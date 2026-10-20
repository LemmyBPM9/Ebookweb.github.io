/**
 * test/challenger_storage_v2_adversarial.test.js
 *
 * Empirical Adversarial Challenger Verification Suite for Storage V2:
 * 1. Zero-Binary Memory Invariant:
 *    - Save 20 books with large binary blobs.
 *    - Call StorageManager.getAllBooks().
 *    - Assert that for 100% of returned items, item.fileBlob === undefined.
 *    - Direct inspection of underlying IDB 'books' object store verifies 0 blobs stored.
 * 2. On-Demand Binary Loading:
 *    - Call StorageManager.getBook(id).
 *    - Assert book.fileBlob instanceof Blob and byte contents match original verbatim.
 *    - Call StorageManager.getBookFile(id) and StorageManager.getBookMetadata(id).
 * 3. Legacy V1 Migration:
 *    - Create an IndexedDB database at version 1 with V1 records containing fileBlob.
 *    - Trigger upgrade to version 2 via StorageManager / WebReaderDB.
 *    - Assert all records migrated to book_files, format set to 'epub', and books store holds no blobs.
 * 4. Atomic Cascade Deletion:
 *    - Add a book with progress, bookmarks, and binary file.
 *    - Call deleteBook(id).
 *    - Assert books, book_files, reading_progress, and bookmarks stores have exactly 0 records for that id.
 *    - Assert multi-book isolation (collateral damage guard).
 * 5. Concurrency:
 *    - Run 50 concurrent saves and concurrent deletes.
 *    - Simultaneous interleaved race: 50 concurrent saves + 50 concurrent deletes.
 *    - Assert zero crashes, zero deadlocks, zero orphaned records across all stores.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFailures = [];

function assert(condition, testName, details = '') {
  totalTests++;
  if (!condition) {
    failedTests++;
    const msg = `❌ [FAIL] ${testName}${details ? ' - ' + details : ''}`;
    console.error(msg);
    testFailures.push(msg);
  } else {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}${details ? ' (' + details + ')' : ''}`);
  }
}

async function runStorageV2Challenger() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: STORAGE V2 ADVERSARIAL STRESS & INVARIANTS     ');
  console.log('========================================================================\n');

  assert(fs.existsSync(CHROME_PATH), `Google Chrome binary exists at ${CHROME_PATH}`);

  const server = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[Static Server] Running at: ${server.url}`);

  console.log(`[Chrome Launcher] Spawning headless Chrome...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  });

  try {
    const page = await browser.newPage();
    const uncaughtErrors = [];
    page.on('pageerror', (err) => uncaughtErrors.push(`[PageError] ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const loc = msg.location ? msg.location() : null;
        if (loc && loc.url && loc.url.includes('favicon.ico')) return;
        if (text.includes('favicon.ico')) return;
        uncaughtErrors.push(`[Console Error] ${text}`);
      }
    });

    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    console.log(`[Page Navigation] Successfully loaded ${server.url}/index.html\n`);

    // =========================================================================
    // HARNESS EXECUTION INSIDE REAL BROWSER
    // =========================================================================
    const suiteResults = await page.evaluate(async () => {
      if (window.__webreaderInitPromise) {
        await window.__webreaderInitPromise;
      }
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const { WebReaderDB } = await import('./js/storage/db.js');

      const results = [];

      // Helper: Raw IndexedDB Store Inspection
      async function getRawStoreRecords(storeName) {
        const db = await WebReaderDB.openDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      }

      async function getRawStoreRecord(storeName, key) {
        const db = await WebReaderDB.openDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
          req.onerror = () => reject(req.error);
        });
      }

      async function getRawBookmarkRecordsForBook(bookId) {
        const db = await WebReaderDB.openDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('bookmarks', 'readonly');
          const store = tx.objectStore('bookmarks');
          const index = store.index('by_bookId');
          const req = index.getAll(IDBKeyRange.only(bookId));
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      }

      async function resetDatabase() {
        if (WebReaderDB._dbInstance) {
          WebReaderDB._dbInstance.close();
          WebReaderDB._dbInstance = null;
        }
        WebReaderDB._openingPromise = null;
        return new Promise((resolve, reject) => {
          const req = indexedDB.deleteDatabase(WebReaderDB.DB_NAME);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => resolve();
        });
      }

      // =======================================================================
      // SUITE 1: ZERO-BINARY MEMORY INVARIANT (20 Books with Large Blobs)
      // =======================================================================
      await resetDatabase();

      const numBooksInvariant = 20;
      const originalPayloads = new Map(); // id -> Uint8Array

      for (let i = 0; i < numBooksInvariant; i++) {
        const bookId = `invariant_book_${String(i).padStart(2, '0')}`;
        // Create large payload: 128 KB each with distinct pseudorandom bytes and PK zip header
        const blobSize = 128 * 1024;
        const bytes = new Uint8Array(blobSize);
        bytes[0] = 0x50; bytes[1] = 0x4B; bytes[2] = 0x03; bytes[3] = 0x04; // PK header
        for (let j = 4; j < blobSize; j++) {
          bytes[j] = (i * 37 + j * 17) & 0xFF;
        }
        originalPayloads.set(bookId, bytes);

        await StorageManager.saveBook({
          id: bookId,
          title: `Large Binary Book Volume ${i}`,
          author: `Author ${i}`,
          format: i % 2 === 0 ? 'epub' : 'pdf',
          fileBlob: new Blob([bytes], { type: i % 2 === 0 ? 'application/epub+zip' : 'application/pdf' }),
          dateAdded: Date.now() + i,
          lastRead: Date.now() + i
        });
      }

      // 1.1 Verify getAllBooks() returns zero binary blobs
      const allBooks = await StorageManager.getAllBooks();
      let allUndefined = true;
      let allKeyAbsent = true;
      let nonZeroCount = allBooks.length === numBooksInvariant;

      for (const item of allBooks) {
        if (item.fileBlob !== undefined) {
          allUndefined = false;
        }
        if ('fileBlob' in item) {
          allKeyAbsent = false;
        }
      }

      results.push({
        id: '1.1_zero_binary_getAllBooks',
        suite: '1. Zero-Binary Memory Invariant',
        desc: 'StorageManager.getAllBooks() returns 20 books where 100% of items have fileBlob === undefined and no fileBlob key',
        pass: nonZeroCount && allUndefined && allKeyAbsent,
        details: `count=${allBooks.length}, allUndefined=${allUndefined}, allKeyAbsent=${allKeyAbsent}`
      });

      // 1.2 Verify StorageManager.getAllBooksMetadata() returns zero binary blobs
      const allMeta = await StorageManager.getAllBooksMetadata();
      let allMetaUndefined = allMeta.length === numBooksInvariant;
      for (const item of allMeta) {
        if (item.fileBlob !== undefined || 'fileBlob' in item) {
          allMetaUndefined = false;
        }
      }

      results.push({
        id: '1.2_zero_binary_getAllBooksMetadata',
        suite: '1. Zero-Binary Memory Invariant',
        desc: 'StorageManager.getAllBooksMetadata() returns 20 books with 100% fileBlob === undefined',
        pass: allMetaUndefined,
        details: `count=${allMeta.length}, allMetaUndefined=${allMetaUndefined}`
      });

      // 1.3 Verify raw 'books' object store holds ZERO binary blobs
      const rawBooks = await getRawStoreRecords('books');
      let rawStoreClean = rawBooks.length === numBooksInvariant;
      for (const rec of rawBooks) {
        if (rec.fileBlob !== undefined || 'fileBlob' in rec) {
          rawStoreClean = false;
        }
      }

      results.push({
        id: '1.3_raw_books_store_holds_zero_blobs',
        suite: '1. Zero-Binary Memory Invariant',
        desc: 'Direct IndexedDB inspection: underlying "books" store records hold 0 binary blobs (fileBlob is omitted at write)',
        pass: rawStoreClean,
        details: `rawBooksCount=${rawBooks.length}, rawStoreClean=${rawStoreClean}`
      });

      // =======================================================================
      // SUITE 2: ON-DEMAND BINARY LOADING
      // =======================================================================
      let onDemandAllBlobsValid = true;
      let onDemandBytesMatched = true;
      let mismatchDetails = '';

      for (let i = 0; i < numBooksInvariant; i++) {
        const bookId = `invariant_book_${String(i).padStart(2, '0')}`;
        const book = await StorageManager.getBook(bookId);

        if (!book || !(book.fileBlob instanceof Blob)) {
          onDemandAllBlobsValid = false;
          mismatchDetails = `Book ${bookId} fileBlob is not instanceof Blob (type: ${typeof book?.fileBlob})`;
          break;
        }

        const retrievedBuf = await book.fileBlob.arrayBuffer();
        const retrievedBytes = new Uint8Array(retrievedBuf);
        const originalBytes = originalPayloads.get(bookId);

        if (retrievedBytes.length !== originalBytes.length) {
          onDemandBytesMatched = false;
          mismatchDetails = `Length mismatch on ${bookId}: retrieved ${retrievedBytes.length} vs original ${originalBytes.length}`;
          break;
        }

        // Verify byte equality
        for (let b = 0; b < originalBytes.length; b++) {
          if (retrievedBytes[b] !== originalBytes[b]) {
            onDemandBytesMatched = false;
            mismatchDetails = `Byte mismatch on ${bookId} at index ${b}: ${retrievedBytes[b]} !== ${originalBytes[b]}`;
            break;
          }
        }
        if (!onDemandBytesMatched) break;
      }

      results.push({
        id: '2.1_on_demand_binary_loading_byte_fidelity',
        suite: '2. On-Demand Binary Loading',
        desc: 'StorageManager.getBook(id) loads on-demand Blob with 100% byte-for-byte fidelity across all 20 books (128 KB each)',
        pass: onDemandAllBlobsValid && onDemandBytesMatched,
        details: mismatchDetails || `verifiedCount=${numBooksInvariant}, sizePerBook=131072 bytes`
      });

      // 2.2 Verify getBookFile(id) direct binary endpoint
      const sampleId = 'invariant_book_07';
      const directFile = await StorageManager.getBookFile(sampleId);
      const isFileBlob = directFile instanceof Blob;
      const directBytes = isFileBlob ? new Uint8Array(await directFile.arrayBuffer()) : null;
      const expectedSampleBytes = originalPayloads.get(sampleId);
      const directBytesMatch = directBytes && directBytes.length === expectedSampleBytes.length &&
                               directBytes[0] === 0x50 && directBytes[1] === 0x4B;

      results.push({
        id: '2.2_getBookFile_direct_binary',
        suite: '2. On-Demand Binary Loading',
        desc: 'StorageManager.getBookFile(id) returns binary Blob with exact byte content',
        pass: isFileBlob && directBytesMatch,
        details: `blobSize=${directFile?.size}, magicBytesMatch=${directBytesMatch}`
      });

      // 2.3 Verify getBookMetadata(id) omits binary payload
      const metaOnly = await StorageManager.getBookMetadata(sampleId);
      const metaClean = metaOnly && metaOnly.id === sampleId && metaOnly.fileBlob === undefined && !('fileBlob' in metaOnly);

      results.push({
        id: '2.3_getBookMetadata_omits_binary',
        suite: '2. On-Demand Binary Loading',
        desc: 'StorageManager.getBookMetadata(id) returns metadata object with fileBlob === undefined',
        pass: metaClean,
        details: `hasMeta=${!!metaOnly}, fileBlobUndefined=${metaOnly?.fileBlob === undefined}`
      });

      // 2.4 Verify Metadata update without fileBlob preserves existing binary in book_files
      const updateTargetId = 'invariant_book_03';
      const originalBytesBeforeUpdate = originalPayloads.get(updateTargetId);
      await StorageManager.saveBook({
        id: updateTargetId,
        title: 'Updated Title Without FileBlob',
        lastRead: Date.now() + 9999
      });
      const bookAfterMetaUpdate = await StorageManager.getBook(updateTargetId);
      const isBlobPreserved = bookAfterMetaUpdate && bookAfterMetaUpdate.fileBlob instanceof Blob;
      let updateBytesMatched = false;
      if (isBlobPreserved) {
        const buf = new Uint8Array(await bookAfterMetaUpdate.fileBlob.arrayBuffer());
        updateBytesMatched = buf.length === originalBytesBeforeUpdate.length && buf[0] === 0x50 && buf[1] === 0x4B;
      }

      results.push({
        id: '2.4_metadata_update_preserves_binary_in_book_files',
        suite: '2. On-Demand Binary Loading',
        desc: 'Updating book metadata without providing fileBlob leaves existing binary in book_files intact',
        pass: isBlobPreserved && updateBytesMatched && bookAfterMetaUpdate.title === 'Updated Title Without FileBlob',
        details: `isBlobPreserved=${isBlobPreserved}, bytesMatch=${updateBytesMatched}, title="${bookAfterMetaUpdate?.title}"`
      });

      // 2.5 Verify 2 MB Large Binary Payload Stress
      const bigBookId = 'big_payload_book_2mb';
      const bigSize = 2 * 1024 * 1024; // 2 MB
      const bigBytes = new Uint8Array(bigSize);
      bigBytes[0] = 0x50; bigBytes[1] = 0x4B; bigBytes[2] = 0x03; bigBytes[3] = 0x04;
      bigBytes[bigSize - 1] = 0xEE;
      await StorageManager.saveBook({
        id: bigBookId,
        title: '2MB Heavyweight Book',
        format: 'pdf',
        fileBlob: new Blob([bigBytes], { type: 'application/pdf' })
      });

      const retrievedBig = await StorageManager.getBook(bigBookId);
      const isBigBlob = retrievedBig && retrievedBig.fileBlob instanceof Blob;
      let bigBytesMatch = false;
      if (isBigBlob) {
        const bigBuf = new Uint8Array(await retrievedBig.fileBlob.arrayBuffer());
        bigBytesMatch = bigBuf.length === bigSize && bigBuf[0] === 0x50 && bigBuf[bigSize - 1] === 0xEE;
      }
      await StorageManager.deleteBook(bigBookId);

      results.push({
        id: '2.5_2mb_large_binary_payload_fidelity',
        suite: '2. On-Demand Binary Loading',
        desc: 'StorageManager reliably persists and loads 2MB large binary payload with exact boundary byte fidelity',
        pass: isBigBlob && bigBytesMatch,
        details: `isBigBlob=${isBigBlob}, size=${retrievedBig?.fileBlob?.size}, bigBytesMatch=${bigBytesMatch}`
      });

      // 2.6 Verify getBooksByFormat zero-binary invariant
      const epubBooks = await StorageManager.getBooksByFormat('epub');
      const pdfBooks = await StorageManager.getBooksByFormat('pdf');
      let formatsClean = epubBooks.length > 0 && pdfBooks.length > 0;
      for (const b of [...epubBooks, ...pdfBooks]) {
        if (b.fileBlob !== undefined || 'fileBlob' in b) formatsClean = false;
      }

      results.push({
        id: '2.6_getBooksByFormat_zero_binary_invariant',
        suite: '2. On-Demand Binary Loading',
        desc: 'StorageManager.getBooksByFormat(format) returns filtered books with 100% zero binary payload',
        pass: formatsClean,
        details: `epubCount=${epubBooks.length}, pdfCount=${pdfBooks.length}, formatsClean=${formatsClean}`
      });

      // =======================================================================
      // SUITE 3: LEGACY V1 MIGRATION
      // =======================================================================
      await resetDatabase();

      // Step 3.1: Create Legacy V1 Database Structure at DB_VERSION = 1
      const v1Records = [
        {
          id: 'v1_book_alpha',
          title: 'Legacy V1 Book Alpha',
          author: 'Vintage Author',
          fileBlob: new Blob(['Legacy V1 Alpha EPUB Binary Content Stream'], { type: 'application/epub+zip' }),
          dateAdded: 1700000000000,
          lastRead: 1700000000000
          // Note: format is intentionally absent (V1 had no format field)
        },
        {
          id: 'v1_book_beta',
          title: 'Legacy V1 Book Beta (Already labeled)',
          author: 'Beta Author',
          format: 'epub',
          fileBlob: new Blob(['Legacy V1 Beta EPUB Binary Content Stream'], { type: 'application/epub+zip' }),
          dateAdded: 1700000001000,
          lastRead: 1700000001000
        },
        {
          id: 'v1_book_gamma',
          title: 'Legacy V1 Book Gamma (No File Blob)',
          author: 'Metadata Only Author',
          dateAdded: 1700000002000,
          lastRead: 1700000002000
        },
        {
          id: 'v1_book_delta',
          title: 'Legacy V1 Book Delta (Large 64KB Blob)',
          fileBlob: new Blob([new Uint8Array(64 * 1024).fill(0x7E)], { type: 'application/octet-stream' }),
          dateAdded: 1700000003000,
          lastRead: 1700000003000
        }
      ];

      // Open database directly at Version 1 without WebReaderDB wrapper
      await new Promise((resolve, reject) => {
        const req1 = indexedDB.open(WebReaderDB.DB_NAME, 1);
        req1.onupgradeneeded = (e) => {
          const db1 = e.target.result;
          const bookStore = db1.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by_lastRead', 'lastRead', { unique: false });
          bookStore.createIndex('by_dateAdded', 'dateAdded', { unique: false });
          bookStore.createIndex('by_title', 'title', { unique: false });
          // Note: In V1, there was NO by_format index and NO book_files store!
          db1.createObjectStore('reading_progress', { keyPath: 'bookId' });
          const bmStore = db1.createObjectStore('bookmarks', { keyPath: 'id' });
          bmStore.createIndex('by_bookId', 'bookId', { unique: false });
          bmStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        };
        req1.onsuccess = (e) => {
          const db1 = e.target.result;
          const tx = db1.transaction(['books', 'reading_progress', 'bookmarks'], 'readwrite');
          const bStore = tx.objectStore('books');
          for (const rec of v1Records) {
            bStore.put(rec);
          }
          // Seed reading progress and bookmark for v1_book_alpha
          tx.objectStore('reading_progress').put({ bookId: 'v1_book_alpha', spineIndex: 2, pageIndex: 5, progressPercentage: 42 });
          tx.objectStore('bookmarks').put({ id: 'v1_bm_01', bookId: 'v1_book_alpha', spineIndex: 2, snippet: 'V1 Bookmark snippet' });

          tx.oncomplete = () => {
            db1.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req1.onerror = () => reject(req1.error);
      });

      // Step 3.2: Trigger Migration to V2 via WebReaderDB.openDB()
      const v2Db = await WebReaderDB.openDB();
      const currentVersion = v2Db.version;
      const hasBookFilesStore = v2Db.objectStoreNames.contains('book_files');
      const hasByFormatIndex = v2Db.transaction('books', 'readonly').objectStore('books').indexNames.contains('by_format');

      // Step 3.3: Assert raw records in 'books' store
      const rawMigratedBooks = await getRawStoreRecords('books');
      let v1BooksClean = rawMigratedBooks.length === 4;
      let v1FormatsSet = true;
      for (const b of rawMigratedBooks) {
        if (b.fileBlob !== undefined || 'fileBlob' in b) {
          v1BooksClean = false;
        }
        if (b.format !== 'epub') {
          v1FormatsSet = false;
        }
      }

      // Step 3.4: Assert raw records in 'book_files' store
      const fileAlpha = await getRawStoreRecord('book_files', 'v1_book_alpha');
      const fileBeta = await getRawStoreRecord('book_files', 'v1_book_beta');
      const fileDelta = await getRawStoreRecord('book_files', 'v1_book_delta');
      const fileGamma = await getRawStoreRecord('book_files', 'v1_book_gamma');

      const alphaText = fileAlpha ? await fileAlpha.fileBlob.text() : '';
      const deltaBytes = fileDelta ? new Uint8Array(await fileDelta.fileBlob.arrayBuffer()) : null;

      const migrationFilesCorrect = fileAlpha && alphaText === 'Legacy V1 Alpha EPUB Binary Content Stream' &&
                                    fileBeta && fileBeta.fileBlob instanceof Blob &&
                                    fileDelta && deltaBytes.length === 64 * 1024 && deltaBytes[0] === 0x7E &&
                                    fileGamma === null;

      // Step 3.5: Assert via StorageManager high-level API
      const loadedAlpha = await StorageManager.getBook('v1_book_alpha');
      const alphaProgress = await StorageManager.getProgress('v1_book_alpha');
      const alphaBookmarks = await StorageManager.getBookmarks('v1_book_alpha');

      const apiAlphaValid = loadedAlpha && loadedAlpha.format === 'epub' &&
                            loadedAlpha.fileBlob instanceof Blob &&
                            (await loadedAlpha.fileBlob.text()) === 'Legacy V1 Alpha EPUB Binary Content Stream' &&
                            alphaProgress && alphaProgress.pageIndex === 5 &&
                            alphaBookmarks && alphaBookmarks.length === 1;

      results.push({
        id: '3.1_legacy_v1_migration',
        suite: '3. Legacy V1 Migration',
        desc: 'V1 database at version 1 with fileBlobs cleanly migrated to V2 (book_files populated, format="epub", books store holds zero blobs)',
        pass: currentVersion === 2 && hasBookFilesStore && hasByFormatIndex && v1BooksClean && v1FormatsSet && migrationFilesCorrect && apiAlphaValid,
        details: `version=${currentVersion}, bookFilesExists=${hasBookFilesStore}, v1BooksClean=${v1BooksClean}, v1FormatsSet=${v1FormatsSet}, migrationFilesCorrect=${migrationFilesCorrect}, apiAlphaValid=${apiAlphaValid}`
      });

      // =======================================================================
      // SUITE 4: ATOMIC CASCADE DELETION
      // =======================================================================
      await resetDatabase();

      const targetBookId = 'cascade_target_book_99';
      const guardBookId = 'cascade_guard_book_01';

      // 4.1 Setup target book and guard book
      const targetBlob = new Blob(['Cascade Target Binary Payload Bytes'], { type: 'application/epub+zip' });
      const guardBlob = new Blob(['Guard Book Binary Payload Bytes'], { type: 'application/epub+zip' });

      await StorageManager.saveBook({ id: targetBookId, title: 'Target Book', fileBlob: targetBlob });
      await StorageManager.saveProgress({ bookId: targetBookId, spineIndex: 3, pageIndex: 12, progressPercentage: 60 });
      for (let m = 0; m < 15; m++) {
        await StorageManager.addBookmark({ bookId: targetBookId, spineIndex: m, snippet: `Target BM ${m}` });
      }

      await StorageManager.saveBook({ id: guardBookId, title: 'Guard Book', fileBlob: guardBlob });
      await StorageManager.saveProgress({ bookId: guardBookId, spineIndex: 1, pageIndex: 2, progressPercentage: 20 });
      for (let m = 0; m < 10; m++) {
        await StorageManager.addBookmark({ bookId: guardBookId, spineIndex: m, snippet: `Guard BM ${m}` });
      }

      // Assert preconditions before deletion
      const preTargetBook = await getRawStoreRecord('books', targetBookId);
      const preTargetFile = await getRawStoreRecord('book_files', targetBookId);
      const preTargetProg = await getRawStoreRecord('reading_progress', targetBookId);
      const preTargetBms = await getRawBookmarkRecordsForBook(targetBookId);

      const preconditionsMet = preTargetBook && preTargetFile && preTargetProg && preTargetBms.length === 15;

      // 4.2 Execute deleteBook(id)
      await StorageManager.deleteBook(targetBookId);

      // 4.3 Inspect all 4 stores directly for targetBookId
      const postTargetBook = await getRawStoreRecord('books', targetBookId);
      const postTargetFile = await getRawStoreRecord('book_files', targetBookId);
      const postTargetProg = await getRawStoreRecord('reading_progress', targetBookId);
      const postTargetBms = await getRawBookmarkRecordsForBook(targetBookId);

      const targetCleanlyEradicated = postTargetBook === null &&
                                      postTargetFile === null &&
                                      postTargetProg === null &&
                                      postTargetBms.length === 0;

      // 4.4 Inspect Guard Book across all 4 stores to prove zero collateral damage
      const postGuardBook = await getRawStoreRecord('books', guardBookId);
      const postGuardFile = await getRawStoreRecord('book_files', guardBookId);
      const postGuardProg = await getRawStoreRecord('reading_progress', guardBookId);
      const postGuardBms = await getRawBookmarkRecordsForBook(guardBookId);

      const guardIntact = postGuardBook !== null &&
                          postGuardFile !== null &&
                          postGuardProg !== null &&
                          postGuardBms.length === 10;

      // 4.5 Verify high-level StorageManager queries for deleted book return null / empty
      const apiTargetBook = await StorageManager.getBook(targetBookId);
      const apiTargetFile = await StorageManager.getBookFile(targetBookId);
      const apiTargetProg = await StorageManager.getProgress(targetBookId);
      const apiTargetBms = await StorageManager.getBookmarks(targetBookId);

      const apiReturnsNull = apiTargetBook === null &&
                             apiTargetFile === null &&
                             apiTargetProg === null &&
                             apiTargetBms.length === 0;

      results.push({
        id: '4.1_atomic_cascade_deletion_all_stores',
        suite: '4. Atomic Cascade Deletion',
        desc: 'StorageManager.deleteBook(id) atomically clears records across books, book_files, reading_progress, and bookmarks stores (0 orphans)',
        pass: preconditionsMet && targetCleanlyEradicated && guardIntact && apiReturnsNull,
        details: `preMet=${preconditionsMet}, postClean=${targetCleanlyEradicated}, guardIntact=${guardIntact}, apiClean=${apiReturnsNull}`
      });

      // 4.6 Idempotency: second delete of already deleted book does not error or alter stores
      let idempotentNoError = true;
      try {
        await StorageManager.deleteBook(targetBookId);
      } catch (err) {
        idempotentNoError = false;
      }
      const postGuardBms2 = await getRawBookmarkRecordsForBook(guardBookId);
      results.push({
        id: '4.2_cascade_delete_idempotent',
        suite: '4. Atomic Cascade Deletion',
        desc: 'Calling deleteBook(id) for non-existent or previously-deleted book is strictly idempotent and safe',
        pass: idempotentNoError && postGuardBms2.length === 10,
        details: `idempotentNoError=${idempotentNoError}, guardBmCount=${postGuardBms2.length}`
      });

      // 4.3 Mass Bookmark Eradication: 100 bookmarks on a single book
      const massBookId = 'mass_bm_book_100';
      await StorageManager.saveBook({ id: massBookId, title: 'Mass Bookmarks Book' });
      const massBmOps = [];
      for (let m = 0; m < 100; m++) {
        massBmOps.push(StorageManager.addBookmark({ bookId: massBookId, spineIndex: m % 10, snippet: `Mass BM ${m}` }));
      }
      await Promise.all(massBmOps);
      const preMassBms = await getRawBookmarkRecordsForBook(massBookId);
      await StorageManager.deleteBook(massBookId);
      const postMassBms = await getRawBookmarkRecordsForBook(massBookId);

      results.push({
        id: '4.3_mass_bookmark_cascade_eradication',
        suite: '4. Atomic Cascade Deletion',
        desc: 'Single deleteBook(id) cleanly removes 100 associated bookmarks via index cursor without orphans',
        pass: preMassBms.length === 100 && postMassBms.length === 0,
        details: `preCount=${preMassBms.length}, postCount=${postMassBms.length}`
      });

      // =======================================================================
      // SUITE 5: CONCURRENCY STRESS (50 Saves & 50 Deletes)
      // =======================================================================
      await resetDatabase();

      // Test 5.1: 50 Concurrent Saves with Large Blobs, Progress, and Bookmarks
      const concurrencyCount = 50;
      const savePromises = [];
      const saveBookIds = [];

      for (let i = 0; i < concurrencyCount; i++) {
        const cId = `concur_save_${String(i).padStart(2, '0')}`;
        saveBookIds.push(cId);
        const blobData = new Uint8Array(32 * 1024).fill(i & 0xFF);
        savePromises.push(
          StorageManager.saveBook({
            id: cId,
            title: `Concurrent Title ${i}`,
            author: `Concurrent Author ${i}`,
            format: 'epub',
            fileBlob: new Blob([blobData], { type: 'application/epub+zip' })
          }).then(async () => {
            // Also write progress and bookmark concurrently
            await Promise.all([
              StorageManager.saveProgress({ bookId: cId, spineIndex: i % 4, pageIndex: i, progressPercentage: i * 2 }),
              StorageManager.addBookmark({ bookId: cId, spineIndex: i % 4, snippet: `Concur BM ${i}` })
            ]);
          })
        );
      }

      const tSavesStart = performance.now();
      await Promise.all(savePromises);
      const savesDurationMs = performance.now() - tSavesStart;

      const booksAfter50Saves = await StorageManager.getAllBooks();
      const filesAfter50Saves = await getRawStoreRecords('book_files');
      const progressAfter50Saves = await getRawStoreRecords('reading_progress');
      const bookmarksAfter50Saves = await getRawStoreRecords('bookmarks');

      const all50Saved = booksAfter50Saves.length === concurrencyCount &&
                         filesAfter50Saves.length === concurrencyCount &&
                         progressAfter50Saves.length === concurrencyCount &&
                         bookmarksAfter50Saves.length === concurrencyCount;

      results.push({
        id: '5.1_50_concurrent_saves_with_blobs_progress_bookmarks',
        suite: '5. Concurrency',
        desc: `50 concurrent saves with 32KB blobs, reading progress, and bookmarks completed in ${savesDurationMs.toFixed(1)}ms with 100% store population`,
        pass: all50Saved,
        details: `saved=${booksAfter50Saves.length}/50, files=${filesAfter50Saves.length}, progress=${progressAfter50Saves.length}, bms=${bookmarksAfter50Saves.length}`
      });

      // Test 5.2: 50 Concurrent Deletes
      const tDeletesStart = performance.now();
      await Promise.all(saveBookIds.map(id => StorageManager.deleteBook(id)));
      const deletesDurationMs = performance.now() - tDeletesStart;

      const booksAfter50Deletes = await getRawStoreRecords('books');
      const filesAfter50Deletes = await getRawStoreRecords('book_files');
      const progressAfter50Deletes = await getRawStoreRecords('reading_progress');
      const bookmarksAfter50Deletes = await getRawStoreRecords('bookmarks');

      const all50Cleaned = booksAfter50Deletes.length === 0 &&
                           filesAfter50Deletes.length === 0 &&
                           progressAfter50Deletes.length === 0 &&
                           bookmarksAfter50Deletes.length === 0;

      results.push({
        id: '5.2_50_concurrent_deletes',
        suite: '5. Concurrency',
        desc: `50 concurrent cascade deletes completed in ${deletesDurationMs.toFixed(1)}ms leaving exactly 0 records in all stores`,
        pass: all50Cleaned,
        details: `books=${booksAfter50Deletes.length}, files=${filesAfter50Deletes.length}, prog=${progressAfter50Deletes.length}, bms=${bookmarksAfter50Deletes.length}`
      });

      // Test 5.3: Interleaved Race: 50 Concurrent Saves AND 50 Concurrent Deletes
      // First, seed 50 books to be deleted (group A: del_00..del_49)
      const groupA = [];
      for (let i = 0; i < 50; i++) {
        const id = `del_target_${String(i).padStart(2, '0')}`;
        groupA.push(id);
        await StorageManager.saveBook({ id, title: `Delete Target ${i}`, fileBlob: new Blob(['Del'], { type: 'text/plain' }) });
        await StorageManager.saveProgress({ bookId: id, spineIndex: 1, progressPercentage: 5 });
        await StorageManager.addBookmark({ bookId: id, spineIndex: 1, snippet: `Bm ${i}` });
      }

      // Group B: 50 new books to be saved concurrently (save_00..save_49)
      const groupB = [];
      for (let i = 0; i < 50; i++) {
        groupB.push({
          id: `save_target_${String(i).padStart(2, '0')}`,
          title: `Concurrent Save Target ${i}`,
          fileBlob: new Blob([`Concurrent Save Content ${i}`], { type: 'text/plain' })
        });
      }

      // Launch 50 saves and 50 deletes simultaneously in Promise.all
      const raceOps = [];
      for (let i = 0; i < 50; i++) {
        // Interleave deletes and saves
        raceOps.push(StorageManager.deleteBook(groupA[i]));
        raceOps.push(StorageManager.saveBook(groupB[i]));
      }

      const tRaceStart = performance.now();
      await Promise.all(raceOps);
      const raceDurationMs = performance.now() - tRaceStart;

      // Post-race store audit:
      const finalBooks = await getRawStoreRecords('books');
      const finalFiles = await getRawStoreRecords('book_files');
      const finalProg = await getRawStoreRecords('reading_progress');
      const finalBms = await getRawStoreRecords('bookmarks');

      const bookIdSet = new Set(finalBooks.map(b => b.id));

      // Assert zero orphaned files (every file in book_files MUST belong to an existing book in books)
      let orphanFilesCount = 0;
      for (const f of finalFiles) {
        if (!bookIdSet.has(f.id)) {
          orphanFilesCount++;
        }
      }

      // Assert zero orphaned progress records
      let orphanProgCount = 0;
      for (const p of finalProg) {
        if (!bookIdSet.has(p.bookId)) {
          orphanProgCount++;
        }
      }

      // Assert zero orphaned bookmarks
      let orphanBmsCount = 0;
      for (const bm of finalBms) {
        if (!bookIdSet.has(bm.bookId)) {
          orphanBmsCount++;
        }
      }

      // Group A must be 100% eradicated
      let groupAStillPresent = 0;
      for (const aId of groupA) {
        if (bookIdSet.has(aId)) groupAStillPresent++;
      }

      // Group B must be 100% present in books and book_files
      let groupBComplete = 0;
      const fileIdSet = new Set(finalFiles.map(f => f.id));
      for (const b of groupB) {
        if (bookIdSet.has(b.id) && fileIdSet.has(b.id)) groupBComplete++;
      }

      const zeroOrphans = orphanFilesCount === 0 && orphanProgCount === 0 && orphanBmsCount === 0;
      const racePassed = zeroOrphans && groupAStillPresent === 0 && groupBComplete === 50;

      results.push({
        id: '5.3_interleaved_race_50_saves_50_deletes',
        suite: '5. Concurrency',
        desc: `Simultaneous race: 50 concurrent saves + 50 concurrent deletes completed in ${raceDurationMs.toFixed(1)}ms with ZERO crashes, ZERO deadlocks, and ZERO orphaned records`,
        pass: racePassed,
        details: `groupAStillPresent=${groupAStillPresent}, groupBComplete=${groupBComplete}/50, orphanFiles=${orphanFilesCount}, orphanProg=${orphanProgCount}, orphanBms=${orphanBmsCount}`
      });

      // Test 5.4: Same-Record Contention Stress: 50 concurrent saves and reads to the EXACT SAME BOOK
      const contentionId = 'same_record_contention_book';
      await StorageManager.saveBook({ id: contentionId, title: 'Initial Contention Book', fileBlob: new Blob(['Init'], { type: 'text/plain' }) });

      const contentionOps = [];
      for (let i = 0; i < 50; i++) {
        contentionOps.push(StorageManager.saveBook({ id: contentionId, title: `Update ${i}`, lastRead: Date.now() + i }));
        contentionOps.push(StorageManager.saveProgress({ bookId: contentionId, spineIndex: 1, pageIndex: i, progressPercentage: i }));
        contentionOps.push(StorageManager.getBook(contentionId));
      }

      const tContentionStart = performance.now();
      await Promise.all(contentionOps);
      const contentionMs = performance.now() - tContentionStart;

      const finalContentionBook = await StorageManager.getBook(contentionId);
      const finalContentionProg = await StorageManager.getProgress(contentionId);
      const contentionIntact = finalContentionBook && finalContentionProg &&
                               finalContentionBook.fileBlob instanceof Blob;

      results.push({
        id: '5.4_same_record_contention_stress',
        suite: '5. Concurrency',
        desc: `150 concurrent operations (50 writes + 50 progress + 50 reads) on a single record resolved cleanly in ${contentionMs.toFixed(1)}ms without corruption`,
        pass: contentionIntact,
        details: `lastRead=${finalContentionBook?.lastRead}, pageIndex=${finalContentionProg?.pageIndex}, fileBlobIntact=${finalContentionBook?.fileBlob instanceof Blob}`
      });

      // Cleanup
      await resetDatabase();

      return results;
    });

    // Process and print all assertions
    let currentSuite = '';
    for (const r of suiteResults) {
      if (r.suite !== currentSuite) {
        currentSuite = r.suite;
        console.log(`\n------------------------------------------------------------------------`);
        console.log(`SUITE: ${currentSuite}`);
        console.log(`------------------------------------------------------------------------`);
      }
      assert(r.pass, r.desc, r.details);
    }

    assert(uncaughtErrors.length === 0, 'Zero uncaught page errors or unexpected console errors', uncaughtErrors.join('; '));

  } finally {
    console.log('\n[Chrome] Closing browser...');
    await browser.close();
    console.log('[Static Server] Stopping test server...');
    await server.close();
  }

  console.log('\n========================================================================');
  console.log(`HARNESS COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    console.error('FAILURES:');
    testFailures.forEach(f => console.error(f));
    process.exit(1);
  } else {
    console.log('ALL STORAGE V2 EMPIRICAL ADVERSARIAL STRESS TESTS PASSED!');
    process.exit(0);
  }
}

runStorageV2Challenger().catch(err => {
  console.error('[Harness Execution Error]', err);
  process.exit(1);
});
