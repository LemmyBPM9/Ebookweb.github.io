/**
 * .agents/teamwork/m1_challenger_1/challenge_storage.js
 * Adversarial Stress & Empirical Challenge Suite for Milestone 1:
 * - Concurrency Stress: 50+ rapid concurrent write/read/delete operations in IndexedDB WebReaderDB
 * - Relational Cascade Integrity: Multi-book isolation & orphan bookmark eradication
 * - EventBus Stress: 100+ listeners, simulated throwing listeners, unregister closures, once semantics, event floods
 * - Storage Resilience: LocalStorage throwing SecurityError, QuotaExceededError, and corrupted payloads
 *
 * Runs against headless Google Chrome (/Applications/Google Chrome.app/Contents/MacOS/Google Chrome).
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const { startServer } = require(path.join(PROJECT_ROOT, 'test/server.js'));

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failures = [];

function assert(condition, message, details = '') {
  totalAssertions++;
  if (!condition) {
    failedAssertions++;
    const errMsg = `[FAIL] ${message}${details ? ' - ' + details : ''}`;
    console.error(`  ❌ ${errMsg}`);
    failures.push(errMsg);
  } else {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${message}`);
  }
}

async function runAdversarialSuite() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: STORAGE ARCHITECTURE & EVENTBUS STRESS HARNESS   ');
  console.log('========================================================================\n');

  assert(fs.existsSync(CHROME_PATH), `Google Chrome binary exists at ${CHROME_PATH}`);

  // 1. Start Static HTTP Server
  const server = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[Static Server] Running at: ${server.url}`);

  // 2. Launch Headless Google Chrome
  console.log(`[Chrome Launcher] Spawning headless Chrome...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    const uncaughtPageErrors = [];
    page.on('pageerror', (err) => uncaughtPageErrors.push(err.message));

    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    console.log(`[Page Navigation] Successfully loaded ${server.url}/index.html\n`);

    // =========================================================================
    // SUITE 1: EVENTBUS ADVERSARIAL STRESS & ERROR ISOLATION
    // =========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('SUITE 1: EventBus Adversarial Stress, Error Isolation & Once Semantics');
    console.log('------------------------------------------------------------------------');

    const eventBusResults = await page.evaluate(async () => {
      const results = [];
      const { EventBus, EVENTS } = await import('./js/event-bus.js');

      // Test 1.1: 100+ listeners with 50 throwing diverse errors
      EventBus.clear();
      let nonThrowingExecuted = 0;
      let throwingAttempted = 0;
      const totalListeners = 120;
      const throwTypes = [
        new Error('Standard Error exception'),
        'String literal exception',
        null,
        undefined,
        { custom: 'Object exception' },
        42
      ];

      for (let i = 0; i < totalListeners; i++) {
        if (i % 2 === 0) {
          // Throwing listener
          const errToThrow = throwTypes[i % throwTypes.length];
          EventBus.on('stress:mixed', () => {
            throwingAttempted++;
            throw errToThrow;
          });
        } else {
          // Normal listener
          EventBus.on('stress:mixed', (payload) => {
            if (payload && payload.token === 'stress_token') {
              nonThrowingExecuted++;
            }
          });
        }
      }

      // Suppress console.error logging temporarily during intentional throws
      const originalConsoleError = console.error;
      let errorLogCount = 0;
      console.error = () => { errorLogCount++; };

      try {
        EventBus.emit('stress:mixed', { token: 'stress_token' });
      } finally {
        console.error = originalConsoleError;
      }

      results.push({
        id: '1.1_error_isolation',
        description: '120 listeners (60 throwing, 60 normal) error isolation',
        pass: nonThrowingExecuted === 60 && throwingAttempted === 60,
        details: `nonThrowingExecuted=${nonThrowingExecuted}/60, throwingAttempted=${throwingAttempted}/60, errorLogsCaptured=${errorLogCount}`
      });

      // Test 1.2: 100 once listeners with throwing listeners
      EventBus.clear();
      let onceExecutedCount = 0;
      let onceThrowCount = 0;
      const onceTotal = 100;

      for (let i = 0; i < onceTotal; i++) {
        if (i % 2 === 0) {
          EventBus.once('stress:once', () => {
            onceThrowCount++;
            throw new Error(`Once failure ${i}`);
          });
        } else {
          EventBus.once('stress:once', () => {
            onceExecutedCount++;
          });
        }
      }

      console.error = () => {};
      try {
        // Emit 1st time
        EventBus.emit('stress:once');
      } finally {
        console.error = originalConsoleError;
      }

      const activeAfterFirstEmit = EventBus.listenerCount('stress:once');

      // Emit 2nd time
      let secondEmitCount = 0;
      EventBus.on('stress:once', () => { secondEmitCount++; });
      // Emit again to ensure old once handlers do not fire
      EventBus.emit('stress:once');

      results.push({
        id: '1.2_once_semantics',
        description: '100 once listeners (50 throwing) auto-deregister completely after single execution',
        pass: onceExecutedCount === 50 && onceThrowCount === 50 && activeAfterFirstEmit === 0 && secondEmitCount === 1,
        details: `firstEmit: normal=${onceExecutedCount}/50, throws=${onceThrowCount}/50; remainingActive=${activeAfterFirstEmit}`
      });

      // Test 1.3: Self-unsubscribing closures under rapid event flood
      EventBus.clear();
      const unsubs = [];
      let unsubExecutions = 0;
      for (let i = 0; i < 200; i++) {
        const u = EventBus.on('stress:flood', () => {
          unsubExecutions++;
        });
        unsubs.push(u);
      }

      const countBeforeUnsub = EventBus.listenerCount('stress:flood');
      // Unsubscribe all 200 via their returned closures
      for (const u of unsubs) {
        u();
      }
      const countAfterUnsub = EventBus.listenerCount('stress:flood');

      // Test idempotency of closures
      for (const u of unsubs) {
        u(); // second call should be harmless
      }
      const countAfterDoubleUnsub = EventBus.listenerCount('stress:flood');

      EventBus.emit('stress:flood');

      results.push({
        id: '1.3_closure_unsubs',
        description: '200 returned unsubscribe closures cleanly purge listeners with idempotency',
        pass: countBeforeUnsub === 200 && countAfterUnsub === 0 && countAfterDoubleUnsub === 0 && unsubExecutions === 0,
        details: `before=${countBeforeUnsub}, after=${countAfterUnsub}, afterSecondUnsub=${countAfterDoubleUnsub}, executionsAfterUnsub=${unsubExecutions}`
      });

      // Test 1.4: Mutation during emit snapshot test
      EventBus.clear();
      let order = [];
      let unsubDynamic = null;

      const handler1 = () => {
        order.push('h1');
        // Unregister handler2 during execution of handler1
        if (unsubDynamic) unsubDynamic();
        // Register a new handler during execution
        EventBus.on('stress:mutation', () => {
          order.push('h_late');
        });
      };

      const handler2 = () => {
        order.push('h2');
      };

      EventBus.on('stress:mutation', handler1);
      unsubDynamic = EventBus.on('stress:mutation', handler2);

      // Emit 1st turn
      EventBus.emit('stress:mutation');
      const orderTurn1 = [...order];

      // Emit 2nd turn
      order = [];
      EventBus.emit('stress:mutation');
      const orderTurn2 = [...order];

      // In turn 1: h1 and h2 execute (snapshot). In turn 2: h1 and h_late execute (h2 was removed, h_late added).
      results.push({
        id: '1.4_snapshot_isolation',
        description: 'Snapshot isolation ensures safe handler addition/removal during emission',
        pass: orderTurn1.includes('h1') && orderTurn2.includes('h_late') && !orderTurn2.includes('h2'),
        details: `Turn 1: [${orderTurn1.join(', ')}], Turn 2: [${orderTurn2.join(', ')}]`
      });

      // Test 1.5: Input validation / TypeError guards
      let throwsOnBadHandler = false;
      let throwsOnBadOnce = false;
      try {
        EventBus.on('invalid', 'not-a-func');
      } catch (e) {
        throwsOnBadHandler = e instanceof TypeError;
      }
      try {
        EventBus.once('invalid', null);
      } catch (e) {
        throwsOnBadOnce = e instanceof TypeError;
      }

      results.push({
        id: '1.5_type_guards',
        description: 'EventBus.on and once throw TypeError on invalid handler arguments',
        pass: throwsOnBadHandler && throwsOnBadOnce,
        details: `throwsOnBadHandler=${throwsOnBadHandler}, throwsOnBadOnce=${throwsOnBadOnce}`
      });

      return results;
    });

    for (const r of eventBusResults) {
      assert(r.pass, `EventBus: ${r.description}`, r.details);
    }

    // =========================================================================
    // SUITE 2: STORAGE RESILIENCE & LOCALSTORAGE FAULT TOLERANCE
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 2: Storage Resilience, LocalStorage Exceptions & Fallback');
    console.log('------------------------------------------------------------------------');

    const storageResilienceResults = await page.evaluate(async () => {
      const results = [];
      const { SettingsManager, THEMES, DEFAULT_TYPOGRAPHY } = await import('./js/storage/settings-store.js');

      // Test 2.1: LocalStorage Throwing SecurityError (Blocked Storage / Sandbox)
      // Save original descriptor
      const originalGetItem = localStorage.getItem;
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;

      // Mock localStorage to simulate complete storage block
      localStorage.getItem = () => {
        throw new DOMException('Storage access denied by user agent', 'SecurityError');
      };
      localStorage.setItem = () => {
        throw new DOMException('Storage access denied by user agent', 'SecurityError');
      };
      localStorage.removeItem = () => {
        throw new DOMException('Storage access denied by user agent', 'SecurityError');
      };

      let securityErrorHandled = true;
      let themeRetrieved = null;
      let typoRetrieved = null;
      let lastBookRetrieved = null;

      try {
        SettingsManager.setTheme('sage');
        themeRetrieved = SettingsManager.getTheme();

        SettingsManager.setTypography({ fontSize: 24, fontFamily: 'sans' });
        typoRetrieved = SettingsManager.getTypography();

        SettingsManager.setLastBookId('book_security_test');
        lastBookRetrieved = SettingsManager.getLastBookId();

        SettingsManager.setLastBookId(null);
        const lastBookAfterNull = SettingsManager.getLastBookId();

        const pass = themeRetrieved === 'sage' &&
          typoRetrieved.fontSize === 24 &&
          typoRetrieved.fontFamily === 'sans' &&
          lastBookRetrieved === 'book_security_test' &&
          lastBookAfterNull === null;

        results.push({
          id: '2.1_security_error_fallback',
          description: 'In-memory fallback operates seamlessly when localStorage throws SecurityError',
          pass,
          details: `theme=${themeRetrieved}, fontSize=${typoRetrieved.fontSize}, lastBookAfterNull=${lastBookAfterNull}`
        });
      } catch (err) {
        results.push({
          id: '2.1_security_error_fallback',
          description: 'In-memory fallback operates seamlessly when localStorage throws SecurityError',
          pass: false,
          details: `Uncaught exception thrown: ${err.message}`
        });
      }

      // Restore original localStorage methods
      localStorage.getItem = originalGetItem;
      localStorage.setItem = originalSetItem;
      localStorage.removeItem = originalRemoveItem;

      // Test 2.2: LocalStorage QuotaExceededError handling
      localStorage.setItem = () => {
        throw new DOMException('QuotaExceededError: storage quota exceeded', 'QuotaExceededError');
      };

      try {
        SettingsManager.setTheme('soft-dark');
        const themeOnQuota = SettingsManager.getTheme();
        SettingsManager.setTypography({ lineHeight: 2.0 });
        const typoOnQuota = SettingsManager.getTypography();

        results.push({
          id: '2.2_quota_exceeded_fallback',
          description: 'Graceful in-memory fallback when localStorage throws QuotaExceededError',
          pass: themeOnQuota === 'soft-dark' && typoOnQuota.lineHeight === 2.0,
          details: `themeOnQuota=${themeOnQuota}, lineHeight=${typoOnQuota.lineHeight}`
        });
      } catch (err) {
        results.push({
          id: '2.2_quota_exceeded_fallback',
          description: 'Graceful in-memory fallback when localStorage throws QuotaExceededError',
          pass: false,
          details: `Uncaught exception thrown: ${err.message}`
        });
      }

      localStorage.setItem = originalSetItem;

      // Test 2.3: Corrupted / Malformed JSON injection
      localStorage.setItem('webreader_typography', '{bad_json: invalid syntax!!');
      const typoCorrupted = SettingsManager.getTypography();

      localStorage.setItem('webreader_theme', 'evil-malicious-theme-injection');
      const themeCorrupted = SettingsManager.getTheme();

      localStorage.setItem('webreader_reading_mode', 'unrecognized-mode-val');
      const modeCorrupted = SettingsManager.getReadingMode();

      results.push({
        id: '2.3_corrupted_payload_recovery',
        description: 'Sanitizes corrupted JSON and unknown values by reverting to defaults',
        pass: typoCorrupted.fontFamily === 'serif' &&
              typoCorrupted.fontSize === 18 &&
              themeCorrupted === 'warm-paper' &&
              modeCorrupted === 'paginated',
        details: `theme=${themeCorrupted}, mode=${modeCorrupted}, typoFont=${typoCorrupted.fontFamily}`
      });

      // Test 2.4: Out-of-bounds typography values clamping & sanitization
      localStorage.setItem('webreader_typography', JSON.stringify({
        fontSize: 999999, // out of range 12..40
        lineHeight: 0.1,  // out of range 1.2..2.8
        maxWidth: 50000,  // out of range 480..1200
        fontFamily: '<script>evil()</script>' // invalid choice
      }));

      const clampedTypo = SettingsManager.getTypography();
      results.push({
        id: '2.4_typography_clamping',
        description: 'Clamps and validates out-of-bounds typography settings',
        pass: clampedTypo.fontSize === DEFAULT_TYPOGRAPHY.fontSize &&
              clampedTypo.lineHeight === DEFAULT_TYPOGRAPHY.lineHeight &&
              clampedTypo.maxWidth === DEFAULT_TYPOGRAPHY.maxWidth &&
              clampedTypo.fontFamily === DEFAULT_TYPOGRAPHY.fontFamily,
        details: `clamped=${JSON.stringify(clampedTypo)}`
      });

      return results;
    });

    for (const r of storageResilienceResults) {
      assert(r.pass, `StorageResilience: ${r.description}`, r.details);
    }

    // =========================================================================
    // SUITE 3: INDEXEDDB CONCURRENCY STRESS (50 CONCURRENT RAPID OPERATIONS)
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 3: IndexedDB Concurrency Stress (50 Concurrent Rapid Operations)');
    console.log('------------------------------------------------------------------------');

    const concurrencyResults = await page.evaluate(async () => {
      const results = [];
      const { StorageManager } = await import('./js/storage/storage-manager.js');

      // Clear existing books for a clean test stage
      const existing = await StorageManager.getAllBooks();
      for (const b of existing) {
        await StorageManager.deleteBook(b.id);
      }

      // Test 3.1: 50 Concurrent Rapid Book Writes
      const writeCount = 50;
      const testBooks = [];
      for (let i = 0; i < writeCount; i++) {
        testBooks.push({
          id: `stress_book_${i}`,
          title: `Concurrency Stress Book ${i}`,
          author: `Author ${i}`,
          dateAdded: Date.now() + i,
          lastRead: Date.now() + i,
          fileBlob: new Blob([`Dummy EPUB content for book ${i}`], { type: 'application/epub+zip' })
        });
      }

      const t0 = performance.now();
      const savePromises = testBooks.map(b => StorageManager.saveBook(b));
      const savedIds = await Promise.all(savePromises);
      const writeTimeMs = performance.now() - t0;

      const booksInDb = await StorageManager.getAllBooks();

      results.push({
        id: '3.1_50_concurrent_writes',
        description: `50 concurrent rapid saveBook calls completed without collisions in ${writeTimeMs.toFixed(1)}ms`,
        pass: savedIds.length === 50 && booksInDb.length === 50,
        details: `savedIds=${savedIds.length}, booksInDb=${booksInDb.length}, elapsed=${writeTimeMs.toFixed(1)}ms`
      });

      // Test 3.2: 50 Concurrent Mixed Operations (15 Progress, 15 Bookmarks, 10 Queries, 10 Updates)
      const t1 = performance.now();
      const mixedOps = [];

      // 15 Save Progress
      for (let i = 0; i < 15; i++) {
        mixedOps.push(StorageManager.saveProgress({
          bookId: `stress_book_${i}`,
          spineIndex: i % 5,
          pageIndex: i,
          totalPages: 20,
          progressPercentage: (i / 20) * 100
        }));
      }

      // 15 Add Bookmark
      for (let i = 15; i < 30; i++) {
        mixedOps.push(StorageManager.addBookmark({
          bookId: `stress_book_${i}`,
          spineIndex: 1,
          snippet: `Bookmark for book ${i} under concurrency stress`
        }));
      }

      // 10 Read Book queries
      for (let i = 30; i < 40; i++) {
        mixedOps.push(StorageManager.getBook(`stress_book_${i}`));
      }

      // 10 Book updates
      for (let i = 40; i < 50; i++) {
        mixedOps.push(StorageManager.saveBook({
          id: `stress_book_${i}`,
          title: `UPDATED Title for Book ${i}`,
          author: `Updated Author ${i}`
        }));
      }

      const mixedResults = await Promise.all(mixedOps);
      const mixedTimeMs = performance.now() - t1;

      // Verify updates took effect
      const updatedBook = await StorageManager.getBook('stress_book_45');
      const retrievedProgress = await StorageManager.getProgress('stress_book_10');
      const retrievedBookmarks = await StorageManager.getBookmarks('stress_book_20');

      results.push({
        id: '3.2_50_concurrent_mixed_ops',
        description: `50 concurrent mixed reads/writes/updates completed in ${mixedTimeMs.toFixed(1)}ms`,
        pass: mixedResults.length === 50 &&
              updatedBook && updatedBook.title === 'UPDATED Title for Book 45' &&
              retrievedProgress && retrievedProgress.pageIndex === 10 &&
              retrievedBookmarks && retrievedBookmarks.length === 1,
        details: `elapsed=${mixedTimeMs.toFixed(1)}ms, updatedTitle=${updatedBook ? updatedBook.title : 'null'}, progressPageIndex=${retrievedProgress ? retrievedProgress.pageIndex : 'null'}`
      });

      // Test 3.3: 50 Concurrent Deletes and Reads collision stress
      const t2 = performance.now();
      const deleteReadOps = [];

      // 25 deletes (books 0 to 24)
      for (let i = 0; i < 25; i++) {
        deleteReadOps.push(StorageManager.deleteBook(`stress_book_${i}`));
      }

      // 25 reads (books 25 to 49)
      for (let i = 25; i < 50; i++) {
        deleteReadOps.push(StorageManager.getBook(`stress_book_${i}`));
      }

      await Promise.all(deleteReadOps);
      const deleteReadTimeMs = performance.now() - t2;

      const remainingBooks = await StorageManager.getAllBooks();

      // Verify books 0..24 are deleted, books 25..49 still exist
      let deletedVerified = true;
      for (let i = 0; i < 25; i++) {
        const b = await StorageManager.getBook(`stress_book_${i}`);
        if (b !== null) deletedVerified = false;
      }

      results.push({
        id: '3.3_50_concurrent_delete_read',
        description: `25 concurrent deletes + 25 concurrent reads executed cleanly without race collisions`,
        pass: remainingBooks.length === 25 && deletedVerified,
        details: `remainingCount=${remainingBooks.length}/25, deletedVerified=${deletedVerified}, elapsed=${deleteReadTimeMs.toFixed(1)}ms`
      });

      // Clean remaining books
      for (let i = 25; i < 50; i++) {
        await StorageManager.deleteBook(`stress_book_${i}`);
      }

      return results;
    });

    for (const r of concurrencyResults) {
      assert(r.pass, `IndexedDBConcurrency: ${r.description}`, r.details);
    }

    // =========================================================================
    // SUITE 4: RELATIONAL CASCADE INTEGRITY & MULTI-BOOK ISOLATION
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 4: Relational Cascade Integrity, Multi-Book Isolation & Orphan Eradication');
    console.log('------------------------------------------------------------------------');

    const cascadeResults = await page.evaluate(async () => {
      const results = [];
      const { StorageManager } = await import('./js/storage/storage-manager.js');

      // Setup 3 distinct books:
      // Book Alpha: 20 bookmarks + reading progress
      // Book Beta: 15 bookmarks + reading progress
      // Book Gamma: 0 bookmarks + reading progress
      const ALPHA_ID = 'book_cascade_alpha';
      const BETA_ID = 'book_cascade_beta';
      const GAMMA_ID = 'book_cascade_gamma';

      await StorageManager.saveBook({ id: ALPHA_ID, title: 'Book Alpha' });
      await StorageManager.saveBook({ id: BETA_ID, title: 'Book Beta' });
      await StorageManager.saveBook({ id: GAMMA_ID, title: 'Book Gamma' });

      await StorageManager.saveProgress({ bookId: ALPHA_ID, spineIndex: 3, progressPercentage: 45 });
      await StorageManager.saveProgress({ bookId: BETA_ID, spineIndex: 1, progressPercentage: 15 });
      await StorageManager.saveProgress({ bookId: GAMMA_ID, spineIndex: 5, progressPercentage: 90 });

      // Add 20 bookmarks to Alpha
      for (let i = 0; i < 20; i++) {
        await StorageManager.addBookmark({
          bookId: ALPHA_ID,
          spineIndex: i,
          snippet: `Alpha Bookmark ${i}`
        });
      }

      // Add 15 bookmarks to Beta
      for (let i = 0; i < 15; i++) {
        await StorageManager.addBookmark({
          bookId: BETA_ID,
          spineIndex: i,
          snippet: `Beta Bookmark ${i}`
        });
      }

      // Verify baseline counts
      const alphaBmBefore = await StorageManager.getBookmarks(ALPHA_ID);
      const betaBmBefore = await StorageManager.getBookmarks(BETA_ID);
      const gammaBmBefore = await StorageManager.getBookmarks(GAMMA_ID);

      // Perform atomic cascade delete on Book Alpha
      await StorageManager.deleteBook(ALPHA_ID);

      // 1. Verify Alpha is completely gone
      const alphaBookAfter = await StorageManager.getBook(ALPHA_ID);
      const alphaProgressAfter = await StorageManager.getProgress(ALPHA_ID);
      const alphaBmAfter = await StorageManager.getBookmarks(ALPHA_ID);

      // 2. Direct raw IndexedDB cursor scan to verify ZERO orphan bookmarks remain anywhere in db
      const db = await StorageManager.openDB();
      const orphanScanResult = await new Promise((resolve) => {
        const tx = db.transaction('bookmarks', 'readonly');
        const store = tx.objectStore('bookmarks');
        let totalBookmarksInDb = 0;
        let alphaOrphansFound = 0;
        let betaBookmarksFound = 0;

        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            totalBookmarksInDb++;
            if (cursor.value.bookId === ALPHA_ID) {
              alphaOrphansFound++;
            }
            if (cursor.value.bookId === BETA_ID) {
              betaBookmarksFound++;
            }
            cursor.continue();
          } else {
            resolve({ totalBookmarksInDb, alphaOrphansFound, betaBookmarksFound });
          }
        };
      });

      results.push({
        id: '4.1_alpha_cascade_erased',
        description: 'deleteBook(Alpha) atomically eradicated book, progress, and all 20 bookmarks (0 orphans found in raw store scan)',
        pass: alphaBookAfter === null &&
              alphaProgressAfter === null &&
              alphaBmAfter.length === 0 &&
              orphanScanResult.alphaOrphansFound === 0,
        details: `alphaBook=${alphaBookAfter}, progress=${alphaProgressAfter}, bookmarks=${alphaBmAfter.length}, rawStoreOrphans=${orphanScanResult.alphaOrphansFound}`
      });

      // 3. Verify Multi-Book Isolation: Book Beta and Book Gamma remain 100% intact
      const betaBookAfter = await StorageManager.getBook(BETA_ID);
      const betaProgressAfter = await StorageManager.getProgress(BETA_ID);
      const betaBmAfter = await StorageManager.getBookmarks(BETA_ID);

      const gammaBookAfter = await StorageManager.getBook(GAMMA_ID);
      const gammaProgressAfter = await StorageManager.getProgress(GAMMA_ID);

      const betaIntact = betaBookAfter && betaBookAfter.title === 'Book Beta' &&
        betaProgressAfter && betaProgressAfter.progressPercentage === 15 &&
        betaBmAfter.length === 15 && orphanScanResult.betaBookmarksFound === 15;

      const gammaIntact = gammaBookAfter && gammaBookAfter.title === 'Book Gamma' &&
        gammaProgressAfter && gammaProgressAfter.progressPercentage === 90;

      results.push({
        id: '4.2_multi_book_isolation',
        description: 'Deleting Book Alpha had zero side-effects on Book Beta (15 bm intact) and Book Gamma',
        pass: betaIntact && gammaIntact,
        details: `betaBmCount=${betaBmAfter.length}/15, betaProgress=${betaProgressAfter ? betaProgressAfter.progressPercentage : 'null'}, gammaTitle=${gammaBookAfter ? gammaBookAfter.title : 'null'}`
      });

      // 4. Cascade delete Book Gamma (edge case: book with 0 bookmarks)
      await StorageManager.deleteBook(GAMMA_ID);
      const gammaBookDeleted = await StorageManager.getBook(GAMMA_ID);
      const gammaProgressDeleted = await StorageManager.getProgress(GAMMA_ID);

      results.push({
        id: '4.3_zero_bookmarks_cascade',
        description: 'deleteBook on book with 0 bookmarks succeeds without error or transaction abort',
        pass: gammaBookDeleted === null && gammaProgressDeleted === null,
        details: `gammaBookDeleted=${gammaBookDeleted}, gammaProgressDeleted=${gammaProgressDeleted}`
      });

      // 5. High-volume cascade deletion stress: 100 bookmarks on a single book
      const DELTA_ID = 'book_cascade_delta_100';
      await StorageManager.saveBook({ id: DELTA_ID, title: 'Book Delta (100 Bookmarks)' });
      for (let i = 0; i < 100; i++) {
        await StorageManager.addBookmark({
          bookId: DELTA_ID,
          spineIndex: i % 10,
          snippet: `High volume bookmark ${i}`
        });
      }
      const deltaBmBefore = await StorageManager.getBookmarks(DELTA_ID);

      await StorageManager.deleteBook(DELTA_ID);
      const deltaBmAfter = await StorageManager.getBookmarks(DELTA_ID);

      // Verify raw store has 0 orphans for DELTA_ID
      const deltaOrphans = await new Promise((resolve) => {
        const tx = db.transaction('bookmarks', 'readonly');
        const store = tx.objectStore('bookmarks');
        let count = 0;
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.bookId === DELTA_ID) count++;
            cursor.continue();
          } else {
            resolve(count);
          }
        };
      });

      results.push({
        id: '4.4_100_bookmarks_cascade_stress',
        description: 'deleteBook atomically purges 100 bookmarks in a single transaction with 0 remaining orphans',
        pass: deltaBmBefore.length === 100 && deltaBmAfter.length === 0 && deltaOrphans === 0,
        details: `beforeCount=${deltaBmBefore.length}, afterCount=${deltaBmAfter.length}, rawStoreOrphans=${deltaOrphans}`
      });

      // 6. Robustness against non-existent or invalid book IDs
      let nonExistentThrew = false;
      let emptyStringThrew = false;
      let nullThrew = false;

      try {
        await StorageManager.deleteBook('completely_non_existent_book_id');
      } catch (e) {
        nonExistentThrew = true;
      }

      try {
        await StorageManager.deleteBook('');
      } catch (e) {
        emptyStringThrew = true;
      }

      try {
        await StorageManager.deleteBook(null);
      } catch (e) {
        nullThrew = true;
      }

      // Ensure Beta is still intact after invalid delete attempts
      const betaFinal = await StorageManager.getBook(BETA_ID);

      results.push({
        id: '4.5_invalid_id_resilience',
        description: 'deleteBook gracefully handles non-existent IDs, empty strings, and null without throwing or corrupting data',
        pass: !nonExistentThrew && !emptyStringThrew && !nullThrew && betaFinal !== null,
        details: `nonExistentThrew=${nonExistentThrew}, emptyStringThrew=${emptyStringThrew}, nullThrew=${nullThrew}`
      });

      // Test 4.6: Unicode & Exotic Book ID Stress
      const exoticIds = [
        'book_📚_unicode_reading',
        'book_with spaces and symbols #@!%&',
        'book_special_quotes_\'\"`',
        'book_CJK_日本語_中文_한국어_2026'
      ];

      for (const eid of exoticIds) {
        await StorageManager.saveBook({ id: eid, title: `Exotic ID: ${eid}` });
        await StorageManager.saveProgress({ bookId: eid, spineIndex: 2, progressPercentage: 50 });
        await StorageManager.addBookmark({ bookId: eid, spineIndex: 2, snippet: `Bookmark for ${eid}` });

        const retrieved = await StorageManager.getBook(eid);
        const bms = await StorageManager.getBookmarks(eid);
        const prog = await StorageManager.getProgress(eid);

        const ok = retrieved && bms.length === 1 && prog && prog.progressPercentage === 50;
        await StorageManager.deleteBook(eid);

        const afterDelBook = await StorageManager.getBook(eid);
        const afterDelBms = await StorageManager.getBookmarks(eid);

        results.push({
          id: `4.6_exotic_id_${eid.slice(0, 15)}`,
          description: `Exotic book ID handled correctly (${eid}): CRUD and cascade deletion succeed`,
          pass: ok && afterDelBook === null && afterDelBms.length === 0,
          details: `preOk=${ok}, postDelBook=${afterDelBook}, postDelBms=${afterDelBms.length}`
        });
      }

      // Test 4.7: Binary Blob Storage & Integrity (Magic Bytes Verification)
      const sampleBuffer = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const binaryBlob = new Blob([sampleBuffer], { type: 'application/epub+zip' });
      const BINARY_BOOK_ID = 'book_binary_blob_test';

      await StorageManager.saveBook({
        id: BINARY_BOOK_ID,
        title: 'Binary Blob Integrity Test Book',
        fileBlob: binaryBlob
      });

      const retrievedBinaryBook = await StorageManager.getBook(BINARY_BOOK_ID);
      const isBlob = retrievedBinaryBook && retrievedBinaryBook.fileBlob instanceof Blob;
      const sizeMatches = isBlob && retrievedBinaryBook.fileBlob.size === sampleBuffer.length;
      let magicBytesValid = false;

      if (isBlob) {
        const readBuf = new Uint8Array(await retrievedBinaryBook.fileBlob.arrayBuffer());
        magicBytesValid = readBuf[0] === 0x50 && readBuf[1] === 0x4B && readBuf[2] === 0x03 && readBuf[3] === 0x04;
      }

      await StorageManager.deleteBook(BINARY_BOOK_ID);

      results.push({
        id: '4.7_binary_blob_persistence',
        description: 'WebReaderDB stores raw binary Blobs without data corruption (PK magic bytes verified)',
        pass: isBlob && sizeMatches && magicBytesValid,
        details: `isBlob=${isBlob}, sizeMatches=${sizeMatches}, magicBytesValid=${magicBytesValid}`
      });

      return results;
    });

    for (const r of cascadeResults) {
      assert(r.pass, `CascadeIntegrity: ${r.description}`, r.details);
    }

    // =========================================================================
    // SUITE 5: QUOTA & BOUNDARY GUARDS
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 5: Storage Quota Inspection & Input Boundary Guards');
    console.log('------------------------------------------------------------------------');

    const quotaResults = await page.evaluate(async () => {
      const results = [];
      const { StorageManager } = await import('./js/storage/storage-manager.js');

      // Test 5.1: Quota Info
      const quotaInfo = await StorageManager.getQuotaInfo();
      const validQuota = quotaInfo &&
        typeof quotaInfo.quotaBytes === 'number' &&
        typeof quotaInfo.usageBytes === 'number' &&
        typeof quotaInfo.percentUsed === 'number' &&
        quotaInfo.quotaBytes > 0;

      results.push({
        id: '5.1_quota_info',
        description: 'StorageManager.getQuotaInfo() returns valid quota metrics via navigator.storage.estimate',
        pass: Boolean(validQuota),
        details: validQuota ? `quota=${(quotaInfo.quotaBytes / (1024 * 1024)).toFixed(1)}MB, usage=${(quotaInfo.usageBytes / 1024).toFixed(1)}KB, percent=${quotaInfo.percentUsed.toFixed(4)}%` : 'null'
      });

      // Test 5.2: Invalid input rejections in WebReaderDB
      let saveBookNullThrows = false;
      let saveProgressNullThrows = false;
      let addBookmarkNullThrows = false;

      try {
        await StorageManager.saveBook(null);
      } catch (e) {
        saveBookNullThrows = true;
      }

      try {
        await StorageManager.saveProgress(null);
      } catch (e) {
        saveProgressNullThrows = true;
      }

      try {
        await StorageManager.addBookmark(null);
      } catch (e) {
        addBookmarkNullThrows = true;
      }

      results.push({
        id: '5.2_input_boundaries',
        description: 'WebReaderDB strictly rejects null/invalid records on write operations',
        pass: saveBookNullThrows && saveProgressNullThrows && addBookmarkNullThrows,
        details: `saveBookNullThrows=${saveBookNullThrows}, saveProgressNullThrows=${saveProgressNullThrows}, addBookmarkNullThrows=${addBookmarkNullThrows}`
      });

      return results;
    });

    for (const r of quotaResults) {
      assert(r.pass, `QuotaAndBoundaries: ${r.description}`, r.details);
    }

    // Zero page errors check
    assert(uncaughtPageErrors.length === 0, 'Zero uncaught page errors during entire browser stress session', uncaughtPageErrors.join('; '));

  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[Chrome] Browser closed.');
    }
    if (server) {
      await server.close();
      console.log('[Static Server] Server closed.');
    }
  }

  console.log('\n========================================================================');
  console.log(`CHALLENGE HARNESS COMPLETE: ${passedAssertions}/${totalAssertions} PASSED (${failedAssertions} FAILED)`);
  console.log('========================================================================\n');

  if (failedAssertions > 0) {
    console.error('FAILURES DETECTED:');
    for (const f of failures) {
      console.error(` - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('ALL ADVERSARIAL STRESS CHALLENGES PASSED EMPIRICALLY!');
    process.exit(0);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('FATAL HARNESS EXCEPTION:', err);
  process.exit(1);
});
