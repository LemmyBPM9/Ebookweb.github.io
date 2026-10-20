/**
 * .agents/teamwork/m1_worker_2/verify_m1_r2.js
 * Comprehensive Remediation Verification Suite for Milestone 1 (Iteration 2):
 * - EventBus mechanics & error isolation
 * - SettingsStore (localStorage & fallback)
 * - JSZip vendoring & Sample EPUB binary conformance (OCF 3.3)
 * - Enhanced Native DOMParser XML/XHTML/SVG Validation across all 9 EPUB entries:
 *   * Zero <parsererror> tags
 *   * OPF package metadata, spine (4 itemrefs), manifest properties (nav, cover-image)
 *   * NCX and NavDoc structural parity (10 navigation points each)
 * - WCAG AAA mathematical contrast calculation for all 4 themes
 * - Headless Chrome Verification:
 *   * FOUC bootstrap in <head>
 *   * Double-rAF removal of .no-theme-transition class
 *   * Computed transitions for body, .drawer (transform preserved), and .btn (transform preserved)
 *   * Theme toggling with computed CSS custom properties
 *   * WebReaderDB IndexedDB auto-seeding, progress saving, bookmarks CRUD, and atomic cascade delete
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

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

async function run() {
  console.log('================================================================');
  console.log('       MILESTONE 1 ITERATION 2 REMEDIATION VERIFICATION          ');
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
  assert(defaultTypo.fontFamily === DEFAULT_TYPOGRAPHY.fontFamily, 'Default typography fontFamily loaded');
  assert(defaultTypo.fontSize === DEFAULT_TYPOGRAPHY.fontSize, 'Default typography fontSize loaded');

  SettingsManager.setTypography({ fontSize: 22, fontFamily: 'sans' });
  const updatedTypo = SettingsManager.getTypography();
  assert(updatedTypo.fontSize === 22, 'Typography update persisted fontSize=22');
  assert(updatedTypo.fontFamily === 'sans', 'Typography update persisted fontFamily=sans');

  // ---------------------------------------------------------------------------
  // 3. SAMPLE EPUB BINARY GENERATION & OCF 3.3 CONFORMANCE
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Sample EPUB Generator & OCF 3.3 Binary Conformance ---');
  const jszipCode = fs.readFileSync(path.resolve(PROJECT_ROOT, 'vendor/jszip.min.js'), 'utf8');
  const jszipModule = { exports: {} };
  const jszipFn = new Function('module', 'exports', jszipCode);
  jszipFn(jszipModule, jszipModule.exports);
  const JSZip = jszipModule.exports;
  assert(typeof JSZip === 'function', 'JSZip exports valid constructor from vendor/jszip.min.js');

  global.window = global.window || {};
  global.window.JSZip = JSZip;
  global.JSZip = JSZip;

  const { generateSampleEpub, escapeXml, SAMPLE_BOOK_METADATA } = await import('../../../js/sample-book.js');

  // Unit test escapeXml helper
  assert(typeof escapeXml === 'function', 'escapeXml helper is exported');
  assert(escapeXml('Foo & Bar <Baz> "Qux" \'Tick\'') === 'Foo &amp; Bar &lt;Baz&gt; &quot;Qux&quot; &apos;Tick&apos;', 'escapeXml correctly replaces all XML special characters');
  assert(escapeXml(null) === '', 'escapeXml handles null safely');
  assert(escapeXml(undefined) === '', 'escapeXml handles undefined safely');
  assert(escapeXml(123) === '123', 'escapeXml handles numbers safely');

  const { blob, arrayBuffer, bookRecord, metadata } = await generateSampleEpub();
  assert(blob instanceof Blob, 'Sample EPUB returns valid Blob');
  assert(arrayBuffer instanceof ArrayBuffer, 'Sample EPUB returns valid ArrayBuffer');
  assert(bookRecord.id === 'sample-book-001', 'Sample bookRecord ID is deterministic');
  assert(metadata.title.includes('Art of Reading'), 'Sample metadata title matches specification');

  // Strict OCF 3.3 Binary Conformance
  const buf = Buffer.from(arrayBuffer);
  const magic = buf.subarray(0, 4).toString('hex');
  assert(magic === '504b0304', 'EPUB file begins with ZIP magic signature 0x504b0304');
  const compressionMethod = buf.readUInt16LE(8);
  assert(compressionMethod === 0, 'mimetype file is stored UNCOMPRESSED (method 0 / STORE)');
  const filenameLength = buf.readUInt16LE(26);
  assert(filenameLength === 8, 'First local header filename length is 8');
  const extraLength = buf.readUInt16LE(28);
  assert(extraLength === 0, 'First local header extra field length is 0 (strict OCF 3.3)');
  const filenameAndContent = buf.subarray(30, 58).toString('utf8');
  assert(filenameAndContent === 'mimetypeapplication/epub+zip', 'Uncompressed mimetype content is exact application/epub+zip');

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
  // 5. HEADLESS CHROME TEST (DOMPARSER XML VALIDATION, FOUC, TRANSITIONS, IDB)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Headless Chrome Browser Verification & Native DOMParser Validation ---');
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

    // Inject temporary test elements to verify component transition rules
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const drawer = document.createElement('div');
        drawer.className = 'drawer';
        drawer.id = 'test-drawer';
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.id = 'test-btn';
        document.body.appendChild(drawer);
        document.body.appendChild(btn);
      });
    });

    await page.goto(serverInstance.url + '/index.html', { waitUntil: 'networkidle0' });

    // 5.1 FOUC Prevention & Class Removal Verification
    console.log('\n--- 5.1 FOUC Prevention & Smooth Transition Lifecycle ---');
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert(initialTheme === 'warm-paper', 'Initial data-theme set to warm-paper in <head>');

    // Wait slightly to ensure double-rAF has fired
    await new Promise((r) => setTimeout(r, 60));

    const noTransitionClassPresent = await page.evaluate(() => {
      return document.documentElement.classList.contains('no-theme-transition');
    });
    assert(!noTransitionClassPresent, 'document.documentElement no-theme-transition class is removed after initial paint');

    const transitions = await page.evaluate(() => {
      const body = window.getComputedStyle(document.body).transition;
      const drawer = window.getComputedStyle(document.getElementById('test-drawer')).transition;
      const btn = window.getComputedStyle(document.getElementById('test-btn')).transition;
      return { body, drawer, btn };
    });

    assert(transitions.body.includes('background-color 0.22s'), `Body transition includes background-color 0.22s (got: '${transitions.body}')`);
    assert(transitions.drawer.includes('transform') && transitions.drawer.includes('background-color 0.22s'), `Drawer preserves transform transition and includes background-color (got: '${transitions.drawer}')`);
    assert(transitions.btn.includes('transform 0.1s') && transitions.btn.includes('background-color 0.22s'), `Button preserves transform 0.1s transition and includes background-color (got: '${transitions.btn}')`);

    // 5.2 Native Chrome DOMParser XML/XHTML/SVG Validation
    console.log('\n--- 5.2 Native Chrome DOMParser XML/XHTML/SVG Validation ---');
    const xmlValidation = await page.evaluate(async () => {
      const { generateSampleEpub } = await import('./js/sample-book.js');
      const { arrayBuffer } = await generateSampleEpub();
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const parser = new DOMParser();

      const xmlEntries = [
        { path: 'META-INF/container.xml', desc: 'OCF Container XML', expectedRoot: 'container' },
        { path: 'OEBPS/content.opf', desc: 'EPUB 3.3 Package Document (OPF)', expectedRoot: 'package' },
        { path: 'OEBPS/toc.ncx', desc: 'EPUB 2 NCX Navigation Document', expectedRoot: 'ncx' },
        { path: 'OEBPS/nav.xhtml', desc: 'EPUB 3 Navigation Document (NavDoc)', expectedRoot: 'html' },
        { path: 'OEBPS/cover.xhtml', desc: 'Cover XHTML Page', expectedRoot: 'html' },
        { path: 'OEBPS/images/cover.svg', desc: 'Cover Art Vector SVG', expectedRoot: 'svg' },
        { path: 'OEBPS/text/ch01.xhtml', desc: 'Chapter 1 Content XHTML', expectedRoot: 'html' },
        { path: 'OEBPS/text/ch02.xhtml', desc: 'Chapter 2 Content XHTML (with SVG spectrum)', expectedRoot: 'html' },
        { path: 'OEBPS/text/ch03.xhtml', desc: 'Chapter 3 Content XHTML (with table & notes)', expectedRoot: 'html' }
      ];

      const fileResults = [];
      for (const item of xmlEntries) {
        const fileEntry = zip.file(item.path);
        if (!fileEntry) {
          fileResults.push({
            path: item.path,
            desc: item.desc,
            exists: false,
            hasParserError: true,
            errorMessage: 'File not found in ZIP archive',
            rootTag: null,
            expectedRoot: item.expectedRoot
          });
          continue;
        }

        const xmlString = await fileEntry.async('string');
        const doc = parser.parseFromString(xmlString, 'application/xml');
        const parserError = doc.querySelector('parsererror') ||
          (doc.getElementsByTagName('parsererror').length > 0 ? doc.getElementsByTagName('parsererror')[0] : null);

        fileResults.push({
          path: item.path,
          desc: item.desc,
          exists: true,
          charLength: xmlString.length,
          hasParserError: !!parserError,
          errorMessage: parserError ? parserError.textContent.trim() : null,
          rootTag: doc.documentElement ? doc.documentElement.tagName.toLowerCase() : null,
          expectedRoot: item.expectedRoot
        });
      }

      // Deep structural assertions on parsed XML trees
      // 1. content.opf
      const opfDoc = parser.parseFromString(await zip.file('OEBPS/content.opf').async('string'), 'application/xml');
      const spineItems = Array.from(opfDoc.querySelectorAll('spine > itemref')).map(el => el.getAttribute('idref'));
      const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item')).map(el => ({
        id: el.getAttribute('id'),
        href: el.getAttribute('href'),
        mediaType: el.getAttribute('media-type'),
        properties: el.getAttribute('properties') || ''
      }));
      const dcTitle = opfDoc.querySelector('metadata > title, metadata > dc\\:title, dc\\:title')?.textContent?.trim();

      // 2. toc.ncx
      const ncxDoc = parser.parseFromString(await zip.file('OEBPS/toc.ncx').async('string'), 'application/xml');
      const ncxPoints = Array.from(ncxDoc.querySelectorAll('navPoint')).map(pt => ({
        label: pt.querySelector('navLabel > text')?.textContent?.trim(),
        src: pt.querySelector('content')?.getAttribute('src')
      }));
      const ncxDocTitle = ncxDoc.querySelector('docTitle > text')?.textContent?.trim();

      // 3. nav.xhtml
      const navDoc = parser.parseFromString(await zip.file('OEBPS/nav.xhtml').async('string'), 'application/xml');
      const navLinks = Array.from(navDoc.querySelectorAll('nav#toc ol a, nav[role="doc-toc"] ol a, nav[*|type="toc"] ol a')).map(a => ({
        label: a.textContent.trim(),
        src: a.getAttribute('href')
      }));

      return {
        fileResults,
        structural: {
          spineItems,
          manifestCount: manifestItems.length,
          hasNavProperty: manifestItems.some(i => i.id === 'nav' && i.properties.includes('nav')),
          hasCoverProperty: manifestItems.some(i => i.id === 'cover-image' && i.properties.includes('cover-image')),
          dcTitle,
          ncxPointsCount: ncxPoints.length,
          ncxDocTitle,
          navLinksCount: navLinks.length,
          ncxPoints,
          navLinks
        }
      };
    });

    for (const r of xmlValidation.fileResults) {
      assert(r.exists, `EPUB ZIP contains entry: ${r.path}`);
      assert(!r.hasParserError, `[${r.path}] (${r.desc}) parsed with DOMParser(application/xml) with ZERO <parsererror> tags`);
      assert(r.rootTag === r.expectedRoot, `[${r.path}] root XML tag is <${r.expectedRoot}>`);
    }

    // Structural assertions
    assert(xmlValidation.structural.spineItems.length === 4, `content.opf spine contains 4 itemrefs (cover + 3 chapters, got ${xmlValidation.structural.spineItems.length})`);
    assert(xmlValidation.structural.manifestCount >= 8, `content.opf manifest contains >= 8 items (got ${xmlValidation.structural.manifestCount})`);
    assert(xmlValidation.structural.hasNavProperty, `content.opf manifest declares properties="nav" for nav.xhtml`);
    assert(xmlValidation.structural.hasCoverProperty, `content.opf manifest declares properties="cover-image" for cover.svg`);
    assert(xmlValidation.structural.dcTitle?.includes('Art of Reading'), `content.opf dc:title contains 'Art of Reading' (got: '${xmlValidation.structural.dcTitle}')`);
    assert(xmlValidation.structural.ncxPointsCount === 10, `toc.ncx contains 10 navPoints across chapters and subchapters (got ${xmlValidation.structural.ncxPointsCount})`);
    assert(xmlValidation.structural.ncxDocTitle?.includes('Art of Reading'), `toc.ncx docTitle contains 'Art of Reading' (got: '${xmlValidation.structural.ncxDocTitle}')`);
    assert(xmlValidation.structural.navLinksCount === 10, `nav.xhtml TOC contains 10 navigation links (got ${xmlValidation.structural.navLinksCount})`);

    // Parity between NCX and NavDoc
    for (let i = 0; i < 10; i++) {
      const ncxLink = xmlValidation.structural.ncxPoints[i];
      const navLink = xmlValidation.structural.navLinks[i];
      if (ncxLink && navLink) {
        assert(ncxLink.src === navLink.src, `TOC entry ${i + 1} href parity: NCX '${ncxLink.src}' === NavDoc '${navLink.src}'`);
        assert(ncxLink.label === navLink.label, `TOC entry ${i + 1} label parity: '${ncxLink.label}'`);
      }
    }

    // 5.3 Theme Switch Verification in Browser
    console.log('\n--- 5.3 Theme Switching & Variable Application in Browser ---');
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

    // 5.4 IndexedDB WebReaderDB & StorageManager Seeding and Cascade Deletion
    console.log('\n--- 5.4 IndexedDB WebReaderDB & StorageManager Operations ---');
    const idbResult = await page.evaluate(async () => {
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const { generateSampleEpub, seedSampleBookIfEmpty, restoreSampleBook, SAMPLE_BOOK_ID } = await import('./js/sample-book.js');

      const initialBooks = await StorageManager.getAllBooks();
      const initialCount = initialBooks.length;

      // Auto-seeding
      const seeded = await seedSampleBookIfEmpty(StorageManager);
      const afterSeedBooks = await StorageManager.getAllBooks();

      // Save progress
      await StorageManager.saveProgress({
        bookId: SAMPLE_BOOK_ID,
        spineIndex: 2,
        pageIndex: 3,
        totalPages: 10,
        progressPercentage: 30
      });
      const progress = await StorageManager.getProgress(SAMPLE_BOOK_ID);

      // Bookmarks
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

      // Atomic cascade delete
      await StorageManager.deleteBook(SAMPLE_BOOK_ID);
      const booksAfterDel = await StorageManager.getAllBooks();
      const progressAfterDel = await StorageManager.getProgress(SAMPLE_BOOK_ID);
      const bookmarksAfterDel = await StorageManager.getBookmarks(SAMPLE_BOOK_ID);

      // Restore sample book
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
