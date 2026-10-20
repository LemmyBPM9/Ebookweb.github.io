/**
 * adversarial_test.js
 * Independent Adversarial Stress Test & Integrity Verification by m1_reviewer_1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import serverPkg from '../../../test/server.js';
const { startServer } = serverPkg;
import { EventBus, EVENTS } from '../../../js/event-bus.js';
import { SettingsManager, THEMES, DEFAULT_TYPOGRAPHY } from '../../../js/storage/settings-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    testsFailed++;
    failures.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// -------------------------------------------------------------
// 1. Math: Relative Luminance & WCAG Contrast Verification
// -------------------------------------------------------------
console.log('\n--- 1. Independent Contrast Calculation Check ---');

function parseHex(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function getRelativeLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(parseHex(hex1));
  const l2 = getRelativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const themeColors = {
  'warm-paper': {
    bg: '#f8f1e3',
    surface: '#efe5d0',
    text: '#2c2523',
    secondary: '#5c504a',
    muted: '#70625b',
    accent: '#8b5a2b',
    accentText: '#ffffff',
    borderStrong: '#96836e'
  },
  'soft-dark': {
    bg: '#1a1c1e',
    surface: '#24282c',
    text: '#e2e2e0',
    secondary: '#9e9e9a',
    muted: '#92928d',
    accent: '#e5a869',
    accentText: '#1a1c1e',
    borderStrong: '#636b75'
  },
  'daylight': {
    bg: '#fcfbf9',
    surface: '#f3f2ee',
    text: '#1e2022',
    secondary: '#555b62',
    muted: '#666d75',
    accent: '#2364a0',
    accentText: '#ffffff',
    borderStrong: '#8d9299'
  },
  'sage': {
    bg: '#eef3ed',
    surface: '#e1eae0',
    text: '#1c2820',
    secondary: '#4a5d50',
    muted: '#56685c',
    accent: '#2d7348',
    accentText: '#ffffff',
    borderStrong: '#778d7b'
  }
};

for (const [theme, colors] of Object.entries(themeColors)) {
  const bodyRatio = getContrastRatio(colors.text, colors.bg);
  assert(bodyRatio >= 7.0, `[${theme}] Body on BG contrast ratio is ${bodyRatio.toFixed(2)}:1 (>= 7:1 AAA)`);

  const surfaceRatio = getContrastRatio(colors.text, colors.surface);
  assert(surfaceRatio >= 7.0, `[${theme}] Body on Surface ratio is ${surfaceRatio.toFixed(2)}:1 (>= 7:1 AAA)`);

  const accentTextRatio = getContrastRatio(colors.accentText, colors.accent);
  assert(accentTextRatio >= 4.5, `[${theme}] Accent Text on Button ratio is ${accentTextRatio.toFixed(2)}:1 (>= 4.5:1 AA)`);

  const borderRatio = getContrastRatio(colors.borderStrong, colors.bg);
  assert(borderRatio >= 3.0, `[${theme}] Strong border on BG ratio is ${borderRatio.toFixed(2)}:1 (>= 3.0:1 UI)`);
}

// -------------------------------------------------------------
// 2. EventBus Adversarial Edge Cases
// -------------------------------------------------------------
console.log('\n--- 2. EventBus Adversarial Testing ---');

EventBus.clear();
// Test 2.1: Throwing in listener does not break subsequent listeners
let l1Called = false;
let l2Called = false;
let l3Called = false;

EventBus.on('stress:err', () => {
  l1Called = true;
  throw new Error('Adversarial crash in listener 1');
});
EventBus.on('stress:err', () => {
  l2Called = true;
});
EventBus.on('stress:err', () => {
  l3Called = true;
  throw new Error('Adversarial crash in listener 3');
});

EventBus.emit('stress:err', { foo: 'bar' });
assert(l1Called && l2Called && l3Called, 'EventBus continues dispatching when multiple listeners throw');

// Test 2.2: Self-unsubscribing inside handler
let selfUnsubCount = 0;
let unsubClosure;
unsubClosure = EventBus.on('stress:self_unsub', () => {
  selfUnsubCount++;
  unsubClosure();
});
EventBus.emit('stress:self_unsub');
EventBus.emit('stress:self_unsub');
assert(selfUnsubCount === 1, 'Self-unsubscribing inside handler correctly stops subsequent emits');

// Test 2.3: Type errors on non-function handler
let caughtTypeErr = false;
try {
  EventBus.on('test:invalid', 'not_a_func');
} catch (e) {
  caughtTypeErr = e instanceof TypeError;
}
assert(caughtTypeErr, 'EventBus.on throws TypeError if handler is not a function');

// Test 2.4: Mutating listener set during dispatch (handler adds another listener)
let addedDuringEmitRan = false;
EventBus.on('stress:mutate', () => {
  EventBus.on('stress:mutate', () => {
    addedDuringEmitRan = true;
  });
});
EventBus.emit('stress:mutate');
assert(!addedDuringEmitRan, 'Listener added during emit does not execute in the same emit turn');
EventBus.emit('stress:mutate');
assert(addedDuringEmitRan, 'Listener added during emit executes on the subsequent emit turn');

// -------------------------------------------------------------
// 3. SettingsManager Defensive Boundaries & Fallback
// -------------------------------------------------------------
console.log('\n--- 3. SettingsManager Defensive Boundaries & Fallback ---');

// Test 3.1: Typography values out of range clamped to defaults
SettingsManager.setTypography({ fontSize: 999 });
assert(SettingsManager.getTypography().fontSize === DEFAULT_TYPOGRAPHY.fontSize, 'Excessive fontSize (999) rejected, fallback to default 18');

SettingsManager.setTypography({ fontSize: 5 });
assert(SettingsManager.getTypography().fontSize === DEFAULT_TYPOGRAPHY.fontSize, 'Tiny fontSize (5) rejected, fallback to default 18');

SettingsManager.setTypography({ lineHeight: 0.2 });
assert(SettingsManager.getTypography().lineHeight === DEFAULT_TYPOGRAPHY.lineHeight, 'Extreme lineHeight (0.2) rejected, fallback to default 1.75');

SettingsManager.setTypography({ maxWidth: 20000 });
assert(SettingsManager.getTypography().maxWidth === DEFAULT_TYPOGRAPHY.maxWidth, 'Extreme maxWidth (20000) rejected, fallback to default 720');

SettingsManager.setTypography({ fontFamily: 'comic-sans' });
assert(SettingsManager.getTypography().fontFamily === DEFAULT_TYPOGRAPHY.fontFamily, 'Invalid fontFamily rejected, fallback to default serif');

// Test 3.2: Valid custom typography within range
SettingsManager.setTypography({ fontSize: 24, lineHeight: 2.0, maxWidth: 800, fontFamily: 'sans' });
const typo = SettingsManager.getTypography();
assert(typo.fontSize === 24 && typo.lineHeight === 2.0 && typo.maxWidth === 800 && typo.fontFamily === 'sans', 'Valid custom typography accepted');

// -------------------------------------------------------------
// 4. In-Depth Headless Chrome & IndexedDB Adversarial Testing
// -------------------------------------------------------------
console.log('\n--- 4. Headless Chrome & IndexedDB Adversarial Testing ---');

async function runBrowserTests() {
  const { server, url, close } = await startServer({ port: 3001 });
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto(`${url}/index.html`, { waitUntil: 'domcontentloaded' });

    // Test 4.1: EPUB Spec Integrity & Internal Link Cross-Referencing
    const epubValidation = await page.evaluate(async () => {
      const { generateSampleEpub } = await import('/js/sample-book.js');
      const sample = await generateSampleEpub();
      const JSZip = window.JSZip;
      const zip = await JSZip.loadAsync(sample.arrayBuffer);

      // Check all files listed in content.opf manifest actually exist in the zip
      const opfXml = await zip.file('OEBPS/content.opf').async('string');
      const parser = new DOMParser();
      const opfDoc = parser.parseFromString(opfXml, 'application/xml');
      const parseError = opfDoc.querySelector('parsererror');
      if (parseError) return { success: false, error: 'OPF XML parse error: ' + parseError.textContent };

      const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item')).map((el) => el.getAttribute('href'));
      const missingFiles = [];
      for (const href of manifestItems) {
        const fullPath = 'OEBPS/' + href;
        if (!zip.file(fullPath)) {
          missingFiles.push(fullPath);
        }
      }

      // Check spine itemrefs exist in manifest
      const spineItems = Array.from(opfDoc.querySelectorAll('spine > itemref')).map((el) => el.getAttribute('idref'));
      const missingSpineRefs = [];
      for (const idref of spineItems) {
        if (!opfDoc.querySelector(`manifest > item[id="${idref}"]`)) {
          missingSpineRefs.push(idref);
        }
      }

      // Check NCX validity and TOC anchor targets
      const ncxXml = await zip.file('OEBPS/toc.ncx').async('string');
      const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
      if (ncxDoc.querySelector('parsererror')) {
        return { success: false, error: 'NCX XML parse error' };
      }

      // Check Nav doc validity
      const navXml = await zip.file('OEBPS/nav.xhtml').async('string');
      const navDoc = parser.parseFromString(navXml, 'application/xhtml+xml');
      if (navDoc.querySelector('parsererror')) {
        return { success: false, error: 'Nav XHTML parse error' };
      }

      // Check Chapter 1, 2, 3 XML validity
      for (const ch of ['ch01.xhtml', 'ch02.xhtml', 'ch03.xhtml']) {
        const chXml = await zip.file('OEBPS/text/' + ch).async('string');
        const chDoc = parser.parseFromString(chXml, 'application/xhtml+xml');
        if (chDoc.querySelector('parsererror')) {
          return { success: false, error: `Chapter ${ch} XML parse error` };
        }
      }

      return {
        success: true,
        manifestCount: manifestItems.length,
        missingFiles,
        spineCount: spineItems.length,
        missingSpineRefs
      };
    });

    if (!epubValidation.success) {
      console.error('epubValidation failed with:', epubValidation.error);
    }
    assert(epubValidation.success, `Sample EPUB XML documents parse cleanly without syntax errors`);
    assert(epubValidation.missingFiles && epubValidation.missingFiles.length === 0, `All ${epubValidation.manifestCount} manifest items exist in ZIP`);
    assert(epubValidation.missingSpineRefs && epubValidation.missingSpineRefs.length === 0, `All ${epubValidation.spineCount} spine items resolve to valid manifest IDs`);

    // Test 4.2: IndexedDB Isolation & Cascading Delete Boundary Testing
    const idbTest = await page.evaluate(async () => {
      const { StorageManager } = await import('/js/storage/storage-manager.js');

      // Create Book A and Book B
      const bookA = { id: 'book_A', title: 'Book A', author: 'Author A', fileBlob: new Blob(['a']), dateAdded: Date.now() };
      const bookB = { id: 'book_B', title: 'Book B', author: 'Author B', fileBlob: new Blob(['b']), dateAdded: Date.now() };
      await StorageManager.saveBook(bookA);
      await StorageManager.saveBook(bookB);

      // Add Reading Progress to A and B
      await StorageManager.saveProgress({ bookId: 'book_A', spineIndex: 2, pageIndex: 5, progressPercent: 45 });
      await StorageManager.saveProgress({ bookId: 'book_B', spineIndex: 1, pageIndex: 0, progressPercent: 10 });

      // Add Bookmarks to A and B
      const bmA1 = await StorageManager.addBookmark({ bookId: 'book_A', spineIndex: 1, title: 'Chapter 1' });
      const bmA2 = await StorageManager.addBookmark({ bookId: 'book_A', spineIndex: 2, title: 'Chapter 2' });
      const bmB1 = await StorageManager.addBookmark({ bookId: 'book_B', spineIndex: 1, title: 'Book B Mark' });

      // Delete Book A
      await StorageManager.deleteBook('book_A');

      // Check Book A is gone
      const getA = await StorageManager.getBook('book_A');
      const progA = await StorageManager.getProgress('book_A');
      const bmsA = await StorageManager.getBookmarks('book_A');

      // Check Book B and its data are completely intact!
      const getB = await StorageManager.getBook('book_B');
      const progB = await StorageManager.getProgress('book_B');
      const bmsB = await StorageManager.getBookmarks('book_B');

      // Clean up B
      await StorageManager.deleteBook('book_B');

      return {
        bookAGone: getA === null,
        progAGone: progA === null,
        bmsAGone: bmsA.length === 0,
        bookBIntact: getB !== null && getB.id === 'book_B',
        progBIntact: progB !== null && progB.spineIndex === 1,
        bmsBIntact: bmsB.length === 1 && bmsB[0].id === bmB1
      };
    });

    assert(idbTest.bookAGone, 'Deleted Book A record is null');
    assert(idbTest.progAGone, 'Deleted Book A reading progress is purged');
    assert(idbTest.bmsAGone, 'Deleted Book A bookmarks are completely purged');
    assert(idbTest.bookBIntact, 'Book B is unaffected by deletion of Book A');
    assert(idbTest.progBIntact, 'Book B progress is unaffected by deletion of Book A');
    assert(idbTest.bmsBIntact, 'Book B bookmark is unaffected by deletion of Book A');

    // Test 4.3: Quota info utility inspection
    const quotaInfo = await page.evaluate(async () => {
      const { StorageManager } = await import('/js/storage/storage-manager.js');
      return await StorageManager.getQuotaInfo();
    });
    assert(quotaInfo !== null && typeof quotaInfo.quotaBytes === 'number', 'StorageManager.getQuotaInfo() returns valid quota metrics');

    assert(pageErrors.length === 0, `Page errors in headless browser: ${pageErrors.length}`);
  } finally {
    await browser.close();
    await close();
  }
}

await runBrowserTests();

console.log('\n=============================================================');
console.log(`ADVERSARIAL STRESS TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('=============================================================');

if (testsFailed > 0) {
  process.exit(1);
}
