/**
 * .agents/teamwork/m1_worker_1/verify_m1.js
 * Comprehensive Verification Suite for Milestone 1:
 * - EventBus mechanics & error isolation
 * - SettingsStore (localStorage & fallback)
 * - JSZip vendoring & Sample EPUB binary conformance (OCF 3.3)
 * - WCAG AAA mathematical contrast calculation for all 4 themes
 * - Headless Chrome IndexedDB WebReaderDB atomic cascade deletion, seeding, and FOUC prevention
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ PASS: ${message}`);
}

async function run() {
  console.log('================================================================');
  console.log('       MILESTONE 1 COMPREHENSIVE VERIFICATION SUITE              ');
  console.log('================================================================');

  // ---------------------------------------------------------------------------
  // 1. EVENTBUS VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. EventBus Pub/Sub Mechanics ---');
  const { EventBus, EVENTS } = await import('../../../js/event-bus.js');

  assert(typeof EVENTS === 'object' && Object.isFrozen(EVENTS), 'EVENTS catalog is frozen');
  assert(EVENTS.BOOK_OPEN === 'book:open', 'EVENTS.BOOK_OPEN is defined');
  assert(EVENTS.PAGE_CHANGED === 'page:changed', 'EVENTS.PAGE_CHANGED is defined');

  EventBus.clear();
  let receivedPayload = null;
  const unsub = EventBus.on('test:event', (payload) => {
    receivedPayload = payload;
  });
  EventBus.emit('test:event', { foo: 'bar' });
  assert(receivedPayload && receivedPayload.foo === 'bar', 'EventBus.on receives emitted payload');

  unsub();
  receivedPayload = null;
  EventBus.emit('test:event', { foo: 'baz' });
  assert(receivedPayload === null, 'Unsubscribe closure detaches handler');

  let onceCount = 0;
  EventBus.once('test:once', () => {
    onceCount++;
  });
  EventBus.emit('test:once');
  EventBus.emit('test:once');
  assert(onceCount === 1, 'EventBus.once triggers exactly once');

  // Error isolation
  let survived = false;
  EventBus.on('test:error', () => {
    throw new Error('Simulated listener crash');
  });
  EventBus.on('test:error', () => {
    survived = true;
  });
  EventBus.emit('test:error');
  assert(survived === true, 'EventBus provides listener error isolation');

  EventBus.clear();
  assert(EventBus.listenerCount() === 0, 'EventBus.clear resets all listeners');

  // ---------------------------------------------------------------------------
  // 2. SETTINGS STORE (LOCALSTORAGE & FALLBACK)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Settings Store Mechanics ---');
  const { SettingsManager, THEMES, DEFAULT_TYPOGRAPHY } = await import('../../../js/storage/settings-store.js');

  assert(SettingsManager.getTheme() === THEMES.WARM_PAPER, 'Default theme is warm-paper');
  SettingsManager.setTheme('soft-dark');
  assert(SettingsManager.getTheme() === 'soft-dark', 'Theme persists soft-dark');

  SettingsManager.setTheme('invalid-theme-name');
  assert(SettingsManager.getTheme() === THEMES.WARM_PAPER, 'Invalid theme safely defaults to warm-paper');

  const defaultTypo = SettingsManager.getTypography();
  assert(defaultTypo.fontSize === DEFAULT_TYPOGRAPHY.fontSize, 'Default typography font size is 18');

  SettingsManager.setTypography({ fontSize: 22, fontFamily: 'dyslexic' });
  const updatedTypo = SettingsManager.getTypography();
  assert(updatedTypo.fontSize === 22, 'Typography fontSize updated to 22');
  assert(updatedTypo.fontFamily === 'dyslexic', 'Typography fontFamily updated to dyslexic');

  SettingsManager.setReadingMode('scroll');
  assert(SettingsManager.getReadingMode() === 'scroll', 'Reading mode persists scroll');
  SettingsManager.setReadingMode('paginated');
  assert(SettingsManager.getReadingMode() === 'paginated', 'Reading mode persists paginated');

  SettingsManager.setLastBookId('book_sample_42');
  assert(SettingsManager.getLastBookId() === 'book_sample_42', 'Last book ID persists');
  SettingsManager.setLastBookId(null);
  assert(SettingsManager.getLastBookId() === null, 'Last book ID cleared when null');

  const fullSettings = SettingsManager.getSettings();
  assert(typeof fullSettings === 'object' && fullSettings.theme && fullSettings.typography, 'getSettings returns composite object');

  // ---------------------------------------------------------------------------
  // 3. JSZIP VENDORED FILE & SAMPLE EPUB BINARY CONFORMANCE
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Standalone JSZip & Sample EPUB Generator ---');
  const jszipPath = path.join(PROJECT_ROOT, 'vendor/jszip.min.js');
  assert(fs.existsSync(jszipPath), 'vendor/jszip.min.js exists');

  const jszipCode = fs.readFileSync(jszipPath, 'utf8');
  assert(jszipCode.includes('JSZip v3.10.1'), 'vendor/jszip.min.js is JSZip 3.10.1');

  // Execute JSZip in global context for Node verification
  const sandbox = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    Blob,
    Uint8Array,
    ArrayBuffer
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jszipCode, sandbox);
  const JSZip = sandbox.JSZip || sandbox.window.JSZip;
  assert(typeof JSZip === 'function', 'JSZip exports valid constructor');

  // Provide JSZip to global for sample-book generator
  global.window = global.window || {};
  global.window.JSZip = JSZip;
  global.JSZip = JSZip;

  const { generateSampleEpub, generateCoverSvg, generateStylesheetCss } = await import('../../../js/sample-book.js');
  const { blob, arrayBuffer, bookRecord, metadata } = await generateSampleEpub();

  assert(blob instanceof Blob, 'Sample EPUB returns valid Blob');
  assert(arrayBuffer instanceof ArrayBuffer, 'Sample EPUB returns valid ArrayBuffer');
  assert(bookRecord.id === 'sample-book-001', 'Sample bookRecord ID is deterministic');
  assert(metadata.title.includes('Art of Reading'), 'Sample metadata title matches specification');

  // OCF 3.3 Binary Conformance Verification
  const buf = Buffer.from(arrayBuffer);
  // 1. Magic bytes: PK\x03\x04
  const magic = buf.subarray(0, 4).toString('hex');
  assert(magic === '504b0304', 'EPUB file begins with ZIP magic signature 0x504b0304');

  // 2. Mimetype compression: 0 (STORE)
  const compressionMethod = buf.readUInt16LE(8);
  assert(compressionMethod === 0, 'mimetype file is stored UNCOMPRESSED (method 0 / STORE)');

  // 3. Filename length: 8
  const filenameLength = buf.readUInt16LE(26);
  assert(filenameLength === 8, 'First local header filename length is 8');

  // 4. Extra field length: 0
  const extraLength = buf.readUInt16LE(28);
  assert(extraLength === 0, 'First local header extra field length is 0 (strict OCF 3.3)');

  // 5. Filename + Content
  const filenameAndContent = buf.subarray(30, 58).toString('utf8');
  assert(filenameAndContent === 'mimetypeapplication/epub+zip', 'Uncompressed mimetype content is exact application/epub+zip');

  // Inspect EPUB archive entries using JSZip
  const parsedZip = await JSZip.loadAsync(arrayBuffer);
  const expectedFiles = [
    'mimetype',
    'META-INF/container.xml',
    'OEBPS/content.opf',
    'OEBPS/toc.ncx',
    'OEBPS/nav.xhtml',
    'OEBPS/cover.xhtml',
    'OEBPS/images/cover.svg',
    'OEBPS/styles/stylesheet.css',
    'OEBPS/text/ch01.xhtml',
    'OEBPS/text/ch02.xhtml',
    'OEBPS/text/ch03.xhtml'
  ];
  for (const f of expectedFiles) {
    assert(parsedZip.file(f) !== null, `Archive contains entry: ${f}`);
  }

  // ---------------------------------------------------------------------------
  // 4. WCAG CONTRAST RATIO PROOF FOR ALL 4 THEMES
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. WCAG AA & AAA Mathematical Proof ---');
  function sRGBtoLin(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function getLuminance(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
  }
  function getContrast(h1, h2) {
    const l1 = getLuminance(h1);
    const l2 = getLuminance(h2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  const themePalettes = [
    { theme: 'warm-paper', bg: '#f8f1e3', text: '#2c2523', surface: '#efe5d0', secondary: '#5c504a', muted: '#70625b', accent: '#8b5a2b', accentText: '#ffffff', borderStrong: '#96836e' },
    { theme: 'soft-dark',  bg: '#1a1c1e', text: '#e2e2e0', surface: '#24282c', secondary: '#9e9e9a', muted: '#92928d', accent: '#e5a869', accentText: '#1a1c1e', borderStrong: '#636b75' },
    { theme: 'daylight',   bg: '#fcfbf9', text: '#1e2022', surface: '#f3f2ee', secondary: '#555b62', muted: '#666d75', accent: '#2364a0', accentText: '#ffffff', borderStrong: '#8d9299' },
    { theme: 'sage',       bg: '#eef3ed', text: '#1c2820', surface: '#e1eae0', secondary: '#4a5d50', muted: '#56685c', accent: '#2d7348', accentText: '#ffffff', borderStrong: '#778d7b' }
  ];

  for (const t of themePalettes) {
    const bodyBg = getContrast(t.text, t.bg);
    const bodySurf = getContrast(t.text, t.surface);
    const secBg = getContrast(t.secondary, t.bg);
    const mutedSurf = getContrast(t.muted, t.surface);
    const btnText = getContrast(t.accentText, t.accent);
    const borderUi = getContrast(t.borderStrong, t.bg);

    assert(bodyBg >= 7.0, `[${t.theme}] Body on BG (${bodyBg.toFixed(2)}:1) meets WCAG AAA (>= 7.0:1)`);
    assert(bodySurf >= 7.0, `[${t.theme}] Body on Surface (${bodySurf.toFixed(2)}:1) meets WCAG AAA (>= 7.0:1)`);
    assert(secBg >= 4.5, `[${t.theme}] Secondary on BG (${secBg.toFixed(2)}:1) meets WCAG AA (>= 4.5:1)`);
    assert(mutedSurf >= 4.5, `[${t.theme}] Muted on Surface (${mutedSurf.toFixed(2)}:1) meets WCAG AA (>= 4.5:1)`);
    assert(btnText >= 4.5, `[${t.theme}] Accent Text on Button (${btnText.toFixed(2)}:1) meets WCAG AA (>= 4.5:1)`);
    assert(borderUi >= 3.0, `[${t.theme}] Strong border on BG (${borderUi.toFixed(2)}:1) meets Non-text UI (>= 3.0:1)`);
  }

  // ---------------------------------------------------------------------------
  // 5. HEADLESS CHROME TEST (INDEXEDDB, FOUC, SAMPLE SEEDING)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Headless Chrome Browser Verification ---');
  assert(fs.existsSync(CHROME_PATH), `Chrome binary found at ${CHROME_PATH}`);

  const { startServer } = require('../../../test/server.js');
  const serverInstance = await startServer({ port: 0, autoPortFallback: true });
  console.log(`  Static server running on: ${serverInstance.url}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(serverInstance.url + '/index.html', { waitUntil: 'load' });

    // Verify FOUC prevention & head execution
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(initialTheme === 'warm-paper', 'Initial data-theme set to warm-paper in <head>');

    // Verify CSS variables applied from css/themes.css
    const bgVal = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    });
    assert(bgVal === '#f8f1e3', 'Computed --color-bg matches warm-paper palette');

    // Switch through all 4 themes in browser and verify computed styles
    const themesToTest = [
      { name: 'soft-dark', bg: '#1a1c1e', text: '#e2e2e0', accentText: '#1a1c1e' },
      { name: 'daylight', bg: '#fcfbf9', text: '#1e2022', accentText: '#ffffff' },
      { name: 'sage', bg: '#eef3ed', text: '#1c2820', accentText: '#ffffff' },
      { name: 'warm-paper', bg: '#f8f1e3', text: '#2c2523', accentText: '#ffffff' }
    ];

    for (const t of themesToTest) {
      const computed = await page.evaluate((themeName) => {
        document.documentElement.setAttribute('data-theme', themeName);
        const style = getComputedStyle(document.documentElement);
        return {
          bg: style.getPropertyValue('--color-bg').trim(),
          text: style.getPropertyValue('--color-text').trim(),
          accentText: style.getPropertyValue('--color-accent-text').trim()
        };
      }, t.name);

      assert(computed.bg === t.bg, `Browser applied [${t.name}] --color-bg = ${t.bg}`);
      assert(computed.text === t.text, `Browser applied [${t.name}] --color-text = ${t.text}`);
      assert(computed.accentText === t.accentText, `Browser applied [${t.name}] --color-accent-text = ${t.accentText}`);
    }

    // Verify JSZip global is loaded in browser
    const jszipLoaded = await page.evaluate(() => typeof window.JSZip === 'function');
    assert(jszipLoaded, 'window.JSZip is loaded and available globally in browser');

    // Verify WebReaderDB IndexedDB and StorageManager in browser
    const idbResult = await page.evaluate(async () => {
      // Import storage-manager and sample-book
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const { generateSampleEpub, seedSampleBookIfEmpty, restoreSampleBook, SAMPLE_BOOK_ID } = await import('./js/sample-book.js');

      // 1. Initial getAllBooks on clean db
      const initialBooks = await StorageManager.getAllBooks();
      const initialCount = initialBooks.length;

      // 2. Auto-seeding
      const seeded = await seedSampleBookIfEmpty(StorageManager);
      const afterSeedBooks = await StorageManager.getAllBooks();

      // 3. Save progress
      await StorageManager.saveProgress({
        bookId: SAMPLE_BOOK_ID,
        spineIndex: 2,
        pageIndex: 3,
        totalPages: 10,
        progressPercentage: 30
      });
      const progress = await StorageManager.getProgress(SAMPLE_BOOK_ID);

      // 4. Add bookmarks
      const bmId1 = await StorageManager.addBookmark({
        bookId: SAMPLE_BOOK_ID,
        spineIndex: 1,
        snippet: 'Chapter 1 bookmark'
      });
      const bmId2 = await StorageManager.addBookmark({
        bookId: SAMPLE_BOOK_ID,
        spineIndex: 2,
        snippet: 'Chapter 2 bookmark'
      });
      const bookmarksBefore = await StorageManager.getBookmarks(SAMPLE_BOOK_ID);

      // 5. Atomic cascade delete
      await StorageManager.deleteBook(SAMPLE_BOOK_ID);
      const booksAfterDel = await StorageManager.getAllBooks();
      const progressAfterDel = await StorageManager.getProgress(SAMPLE_BOOK_ID);
      const bookmarksAfterDel = await StorageManager.getBookmarks(SAMPLE_BOOK_ID);

      // 6. Restore sample book
      const restored = await restoreSampleBook(StorageManager);
      const booksAfterRestore = await StorageManager.getAllBooks();

      return {
        initialCount,
        seededId: seeded ? seeded.id : null,
        afterSeedCount: afterSeedBooks.length,
        progressMatches: progress && progress.spineIndex === 2 && progress.progressPercentage === 30,
        bookmarksBeforeCount: bookmarksBefore.length,
        booksAfterDelCount: booksAfterDel.length,
        progressPurged: progressAfterDel === null,
        bookmarksPurged: bookmarksAfterDel.length === 0,
        restoredId: restored ? restored.id : null,
        booksAfterRestoreCount: booksAfterRestore.length
      };
    });

    assert(idbResult.afterSeedCount >= 1, 'IndexedDB auto-seeding saved sample book');
    assert(idbResult.progressMatches, 'IndexedDB saved and retrieved reading progress accurately');
    assert(idbResult.bookmarksBeforeCount === 2, 'IndexedDB saved and retrieved bookmarks accurately');
    assert(idbResult.booksAfterDelCount === 0, 'IndexedDB deleted book record');
    assert(idbResult.progressPurged, 'IndexedDB atomically purged reading progress on book deletion');
    assert(idbResult.bookmarksPurged, 'IndexedDB atomically purged all associated bookmarks on book deletion');
    assert(idbResult.booksAfterRestoreCount === 1, 'IndexedDB restored sample book via restoreSampleBook');

    assertEqual(pageErrors.length, 0, `Zero page errors during browser verification: ${pageErrors.join(', ')}`);

  } finally {
    if (browser) await browser.close();
    if (serverInstance) await serverInstance.close();
  }

  function assertEqual(actual, expected, message) {
    assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
  }

  console.log('\n================================================================');
  console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
