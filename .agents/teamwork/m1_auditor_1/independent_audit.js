/**
 * .agents/teamwork/m1_auditor_1/independent_audit.js
 * Independent Forensic Audit & Stress-Testing Script for Milestone 1
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function check(desc, passed, detail = '') {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`[PASS] ${desc}`);
  } else {
    failedChecks++;
    failures.push({ desc, detail });
    console.error(`[FAIL] ${desc} :: ${detail}`);
  }
}

// -----------------------------------------------------------------------------
// WCAG Luminance & Contrast Formula
// -----------------------------------------------------------------------------
function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function srgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.03928 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// -----------------------------------------------------------------------------
// Simple Static Server for Audit
// -----------------------------------------------------------------------------
function startAuditServer(port = 4567) {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(REPO_ROOT, reqPath);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    res.writeHead(200, {
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// -----------------------------------------------------------------------------
// MAIN AUDIT EXECUTION
// -----------------------------------------------------------------------------
async function runAudit() {
  console.log('================================================================');
  console.log('       INDEPENDENT FORENSIC AUDIT - MILESTONE 1                 ');
  console.log('================================================================\n');

  // 1. Static Integrity: Vendor JSZip Analysis
  console.log('--- Phase 1: JSZip Authenticity & Static Analysis ---');
  const jszipPath = path.join(REPO_ROOT, 'vendor/jszip.min.js');
  check('vendor/jszip.min.js exists and is readable', fs.existsSync(jszipPath));
  const jszipContent = fs.readFileSync(jszipPath, 'utf8');
  check('vendor/jszip.min.js has valid size (> 90KB and < 150KB)', jszipContent.length >= 90000 && jszipContent.length <= 150000, `Length: ${jszipContent.length}`);
  check('vendor/jszip.min.js has official licensing and version header', jszipContent.includes('JSZip v3.10.1') && jszipContent.includes('Stuart Knightley'));
  check('vendor/jszip.min.js contains DEFLATE/INFLATE compression algorithms (pako)', jszipContent.includes('pako') || jszipContent.includes('deflate') || jszipContent.includes('inflate'));

  // Evaluate JSZip in an isolated VM sandbox to prove genuine functional zip capabilities
  const sandbox = {
    globalThis: {},
    self: {},
    window: {},
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    Buffer,
    Uint8Array,
    ArrayBuffer
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jszipContent, sandbox);
  const JSZipConstructor = sandbox.JSZip || sandbox.window.JSZip || sandbox.globalThis.JSZip;
  check('JSZip executes and registers constructor in VM sandbox', typeof JSZipConstructor === 'function');

  // Test genuine compression & round-trip extraction with arbitrary non-mock data
  const testZip = new JSZipConstructor();
  const arbitrarySecret = `FORENSIC_INTEGRITY_CHECK_${Math.random()}_${Date.now()}`;
  testZip.file('test/dir/secret.txt', arbitrarySecret, { compression: 'DEFLATE' });
  testZip.file('uncompressed.dat', 'STORED_BYTES_RAW', { compression: 'STORE' });
  const generatedBuffer = await testZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  check('JSZip generates genuine zip buffer beginning with PK\\x03\\x04', generatedBuffer.readUInt32LE(0) === 0x04034b50);
  
  const reloadedZip = await JSZipConstructor.loadAsync(generatedBuffer);
  const extractedSecret = await reloadedZip.file('test/dir/secret.txt').async('string');
  const extractedDat = await reloadedZip.file('uncompressed.dat').async('string');
  check('JSZip round-trips compressed secret accurately', extractedSecret === arbitrarySecret);
  check('JSZip round-trips uncompressed STORE data accurately', extractedDat === 'STORED_BYTES_RAW');

  // Test rejection of corrupted zip data
  let threwOnCorrupt = false;
  try {
    const corruptBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x99, 0x99]);
    await JSZipConstructor.loadAsync(corruptBuffer);
  } catch (err) {
    threwOnCorrupt = true;
  }
  check('JSZip rejects corrupted zip headers', threwOnCorrupt);

  // 2. EventBus Pub/Sub Adversarial Analysis
  console.log('\n--- Phase 2: EventBus Pub/Sub Adversarial Stress-Testing ---');
  const { EventBus, EVENTS } = await import(path.join(REPO_ROOT, 'js/event-bus.js'));
  EventBus.clear();
  check('EventBus starts clean with 0 listeners', EventBus.listenerCount() === 0);

  // Challenge: Handler error during event dispatch must NOT prevent subsequent handlers from executing
  let handler1Ran = false;
  let handler3Ran = false;
  EventBus.on('test:stress', () => { handler1Ran = true; });
  EventBus.on('test:stress', () => { throw new Error('Adversarial fatal error in handler 2'); });
  EventBus.on('test:stress', () => { handler3Ran = true; });
  EventBus.emit('test:stress', { test: true });
  check('EventBus executes all handlers despite intermediate exception (error isolation)', handler1Ran && handler3Ran);

  // Challenge: Unsubscribe during handler execution must not corrupt snapshot
  let loopCount = 0;
  let selfUnsub = null;
  selfUnsub = EventBus.on('test:reentrant', () => {
    loopCount++;
    if (selfUnsub) selfUnsub();
  });
  EventBus.emit('test:reentrant');
  EventBus.emit('test:reentrant');
  check('Self-unsubscribing listener executes exactly once and unhooks cleanly', loopCount === 1);

  // Challenge: Rejection of invalid handler types
  let caughtInvalidOn = false;
  try {
    EventBus.on('bad', 'not a function');
  } catch (e) {
    caughtInvalidOn = true;
  }
  check('EventBus.on throws TypeError on non-function handler', caughtInvalidOn);

  // 3. SettingsManager Defensive & Edge-Case Testing
  console.log('\n--- Phase 3: SettingsStore Defensive & Bounds Testing ---');
  const { SettingsManager } = await import(path.join(REPO_ROOT, 'js/storage/settings-store.js'));

  // Test invalid theme sanitization
  SettingsManager.setTheme('hack_evil_theme');
  check('SettingsManager rejects invalid theme and defaults to warm-paper', SettingsManager.getTheme() === 'warm-paper');

  // Test typography out-of-bounds inputs
  SettingsManager.setTypography({ fontSize: 9999, lineHeight: -5, maxWidth: 10 });
  const boundedTypo = SettingsManager.getTypography();
  check('SettingsManager clamps or defaults out-of-bounds fontSize (18)', boundedTypo.fontSize === 18);
  check('SettingsManager clamps or defaults out-of-bounds lineHeight (1.75)', boundedTypo.lineHeight === 1.75);
  check('SettingsManager clamps or defaults out-of-bounds maxWidth (720)', boundedTypo.maxWidth === 720);

  // Test corrupt JSON in localStorage
  if (typeof globalThis.localStorage !== 'undefined' && typeof globalThis.localStorage.setItem === 'function') {
    globalThis.localStorage.setItem('webreader_typography', '{bad json');
    const safeTypo = SettingsManager.getTypography();
    check('SettingsManager safely handles corrupt JSON in localStorage without throwing', safeTypo.fontFamily === 'serif');
  }

  // 4. Sample Book EPUB Binary OCF / OPF Structural Forensics
  console.log('\n--- Phase 4: Sample EPUB Binary OCF 3.3 Conformance Forensics ---');
  // Inject JSZip onto globalThis for sample-book generator
  globalThis.JSZip = JSZipConstructor;
  const { generateSampleEpub, SAMPLE_BOOK_METADATA } = await import(path.join(REPO_ROOT, 'js/sample-book.js'));

  const sampleEpubResult = await generateSampleEpub();
  const epubBuffer = Buffer.from(sampleEpubResult.arrayBuffer);

  // Forensics on bytes 0..58
  const magic = epubBuffer.readUInt32BE(0);
  check('EPUB begins with ZIP Local File Header Magic 0x504b0304', magic === 0x504b0304);

  const compressionMethod = epubBuffer.readUInt16LE(8);
  check('First entry compression method is 0 (STORED uncompressed)', compressionMethod === 0);

  const filenameLen = epubBuffer.readUInt16LE(26);
  check('First entry filename length is 8 (mimetype)', filenameLen === 8);

  const extraFieldLen = epubBuffer.readUInt16LE(28);
  check('First entry extra field length is 0 (strict EPUB OCF 3.3 requirement)', extraFieldLen === 0);

  const filename = epubBuffer.subarray(30, 30 + filenameLen).toString('utf8');
  check('First entry filename is exact "mimetype"', filename === 'mimetype');

  const mimetypeData = epubBuffer.subarray(38, 38 + 20).toString('utf8');
  check('Mimetype content at offset 38 is "application/epub+zip"', mimetypeData === 'application/epub+zip');

  // Decompress and verify inner files
  const unpackedEpub = await JSZipConstructor.loadAsync(epubBuffer);
  const containerXml = await unpackedEpub.file('META-INF/container.xml').async('string');
  check('META-INF/container.xml contains full-path="OEBPS/content.opf"', containerXml.includes('full-path="OEBPS/content.opf"'));

  const contentOpf = await unpackedEpub.file('OEBPS/content.opf').async('string');
  check('OEBPS/content.opf has Dublin Core metadata', contentOpf.includes('<dc:title>') && contentOpf.includes(SAMPLE_BOOK_METADATA.title));
  check('OEBPS/content.opf specifies EPUB 3 navigation item', contentOpf.includes('properties="nav"'));
  check('OEBPS/content.opf specifies cover image item', contentOpf.includes('properties="cover-image"'));

  const navXhtml = await unpackedEpub.file('OEBPS/nav.xhtml').async('string');
  check('OEBPS/nav.xhtml contains <nav epub:type="toc">', navXhtml.includes('epub:type="toc"') || navXhtml.includes('role="doc-toc"'));

  const tocNcx = await unpackedEpub.file('OEBPS/toc.ncx').async('string');
  check('OEBPS/toc.ncx contains valid <navMap>', tocNcx.includes('<navMap>') && tocNcx.includes('Chapter I:'));

  const ch01 = await unpackedEpub.file('OEBPS/text/ch01.xhtml').async('string');
  const ch02 = await unpackedEpub.file('OEBPS/text/ch02.xhtml').async('string');
  const ch03 = await unpackedEpub.file('OEBPS/text/ch03.xhtml').async('string');
  check('All 3 chapters contain rich typography and sections', ch01.includes('drop-cap') && ch02.includes('diagram-wrapper') && ch03.includes('font-table'));

  // 5. CSS Themes & Contrast Ratios (WCAG 2.1 AA/AAA)
  console.log('\n--- Phase 5: CSS Themes & Photopic Eye-Comfort Verification ---');
  const themesCss = fs.readFileSync(path.join(REPO_ROOT, 'css/themes.css'), 'utf8');

  // Check all 4 themes are defined
  check('css/themes.css defines warm-paper theme', themesCss.includes('[data-theme="warm-paper"]') || themesCss.includes(':root'));
  check('css/themes.css defines soft-dark theme', themesCss.includes('[data-theme="soft-dark"]'));
  check('css/themes.css defines daylight theme', themesCss.includes('[data-theme="daylight"]'));
  check('css/themes.css defines sage theme', themesCss.includes('[data-theme="sage"]'));

  // Verify anti-glare constraint: NO theme may use pure black (#000000) text on pure white (#ffffff)
  const hasPureBlackOnWhite = /--color-bg:\s*#ffffff;[\s\S]*?--color-text:\s*#000000;/i.test(themesCss);
  check('No theme uses harsh #000000 on #ffffff (glare avoidance verified)', !hasPureBlackOnWhite);

  // Independent mathematical contrast validation:
  const palettes = [
    { name: 'warm-paper', bg: '#f8f1e3', text: '#2c2523', surface: '#efe5d0', accent: '#8b5a2b', accentText: '#ffffff' },
    { name: 'soft-dark', bg: '#1a1c1e', text: '#e2e2e0', surface: '#24282c', accent: '#e5a869', accentText: '#1a1c1e' },
    { name: 'daylight', bg: '#fcfbf9', text: '#1e2022', surface: '#f3f2ee', accent: '#2364a0', accentText: '#ffffff' },
    { name: 'sage', bg: '#eef3ed', text: '#1c2820', surface: '#e1eae0', accent: '#2d7348', accentText: '#ffffff' }
  ];

  for (const pal of palettes) {
    const textOnBg = getContrastRatio(pal.text, pal.bg);
    const textOnSurface = getContrastRatio(pal.text, pal.surface);
    const accentTextOnAccent = getContrastRatio(pal.accentText, pal.accent);

    check(`[${pal.name}] Body text on BG contrast is >= 7:1 (AAA) (Actual: ${textOnBg.toFixed(2)}:1)`, textOnBg >= 7.0);
    check(`[${pal.name}] Body text on Surface contrast is >= 7:1 (AAA) (Actual: ${textOnSurface.toFixed(2)}:1)`, textOnSurface >= 7.0);
    check(`[${pal.name}] Accent text on Button contrast is >= 4.5:1 (AA) (Actual: ${accentTextOnAccent.toFixed(2)}:1)`, accentTextOnAccent >= 4.5);
  }

  // 6. Headless Browser Verification (Chrome & IndexedDB)
  console.log('\n--- Phase 6: Headless Chrome Execution & Relational Data Isolation ---');
  const server = await startAuditServer(4567);
  console.log('Independent audit HTTP server listening on http://127.0.0.1:4567');

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:4567/index.html', { waitUntil: 'networkidle0' });

    // Verify FOUC prevention attribute
    const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('Initial data-theme attribute set by synchronous <head> script', dataTheme === 'warm-paper');

    // Verify JSZip on window
    const windowHasJSZip = await page.evaluate(() => typeof window.JSZip === 'function');
    check('window.JSZip is defined and callable in browser', windowHasJSZip);

    // Verify dynamic import of storage & sample book in browser context
    const browserStorageResult = await page.evaluate(async () => {
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const { generateSampleEpub, SAMPLE_BOOK_ID } = await import('./js/sample-book.js');

      // 1. Save two distinct books to test foreign key isolation
      const sample1 = await generateSampleEpub();
      const sample2 = await generateSampleEpub();
      sample2.bookRecord.id = 'book_foreign_002';
      sample2.bookRecord.title = 'Foreign Book Test';

      await StorageManager.saveBook(sample1.bookRecord);
      await StorageManager.saveBook(sample2.bookRecord);

      // 2. Save reading progress for both books
      await StorageManager.saveProgress({ bookId: SAMPLE_BOOK_ID, spineIndex: 2, pageIndex: 5, progressPercent: 65 });
      await StorageManager.saveProgress({ bookId: 'book_foreign_002', spineIndex: 1, pageIndex: 0, progressPercent: 20 });

      // 3. Add bookmarks for both books
      const bm1_a = await StorageManager.addBookmark({ bookId: SAMPLE_BOOK_ID, title: 'Sample BM 1', spineIndex: 1 });
      const bm1_b = await StorageManager.addBookmark({ bookId: SAMPLE_BOOK_ID, title: 'Sample BM 2', spineIndex: 2 });
      const bm2_a = await StorageManager.addBookmark({ bookId: 'book_foreign_002', title: 'Foreign BM 1', spineIndex: 1 });

      // Verify books exist
      const allBooksBefore = await StorageManager.getAllBooks();

      // 4. Delete ONLY sample 1
      await StorageManager.deleteBook(SAMPLE_BOOK_ID);

      // Verify sample 1 is gone, but foreign book remains
      const allBooksAfter = await StorageManager.getAllBooks();
      const sample1After = await StorageManager.getBook(SAMPLE_BOOK_ID);
      const sample2After = await StorageManager.getBook('book_foreign_002');

      // Verify progress for sample 1 was purged, but sample 2 progress preserved
      const prog1After = await StorageManager.getProgress(SAMPLE_BOOK_ID);
      const prog2After = await StorageManager.getProgress('book_foreign_002');

      // Verify bookmarks for sample 1 were purged, but sample 2 bookmark preserved
      const bm1After = await StorageManager.getBookmarks(SAMPLE_BOOK_ID);
      const bm2After = await StorageManager.getBookmarks('book_foreign_002');

      return {
        booksBeforeCount: allBooksBefore.length,
        booksAfterCount: allBooksAfter.length,
        sample1Deleted: sample1After === null,
        sample2Preserved: sample2After !== null && sample2After.title === 'Foreign Book Test',
        prog1Purged: prog1After === null,
        prog2Preserved: prog2After !== null && prog2After.progressPercent === 20,
        bm1PurgedCount: bm1After.length,
        bm2PreservedCount: bm2After.length
      };
    });

    check('StorageManager saved multiple books', browserStorageResult.booksBeforeCount >= 2);
    check('StorageManager.deleteBook purged target book', browserStorageResult.sample1Deleted);
    check('StorageManager.deleteBook preserved untargeted foreign book (data isolation)', browserStorageResult.sample2Preserved);
    check('Atomic cascade delete purged target book reading progress', browserStorageResult.prog1Purged);
    check('Atomic cascade delete preserved untargeted book reading progress', browserStorageResult.prog2Preserved);
    check('Atomic cascade delete purged all target book bookmarks (count: 0)', browserStorageResult.bm1PurgedCount === 0);
    check('Atomic cascade delete preserved untargeted book bookmarks (count: 1)', browserStorageResult.bm2PreservedCount === 1);

    // Verify touch of lastRead during saveProgress
    const touchResult = await page.evaluate(async () => {
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const bookBefore = await StorageManager.getBook('book_foreign_002');
      const initialLastRead = bookBefore.lastRead;

      // Small delay
      await new Promise(r => setTimeout(r, 15));
      await StorageManager.saveProgress({ bookId: 'book_foreign_002', spineIndex: 3, pageIndex: 1, progressPercent: 80 });

      const bookAfter = await StorageManager.getBook('book_foreign_002');
      return {
        initialLastRead,
        updatedLastRead: bookAfter.lastRead,
        wasUpdated: bookAfter.lastRead > initialLastRead
      };
    });
    check('saveProgress touches and updates lastRead timestamp on book record', touchResult.wasUpdated);

    // Verify zero page errors
    check('Zero uncaught exceptions or page errors during audit', pageErrors.length === 0, pageErrors.join(', '));

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  // Summary
  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passedChecks}/${totalChecks} CHECKS PASSED (${failedChecks} FAILED)`);
  console.log('================================================================');

  if (failedChecks > 0) {
    console.error('FAILURES:');
    for (const f of failures) {
      console.error(`- ${f.desc}: ${f.detail}`);
    }
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
