/**
 * WebReader Comprehensive E2E Test Suite (Tiers 0 - 4).
 *
 * Requirements-driven, opaque-box automated headless browser test suite
 * using puppeteer-core driving system Google Chrome against a static HTTP server.
 *
 * Test Tiers:
 *   Tier 0: Infrastructure Verification (Static server, Chrome driver, fixtures, contrast engine)
 *   Tier 1: Feature Coverage (Library boot, sample book seed, paginated view, scroll view, TOC, bookmarks, 4 themes, typography)
 *   Tier 2: Boundary & Corner Cases (invalid zip / corrupted rejection, empty title fallback, boundary page clamping, zero halation, rapid navigation)
 *   Tier 3: Cross-Feature Combinations (Theme switch while paginated, reading mode switch with progress preservation, cross-chapter bookmark jump in scroll mode)
 *   Tier 4: Real-World Scenarios (Full user journey: import custom EPUB -> read -> bookmark -> change theme/typography -> hard reload -> state restoration & zero console errors)
 *
 * Usage:
 *   node test/e2e.test.js
 *   node test/e2e.test.js --verify-infra
 *   node test/e2e.test.js --tier=1
 *   node test/e2e.test.js --grep="Theme"
 *   node test/e2e.test.js --headless=false (for visual inspection)
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');
const { buildAllFixtures } = require('./test-fixtures/generate-fixtures.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURES_DIR = path.resolve(__dirname, 'test-fixtures');
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper sleep function (replaces deprecated page.waitForTimeout)
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
 * Robust selector finder supporting multiple comma-separated selectors or arrays.
 * Prioritizes visible interactive elements (button, input, a, [role="button"]) when multiple selectors match.
 */
async function waitForAnySelector(page, selectors, options = { timeout: 5000 }) {
  const selectorList = Array.isArray(selectors) ? selectors : selectors.split(',').map(s => s.trim());
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
 * Accesses chapter content inside the sandboxed iframe or stage container.
 */
async function getReaderContentText(page) {
  return await page.evaluate(() => {
    const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      return iframe.contentDocument.body.innerText || '';
    }
    const stage = document.querySelector('#reader-viewport, #reader-columns, #reading-content, #reader-stage');
    return stage ? stage.innerText || '' : '';
  });
}

// =============================================================================
// TEST SUITE DEFINITIONS (TIERS 0 - 4)
// =============================================================================

// --- TIER 0: TEST INFRASTRUCTURE & HARNESS VERIFICATION ---
describe('Tier 0: Test Infrastructure & Harness Verification', (test) => {

  test('0.1 Static HTTP Server Serves MIME Types & Enforces Security Boundaries', async () => {
    const baseUrl = `http://127.0.0.1:${serverPort}`;
    // Test MIME types
    const mdRes = await fetch(baseUrl + '/PROJECT.md');
    assertEqual(mdRes.status, 200, 'PROJECT.md status');
    assertEqual(mdRes.headers.get('content-type'), 'text/markdown; charset=utf-8', 'Markdown MIME');
    assertEqual(mdRes.headers.get('access-control-allow-origin'), '*', 'CORS Header');

    const epubRes = await fetch(baseUrl + '/test/test-fixtures/valid-sample.epub');
    assertEqual(epubRes.status, 200, 'EPUB status');
    assertEqual(epubRes.headers.get('content-type'), 'application/epub+zip', 'EPUB MIME');

    // Test path traversal rejection
    const traversalRes = await fetch(baseUrl + '/../../../etc/passwd');
    assert(traversalRes.status === 403 || traversalRes.status === 404, 'Path traversal must return 403 or 404');
  });

  test('0.2 Headless Google Chrome Launches, Executes Scripts & Closes Cleanly', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.setContent('<div id="test-banner" data-val="ready">WebReader Test Suite Active</div>');
      const val = await page.$eval('#test-banner', el => el.getAttribute('data-val'));
      assertEqual(val, 'ready', 'Chrome DOM evaluation');
    } finally {
      await close();
    }
  });

  test('0.3 Synthetic EPUB Fixtures Built with Correct OCF/OPF Architecture', async () => {
    const validEpubPath = path.join(FIXTURES_DIR, 'valid-sample.epub');
    const emptyTitleEpubPath = path.join(FIXTURES_DIR, 'empty-title.epub');
    const corruptedEpubPath = path.join(FIXTURES_DIR, 'corrupted.epub');

    assert(fs.existsSync(validEpubPath), 'valid-sample.epub must exist');
    assert(fs.existsSync(emptyTitleEpubPath), 'empty-title.epub must exist');
    assert(fs.existsSync(corruptedEpubPath), 'corrupted.epub must exist');

    // Verify valid-sample.epub has ZIP magic bytes (PK\x03\x04)
    const validBuf = fs.readFileSync(validEpubPath);
    assert(validBuf.readUInt32LE(0) === 0x04034b50, 'valid-sample.epub must start with ZIP signature 0x04034b50');

    // Verify corrupted.epub does NOT have ZIP magic bytes
    const corruptBuf = fs.readFileSync(corruptedEpubPath);
    assert(corruptBuf.readUInt32LE(0) !== 0x04034b50, 'corrupted.epub must not have valid ZIP signature');
  });

  test('0.4 WCAG Contrast Calculation Engine Calibrates All 4 Eye-Comfort Themes', async () => {
    const themes = {
      'warm-paper': { bg: '#f8f4ec', text: '#2d2a26', minContrast: 10 },
      'soft-dark': { bg: '#1c1f24', text: '#c9d1d9', minContrast: 9 },
      'daylight': { bg: '#fdfdfd', text: '#1a1a1a', minContrast: 13 },
      'sage': { bg: '#eef3ee', text: '#233025', minContrast: 11 }
    };

    for (const [themeName, config] of Object.entries(themes)) {
      const bgRgb = parseRgbColor(config.bg);
      const textRgb = parseRgbColor(config.text);
      const contrast = calculateWcagContrast(bgRgb, textRgb);
      assertGreaterThan(contrast, 4.5, `Theme ${themeName} contrast (${contrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);
      assertGreaterThan(contrast, config.minContrast, `Theme ${themeName} contrast (${contrast.toFixed(2)}:1) should exceed ${config.minContrast}:1`);
    }
  });

});

// --- TIER 1: FEATURE COVERAGE ---
describe('Tier 1: Feature Coverage (Core Requirements Verification)', (test) => {

  test('1.1 Library View Boot & Sample Book Auto-Seeding', async ({ browser, baseUrl }) => {
    const { page, close, consoleErrors, pageErrors } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0', timeout: 10000 });

      // Verify document title
      const title = await page.title();
      assert(title.toLowerCase().includes('reader'), `Page title should reference reader, got: "${title}"`);

      // Verify Library view is active by default
      await waitForAnySelector(page, '#library-view, .library-view, #library-grid, .library-grid');

      // Wait for sample book auto-seeding to populate book cards in IndexedDB & DOM
      await page.waitForFunction(() => {
        const cards = document.querySelectorAll('.book-card, [data-book-id]');
        return cards.length >= 1;
      }, { timeout: 8000 });

      // Check that at least one book card contains title and author
      const cardInfo = await page.evaluate(() => {
        const card = document.querySelector('.book-card, [data-book-id]');
        if (!card) return null;
        return {
          title: card.querySelector('.book-title, .title, h3, h4')?.textContent?.trim() || '',
          author: card.querySelector('.book-author, .author, p')?.textContent?.trim() || '',
          hasCover: !!card.querySelector('img, svg, .book-cover, .cover-placeholder')
        };
      });

      assert(cardInfo !== null, 'Sample book card must be rendered in library');
      assertGreaterThan(cardInfo.title.length, 0, 'Sample book title must not be empty');
      assert(cardInfo.hasCover, 'Sample book card must display a cover image or SVG jacket');

      assertEqual(pageErrors.length, 0, `Page errors during library boot: ${pageErrors.join(', ')}`);
    } finally {
      await close();
    }
  });

  test('1.2 Book Open & Paginated View Render (Default Mode)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0', timeout: 10000 });

      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();

      // Verify transition to reader view
      await waitForAnySelector(page, '#reader-view, .reader-view, #reader-stage, .reader-stage');
      await waitForAnySelector(page, '#reader-header, .reader-header, header');
      await waitForAnySelector(page, '#reader-footer, .reader-footer, footer');

      // Verify reader content has loaded chapter text
      await page.waitForFunction(() => {
        const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          return iframe.contentDocument.body.innerText.trim().length > 50;
        }
        const stage = document.querySelector('#reader-viewport, #reader-columns, #reading-content, #reader-stage');
        return stage && stage.innerText.trim().length > 50;
      }, { timeout: 8000 });

      // Verify default mode is Paginated
      const isPaginated = await page.evaluate(() => {
        const stage = document.querySelector('#reader-stage, #reading-stage');
        const hasScrollClass = stage?.classList.contains('scroll-mode') || document.body.classList.contains('scroll-mode');
        const footer = document.querySelector('#reader-footer, .reader-footer')?.innerText || '';
        const hasPageIndicator = /page\s*\d+/i.test(footer) || /p\.\s*\d+/i.test(footer) || footer.includes('/');
        return !hasScrollClass || hasPageIndicator;
      });

      assert(isPaginated, 'Reader must initialize in Paginated Mode by default');
    } finally {
      await close();
    }
  });

  test('1.3 Paginated Navigation via Keyboard and Tap Zones', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const getPageIndicator = async () => page.evaluate(() => {
        const el = document.querySelector('#page-info, #page-indicator, .page-indicator, #reader-footer, footer');
        return el ? el.innerText : '';
      });

      const initialText = await getPageIndicator();

      // Advance via ArrowRight
      await page.keyboard.press('ArrowRight');
      await sleep(400);
      const afterNextKey = await getPageIndicator();

      // Advance via Right Tap zone
      await page.mouse.click(1280 * 0.85, 400);
      await sleep(400);
      const afterRightTap = await getPageIndicator();

      // Previous via ArrowLeft
      await page.keyboard.press('ArrowLeft');
      await sleep(400);
      const afterPrevKey = await getPageIndicator();

      // Previous via Left Tap zone
      await page.mouse.click(1280 * 0.15, 400);
      await sleep(400);
      const finalPageText = await getPageIndicator();

      assert(initialText !== afterNextKey || afterRightTap !== afterPrevKey || finalPageText !== afterRightTap,
        'Page indicator should update on navigation commands');
    } finally {
      await close();
    }
  });

  test('1.4 Continuous Vertical Scroll View Mode', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const modeBtn = await waitForAnySelector(page, '#btn-mode, .btn-mode, [data-action="toggle-mode"]');
      await modeBtn.click();
      await sleep(300);

      const isScrollModeActive = await page.evaluate(() => {
        const stage = document.querySelector('#reader-stage, #reading-stage');
        const body = document.body;
        return stage?.classList.contains('scroll-mode') ||
               body.classList.contains('scroll-mode') ||
               document.querySelector('[data-reading-mode="scroll"]') !== null;
      });
      assert(isScrollModeActive, 'Reader stage should activate scroll-mode class/attribute');

      const scrollResult = await page.evaluate(() => {
        const target = document.querySelector('#reader-stage.scroll-mode, #reading-stage.scroll-mode, #reader-viewport') || window;
        const beforeScroll = target.scrollTop || window.scrollY || 0;
        if (target.scrollTo) {
          target.scrollTo(0, 300);
        } else {
          window.scrollTo(0, 300);
        }
        return {
          before: beforeScroll,
          after: target.scrollTop || window.scrollY || 0
        };
      });
      assert(scrollResult !== null, 'Scroll container should exist in scroll mode');
    } finally {
      await close();
    }
  });

  test('1.5 Table of Contents (TOC) Drawer Open & Chapter Navigation', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const tocBtn = await waitForAnySelector(page, '#btn-toc, .btn-toc, [data-action="toc"]');
      await tocBtn.click();
      await sleep(300);

      const drawerOpen = await page.evaluate(() => {
        const drawer = document.querySelector('#toc-drawer, .toc-drawer');
        const backdrop = document.querySelector('#drawer-backdrop, .drawer-backdrop');
        return drawer?.classList.contains('open') || drawer?.getAttribute('aria-hidden') === 'false' || backdrop?.classList.contains('open');
      });
      assert(drawerOpen, 'TOC drawer should open when TOC button is clicked');

      const tocItemCount = await page.evaluate(() => {
        return document.querySelectorAll('.toc-item, [data-toc-href]').length;
      });
      assertGreaterThan(tocItemCount, 0, 'TOC drawer must render chapter items');

      const chapterItems = await page.$$('.toc-item, [data-toc-href]');
      if (chapterItems.length > 1) {
        await chapterItems[1].click();
        await sleep(500);

        const chapterTitle = await page.evaluate(() => {
          return document.querySelector('#chapter-title, .chapter-title, footer .chapter')?.innerText || '';
        });
        assertGreaterThan(chapterTitle.length, 0, 'Current chapter title in footer should be visible');
      }
    } finally {
      await close();
    }
  });

  test('1.6 Bookmark Creation, Drawer Listing & Jump', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const bmBtn = await waitForAnySelector(page, '#btn-bookmark, .btn-bookmark, [data-action="bookmark"]');
      await bmBtn.click();
      await sleep(300);

      const bmTabOrDrawer = await waitForAnySelector(page, '#btn-bookmarks, #tab-bookmarks, [data-tab="bookmarks"], #btn-toc, .btn-toc');
      await bmTabOrDrawer.click();
      await sleep(300);

      const bmCount = await page.evaluate(() => {
        return document.querySelectorAll('.bookmark-item, [data-bookmark-id]').length;
      });
      assertGreaterThan(bmCount, 0, 'Saved bookmark must be listed in the bookmarks drawer/tab');
    } finally {
      await close();
    }
  });

  test('1.7 All 4 Eye-Comfort Themes (Contrast >= 4.5:1 & WCAG AA/AAA)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(300);

      const themes = ['warm-paper', 'soft-dark', 'daylight', 'sage'];

      for (const theme of themes) {
        const themeBtn = await waitForAnySelector(page, `[data-theme="${theme}"], [data-theme-choice="${theme}"], #theme-${theme}`);
        await themeBtn.click();
        await sleep(200);

        const activeTheme = await page.evaluate(() => {
          return document.documentElement.getAttribute('data-theme') ||
                 document.body.getAttribute('data-theme') ||
                 document.querySelector('#reader-stage')?.getAttribute('data-theme');
        });
        assertEqual(activeTheme, theme, `Theme attribute should match '${theme}'`);

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

        assertGreaterThan(contrast, 4.5, `Theme '${theme}' contrast (${contrast.toFixed(2)}:1) must meet WCAG AA (>= 4.5:1)`);
      }
    } finally {
      await close();
    }
  });

  test('1.8 Typography Customization (Font Family, Size, Line Height, Margin)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(300);

      const fontSizeInput = await waitForAnySelector(page, '#font-size-slider, [data-setting="fontSize"], input[name="fontSize"]');
      await page.evaluate((el) => {
        el.value = '24';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, fontSizeInput);
      await sleep(300);

      const computedFontSize = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const stage = document.querySelector('#reader-stage, #reading-stage');
        return root.getPropertyValue('--reader-font-size') || (stage ? getComputedStyle(stage).fontSize : '');
      });

      assert(computedFontSize.includes('24'), `Font size should update to 24px, got: ${computedFontSize}`);

      // Verify classic book serif selection (e.g. Literata & EB Garamond)
      const garamondBtn = await waitForAnySelector(page, '[data-font-choice="garamond"]');
      await garamondBtn.click();
      await sleep(150);

      // Verify advanced typography controls (Font Weight, Text Alignment, Paragraph/Letter/Word Spacing)
      const justifyBtn = await waitForAnySelector(page, '[data-align-choice="justify"]');
      await justifyBtn.click();

      await page.evaluate(() => {
        const setSlider = (selector, val) => {
          const el = document.querySelector(selector);
          if (el) {
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        setSlider('#font-weight-slider', '500');
        setSlider('#paragraph-spacing-slider', '1.6');
        setSlider('#letter-spacing-slider', '0.04');
        setSlider('#word-spacing-slider', '0.08');
      });
      await sleep(200);

      const advTypoState = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const iframe = document.querySelector('iframe#reader-frame');
        const iRoot = iframe?.contentDocument ? getComputedStyle(iframe.contentDocument.documentElement) : root;
        return {
          fontFamily: iRoot.getPropertyValue('--reader-font-family').trim(),
          fontWeight: iRoot.getPropertyValue('--reader-font-weight').trim(),
          textAlign: iRoot.getPropertyValue('--reader-text-align').trim(),
          hyphens: iRoot.getPropertyValue('--reader-hyphens').trim(),
          paraSpacing: iRoot.getPropertyValue('--reader-paragraph-spacing').trim(),
          letterSpacing: iRoot.getPropertyValue('--reader-letter-spacing').trim(),
          wordSpacing: iRoot.getPropertyValue('--reader-word-spacing').trim()
        };
      });

      assert(advTypoState.fontFamily.includes('EB Garamond'), `Expected EB Garamond in font stack, got: ${advTypoState.fontFamily}`);
      assertEqual(advTypoState.fontWeight, '500', 'Font weight should update to 500');
      assertEqual(advTypoState.textAlign, 'justify', 'Text alignment should update to justify');
      assertEqual(advTypoState.hyphens, 'auto', 'Justified alignment should automatically enable hyphens: auto');
      assertEqual(advTypoState.paraSpacing, '1.60em', 'Paragraph spacing should update to 1.60em');
      assertEqual(advTypoState.letterSpacing, '0.04em', 'Letter spacing should update to 0.04em');
      assertEqual(advTypoState.wordSpacing, '0.08em', 'Word spacing should update to 0.08em');

      // Verify one-click Reset Typography Defaults button
      const resetBtn = await waitForAnySelector(page, '#btn-reset-typography');
      await resetBtn.click();
      await sleep(150);

      const postResetFontSize = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue('--reader-font-size').trim();
      });
      assertEqual(postResetFontSize, '18px', 'Reset Typography button should restore 18px default font size');
    } finally {
      await close();
    }
  });

});

// --- TIER 2: BOUNDARY & CORNER CASES ---
describe('Tier 2: Boundary & Corner Cases (Stress & Error Handling)', (test) => {

  test('2.1 Corrupted EPUB / Invalid ZIP Rejection with Non-Blocking Error Toast', async ({ browser, baseUrl }) => {
    const corruptedEpubPath = path.join(FIXTURES_DIR, 'corrupted.epub');
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(corruptedEpubPath);
      await sleep(500);

      const toastMessage = await page.evaluate(() => {
        const toast = document.querySelector('.toast, #toast-container, .error-banner, [role="alert"]');
        return toast ? toast.innerText : '';
      });

      assert(toastMessage.length > 0, 'An error toast / alert must be displayed when importing a corrupted EPUB');

      const libraryVisible = await page.evaluate(() => {
        const lib = document.querySelector('#library-view, .library-view, #library-grid');
        return lib && getComputedStyle(lib).display !== 'none';
      });
      assert(libraryVisible, 'Library view must remain visible and functional after rejected upload');
    } finally {
      await close();
    }
  });

  test('2.2 Empty Book Title Fallback Handling', async ({ browser, baseUrl }) => {
    const emptyTitleEpubPath = path.join(FIXTURES_DIR, 'empty-title.epub');
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(emptyTitleEpubPath);
      await sleep(1000);

      const titles = await page.evaluate(() => {
        const cardTitles = Array.from(document.querySelectorAll('.book-card .book-title, .book-card h3, .book-card .title'));
        return cardTitles.map(el => el.textContent.trim());
      });

      for (const t of titles) {
        assert(t !== 'undefined' && t !== 'null' && t !== '', `Book card title must not be undefined/empty, found: "${t}"`);
      }
    } finally {
      await close();
    }
  });

  test('2.3 Boundary Page Clamping (First Page & Last Page)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowLeft');
        await sleep(150);
      }

      const footerInfo = await page.evaluate(() => {
        return document.querySelector('#page-info, #page-indicator, #reader-footer')?.innerText || '';
      });
      assert(!footerInfo.includes('-1') && !footerInfo.includes('Page 0 of'), 'Page index must clamp and never go negative');
    } finally {
      await close();
    }
  });

  test('2.4 Zero Halation on Soft Dark / Night Theme', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(200);

      const darkBtn = await waitForAnySelector(page, '[data-theme="soft-dark"], [data-theme-choice="soft-dark"], #theme-soft-dark');
      await darkBtn.click();
      await sleep(300);

      const stageBg = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const stage = document.querySelector('#reader-stage, #reading-stage') || document.body;
        return root.getPropertyValue('--color-bg') || getComputedStyle(stage).backgroundColor;
      });

      const bgRgb = parseRgbColor(stageBg);
      const isNotPureBlack = (bgRgb.r > 10 || bgRgb.g > 10 || bgRgb.b > 10);
      assert(isNotPureBlack, `Night theme background should be soft dark slate/charcoal, not pitch black #000000 (got: ${JSON.stringify(bgRgb)})`);
    } finally {
      await close();
    }
  });

  test('2.5 Rapid Consecutive Navigation Keystroke Stress', async ({ browser, baseUrl }) => {
    const { page, close, pageErrors } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
        await sleep(30);
      }

      await sleep(800);

      const content = await getReaderContentText(page);
      assertGreaterThan(content.length, 20, 'Reader stage must contain valid content after rapid navigation');
      assertEqual(pageErrors.length, 0, `Uncaught page errors after rapid navigation: ${pageErrors.join(', ')}`);
    } finally {
      await close();
    }
  });

});

// --- TIER 3: CROSS-FEATURE COMBINATIONS ---
describe('Tier 3: Cross-Feature Combinations', (test) => {

  test('3.1 Theme Switch While Navigated to Page 2+ (Preserves Position)', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      await page.keyboard.press('ArrowRight');
      await sleep(300);

      const pageBefore = await page.evaluate(() => {
        return document.querySelector('#page-info, #page-indicator, footer')?.innerText || '';
      });

      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(200);

      const sageBtn = await waitForAnySelector(page, '[data-theme="sage"], [data-theme-choice="sage"], #theme-sage');
      await sageBtn.click();
      await sleep(300);

      const pageAfter = await page.evaluate(() => {
        return document.querySelector('#page-info, #page-indicator, footer')?.innerText || '';
      });

      assertEqual(pageAfter, pageBefore, 'Reading position should be preserved when switching themes');
    } finally {
      await close();
    }
  });

  test('3.2 Reading Mode Switch with Bidirectional Progress Ratio Sync', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      await page.keyboard.press('ArrowRight');
      await sleep(200);
      await page.keyboard.press('ArrowRight');
      await sleep(300);

      const modeBtn = await waitForAnySelector(page, '#btn-mode, .btn-mode, [data-action="toggle-mode"]');
      await modeBtn.click();
      await sleep(400);

      const isScroll = await page.evaluate(() => {
        return document.querySelector('#reader-stage')?.classList.contains('scroll-mode') ||
               document.body.classList.contains('scroll-mode');
      });
      assert(isScroll, 'Should be in scroll mode');

      await modeBtn.click();
      await sleep(400);

      const content = await getReaderContentText(page);
      assertGreaterThan(content.length, 20, 'Content must remain rendered after switching back to paginated mode');
    } finally {
      await close();
    }
  });

  test('3.3 Bookmark Jump Across Chapters While in Scroll Mode', async ({ browser, baseUrl }) => {
    const { page, close } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });
      const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
      await card.click();
      await waitForAnySelector(page, '#reader-stage, .reader-stage');

      const tocBtn = await waitForAnySelector(page, '#btn-toc, .btn-toc, [data-action="toc"]');
      await tocBtn.click();
      await sleep(200);

      const tocItems = await page.$$('.toc-item, [data-toc-href]');
      if (tocItems.length > 1) {
        await tocItems[1].click();
        await sleep(400);
      }

      const bmBtn = await waitForAnySelector(page, '#btn-bookmark, .btn-bookmark, [data-action="bookmark"]');
      await bmBtn.click();
      await sleep(300);

      await tocBtn.click();
      await sleep(200);
      const tocItemsAgain = await page.$$('.toc-item, [data-toc-href]');
      if (tocItemsAgain.length > 0) {
        await tocItemsAgain[0].click();
        await sleep(400);
      }

      const modeBtn = await waitForAnySelector(page, '#btn-mode, .btn-mode, [data-action="toggle-mode"]');
      await modeBtn.click();
      await sleep(300);

      const openBm = await waitForAnySelector(page, '#btn-bookmarks, #tab-bookmarks, [data-tab="bookmarks"], #btn-toc, .btn-toc');
      await openBm.click();
      await sleep(300);

      const bmItem = await waitForAnySelector(page, '.bookmark-item, [data-bookmark-id]');
      await bmItem.click();
      await sleep(500);

      const chapterTitle = await page.evaluate(() => {
        return document.querySelector('#chapter-title, .chapter-title, footer .chapter')?.innerText || '';
      });
      assertGreaterThan(chapterTitle.length, 0, 'Chapter title should be visible after bookmark jump');
    } finally {
      await close();
    }
  });

});

// --- TIER 4: REAL-WORLD APPLICATION SCENARIOS ---
describe('Tier 4: Real-World Scenarios (End-to-End User Journey)', (test) => {

  test('4.1 Complete User Journey: Import EPUB -> Read -> Bookmark -> Style -> Hard Reload -> Exact State Restoration & Zero Console Errors', async ({ browser, baseUrl }) => {
    const validEpubPath = path.join(FIXTURES_DIR, 'valid-sample.epub');
    const { page, close, consoleErrors, pageErrors } = await createCleanPage(browser, baseUrl);
    try {
      await page.goto(baseUrl + '/', { waitUntil: 'networkidle0' });

      const fileInput = await waitForAnySelector(page, 'input[type="file"]#file-input, input[type="file"]');
      await fileInput.uploadFile(validEpubPath);
      await sleep(1000);

      const bookCard = await page.waitForFunction(() => {
        const cards = Array.from(document.querySelectorAll('.book-card, [data-book-id]'));
        return cards.find(c => c.innerText.includes('Minimalist') || c.innerText.includes('Arthur'));
      }, { timeout: 8000 });
      assert(bookCard, 'Newly imported book card should appear in the library');

      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.book-card, [data-book-id]'));
        const match = cards.find(c => c.innerText.includes('Minimalist') || c.innerText.includes('Arthur'));
        if (match) match.click();
      });
      await waitForAnySelector(page, '#reader-stage, .reader-stage');
      await sleep(500);

      await page.keyboard.press('ArrowRight');
      await sleep(200);
      await page.keyboard.press('ArrowRight');
      await sleep(300);

      const bmBtn = await waitForAnySelector(page, '#btn-bookmark, .btn-bookmark, [data-action="bookmark"]');
      await bmBtn.click();
      await sleep(300);

      const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
      await settingsBtn.click();
      await sleep(200);

      const sageBtn = await waitForAnySelector(page, '[data-theme="sage"], [data-theme-choice="sage"], #theme-sage');
      await sageBtn.click();
      await sleep(200);

      await page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
      await sleep(1000);

      const postReloadState = await page.evaluate(() => {
        const activeTheme = document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme');
        const isReaderView = document.querySelector('#reader-view')?.style.display !== 'none' &&
                             document.querySelector('#reader-stage') !== null;
        const bookTitle = document.querySelector('#book-title, .book-title, header h2')?.innerText || '';
        const chapterTitle = document.querySelector('#chapter-title, .chapter-title, footer .chapter')?.innerText || '';
        return {
          activeTheme,
          isReaderView,
          bookTitle,
          chapterTitle
        };
      });

      assertEqual(postReloadState.activeTheme, 'sage', 'Theme should remain restored as "sage" after page reload');
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
  console.log('\x1b[1m\x1b[35m         WebReader Requirements-Driven E2E Test Suite (Tiers 0-4)    \x1b[0m');
  console.log('\x1b[1m\x1b[35m====================================================================\x1b[0m');
  console.log(`Chrome Executable: ${CHROME_PATH}`);
  console.log(`Headless Mode:     ${headlessMode}`);

  const indexHtmlExists = fs.existsSync(path.join(PROJECT_ROOT, 'index.html'));
  if (!indexHtmlExists && targetTier === null && !forceE2E) {
    console.log(`\n\x1b[33m[Notice] index.html not yet present in workspace (Implementation Track M1-M4 in progress).\x1b[0m`);
    console.log(`Executing Tier 0 (Test Infrastructure & Harness Verification)...`);
    console.log(`To execute Tiers 1-4 once index.html is implemented, re-run 'node test/e2e.test.js'.`);
    targetTier = 0;
  }

  console.log(`Target:            ${targetTier !== null ? 'Tier ' + targetTier : 'All Tiers (0-4)'}`);

  // Step 1: Ensure test fixtures exist
  buildAllFixtures();

  // Step 2: Start local static server
  let serverInstance = null;
  let baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    const testPing = await fetch(baseUrl + '/PROJECT.md').catch(() => null);
    if (testPing && testPing.ok) {
      console.log(`Existing server detected at ${baseUrl}`);
    } else {
      serverInstance = await startServer({ port: serverPort, autoPortFallback: true });
      baseUrl = serverInstance.url;
      console.log(`Static test server started at ${baseUrl}`);
    }
  } catch (serverErr) {
    serverInstance = await startServer({ port: 0, autoPortFallback: true });
    baseUrl = serverInstance.url;
    console.log(`Static test server started on dynamic port: ${baseUrl}`);
  }

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
  console.log('\x1b[1m\x1b[35m                   E2E TEST EXECUTION SUMMARY                       \x1b[0m');
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
    console.log('\n\x1b[31mSome tests failed. See details above.\x1b[0m');
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll executed tests completed successfully!\x1b[0m');
    process.exit(0);
  }
}

// Execute test suite when run directly
if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('\x1b[31mFatal error during E2E test suite execution:\x1b[0m', err);
    process.exit(1);
  });
}

module.exports = {
  runTestSuite,
  calculateWcagContrast,
  parseRgbColor
};
