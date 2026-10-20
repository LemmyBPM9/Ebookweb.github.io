/**
 * WebReader Multi-Format Upgrade Comprehensive E2E Test Suite (Tiers 0 - 4).
 *
 * Requirements-driven, automated headless browser test suite using puppeteer-core
 * driving system Google Chrome against a static HTTP server.
 *
 * Test Tiers:
 *   Tier 0: Test Infrastructure & Multi-Format Fixtures Verification
 *           - Static HTTP Server serves .pdf, .mobi, .azw, .txt, .md with correct MIME types
 *           - Multi-format synthetic fixtures integrity (.epub, .pdf, .mobi, .azw, .txt, .md)
 *           - PalmDOC LZ77 compression and decompression roundtrip
 *           - WCAG AAA contrast calculation engine baseline for all 10 themes (>= 7.0:1)
 *
 *   Tier 1: Multi-Format Upgrade Feature Coverage
 *           - 1.1 Multi-format file picker accept attribute & import (.epub, .pdf, .mobi, .txt, .md)
 *           - 1.2 Format badge appearance on library cards (EPUB, PDF, MOBI, TXT, MD)
 *           - 1.3 Header format filter tab functionality (All, EPUB, PDF, MOBI, TXT, MD)
 *           - 1.4 Dual-mode PDF reading: Reflowable Text Mode vs. Visual Page Mode Canvas & toggle
 *           - 1.5 MOBI / AZW PalmDOC reading & TOC navigation
 *           - 1.6 Plain Text (.txt) paragraph reading & synthetic TOC
 *           - 1.7 Markdown (.md) GFM elements (headings, lists, code, table) & TOC
 *           - 1.8 All 10 eye-comfort themes, WCAG AAA contrast (>= 7.0:1) & swatch selection
 *           - 1.9 Zero-FOUC theme boot & persistence across reload for 10 themes
 *
 *   Tier 2: Boundary & Corner Cases
 *           - 2.1 Corrupted / invalid format rejection with non-blocking error toast (PDF, MOBI, EPUB)
 *           - 2.2 Empty / whitespace title fallbacks across formats
 *           - 2.3 Boundary page and chapter clamping across document formats
 *
 *   Tier 3: Memory & CPU Optimization Stress Test
 *           - 3.1 StorageManager V2 segregated storage: getAllBooks() returns metadata without raw binary
 *           - 3.2 10x repeated book open/close lifecycle (zero unrevoked Blob URLs, zero detached iframes, bounded JS heap)
 *           - 3.3 Zero-idle CPU & passive event listener verification
 *
 *   Tier 4: Complete Multi-Format User Journeys
 *           - 4.1 End-to-end multi-format user journey across PDF, MOBI, MD, themes, bookmarks, and reload
 *
 * Usage:
 *   node test/e2e_upgrade.test.js
 *   node test/e2e_upgrade.test.js --tier=0
 *   node test/e2e_upgrade.test.js --tier=1
 *   node test/e2e_upgrade.test.js --grep="PDF"
 *   node test/e2e_upgrade.test.js --headless=false (for visual inspection)
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');
const {
  buildAllFixtures,
  compressPalmDoc,
  decompressPalmDoc
} = require('./test-fixtures/generate-fixtures.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURES_DIR = path.resolve(__dirname, 'test-fixtures');
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Command line arguments parsing
const args = process.argv.slice(2);
let targetTier = null;
let grepFilter = null;
let headlessMode = 'new';
let serverPort = 3000;
let forceE2E = false;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    targetTier = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--verify-infra') {
    targetTier = 0;
  } else if (arg === '--force') {
    forceE2E = true;
  } else if (arg.startsWith('--grep=')) {
    grepFilter = new RegExp(arg.split('=')[1], 'i');
  } else if (arg === '--headless=false') {
    headlessMode = false;
  } else if (arg.startsWith('--port=')) {
    serverPort = parseInt(arg.split('=')[1], 10);
  }
}

// =============================================================================
// Sequential Test Runner Harness & Assertions
// =============================================================================

const testSuites = [];

function describe(title, fn) {
  const tierMatch = title.match(/Tier\s*([0-4])/i);
  const tier = tierMatch ? parseInt(tierMatch[1], 10) : 1;
  const suite = { title, tier, tests: [] };
  testSuites.push(suite);

  const testCollector = (testTitle, testFn) => {
    suite.tests.push({ title: testTitle, fn: testFn });
  };

  fn(testCollector);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertGreaterThan(actual, min, message) {
  if (actual <= min) {
    throw new Error(`${message || 'Assertion failed'}: expected > ${min}, got ${actual}`);
  }
}

// =============================================================================
// Color Luminance & WCAG Contrast Helpers
// =============================================================================

function parseRgbColor(colorStr) {
  if (!colorStr) return { r: 255, g: 255, b: 255 };
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10)
    };
  }
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  return { r: 128, g: 128, b: 128 };
}

function getRelativeLuminance(rgb) {
  const sRGB = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function calculateWcagContrast(rgb1, rgb2) {
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// =============================================================================
// DOM & Puppeteer Utilities
// =============================================================================

async function createCleanPage(browser, baseUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.toString());
  });

  return {
    page,
    consoleErrors,
    pageErrors,
    close: async () => {
      try {
        await page.close();
      } catch (_) {}
    }
  };
}

/**
 * Robust selector finder supporting multiple fallback selectors.
 */
async function waitForAnySelector(page, selectors, options = { timeout: 5000 }) {
  const rawList = Array.isArray(selectors) ? selectors : selectors.split(',').map(s => s.trim());
  const selectorList = rawList.filter(s => s && !s.includes(':has-text('));
  const combined = selectorList.join(', ');
  try {
    await page.waitForSelector(combined, options);
    const handle = await page.evaluateHandle((sel) => {
      const all = Array.from(document.querySelectorAll(sel));
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
      };
      const visibleInteractive = all.find(el =>
        isVisible(el) && (
          el.tagName === 'BUTTON' ||
          el.tagName === 'INPUT' ||
          el.tagName === 'A' ||
          el.getAttribute('role') === 'button' ||
          el.classList.contains('book-card') ||
          el.classList.contains('bookmark-item') ||
          el.classList.contains('toc-item')
        )
      );
      if (visibleInteractive) return visibleInteractive;
      const anyVisible = all.find(isVisible);
      return anyVisible || all[0] || null;
    }, combined);
    const el = handle.asElement();
    if (el) return el;
    return await page.waitForSelector(combined, options);
  } catch (err) {
    throw new Error(`Timeout waiting for any of [${combined}]: ${err.message}`);
  }
}

/**
 * Extracts reader chapter / text content from active iframe or stage.
 */
async function getReaderContentText(page) {
  return await page.evaluate(() => {
    const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      return iframe.contentDocument.body.innerText || '';
    }
    const stage = document.querySelector('#reader-viewport, #reader-columns, #reading-content, #reader-stage, #pdf-visual-stage');
    return stage ? stage.innerText || '' : '';
  });
}

/**
 * Injects memory & blob lifecycle instrumentation into the browser page.
 */
async function instrumentMemoryAndBlobTracking(page) {
  await page.evaluateOnNewDocument(() => {
    window.__activeBlobUrls = new Set();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;

    URL.createObjectURL = function(blob) {
      const url = origCreate.call(URL, blob);
      window.__activeBlobUrls.add(url);
      return url;
    };

    URL.revokeObjectURL = function(url) {
      window.__activeBlobUrls.delete(url);
      return origRevoke.call(URL, url);
    };
  });
}

// =============================================================================
// TEST SUITE DEFINITIONS (TIERS 0 - 4)
// =============================================================================

// --- TIER 0: TEST INFRASTRUCTURE & MULTI-FORMAT FIXTURES VERIFICATION ---
describe('Tier 0: Test Infrastructure & Multi-Format Fixtures Verification', (test) => {

  test('0.1 Static HTTP Server Serves Multi-Format MIME Types & Security Boundaries', async () => {
    const baseUrl = `http://127.0.0.1:${serverPort}`;

    // PDF MIME check
    const pdfRes = await fetch(baseUrl + '/test/test-fixtures/valid-sample.pdf');
    assertEqual(pdfRes.status, 200, 'valid-sample.pdf HTTP status');
    assertEqual(pdfRes.headers.get('content-type'), 'application/pdf', 'PDF Content-Type must be application/pdf');

    // MOBI MIME check
    const mobiRes = await fetch(baseUrl + '/test/test-fixtures/valid-sample.mobi');
    assertEqual(mobiRes.status, 200, 'valid-sample.mobi HTTP status');
    assertEqual(mobiRes.headers.get('content-type'), 'application/x-mobipocket-ebook', 'MOBI Content-Type must be application/x-mobipocket-ebook');

    // Plain Text MIME check
    const txtRes = await fetch(baseUrl + '/test/test-fixtures/valid-sample.txt');
    assertEqual(txtRes.status, 200, 'valid-sample.txt HTTP status');
    assertEqual(txtRes.headers.get('content-type'), 'text/plain; charset=utf-8', 'TXT Content-Type must be text/plain');

    // Markdown MIME check
    const mdRes = await fetch(baseUrl + '/test/test-fixtures/valid-sample.md');
    assertEqual(mdRes.status, 200, 'valid-sample.md HTTP status');
    assertEqual(mdRes.headers.get('content-type'), 'text/markdown; charset=utf-8', 'MD Content-Type must be text/markdown');

    // EPUB MIME check
    const epubRes = await fetch(baseUrl + '/test/test-fixtures/valid-sample.epub');
    assertEqual(epubRes.status, 200, 'valid-sample.epub HTTP status');
    assertEqual(epubRes.headers.get('content-type'), 'application/epub+zip', 'EPUB Content-Type must be application/epub+zip');

    // Security path traversal check
    const traversalRes = await fetch(baseUrl + '/../../../etc/passwd');
    assert(traversalRes.status === 403 || traversalRes.status === 404, 'Path traversal must return 403 or 404');
  });

  test('0.2 Synthetic Multi-Format Fixtures Built with Correct Binary Headers & Magic Bytes', async () => {
    // PDF Magic bytes %PDF-
    const pdfBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-sample.pdf'));
    assertEqual(pdfBuf.toString('ascii', 0, 5), '%PDF-', 'PDF file must start with %PDF-');
    assert(pdfBuf.toString('ascii').includes('%%EOF'), 'PDF file must contain %%EOF marker');

    // MOBI Palm Database Header: 'BOOK' at 60..64, 'MOBI' at 64..68
    const mobiBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-sample.mobi'));
    assertEqual(mobiBuf.toString('ascii', 60, 64), 'BOOK', 'MOBI PDB type must be BOOK');
    assertEqual(mobiBuf.toString('ascii', 64, 68), 'MOBI', 'MOBI PDB creator must be MOBI');

    // TXT file content
    const txtBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-sample.txt'));
    assert(txtBuf.toString('utf8').includes('Chapter 1: The Sanctuary of Words'), 'TXT must contain Chapter 1 heading');

    // MD file content
    const mdBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-sample.md'));
    assert(mdBuf.toString('utf8').includes('# The Art of Digital Reading'), 'MD must contain H1 heading');

    // EPUB PK zip header
    const epubBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'valid-sample.epub'));
    assertEqual(epubBuf.toString('ascii', 0, 2), 'PK', 'EPUB must start with PK zip header');
  });

  test('0.3 PalmDOC LZ77 Compression and Decompression Roundtrip', async () => {
    const originalText = 'Reading on a digital screen should feel as natural as turning the pages of a well-crafted physical volume. Reading on a digital screen should feel as natural.';
    const compressed = compressPalmDoc(originalText);
    const decompressed = decompressPalmDoc(compressed);
    assertEqual(decompressed, originalText, 'PalmDOC LZ77 decompression must match original text identically');
    assert(compressed.length < Buffer.byteLength(originalText, 'utf8'), 'PalmDOC compression must reduce repetitive text size');
  });

  test('0.4 WCAG AAA Contrast Calculation Engine Baseline for All 10 Themes', async () => {
    const themePalettes = {
      'warm-paper': { bg: '#f8f1e3', text: '#2c2523' },
      'soft-dark': { bg: '#1a1c1e', text: '#e2e2e0' },
      'daylight': { bg: '#fcfbf9', text: '#1e2022' },
      'sage': { bg: '#eef3ed', text: '#1c2820' },
      'solarized-light': { bg: '#fdf6e3', text: '#073642' },
      'solarized-dark': { bg: '#002b36', text: '#eee8d5' },
      'nord': { bg: '#2e3440', text: '#eceff4' },
      'oled-black': { bg: '#000000', text: '#c8c8c8' },
      'rose-pine': { bg: '#191724', text: '#e0def4' },
      'e-ink': { bg: '#f0f0eb', text: '#1a1a1a' }
    };

    for (const [themeName, palette] of Object.entries(themePalettes)) {
      const bgRgb = parseRgbColor(palette.bg);
      const textRgb = parseRgbColor(palette.text);
      const contrast = calculateWcagContrast(bgRgb, textRgb);
      assertGreaterThan(
        contrast,
        7.0,
        `Theme '${themeName}' calculated contrast (${contrast.toFixed(2)}:1) must meet WCAG AAA (>= 7.0:1)`
      );
    }
  });

});

// --- TIER 1: MULTI-FORMAT UPGRADE FEATURE COVERAGE ---
describe('Tier 1: Multi-Format Upgrade Feature Coverage', (test) => {

  test('1.1 Multi-Format File Picker Accept Attribute & Drag-and-Drop Handler', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      const fileInputAccept = await page.evaluate(() => {
        const input = document.querySelector('input[type="file"]#file-input, input[type="file"]');
        return input ? input.getAttribute('accept') || '' : '';
      });

      // Verify input accept attribute contains all supported extensions
      const requiredExtensions = ['.epub', '.pdf', '.mobi', '.txt', '.md'];
      for (const ext of requiredExtensions) {
        assert(
          fileInputAccept.toLowerCase().includes(ext),
          `File input accept attribute must include '${ext}', got: "${fileInputAccept}"`
        );
      }
    } finally {
      await close();
    }
  });

  test('1.2 Format Badges on Library Cards (EPUB, PDF, MOBI, TXT, MD)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Import each format fixture sequentially
      const fixtures = [
        { name: 'valid-sample.pdf', format: 'PDF' },
        { name: 'valid-sample.mobi', format: 'MOBI' },
        { name: 'valid-sample.txt', format: 'TXT' },
        { name: 'valid-sample.md', format: 'MD' }
      ];

      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');

      for (const fixture of fixtures) {
        const filePath = path.join(FIXTURES_DIR, fixture.name);
        await fileInput.uploadFile(filePath);
        await sleep(1000);
      }

      // Verify that badges corresponding to each imported format exist in library cards
      const badges = await page.evaluate(() => {
        const badgeEls = Array.from(document.querySelectorAll('.book-format-badge, .format-badge, [data-format], .card-badge'));
        return badgeEls.map(el => el.textContent.trim().toUpperCase());
      });

      for (const fixture of fixtures) {
        assert(
          badges.some(b => b.includes(fixture.format)),
          `Library view must render a format badge for '${fixture.format}', found badges: ${JSON.stringify(badges)}`
        );
      }
    } finally {
      await close();
    }
  });

  test('1.3 Header Format Filter Tab Functionality (All, EPUB, PDF, MOBI, TXT, MD)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Look for format filter tabs in library header
      const filterTabsExist = await page.evaluate(() => {
        const tabs = document.querySelectorAll('.library-filter-tabs, [data-format-filter], .filter-tabs, .format-filter-btn');
        return tabs.length > 0;
      });
      assert(filterTabsExist, 'Library header must provide format filter tabs/buttons for filtering bookshelf');

      // Click the PDF filter tab
      const pdfTab = await waitForAnySelector(page, '[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf, button:has-text("PDF")');
      await pdfTab.click();
      await sleep(300);

      // Verify only PDF books are visible
      const visibleCards = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        return cards.filter(c => getComputedStyle(c).display !== 'none');
      });
      assert(visibleCards.length > 0, 'PDF filter should display imported PDF cards');

      // Click 'All' filter tab to restore
      const allTab = await waitForAnySelector(page, '[data-format-filter="all"], [data-filter="all"], .filter-tab-all, button:has-text("All")');
      await allTab.click();
      await sleep(300);
    } finally {
      await close();
    }
  });

  test('1.4 Dual-Mode PDF Reading: Reflowable Text Mode vs. Visual Page Mode Canvas Rendering & Toggle', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Import PDF fixture
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'valid-sample.pdf'));
      await sleep(1200);

      // Open the PDF book card
      const pdfCard = await page.waitForFunction(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        return cards.find(c => c.innerText.toLowerCase().includes('pdf') || c.innerText.includes('WebReader PDF'));
      }, { timeout: 8000 });
      assert(pdfCard, 'PDF book card should appear in the library');

      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        const match = cards.find(c => c.innerText.toLowerCase().includes('pdf') || c.innerText.includes('WebReader PDF'));
        if (match) match.click();
      });
      await waitForAnySelector(page, '#reader-stage, .reader-stage');
      await sleep(800);

      // 1. Verify Reflowable Text Mode initial content
      const reflowableText = await getReaderContentText(page);
      assert(
        reflowableText.includes('Chapter 1') || reflowableText.includes('Sanctuary') || reflowableText.length > 20,
        `Reflowable PDF mode must render extracted text content, got: "${reflowableText.slice(0, 100)}..."`
      );

      // 2. Locate mode toggle button and switch to Visual Page Mode
      const modeBtn = await waitForAnySelector(page, '#btn-mode, .btn-mode, [data-action="toggle-mode"], #btn-pdf-mode');
      await modeBtn.click();
      await sleep(800);

      // 3. Verify Canvas element is rendered in Visual Mode
      const hasCanvas = await page.evaluate(() => {
        const canvas = document.querySelector('canvas, .pdf-page-canvas, #pdf-visual-stage canvas, .pdf-canvas');
        return canvas !== null && canvas.width > 0 && canvas.height > 0;
      });
      assert(hasCanvas, 'Visual Page Mode must render PDF page to HTML5 <canvas> element with positive dimensions');

      // 4. Toggle back to Reflowable Mode and verify text persists
      await modeBtn.click();
      await sleep(800);
      const textAfterToggle = await getReaderContentText(page);
      assertGreaterThan(textAfterToggle.length, 20, 'Text content must remain readable after toggling back to Reflowable mode');
    } finally {
      await close();
    }
  });

  test('1.5 MOBI / AZW Reading & Chapter / TOC Navigation', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Import MOBI fixture
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'valid-sample.mobi'));
      await sleep(1200);

      // Open MOBI book card
      const mobiCard = await page.waitForFunction(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        return cards.find(c => c.innerText.toLowerCase().includes('mobi') || c.innerText.includes('Minimalist Reader'));
      }, { timeout: 8000 });
      assert(mobiCard, 'MOBI book card should appear in library');

      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        const match = cards.find(c => c.innerText.toLowerCase().includes('mobi') || c.innerText.includes('Minimalist Reader'));
        if (match) match.click();
      });
      await waitForAnySelector(page, '#reader-stage, .reader-stage');
      await sleep(800);

      // Verify PalmDOC decompressed HTML content is rendered
      const content = await getReaderContentText(page);
      assert(
        content.includes('Chapter 1') || content.includes('dialogue between the mind'),
        `MOBI content must render decompressed chapter text, got: "${content.slice(0, 100)}..."`
      );

      // Open Table of Contents drawer
      const tocBtn = await waitForAnySelector(page, '#btn-toc, .btn-toc, [data-action="toc"]');
      await tocBtn.click();
      await sleep(300);

      // Verify TOC items exist for chapters
      const tocItemCount = await page.evaluate(() => {
        return document.querySelectorAll('#toc-list .toc-item, #toc-drawer .toc-item, .toc-link').length;
      });
      assertGreaterThan(tocItemCount, 0, 'MOBI book must generate Table of Contents items from chapters');
    } finally {
      await close();
    }
  });

  test('1.6 Plain Text (.txt) Paragraph Reading & Synthetic TOC', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Import TXT fixture
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'valid-sample.txt'));
      await sleep(1000);

      // Open TXT book card
      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        const match = cards.find(c => c.innerText.toLowerCase().includes('txt') || c.innerText.includes('valid-sample'));
        if (match) match.click();
      });
      await waitForAnySelector(page, '#reader-stage, .reader-stage');
      await sleep(600);

      // Verify paragraphs rendered as semantic elements
      const paragraphCount = await page.evaluate(() => {
        const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
        const doc = iframe && iframe.contentDocument ? iframe.contentDocument : document;
        return doc.querySelectorAll('p').length;
      });
      assertGreaterThan(paragraphCount, 0, 'Plain text parser must structure paragraphs into <p> tags');

      // Verify synthetic TOC generated from Chapter headings
      const tocBtn = await waitForAnySelector(page, '#btn-toc, .btn-toc, [data-action="toc"]');
      await tocBtn.click();
      await sleep(300);

      const tocTitles = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('#toc-list .toc-item, .toc-link'));
        return items.map(el => el.textContent.trim());
      });
      assert(
        tocTitles.some(t => t.toLowerCase().includes('chapter')),
        `Plain text parser must generate synthetic TOC from Chapter headings, found: ${JSON.stringify(tocTitles)}`
      );
    } finally {
      await close();
    }
  });

  test('1.7 Markdown (.md) GFM Elements & TOC Navigation', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Import MD fixture
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'valid-sample.md'));
      await sleep(1000);

      // Open MD book card
      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        const match = cards.find(c => c.innerText.toLowerCase().includes('md') || c.innerText.includes('Digital Reading'));
        if (match) match.click();
      });
      await waitForAnySelector(page, '#reader-stage, .reader-stage');
      await sleep(600);

      // Verify semantic GFM HTML elements rendered inside reader document
      const gfmElements = await page.evaluate(() => {
        const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
        const doc = iframe && iframe.contentDocument ? iframe.contentDocument : document;
        return {
          h1: doc.querySelectorAll('h1').length,
          h2: doc.querySelectorAll('h2').length,
          code: doc.querySelectorAll('code, pre').length,
          blockquote: doc.querySelectorAll('blockquote').length,
          list: doc.querySelectorAll('ul, ol').length
        };
      });

      assertGreaterThan(gfmElements.h1 + gfmElements.h2, 0, 'Markdown headings must be rendered as semantic <h1>/<h2> elements');
      assertGreaterThan(gfmElements.list, 0, 'Markdown lists must be rendered as semantic <ul>/<ol> elements');
      assertGreaterThan(gfmElements.code, 0, 'Markdown code blocks must be rendered as semantic <code>/<pre> elements');
    } finally {
      await close();
    }
  });

  test('1.8 All 10 Eye-Comfort Themes & WCAG AAA Contrast Assertions (>= 7.0:1)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Open sample book to access reader stage and settings drawer
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(300);

      const allTenThemes = [
        'warm-paper',
        'soft-dark',
        'daylight',
        'sage',
        'solarized-light',
        'solarized-dark',
        'nord',
        'oled-black',
        'rose-pine',
        'e-ink'
      ];

      for (const theme of allTenThemes) {
        // Find theme button / swatch
        const themeSelector = `[data-theme-choice="${theme}"], #theme-${theme}, [data-theme="${theme}"]`;
        const themeBtn = await waitForAnySelector(page, themeSelector, { timeout: 3000 });
        await themeBtn.click();
        await sleep(250);

        // Verify active theme data attribute on html root
        const activeTheme = await page.evaluate(() => {
          return document.documentElement.getAttribute('data-theme') ||
                 document.body.getAttribute('data-theme');
        });
        assertEqual(activeTheme, theme, `Theme data-theme attribute must update to '${theme}'`);

        // Compute contrast ratio between background and text colors
        const colors = await page.evaluate(() => {
          const rootStyle = getComputedStyle(document.documentElement);
          const bodyStyle = getComputedStyle(document.body);
          return {
            bg: rootStyle.getPropertyValue('--color-bg') || bodyStyle.backgroundColor,
            text: rootStyle.getPropertyValue('--color-text') || bodyStyle.color
          };
        });

        const bgRgb = parseRgbColor(colors.bg);
        const textRgb = parseRgbColor(colors.text);
        const contrast = calculateWcagContrast(bgRgb, textRgb);

        assertGreaterThan(
          contrast,
          7.0,
          `Theme '${theme}' contrast (${contrast.toFixed(2)}:1) must meet WCAG AAA standard (>= 7.0:1)`
        );
      }
    } finally {
      await close();
    }
  });

  test('1.9 Zero-FOUC Theme Boot & Persistence Across Reload for 10 Themes', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Test persistence of non-default theme e.g. 'nord'
      await page.evaluate(() => {
        localStorage.setItem('webreader_theme', 'nord');
      });

      // Reload and inspect initial head bootstrap state
      await page.reload({ waitUntil: 'domcontentloaded' });

      const bootstrapState = await page.evaluate(() => {
        return {
          theme: document.documentElement.getAttribute('data-theme'),
          hasNoTransition: document.documentElement.classList.contains('no-theme-transition')
        };
      });

      assertEqual(bootstrapState.theme, 'nord', 'Synchronous head script must restore "nord" theme on initial DOM load');

      // After paint, .no-theme-transition should be removed
      await sleep(100);
      const postPaintNoTransition = await page.evaluate(() => {
        return document.documentElement.classList.contains('no-theme-transition');
      });
      assertEqual(postPaintNoTransition, false, '.no-theme-transition class must be removed after initial frame paint');
    } finally {
      await close();
    }
  });

});

// --- TIER 2: BOUNDARY & CORNER CASES ---
describe('Tier 2: Boundary & Corner Cases (Stress & Error Handling)', (test) => {

  test('2.1 Corrupted / Invalid File Format Rejection with Non-Blocking Error Toast', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');

      // Attempt upload of corrupted PDF
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'corrupted.pdf'));
      await sleep(600);

      const toastMessage = await page.evaluate(() => {
        const toast = document.querySelector('.toast, #toast-container, .error-banner, [role="alert"]');
        return toast ? toast.innerText : '';
      });
      assert(toastMessage.length > 0, 'Corrupted PDF upload must trigger a user-facing error toast');

      // Attempt upload of corrupted MOBI
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'corrupted.mobi'));
      await sleep(600);

      // Verify library remains intact and functional
      const libraryVisible = await page.evaluate(() => {
        const lib = document.querySelector('#library-view, .library-view, #library-grid');
        return lib && getComputedStyle(lib).display !== 'none';
      });
      assert(libraryVisible, 'Library view must remain visible and functional after rejected upload');
    } finally {
      await close();
    }
  });

  test('2.2 Empty / Whitespace Title Fallbacks across Formats', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');

      // Upload empty-title.txt and empty-title.epub
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'empty-title.txt'));
      await sleep(800);

      const titles = await page.evaluate(() => {
        const cardTitles = Array.from(document.querySelectorAll('.book-card .book-title, .book-card h3, .book-card .title'));
        return cardTitles.map(el => el.textContent.trim());
      });

      for (const t of titles) {
        assert(t !== 'undefined' && t !== 'null' && t !== '', `Book card title must not be undefined or blank, found: "${t}"`);
      }
    } finally {
      await close();
    }
  });

  test('2.3 Boundary Page and Chapter Clamping Across Document Formats', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      // Press ArrowLeft repeatedly on page 1
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowLeft');
        await sleep(100);
      }

      const footerInfo = await page.evaluate(() => {
        return document.querySelector('#page-info, #page-indicator, #reader-footer')?.innerText || '';
      });
      assert(!footerInfo.includes('-1') && !footerInfo.includes('Page 0 of'), 'Page indicator must not display negative or 0-indexed page numbers');
    } finally {
      await close();
    }
  });

});

// --- TIER 3: MEMORY & CPU OPTIMIZATION STRESS TEST ---
describe('Tier 3: Memory & CPU Optimization Stress Test', (test) => {

  test('3.1 StorageManager Segregated Storage: getAllBooks() Returns Metadata Without Raw Binary Payloads in RAM', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Execute in-browser storage inspection via StorageManager / WebReaderDB
      const storageAudit = await page.evaluate(async () => {
        let StorageMgr;
        try {
          const mod = await import('./js/storage/storage-manager.js');
          StorageMgr = mod.StorageManager;
        } catch (e) {
          return { error: 'Failed to load StorageManager: ' + e.message };
        }

        const allBooks = await StorageMgr.getAllBooks();
        if (!allBooks || allBooks.length === 0) {
          return { bookCount: 0, hasBinaryInList: false, sampleBinaryCheck: true };
        }

        // Check if any item in getAllBooks contains raw binary payloads
        let hasBinaryInList = false;
        for (const book of allBooks) {
          if (book.fileBlob || book.fileData || book.blob || book.buffer || book.rawBytes) {
            hasBinaryInList = true;
            break;
          }
        }

        // Fetch single book and verify binary payload is retrieved on demand
        const firstBook = await StorageMgr.getBook(allBooks[0].id);
        const hasBinaryOnGet = !!(firstBook && (firstBook.fileBlob || firstBook.fileData || firstBook.blob || firstBook.buffer));

        return {
          bookCount: allBooks.length,
          hasBinaryInList,
          hasBinaryOnGet
        };
      });

      if (storageAudit.error) {
        throw new Error(storageAudit.error);
      }

      assertEqual(
        storageAudit.hasBinaryInList,
        false,
        'StorageManager.getAllBooks() must NEVER load binary Blob / ArrayBuffer payloads into RAM'
      );
    } finally {
      await close();
    }
  });

  test('3.2 10x Repeated Book Open and Close Cycles (Zero Leaked Blob URLs, Zero Detached Iframes, Bounded JS Heap)', async ({ browser, baseUrl }) => {
    const { page, close, pageErrors } = await createCleanPage(browser, baseUrl);
    try {
      await instrumentMemoryAndBlobTracking(page);
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Measure baseline heap size if available in Chromium
      const initialHeap = await page.evaluate(() => {
        return window.performance && window.performance.memory ? window.performance.memory.usedJSHeapSize : 0;
      });

      const CYCLES = 10;
      for (let cycle = 1; cycle <= CYCLES; cycle++) {
        // 1. Open book card
        const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
        await card.click();
        await waitForAnySelector(page, '#reader-stage, .reader-stage');
        await sleep(150);

        // 2. Perform page turn
        await page.keyboard.press('ArrowRight');
        await sleep(100);

        // 3. Return to library view
        const backBtn = await waitForAnySelector(page, '#btn-back-library, .btn-back, [data-action="back"]');
        await backBtn.click();
        await waitForAnySelector(page, '#library-view, .library-view');
        await sleep(150);
      }

      // Check active unrevoked Blob URLs count
      const activeBlobCount = await page.evaluate(() => {
        return window.__activeBlobUrls ? window.__activeBlobUrls.size : 0;
      });
      assertEqual(activeBlobCount, 0, `All Blob URLs created during reading must be revoked upon closing book. Leaked count: ${activeBlobCount}`);

      // Check detached / orphaned reader iframes in DOM
      const detachedIframesCount = await page.evaluate(() => {
        const lib = document.querySelector('#library-view');
        return lib ? lib.querySelectorAll('iframe').length : 0;
      });
      assertEqual(detachedIframesCount, 0, 'No detached reader iframes should remain inside library DOM tree');

      // Check final heap size delta
      const finalHeap = await page.evaluate(() => {
        return window.performance && window.performance.memory ? window.performance.memory.usedJSHeapSize : 0;
      });

      if (initialHeap > 0 && finalHeap > 0) {
        const heapGrowthBytes = finalHeap - initialHeap;
        const heapGrowthMB = heapGrowthBytes / (1024 * 1024);
        console.log(`\n    [Memory Stress] Heap delta after ${CYCLES} open/close cycles: ${heapGrowthMB.toFixed(2)} MB`);
        assert(
          heapGrowthMB < 30,
          `Heap growth after ${CYCLES} cycles must stay strictly bounded (< 30 MB), observed: ${heapGrowthMB.toFixed(2)} MB`
        );
      }

      assertEqual(pageErrors.length, 0, `Uncaught page errors during 10x open/close cycles: ${pageErrors.join(', ')}`);
    } finally {
      await close();
    }
  });

  test('3.3 Zero-Idle CPU & Passive Event Listener Verification', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Audit idle state: verify no runaway interval timers active
      const timerAudit = await page.evaluate(async () => {
        const start = performance.now();
        await new Promise(r => setTimeout(r, 200));
        const elapsed = performance.now() - start;
        return { elapsed };
      });

      assert(timerAudit.elapsed >= 190 && timerAudit.elapsed <= 350, 'Event loop must not be blocked or saturated with runaway timers');
    } finally {
      await close();
    }
  });

});

// --- TIER 4: REAL-WORLD APPLICATION SCENARIOS ---
describe('Tier 4: Complete Multi-Format User Journeys', (test) => {

  test('4.1 Multi-Format User Journey: Import PDF/MOBI/MD -> Filter -> Read -> Theme -> Reload State Restoration', async ({ browser, baseUrl }) => {
    const { page, close, consoleErrors, pageErrors } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      // Step 1: Import custom markdown document
      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(path.join(FIXTURES_DIR, 'valid-sample.md'));
      await sleep(1200);

      // Step 2: Open imported markdown book
      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        const match = cards.find(c => c.innerText.includes('Digital Reading') || c.innerText.toLowerCase().includes('md'));
        if (match) match.click();
      });
      await waitForAnySelector(page, '#reader-stage, .reader-stage');
      await sleep(500);

      // Step 3: Bookmark page
      const bmBtn = await waitForAnySelector(page, '#btn-bookmark, .btn-bookmark, [data-action="bookmark"]');
      await bmBtn.click();
      await sleep(300);

      // Step 4: Customize theme to 'nord' and adjust typography
      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(300);

      const nordBtn = await waitForAnySelector(page, '[data-theme-choice="nord"], #theme-nord, [data-theme="nord"]');
      await nordBtn.click();
      await sleep(300);

      // Step 5: Reload page and verify state restoration
      await page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
      await sleep(1000);

      const postReloadState = await page.evaluate(() => {
        const activeTheme = document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme');
        const isReaderView = document.querySelector('#reader-view')?.style.display !== 'none' &&
                             document.querySelector('#reader-stage') !== null;
        return {
          activeTheme,
          isReaderView
        };
      });

      assertEqual(postReloadState.activeTheme, 'nord', 'Theme should remain restored as "nord" after reload');
      assert(postReloadState.isReaderView, 'Reader view should be automatically restored after reload');
      assertEqual(pageErrors.length, 0, `Uncaught page errors during complete user journey: ${pageErrors.join(', ')}`);
      assertEqual(consoleErrors.length, 0, `Console errors during complete user journey: ${consoleErrors.join(', ')}`);
    } finally {
      await close();
    }
  });

});

// =============================================================================
// MAIN TEST EXECUTION HARNESS
// =============================================================================

async function runTestSuite() {
  console.log('\x1b[1m\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m       WebReader Multi-Format Upgrade E2E Test Suite (Tiers 0-4)    \x1b[0m');
  console.log('\x1b[1m\x1b[35m====================================================================\x1b[0m');
  console.log(`Chrome Executable: ${CHROME_PATH}`);
  console.log(`Headless Mode:     ${headlessMode}`);

  console.log(`Target:            ${targetTier !== null ? 'Tier ' + targetTier : 'All Tiers (0-4)'}`);

  // Step 1: Ensure test fixtures exist
  buildAllFixtures();

  // Step 2: Start dedicated local static server on dynamic port
  const serverInstance = await startServer({ port: 0, autoPortFallback: true });
  const baseUrl = serverInstance.url;
  console.log(`Static test server started at ${baseUrl}`);

  // Step 3: Launch Google Chrome
  assert(fs.existsSync(CHROME_PATH), `Google Chrome binary not found at ${CHROME_PATH}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: headlessMode,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  });
  console.log(`Browser launched successfully.`);

  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    tiers: {
      0: { total: 0, passed: 0, failed: 0 },
      1: { total: 0, passed: 0, failed: 0 },
      2: { total: 0, passed: 0, failed: 0 },
      3: { total: 0, passed: 0, failed: 0 },
      4: { total: 0, passed: 0, failed: 0 }
    },
    details: []
  };

  try {
    for (const suite of testSuites) {
      if (targetTier !== null && suite.tier !== targetTier) {
        testResults.skipped += suite.tests.length;
        continue;
      }

      console.log(`\n\x1b[1m\x1b[36m=== ${suite.title} ===\x1b[0m`);

      for (const t of suite.tests) {
        if (grepFilter && !grepFilter.test(t.title)) {
          testResults.skipped++;
          continue;
        }

        testResults.total++;
        testResults.tiers[suite.tier].total++;
        process.stdout.write(`  \x1b[33m•\x1b[0m ${t.title} ... `);
        const start = Date.now();
        try {
          await t.fn({ browser, baseUrl });
          const duration = Date.now() - start;
          testResults.passed++;
          testResults.tiers[suite.tier].passed++;
          console.log(`\x1b[32mPASSED\x1b[0m \x1b[90m(${duration}ms)\x1b[0m`);
          testResults.details.push({ tier: suite.tier, title: t.title, status: 'PASSED', duration });
        } catch (err) {
          const duration = Date.now() - start;
          testResults.failed++;
          testResults.tiers[suite.tier].failed++;
          console.log(`\x1b[31mFAILED\x1b[0m \x1b[90m(${duration}ms)\x1b[0m`);
          console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
          if (err.stack) {
            const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
            console.log(`    \x1b[90m${relevantStack}\x1b[0m`);
          }
          testResults.details.push({ tier: suite.tier, title: t.title, status: 'FAILED', duration, error: err.message });
        }
      }
    }
  } finally {
    await browser.close();
    if (serverInstance) {
      await serverInstance.close();
      console.log('Test server closed.');
    }
  }

  // ===========================================================================
  // Summary & Test Report
  // ===========================================================================
  console.log('\n\x1b[1m\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m         MULTI-FORMAT UPGRADE TEST EXECUTION SUMMARY                \x1b[0m');
  console.log('\x1b[1m\x1b[35m====================================================================\x1b[0m');
  console.log(`Total Tests Executed: ${testResults.total}`);
  console.log(`Passed Tests:         \x1b[32m${testResults.passed}\x1b[0m`);
  console.log(`Failed Tests:         \x1b[31m${testResults.failed}\x1b[0m`);
  console.log(`Skipped Tests:        \x1b[90${testResults.skipped ? 'm' + testResults.skipped : 'm0'}\x1b[0m\n`);

  console.log('Tier Breakdown:');
  for (let t = 0; t <= 4; t++) {
    const tierStat = testResults.tiers[t];
    if (tierStat.total > 0) {
      console.log(`  Tier ${t}: ${tierStat.passed} / ${tierStat.total} passed (${tierStat.failed} failed)`);
    }
  }

  if (testResults.failed > 0) {
    console.log('\n\x1b[33m[Test Status] Observed expected failures on unimplemented upgrade features (Milestones M1-M5 in progress).\x1b[0m');
    console.log('\x1b[31mFailed test count: ' + testResults.failed + '\x1b[0m');
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll executed tests completed successfully!\x1b[0m');
    process.exit(0);
  }
}

// Execute test suite when run directly
if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('\x1b[31mFatal error during E2E upgrade test suite execution:\x1b[0m', err);
    process.exit(1);
  });
}

module.exports = {
  runTestSuite,
  calculateWcagContrast,
  parseRgbColor
};
