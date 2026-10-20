/**
 * WebReader Adversarial Challenger Test Suite:
 * Milestone 2 — WCAG AAA Contrast Ratios (>= 7.0:1) & Zero-FOUC Bootstrap Verification
 *
 * Requirements:
 * 1. Standalone Puppeteer script driving Chromium against static HTTP server.
 * 2. Load each of the 10 themes in Chromium.
 * 3. Extract computed --text-primary (or body color) and --bg-primary (or body background-color).
 * 4. Compute W3C relative luminance: L = 0.2126 * R + 0.7152 * G + 0.0722 * B.
 * 5. Assert contrast ratio (L1 + 0.05) / (L2 + 0.05) >= 7.0:1 for EVERY ONE of the 10 themes.
 * 6. Test Zero-FOUC: preload localStorage before navigation (page.evaluateOnNewDocument).
 * 7. Query document.documentElement.dataset.theme before first paint (domcontentloaded).
 *    Assert it matches the stored theme without flashing white or warm-paper.
 * 8. Adversarial challenge: Swatch UI switching, Iframe content inheritance, API desync,
 *    and Malicious/Corrupted storage values.
 */

const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TEST_PORT = 3456;

const ALL_10_THEMES = [
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

// Reference palette definitions from spec & themes.css
const EXPECTED_PALETTES = {
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

// =============================================================================
// W3C WCAG 2.1 Luminance & Contrast Calculation Helpers
// =============================================================================

function parseCssColor(colorStr) {
  if (!colorStr) return { r: 255, g: 255, b: 255 };
  const trimmed = colorStr.trim();
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  return { r: 128, g: 128, b: 128 };
}

function getW3CRelativeLuminance(rgb) {
  // sRGB to linear conversion per W3C WCAG 2.1 specs
  const sR = rgb.r / 255;
  const sG = rgb.g / 255;
  const sB = rgb.b / 255;

  const R = (sR <= 0.04045) ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4);
  const G = (sG <= 0.04045) ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4);
  const B = (sB <= 0.04045) ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4);

  // L = 0.2126 * R + 0.7152 * G + 0.0722 * B
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function calculateW3CContrastRatio(color1, color2) {
  const rgb1 = typeof color1 === 'string' ? parseCssColor(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? parseCssColor(color2) : color2;

  const l1 = getW3CRelativeLuminance(rgb1);
  const l2 = getW3CRelativeLuminance(rgb2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

// =============================================================================
// Test Harness & Results Aggregator
// =============================================================================

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function recordTest(name, passed, details = {}) {
  if (passed) {
    results.passed++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name}`);
  } else {
    results.failed++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`);
    if (details.error) console.error(`    Error: ${details.error}`);
  }
  results.tests.push({ name, passed, details });
}

async function runAdversarialSuite() {
  console.log('======================================================================');
  console.log('   M2 ADVERSARIAL CHALLENGER: WCAG AAA CONTRAST & ZERO-FOUC HARNESS  ');
  console.log('======================================================================');

  const { server, port, url, close: closeServer } = await startServer({ port: TEST_PORT });
  console.log(`Test server active at ${url}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: WCAG AAA Contrast Ratios (>= 7.0:1) on Computed Styles
    // -------------------------------------------------------------------------
    console.log('\n--- PART 1: WCAG AAA Contrast Ratios (>= 7.0:1) for All 10 Themes in Chromium ---');

    for (const theme of ALL_10_THEMES) {
      const page = await browser.newPage();
      try {
        // Preload theme via localStorage to let the app initialize it naturally
        await page.evaluateOnNewDocument((t) => {
          localStorage.setItem('webreader_theme', t);
        }, theme);

        await page.goto(`${url}/`, { waitUntil: 'networkidle0' });

        // Extract computed properties on documentElement and body
        const computedThemeData = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const docStyle = getComputedStyle(doc);
          const bodyStyle = getComputedStyle(body);

          return {
            bgPrimary: docStyle.getPropertyValue('--bg-primary').trim(),
            textPrimary: docStyle.getPropertyValue('--text-primary').trim(),
            colorBg: docStyle.getPropertyValue('--color-bg').trim(),
            colorText: docStyle.getPropertyValue('--color-text').trim(),
            bodyBackgroundColor: bodyStyle.backgroundColor,
            bodyColor: bodyStyle.color,
            datasetTheme: doc.dataset.theme,
            attrTheme: doc.getAttribute('data-theme'),
            bodyDatasetTheme: body.dataset.theme,
            bodyAttrTheme: body.getAttribute('data-theme')
          };
        });

        // 1. Contrast ratio between --bg-primary and --text-primary
        const propContrast = calculateW3CContrastRatio(
          computedThemeData.bgPrimary,
          computedThemeData.textPrimary
        );

        // 2. Contrast ratio between computed body background-color and color
        const bodyContrast = calculateW3CContrastRatio(
          computedThemeData.bodyBackgroundColor,
          computedThemeData.bodyColor
        );

        const meetsAAA = propContrast >= 7.0 && bodyContrast >= 7.0;

        recordTest(
          `Theme '${theme}' WCAG AAA Contrast: --bg-primary vs --text-primary (${propContrast.toFixed(2)}:1), body (${bodyContrast.toFixed(2)}:1)`,
          meetsAAA,
          {
            theme,
            propContrast,
            bodyContrast,
            bgPrimary: computedThemeData.bgPrimary,
            textPrimary: computedThemeData.textPrimary,
            bodyBg: computedThemeData.bodyBackgroundColor,
            bodyColor: computedThemeData.bodyColor
          }
        );
      } finally {
        await page.close();
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 2: Zero-FOUC Bootstrap Verification Across All 10 Themes
    // -------------------------------------------------------------------------
    console.log('\n--- PART 2: Zero-FOUC Bootstrap Verification with Preloaded localStorage ---');

    for (const theme of ALL_10_THEMES) {
      const page = await browser.newPage();
      try {
        // Preload localStorage before ANY document parsing occurs
        // AND install high-resolution telemetry to monitor DOM mutations
        await page.evaluateOnNewDocument((targetTheme) => {
          localStorage.setItem('webreader_theme', targetTheme);

          window.__foucTelemetry = {
            targetTheme,
            history: [],
            flashedWarmPaper: false,
            flashedWhite: false
          };

          const check = (stage) => {
            if (!document.documentElement) return;
            const currentTheme = document.documentElement.getAttribute('data-theme') ||
                                 (document.documentElement.dataset && document.documentElement.dataset.theme);
            const docClass = document.documentElement.className;
            const bodyBg = document.body ? window.getComputedStyle(document.body).backgroundColor : null;

            window.__foucTelemetry.history.push({
              stage,
              theme: currentTheme,
              class: docClass,
              bodyBg,
              time: performance.now()
            });

            // Check if non-warm-paper theme ever flashed warm-paper or white
            if (targetTheme !== 'warm-paper') {
              if (currentTheme === 'warm-paper') {
                window.__foucTelemetry.flashedWarmPaper = true;
              }
              if (bodyBg === 'rgb(248, 241, 227)' || bodyBg === 'rgb(255, 255, 255)') {
                window.__foucTelemetry.flashedWhite = true;
              }
            }
          };

          // Capture on MutationObserver
          const observer = new MutationObserver(() => check('mutation'));
          observer.observe(document, { attributes: true, childList: true, subtree: true });

          // Also check synchronously at readystatechange
          document.addEventListener('readystatechange', () => {
            check('readystatechange-' + document.readyState);
          });
        }, theme);

        // Navigate with waitUntil: 'domcontentloaded' to evaluate BEFORE first paint
        await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });

        const bootCheck = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const docStyle = getComputedStyle(doc);
          const bodyStyle = body ? getComputedStyle(body) : null;

          return {
            datasetTheme: doc.dataset.theme,
            attrTheme: doc.getAttribute('data-theme'),
            hasNoThemeTransition: doc.classList.contains('no-theme-transition'),
            computedBg: docStyle.getPropertyValue('--bg-primary').trim(),
            computedText: docStyle.getPropertyValue('--text-primary').trim(),
            bodyComputedBg: bodyStyle ? bodyStyle.backgroundColor : null,
            bodyComputedColor: bodyStyle ? bodyStyle.color : null,
            telemetry: window.__foucTelemetry
          };
        });

        // Compute contrast at DOMContentLoaded
        const domContentLoadedCr = calculateW3CContrastRatio(
          bootCheck.computedBg,
          bootCheck.computedText
        );

        const isDatasetMatch = bootCheck.datasetTheme === theme;
        const isAttrMatch = bootCheck.attrTheme === theme;
        const noWhiteOrWarmPaperFlash = !bootCheck.telemetry.flashedWarmPaper && !bootCheck.telemetry.flashedWhite;
        const hasTransitionGuard = bootCheck.hasNoThemeTransition === true;

        const zeroFoucPassed = isDatasetMatch && isAttrMatch && noWhiteOrWarmPaperFlash && domContentLoadedCr >= 7.0;

        recordTest(
          `Zero-FOUC on preloaded '${theme}': dataset.theme matches immediately at domcontentloaded (CR ${domContentLoadedCr.toFixed(2)}:1, no flash)`,
          zeroFoucPassed,
          {
            theme,
            datasetTheme: bootCheck.datasetTheme,
            attrTheme: bootCheck.attrTheme,
            hasTransitionGuard,
            flashedWarmPaper: bootCheck.telemetry.flashedWarmPaper,
            flashedWhite: bootCheck.telemetry.flashedWhite,
            domContentLoadedCr
          }
        );
      } finally {
        await page.close();
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 3: Settings Drawer Swatch Switching & Real-Time Dynamic Contrast
    // -------------------------------------------------------------------------
    console.log('\n--- PART 3: Settings Drawer Swatch Switching & Real-Time Contrast ---');
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${url}/`, { waitUntil: 'networkidle0' });

        // Open sample book to enter reader view where settings button is accessible
        const card = await page.$('.book-card, [data-book-id]');
        if (card) {
          await card.click();
          await page.waitForSelector('#reader-stage, .reader-stage', { timeout: 5000 });

          // Open settings drawer
          const settingsBtn = await page.$('#btn-settings, .btn-settings, [data-action="settings"]');
          if (settingsBtn) {
            await settingsBtn.click();
            await page.waitForSelector('#settings-drawer.is-open, #settings-drawer:not([aria-hidden="true"])', { timeout: 3000 });
          }

          for (const theme of ALL_10_THEMES) {
            const swatchSelector = `[data-theme-choice="${theme}"], #theme-${theme}, button[data-theme="${theme}"]`;
            const swatch = await page.$(swatchSelector);

            if (!swatch) {
              recordTest(`Theme swatch button found for '${theme}'`, false, {
                error: `Selector '${swatchSelector}' not found in DOM`
              });
              continue;
            }

            await page.evaluate((sel) => {
              const btn = document.querySelector(sel);
              if (btn) btn.click();
            }, swatchSelector);
            // Allow 300ms for the 220ms CSS transition on body to settle
            await new Promise(r => setTimeout(r, 300));

            const activeData = await page.evaluate(() => {
              const doc = document.documentElement;
              const body = document.body;
              const docStyle = getComputedStyle(doc);
              const bodyStyle = getComputedStyle(body);
              return {
                datasetTheme: doc.dataset.theme,
                attrTheme: doc.getAttribute('data-theme'),
                bodyDatasetTheme: body.dataset.theme,
                storedTheme: localStorage.getItem('webreader_theme'),
                bgPrimary: docStyle.getPropertyValue('--bg-primary').trim(),
                textPrimary: docStyle.getPropertyValue('--text-primary').trim(),
                bodyBg: bodyStyle.backgroundColor,
                bodyColor: bodyStyle.color
              };
            });

            const propCr = calculateW3CContrastRatio(activeData.bgPrimary, activeData.textPrimary);
            const bodyCr = calculateW3CContrastRatio(activeData.bodyBg, activeData.bodyColor);

            const passed = activeData.datasetTheme === theme &&
                           activeData.bodyDatasetTheme === theme &&
                           activeData.storedTheme === theme &&
                           propCr >= 7.0 &&
                           bodyCr >= 7.0;

            recordTest(
              `Dynamic swatch switch to '${theme}': updates doc & body, localStorage, maintains WCAG AAA (prop: ${propCr.toFixed(2)}:1, body: ${bodyCr.toFixed(2)}:1)`,
              passed,
              { theme, activeData, propCr, bodyCr }
            );
          }
        } else {
          recordTest('Sample book card present to access settings drawer', false, { error: 'No book card found' });
        }
      } finally {
        await page.close();
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 4: Reader Iframe Content Theme Inheritance & Contrast
    // -------------------------------------------------------------------------
    console.log('\n--- PART 4: Reader Iframe Content Theme Inheritance & Contrast ---');
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${url}/`, { waitUntil: 'networkidle0' });

        await page.waitForSelector('.book-card, [data-book-id]');
        await page.evaluate(() => {
          const card = document.querySelector('.book-card, [data-book-id]');
          if (card) card.click();
        });
        await page.waitForSelector('iframe#reader-frame, iframe.reader-frame', { timeout: 5000 });

        for (const theme of ALL_10_THEMES) {
          await page.evaluate(async (t) => {
            const { EventBus } = await import('./js/event-bus.js');
            EventBus.emit('ui:set-theme', { themeId: t });
          }, theme);

          await new Promise(r => setTimeout(r, 150));

            const iframeData = await page.evaluate(() => {
              const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
              if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) return null;
              const doc = iframe.contentDocument.documentElement;
              const body = iframe.contentDocument.body;
              const docStyle = getComputedStyle(doc);
              const bodyStyle = getComputedStyle(body);
              return {
                themeAttr: doc.getAttribute('data-theme'),
                bodyClass: body.className,
                bgPrimary: docStyle.getPropertyValue('--bg-primary').trim(),
                textPrimary: docStyle.getPropertyValue('--text-primary').trim(),
                bodyBg: bodyStyle.backgroundColor,
                bodyColor: bodyStyle.color
              };
            });

            if (iframeData) {
              const iframeBodyCr = calculateW3CContrastRatio(iframeData.bodyBg, iframeData.bodyColor);
              const passed = iframeData.themeAttr === theme && iframeBodyCr >= 7.0;

              recordTest(
                `Reader iframe content styles theme '${theme}' with WCAG AAA Contrast (${iframeBodyCr.toFixed(2)}:1)`,
                passed,
                { theme, iframeData, iframeBodyCr }
              );
            } else {
              recordTest(`Reader iframe accessible for theme '${theme}'`, false, { error: 'Iframe contentDocument not found' });
            }
          }
      } finally {
        await page.close();
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 5: Adversarial Stress & Failure Mode Corner Cases
    // -------------------------------------------------------------------------
    console.log('\n--- PART 5: Adversarial Stress & Corner Case Hardening ---');

    // 5.1 XSS / Script injection in localStorage 'webreader_theme'
    {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument(() => {
          localStorage.setItem('webreader_theme', '"><script>window.__xssInjection=true;</script>');
        });

        await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });

        const state = await page.evaluate(() => ({
          datasetTheme: document.documentElement.dataset.theme,
          attrTheme: document.documentElement.getAttribute('data-theme'),
          xssTriggered: window.__xssInjection === true
        }));

        const safe = state.datasetTheme === 'warm-paper' &&
                     state.attrTheme === 'warm-paper' &&
                     !state.xssTriggered;

        recordTest(
          'Adversarial XSS string in webreader_theme safely rejected & falls back to warm-paper',
          safe,
          state
        );
      } finally {
        await page.close();
      }
    }

    // 5.2 Non-existent / unknown theme name
    {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument(() => {
          localStorage.setItem('webreader_theme', 'neon-cyberpunk-404');
        });

        await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });

        const state = await page.evaluate(() => ({
          datasetTheme: document.documentElement.dataset.theme,
          attrTheme: document.documentElement.getAttribute('data-theme')
        }));

        const safe = state.datasetTheme === 'warm-paper' && state.attrTheme === 'warm-paper';
        recordTest(
          'Unknown theme string in webreader_theme gracefully falls back to warm-paper',
          safe,
          state
        );
      } finally {
        await page.close();
      }
    }

    // 5.3 Empty string in webreader_theme
    {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument(() => {
          localStorage.setItem('webreader_theme', '');
        });

        await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });

        const state = await page.evaluate(() => ({
          datasetTheme: document.documentElement.dataset.theme,
          attrTheme: document.documentElement.getAttribute('data-theme')
        }));

        const safe = state.datasetTheme === 'warm-paper' && state.attrTheme === 'warm-paper';
        recordTest(
          'Empty string in webreader_theme safely defaults to warm-paper',
          safe,
          state
        );
      } finally {
        await page.close();
      }
    }

    // 5.4 Null / Unset theme key in localStorage
    {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument(() => {
          localStorage.removeItem('webreader_theme');
        });

        await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });

        const state = await page.evaluate(() => ({
          datasetTheme: document.documentElement.dataset.theme,
          attrTheme: document.documentElement.getAttribute('data-theme')
        }));

        const safe = state.datasetTheme === 'warm-paper' && state.attrTheme === 'warm-paper';
        recordTest(
          'Clean launch with unset webreader_theme defaults cleanly to warm-paper',
          safe,
          state
        );
      } finally {
        await page.close();
      }
    }

    // 5.5 Transition suppression guard (.no-theme-transition cleanup)
    {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument(() => {
          localStorage.setItem('webreader_theme', 'nord');
        });

        await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });

        const initialTransitionClass = await page.evaluate(() => {
          return document.documentElement.classList.contains('no-theme-transition');
        });

        // Wait for double-rAF callback in head script to remove .no-theme-transition
        await page.waitForFunction(() => !document.documentElement.classList.contains('no-theme-transition'), { timeout: 3000 });

        const postPaintTransitionClass = await page.evaluate(() => {
          return document.documentElement.classList.contains('no-theme-transition');
        });

        const transitionLifecyclePassed = initialTransitionClass === true && postPaintTransitionClass === false;

        recordTest(
          '.no-theme-transition class active during bootstrap and removed post-paint',
          transitionLifecyclePassed,
          { initialTransitionClass, postPaintTransitionClass }
        );
      } finally {
        await page.close();
      }
    }

    // 5.6 UI EventBus Coordination Test: ui:set-theme updates both documentElement & body
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${url}/`, { waitUntil: 'networkidle0' });

        const coordinationTest = await page.evaluate(async () => {
          const { EventBus } = await import('./js/event-bus.js');
          EventBus.emit('ui:set-theme', { themeId: 'nord' });

          const doc = document.documentElement;
          const body = document.body;
          const docStyle = getComputedStyle(doc);
          const bodyStyle = getComputedStyle(body);

          return {
            docTheme: doc.dataset.theme,
            bodyTheme: body.dataset.theme,
            docBg: docStyle.getPropertyValue('--bg-primary').trim(),
            bodyBg: bodyStyle.backgroundColor,
            isSynchronized: doc.dataset.theme === 'nord' && body.dataset.theme === 'nord'
          };
        });

        recordTest(
          'UI EventBus theme change keeps document.body and documentElement synchronized',
          coordinationTest.isSynchronized,
          coordinationTest
        );
      } finally {
        await page.close();
      }
    }

  } finally {
    await browser.close();
    await closeServer();
  }

  // Summary Output
  console.log('\n======================================================================');
  console.log('                        TEST RUN SUMMARY                              ');
  console.log('======================================================================');
  console.log(`Total Tests Run: ${results.passed + results.failed}`);
  console.log(`Passed:          ${results.passed}`);
  console.log(`Failed:          ${results.failed}`);

  // Return full JSON report for analysis
  return results;
}

runAdversarialSuite().then(res => {
  if (res.failed === 0) {
    console.log('\n\x1b[32m✔ VERDICT: ALL TESTS PASSED. WCAG AAA & ZERO-FOUC VERIFIED.\x1b[0m\n');
    process.exit(0);
  } else {
    console.error(`\n\x1b[31m✖ VERDICT: ${res.failed} TEST(S) FAILED. ADVERSARIAL FINDING IDENTIFIED.\x1b[0m\n`);
    process.exit(1);
  }
}).catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
