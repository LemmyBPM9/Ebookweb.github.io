/**
 * test/challenger_theme_stress.test.js
 *
 * EMPIRICAL CHALLENGER ADVERSARIAL STRESS TEST SUITE:
 * Theme Switching Stress, Swatch Grid UI, Keyboard Navigation, and Iframe Synchronization.
 *
 * Requirements:
 * 1. Rapidly switch themes across all 10 themes 50 times in rapid succession (500 switches).
 * 2. Assert zero unhandled exceptions, zero detached styles, and zero theme desynchronization
 *    between host UI and chapter iframe.
 * 3. Verify clicking each of the 10 theme swatches in Settings Drawer properly updates
 *    active outline, sets aria-checked="true", and updates localStorage.
 * 4. Verify keyboard navigation in #theme-options (Arrow keys, Home, End) updates selected theme.
 * 5. Verify dual-mode reading (Paginated & Scroll) theme stability and reload persistence.
 *
 * Usage:
 *   node test/challenger_theme_stress.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');
const { buildAllFixtures } = require('./test-fixtures/generate-fixtures.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURES_DIR = path.resolve(__dirname, 'test-fixtures');
const PROJECT_ROOT = path.resolve(__dirname, '..');

const THEMES = [
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

const THEME_PALETTES = {
  'warm-paper': { bg: '#f8f1e3', text: '#2c2523', accent: '#8b5a2b' },
  'soft-dark': { bg: '#1a1c1e', text: '#e2e2e0', accent: '#e5a869' },
  'daylight': { bg: '#fcfbf9', text: '#1e2022', accent: '#2364a0' },
  'sage': { bg: '#eef3ed', text: '#1c2820', accent: '#2d7348' },
  'solarized-light': { bg: '#fdf6e3', text: '#073642', accent: '#268bd2' },
  'solarized-dark': { bg: '#002b36', text: '#eee8d5', accent: '#2aa198' },
  'nord': { bg: '#2e3440', text: '#eceff4', accent: '#88c0d0' },
  'oled-black': { bg: '#000000', text: '#c8c8c8', accent: '#e0a96d' },
  'rose-pine': { bg: '#191724', text: '#e0def4', accent: '#ebbcba' },
  'e-ink': { bg: '#f0f0eb', text: '#1a1a1a', accent: '#2b2b2b' }
};

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForAnySelector(page, selectorList, timeout = 10000) {
  const combined = Array.isArray(selectorList) ? selectorList.join(', ') : selectorList;
  return await page.waitForSelector(combined, { visible: true, timeout });
}

async function runAdversarialHarness() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: THEME SWITCHING STRESS & IFRAME SYNC HARNESS   ');
  console.log('========================================================================\n');

  assert(fs.existsSync(CHROME_PATH), `Google Chrome binary exists at ${CHROME_PATH}`);

  // Build fixtures if not present
  if (!fs.existsSync(path.join(FIXTURES_DIR, 'valid-sample.epub'))) {
    buildAllFixtures(FIXTURES_DIR);
  }

  // 1. Start Static HTTP Server on dynamic port
  const server = await startServer({ port: 0, autoPortFallback: true });
  const baseUrl = server.url;
  console.log(`[Static Server] Running at: ${baseUrl}`);

  // 2. Launch Headless Google Chrome
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

  const uncaughtErrors = [];
  const themeErrors = [];
  const markupWarnings = [];

  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => {
      uncaughtErrors.push(err.message);
      console.error(`  [Browser Uncaught Error] ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const loc = msg.location ? msg.location() : null;
        if (loc && loc.url && loc.url.includes('favicon.ico')) return;
        if (text.includes('favicon.ico')) return;
        if (text.includes('<svg> attribute height')) {
          markupWarnings.push(text);
        } else {
          themeErrors.push(text);
          console.error(`  [Browser Console Error] ${text} (location: ${JSON.stringify(loc)})`);
        }
      }
    });

    // -------------------------------------------------------------------------
    // SETUP: Open App and Load a Book to activate the chapter iframe
    // -------------------------------------------------------------------------
    console.log(`\n[Setup] Navigating to ${baseUrl}/...`);
    await page.goto(baseUrl + '/', { waitUntil: 'networkidle0', timeout: 15000 });

    // Open first book card to load Reader View
    const card = await waitForAnySelector(page, '.book-card, [data-book-id]');
    await card.click();

    // Wait for reader stage and chapter iframe to load content
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
      return (
        iframe &&
        iframe.contentDocument &&
        iframe.contentDocument.body &&
        iframe.contentDocument.body.innerText.trim().length > 30
      );
    }, { timeout: 12000 });

    console.log('  [Setup] Reader View and Chapter Iframe successfully initialized.');

    // Open Settings Drawer
    const settingsBtn = await waitForAnySelector(page, '#btn-settings, .btn-settings, [data-action="settings"]');
    await settingsBtn.click();
    await page.waitForSelector('#settings-drawer.is-open, #settings-drawer.open, #settings-drawer[aria-hidden="false"]', { timeout: 5000 });
    console.log('  [Setup] Settings Drawer opened.');

    // -------------------------------------------------------------------------
    // SUITE 1: Swatch Grid UI, Active Outline & LocalStorage Verification
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 1: Swatch Grid UI, Active Outline & LocalStorage Verification');
    console.log('------------------------------------------------------------------------');

    // 1.1 Verify all 10 theme swatches exist in #theme-options
    const swatchCount = await page.evaluate(() => {
      const container = document.querySelector('#theme-options, .theme-swatches');
      if (!container) return 0;
      const btns = container.querySelectorAll('[data-theme-choice], [data-theme], .theme-option');
      return btns.length;
    });
    assert(swatchCount === 10, 'All 10 theme swatch buttons rendered in Settings Drawer', `count=${swatchCount}`);

    // 1.2 Verify initial state: exactly one active swatch (warm-paper default)
    const initialActive = await page.evaluate(() => {
      const activeBtns = Array.from(document.querySelectorAll('#theme-options [aria-checked="true"], .theme-swatches [aria-checked="true"]'));
      return {
        activeCount: activeBtns.length,
        activeTheme: activeBtns[0]?.getAttribute('data-theme-choice') || activeBtns[0]?.getAttribute('data-theme')
      };
    });
    assert(initialActive.activeCount === 1, 'Exactly one theme swatch has aria-checked="true" on boot', `count=${initialActive.activeCount}`);
    assert(initialActive.activeTheme === 'warm-paper', 'Default active theme is warm-paper', `theme=${initialActive.activeTheme}`);

    // 1.3 Sequentially click each of the 10 theme swatches and assert UI + storage + outline
    for (const themeId of THEMES) {
      // Click the swatch
      const clicked = await page.evaluate((targetTheme) => {
        const btn = document.querySelector(`[data-theme-choice="${targetTheme}"], [data-theme="${targetTheme}"]`);
        if (!btn) return false;
        btn.click();
        return true;
      }, themeId);

      assert(clicked, `Clicked swatch for theme "${themeId}"`);

      // Allow microtask / event bus dispatch
      await sleep(50);

      // Inspect state in page context
      const swatchState = await page.evaluate((targetTheme) => {
        const btns = Array.from(document.querySelectorAll('#theme-options [data-theme-choice], #theme-options [data-theme], .theme-swatches button'));
        const activeBtn = btns.find(b => (b.getAttribute('data-theme-choice') || b.getAttribute('data-theme')) === targetTheme);
        const otherBtns = btns.filter(b => b !== activeBtn);

        const cs = activeBtn ? window.getComputedStyle(activeBtn) : null;
        const outlineStyle = cs ? cs.outlineStyle : '';
        const outlineWidth = cs ? cs.outlineWidth : '';
        const outlineColor = cs ? cs.outlineColor : '';
        const borderColor = cs ? cs.borderColor : '';

        const activeAriaChecked = activeBtn?.getAttribute('aria-checked');
        const activeAriaPressed = activeBtn?.getAttribute('aria-pressed');
        const activeTabIndex = activeBtn?.getAttribute('tabindex');
        const activeHasClass = activeBtn?.classList.contains('is-active') || activeBtn?.classList.contains('active');

        // Check others
        const invalidOthers = otherBtns.filter(b =>
          b.getAttribute('aria-checked') === 'true' ||
          b.getAttribute('tabindex') !== '-1' ||
          b.classList.contains('is-active')
        );

        const lsTheme = localStorage.getItem('webreader_theme');
        const hostDataTheme = document.documentElement.getAttribute('data-theme');
        const bodyDataTheme = document.body?.getAttribute('data-theme');

        // Check iframe sync
        const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
        const iframeDoc = iframe?.contentDocument;
        const iframeRootTheme = iframeDoc?.documentElement?.getAttribute('data-theme');
        const iframeBodyTheme = iframeDoc?.body?.getAttribute('data-theme');
        const iframeBodyClass = iframeDoc?.body?.classList.contains(`theme-${targetTheme}`);
        const iframeBg = iframeDoc?.body?.style?.backgroundColor;
        const iframeColor = iframeDoc?.body?.style?.color;

        return {
          found: Boolean(activeBtn),
          activeAriaChecked,
          activeAriaPressed,
          activeTabIndex,
          activeHasClass,
          outlineStyle,
          outlineWidth,
          outlineColor,
          borderColor,
          othersValid: invalidOthers.length === 0,
          otherInvalidCount: invalidOthers.length,
          lsTheme,
          hostDataTheme,
          bodyDataTheme,
          iframeRootTheme,
          iframeBodyTheme,
          iframeBodyClass,
          iframeBg,
          iframeColor
        };
      }, themeId);

      assert(
        swatchState.activeAriaChecked === 'true',
        `Theme "${themeId}" swatch sets aria-checked="true"`,
        `val=${swatchState.activeAriaChecked}`
      );
      assert(
        swatchState.activeHasClass,
        `Theme "${themeId}" swatch receives .is-active class`
      );
      assert(
        swatchState.activeTabIndex === '0',
        `Theme "${themeId}" swatch receives roving tabindex="0"`,
        `tabindex=${swatchState.activeTabIndex}`
      );
      assert(
        swatchState.othersValid,
        `Other 9 swatches have aria-checked="false" and tabindex="-1" when "${themeId}" is active`,
        `invalidCount=${swatchState.otherInvalidCount}`
      );
      assert(
        swatchState.outlineStyle === 'solid' || swatchState.outlineWidth !== '0px',
        `Theme "${themeId}" swatch displays active outline/border`,
        `outlineStyle=${swatchState.outlineStyle}, outlineWidth=${swatchState.outlineWidth}, borderColor=${swatchState.borderColor}`
      );
      assert(
        swatchState.lsTheme === themeId,
        `Theme "${themeId}" correctly persists to localStorage`,
        `ls=${swatchState.lsTheme}`
      );
      assert(
        swatchState.hostDataTheme === themeId && swatchState.bodyDataTheme === themeId,
        `Theme "${themeId}" sets data-theme on host documentElement and body`,
        `html=${swatchState.hostDataTheme}, body=${swatchState.bodyDataTheme}`
      );
      assert(
        swatchState.iframeRootTheme === themeId && swatchState.iframeBodyTheme === themeId && swatchState.iframeBodyClass,
        `Theme "${themeId}" synchronizes data-theme and theme class to chapter iframe`,
        `iframeRoot=${swatchState.iframeRootTheme}, iframeBody=${swatchState.iframeBodyTheme}`
      );
    }

    // -------------------------------------------------------------------------
    // SUITE 2: Keyboard Navigation in #theme-options (Arrows, Home, End, Wrap)
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 2: Keyboard Navigation in #theme-options (Radio Group)');
    console.log('------------------------------------------------------------------------');

    // 2.1 Focus first swatch (warm-paper)
    await page.evaluate(() => {
      const firstBtn = document.querySelector('[data-theme-choice="warm-paper"], [data-theme="warm-paper"]');
      if (firstBtn) {
        firstBtn.focus();
        firstBtn.click();
      }
    });
    await sleep(50);

    // 2.2 Press ArrowRight 9 times to traverse through all 10 themes
    console.log('  [Keyboard] Navigating forward with ArrowRight through all 10 themes...');
    for (let i = 1; i < THEMES.length; i++) {
      const expectedTheme = THEMES[i];
      await page.keyboard.press('ArrowRight');
      await sleep(30);

      const navState = await page.evaluate(() => {
        const activeEl = document.activeElement;
        const focusedTheme = activeEl?.getAttribute('data-theme-choice') || activeEl?.getAttribute('data-theme');
        const ariaChecked = activeEl?.getAttribute('aria-checked');
        const lsTheme = localStorage.getItem('webreader_theme');
        const htmlTheme = document.documentElement.getAttribute('data-theme');
        const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
        const iframeTheme = iframe?.contentDocument?.documentElement?.getAttribute('data-theme');

        return { focusedTheme, ariaChecked, lsTheme, htmlTheme, iframeTheme };
      });

      assert(
        navState.focusedTheme === expectedTheme &&
        navState.ariaChecked === 'true' &&
        navState.lsTheme === expectedTheme &&
        navState.htmlTheme === expectedTheme &&
        navState.iframeTheme === expectedTheme,
        `ArrowRight key advances to theme "${expectedTheme}" with full UI/storage/iframe sync`,
        `focused=${navState.focusedTheme}, ls=${navState.lsTheme}, iframe=${navState.iframeTheme}`
      );
    }

    // 2.3 ArrowRight wrap-around: From last theme (e-ink) -> first theme (warm-paper)
    await page.keyboard.press('ArrowRight');
    await sleep(30);
    const wrapForward = await page.evaluate(() => {
      const activeEl = document.activeElement;
      return {
        theme: activeEl?.getAttribute('data-theme-choice') || activeEl?.getAttribute('data-theme'),
        ariaChecked: activeEl?.getAttribute('aria-checked'),
        lsTheme: localStorage.getItem('webreader_theme')
      };
    });
    assert(
      wrapForward.theme === 'warm-paper' && wrapForward.ariaChecked === 'true' && wrapForward.lsTheme === 'warm-paper',
      'ArrowRight wraps around from last theme (e-ink) to first theme (warm-paper)',
      `theme=${wrapForward.theme}`
    );

    // 2.4 ArrowLeft wrap-around: From first theme (warm-paper) -> last theme (e-ink)
    await page.keyboard.press('ArrowLeft');
    await sleep(30);
    const wrapBackward = await page.evaluate(() => {
      const activeEl = document.activeElement;
      return {
        theme: activeEl?.getAttribute('data-theme-choice') || activeEl?.getAttribute('data-theme'),
        ariaChecked: activeEl?.getAttribute('aria-checked'),
        lsTheme: localStorage.getItem('webreader_theme')
      };
    });
    assert(
      wrapBackward.theme === 'e-ink' && wrapBackward.ariaChecked === 'true' && wrapBackward.lsTheme === 'e-ink',
      'ArrowLeft wraps around from first theme (warm-paper) to last theme (e-ink)',
      `theme=${wrapBackward.theme}`
    );

    // 2.5 ArrowDown and ArrowUp navigation
    // ArrowDown from e-ink wraps to warm-paper
    await page.keyboard.press('ArrowDown');
    await sleep(30);
    const arrowDownTheme = await page.evaluate(() => document.activeElement?.getAttribute('data-theme-choice'));
    assert(arrowDownTheme === 'warm-paper', 'ArrowDown key behaves consistently with ArrowRight (wraps to warm-paper)', `theme=${arrowDownTheme}`);

    // ArrowDown advances to soft-dark
    await page.keyboard.press('ArrowDown');
    await sleep(30);
    const arrowDownNext = await page.evaluate(() => document.activeElement?.getAttribute('data-theme-choice'));
    assert(arrowDownNext === 'soft-dark', 'ArrowDown advances to soft-dark', `theme=${arrowDownNext}`);

    // ArrowUp retreats to warm-paper
    await page.keyboard.press('ArrowUp');
    await sleep(30);
    const arrowUpTheme = await page.evaluate(() => document.activeElement?.getAttribute('data-theme-choice'));
    assert(arrowUpTheme === 'warm-paper', 'ArrowUp key retreats back to warm-paper', `theme=${arrowUpTheme}`);

    // 2.6 Home and End Keys
    // End key jumps directly to last theme (e-ink)
    await page.keyboard.press('End');
    await sleep(30);
    const endKeyState = await page.evaluate(() => {
      const activeEl = document.activeElement;
      const theme = activeEl?.getAttribute('data-theme-choice');
      const ls = localStorage.getItem('webreader_theme');
      return { theme, ls, ariaChecked: activeEl?.getAttribute('aria-checked') };
    });
    assert(
      endKeyState.theme === 'e-ink' && endKeyState.ls === 'e-ink' && endKeyState.ariaChecked === 'true',
      'End key jumps directly to last theme (e-ink)',
      `theme=${endKeyState.theme}`
    );

    // Home key jumps directly to first theme (warm-paper)
    await page.keyboard.press('Home');
    await sleep(30);
    const homeKeyState = await page.evaluate(() => {
      const activeEl = document.activeElement;
      const theme = activeEl?.getAttribute('data-theme-choice');
      const ls = localStorage.getItem('webreader_theme');
      return { theme, ls, ariaChecked: activeEl?.getAttribute('aria-checked') };
    });
    assert(
      homeKeyState.theme === 'warm-paper' && homeKeyState.ls === 'warm-paper' && homeKeyState.ariaChecked === 'true',
      'Home key jumps directly to first theme (warm-paper)',
      `theme=${homeKeyState.theme}`
    );

    // -------------------------------------------------------------------------
    // SUITE 3: Theme Switching Stress Harness (50 Rapid Cycles = 500 Switches)
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 3: Theme Switching Stress (50 Rapid Cycles x 10 Themes = 500 Switches)');
    console.log('------------------------------------------------------------------------');

    const CYCLES = 50;
    const TOTAL_SWITCHES = CYCLES * THEMES.length;
    console.log(`  [Stress] Commencing ${CYCLES} consecutive cycles across all 10 themes (${TOTAL_SWITCHES} total switches)...`);

    const stressStartTime = Date.now();

    const stressResult = await page.evaluate(async (themeList, cycles) => {
      let switchCount = 0;
      const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
      const iframeDoc = iframe?.contentDocument;

      for (let c = 0; c < cycles; c++) {
        for (const t of themeList) {
          // Trigger theme switch through standard SettingsManager / EventBus API
          window.dispatchEvent(new CustomEvent('test:switch-theme', { detail: { themeId: t } }));
          // Directly invoke settings store and reader engine
          const { SettingsManager } = await import('./js/storage/settings-store.js');
          const { EventBus, EVENTS } = await import('./js/event-bus.js');
          SettingsManager.setTheme(t);
          EventBus.emit('ui:set-theme', { themeId: t });
          EventBus.emit(EVENTS.THEME_CHANGED, { themeId: t });
          switchCount++;
        }
      }

      const finalTheme = themeList[themeList.length - 1]; // 'e-ink'

      // Inspect detached styles and iframe status
      const styleTags = Array.from(iframeDoc?.querySelectorAll('style#webreader-theme-style') || []);
      const allStyleTags = Array.from(iframeDoc?.querySelectorAll('style') || []);
      const styleSheets = Array.from(iframeDoc?.styleSheets || []);

      const disconnectedSheets = styleSheets.filter(s => !s.ownerNode || !s.ownerNode.isConnected);
      const bodyStyleTags = Array.from(iframeDoc?.body?.querySelectorAll('style') || []);

      const hostDataTheme = document.documentElement.getAttribute('data-theme');
      const hostBodyTheme = document.body?.getAttribute('data-theme');
      const lsTheme = localStorage.getItem('webreader_theme');

      const iframeRootTheme = iframeDoc?.documentElement?.getAttribute('data-theme');
      const iframeBodyTheme = iframeDoc?.body?.getAttribute('data-theme');
      const iframeBodyClass = iframeDoc?.body?.classList.contains(`theme-${finalTheme}`);
      const iframeBg = iframeDoc?.body?.style?.backgroundColor;
      const iframeColor = iframeDoc?.body?.style?.color;

      return {
        switchCount,
        finalTheme,
        themeStyleTagCount: styleTags.length,
        totalStyleTags: allStyleTags.length,
        disconnectedSheetsCount: disconnectedSheets.length,
        bodyStyleTagsCount: bodyStyleTags.length,
        hostDataTheme,
        hostBodyTheme,
        lsTheme,
        iframeRootTheme,
        iframeBodyTheme,
        iframeBodyClass,
        iframeBg,
        iframeColor
      };
    }, THEMES, CYCLES);

    const stressDuration = Date.now() - stressStartTime;
    const avgLatency = (stressDuration / TOTAL_SWITCHES).toFixed(2);
    console.log(`  [Stress] Completed ${stressResult.switchCount} theme switches in ${stressDuration}ms (avg ${avgLatency}ms/switch).`);

    assert(
      stressResult.switchCount === TOTAL_SWITCHES,
      `All ${TOTAL_SWITCHES} theme switches executed completely`,
      `count=${stressResult.switchCount}`
    );
    assert(
      stressResult.themeStyleTagCount === 1,
      'Exactly ONE <style id="webreader-theme-style"> exists inside iframe head (Zero style duplication/leaks)',
      `styleTagCount=${stressResult.themeStyleTagCount}`
    );
    assert(
      stressResult.disconnectedSheetsCount === 0,
      'Zero disconnected or detached stylesheets detected in iframe',
      `disconnectedSheets=${stressResult.disconnectedSheetsCount}`
    );
    assert(
      stressResult.bodyStyleTagsCount === 0,
      'Zero orphaned style tags injected into iframe body',
      `bodyStyleCount=${stressResult.bodyStyleTagsCount}`
    );
    assert(
      stressResult.hostDataTheme === stressResult.finalTheme &&
      stressResult.hostBodyTheme === stressResult.finalTheme &&
      stressResult.lsTheme === stressResult.finalTheme,
      `Host documentElement, body, and localStorage synchronized to final theme "${stressResult.finalTheme}"`,
      `host=${stressResult.hostDataTheme}, ls=${stressResult.lsTheme}`
    );
    assert(
      stressResult.iframeRootTheme === stressResult.finalTheme &&
      stressResult.iframeBodyTheme === stressResult.finalTheme &&
      stressResult.iframeBodyClass,
      `Chapter iframe synchronized to final theme "${stressResult.finalTheme}"`,
      `iframeRoot=${stressResult.iframeRootTheme}, iframeBody=${stressResult.iframeBodyTheme}`
    );
    assert(
      uncaughtErrors.length === 0,
      `Zero unhandled exceptions or pageerrors thrown during 500-switch stress test`,
      `errors=${uncaughtErrors.length}`
    );
    assert(
      themeErrors.length === 0,
      `Zero theme-related console errors recorded during 500-switch stress test`,
      `themeErrors=${themeErrors.length}`
    );

    // -------------------------------------------------------------------------
    // SUITE 4: Rapid DOM Swatch Clicks Stress (Direct User Interaction)
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 4: Rapid DOM Swatch Clicks Stress (50 Rapid Physical Clicks)');
    console.log('------------------------------------------------------------------------');

    console.log('  [Clicks] Performing 50 rapid clicks across theme swatches in Settings Drawer...');
    const clickResults = await page.evaluate(async (themeList) => {
      const errors = [];
      for (let i = 0; i < 50; i++) {
        const themeId = themeList[i % themeList.length];
        const btn = document.querySelector(`[data-theme-choice="${themeId}"], [data-theme="${themeId}"]`);
        if (!btn) {
          errors.push(`Missing button for ${themeId}`);
          continue;
        }
        btn.click();
      }

      const activeBtn = document.querySelector('#theme-options [aria-checked="true"], .theme-swatches [aria-checked="true"]');
      const activeTheme = activeBtn?.getAttribute('data-theme-choice') || activeBtn?.getAttribute('data-theme');
      const lsTheme = localStorage.getItem('webreader_theme');
      const hostTheme = document.documentElement.getAttribute('data-theme');

      return {
        clickErrors: errors,
        activeTheme,
        lsTheme,
        hostTheme
      };
    }, THEMES);

    assert(clickResults.clickErrors.length === 0, '50 rapid DOM button clicks executed without missing selectors', `errors=${clickResults.clickErrors.join(', ')}`);
    assert(
      clickResults.activeTheme === clickResults.lsTheme && clickResults.lsTheme === clickResults.hostTheme,
      'Final active swatch, localStorage, and host data-theme are in 100% agreement after rapid clicks',
      `active=${clickResults.activeTheme}, ls=${clickResults.lsTheme}, host=${clickResults.hostTheme}`
    );

    // -------------------------------------------------------------------------
    // SUITE 5: Dual-Mode Reading & Mode Toggling Theme Synchronization
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 5: Dual-Mode Reading & Mode Toggling Theme Synchronization');
    console.log('------------------------------------------------------------------------');

    // Close Settings Drawer first to reveal header controls
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#btn-close-settings');
      if (closeBtn) closeBtn.click();
    });
    await sleep(200);

    // Toggle reading mode to continuous scroll mode
    const modeBtn = await waitForAnySelector(page, '#btn-mode-toggle, [data-action="toggle-mode"]');
    await modeBtn.click();
    await sleep(300);

    const isScrollMode = await page.evaluate(() => {
      const stage = document.querySelector('#reader-stage');
      const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
      const iframeDoc = iframe?.contentDocument;
      const scrollStyle = iframeDoc?.getElementById('webreader-scroll-style');
      return Boolean(
        stage?.classList.contains('scroll-mode') ||
        document.body.classList.contains('scroll-mode') ||
        scrollStyle !== null
      );
    });
    assert(isScrollMode, 'Reading mode successfully toggled to Continuous Scroll Mode', `active=${isScrollMode}`);

    // Reopen Settings Drawer
    await settingsBtn.click();
    await page.waitForSelector('#settings-drawer.is-open, #settings-drawer.open, #settings-drawer[aria-hidden="false"]', { timeout: 5000 });

    // In Scroll Mode, switch through all 10 themes
    for (const theme of THEMES) {
      await page.evaluate((t) => {
        const btn = document.querySelector(`[data-theme-choice="${t}"]`);
        if (btn) btn.click();
      }, theme);
    }
    await sleep(100);

    const scrollSync = await page.evaluate(() => {
      const theme = localStorage.getItem('webreader_theme');
      const iframe = document.querySelector('iframe#reader-frame, iframe.reader-frame, #reader-stage iframe');
      const iframeDoc = iframe?.contentDocument;
      return {
        theme,
        hostTheme: document.documentElement.getAttribute('data-theme'),
        iframeTheme: iframeDoc?.documentElement?.getAttribute('data-theme'),
        styleTagCount: iframeDoc?.querySelectorAll('style#webreader-theme-style')?.length || 0
      };
    });

    assert(
      scrollSync.hostTheme === 'e-ink' && scrollSync.iframeTheme === 'e-ink',
      'Continuous Scroll Mode correctly synchronizes themes across host and chapter iframe',
      `host=${scrollSync.hostTheme}, iframe=${scrollSync.iframeTheme}`
    );
    assert(
      scrollSync.styleTagCount === 1,
      'Continuous Scroll Mode maintains exactly 1 #webreader-theme-style in iframe head',
      `styleTags=${scrollSync.styleTagCount}`
    );

    // Close Settings Drawer and toggle back to paginated mode
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#btn-close-settings');
      if (closeBtn) closeBtn.click();
    });
    await sleep(200);
    await modeBtn.click();
    await sleep(300);

    // Reopen Settings Drawer for subsequent tests
    await settingsBtn.click();
    await page.waitForSelector('#settings-drawer.is-open, #settings-drawer.open, #settings-drawer[aria-hidden="false"]', { timeout: 5000 });

    // -------------------------------------------------------------------------
    // SUITE 6: Full Page Reload Persistence & Zero-FOUC Verification
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 6: Full Page Reload Persistence & Zero-FOUC Verification');
    console.log('------------------------------------------------------------------------');

    // Test reload persistence for distinct themes: solarized-dark, nord, oled-black, daylight
    const testReloadThemes = ['solarized-dark', 'nord', 'oled-black', 'daylight'];
    for (const testTheme of testReloadThemes) {
      await page.evaluate((t) => {
        const btn = document.querySelector(`[data-theme-choice="${t}"]`);
        if (btn) btn.click();
      }, testTheme);

      // Hard reload page
      await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });

      // Verify immediate data-theme on documentElement
      const reloadedState = await page.evaluate(() => {
        const docTheme = document.documentElement.getAttribute('data-theme');
        const lsTheme = localStorage.getItem('webreader_theme');
        return { docTheme, lsTheme };
      });

      assert(
        reloadedState.docTheme === testTheme && reloadedState.lsTheme === testTheme,
        `Hard page reload preserves theme "${testTheme}" with zero FOUC on documentElement`,
        `docTheme=${reloadedState.docTheme}, ls=${reloadedState.lsTheme}`
      );
    }

    // -------------------------------------------------------------------------
    // SUITE 7: Graceful Fallback for Invalid Theme Inputs
    // -------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 7: Defensive Fallback on Corrupted / Invalid Theme Inputs');
    console.log('------------------------------------------------------------------------');

    const invalidInputs = ['cyberpunk-neon', 'invalid-theme', '', 'null', 'undefined', '12345'];
    for (const invalid of invalidInputs) {
      const fallbackResult = await page.evaluate(async (badTheme) => {
        const { SettingsManager } = await import('./js/storage/settings-store.js');
        SettingsManager.setTheme(badTheme);
        const storedTheme = SettingsManager.getTheme();
        const htmlTheme = document.documentElement.getAttribute('data-theme');
        return { storedTheme, htmlTheme };
      }, invalid);

      assert(
        fallbackResult.storedTheme === 'warm-paper' && fallbackResult.htmlTheme === 'warm-paper',
        `Invalid theme "${invalid}" gracefully falls back to default "warm-paper" without crashing`,
        `stored=${fallbackResult.storedTheme}, html=${fallbackResult.htmlTheme}`
      );
    }

    assert(
      uncaughtErrors.length === 0,
      `Zero total uncaught page errors across entire test harness`,
      `totalErrors=${uncaughtErrors.length}`
    );
    assert(
      themeErrors.length === 0,
      `Zero total theme-related console errors across entire test harness`,
      `totalThemeErrors=${themeErrors.length}`
    );

    if (markupWarnings.length > 0) {
      console.log(`\n  ℹ️ [Empirical Finding / Notice] ${markupWarnings.length} markup warnings observed in sample-book.js:`);
      console.log(`     "${markupWarnings[0]}" (SVG height="auto" attribute in ch02)`);
    }

    console.log('\n========================================================================');
    console.log(`HARNESS COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('💥 Fatal error in challenger harness:', err);
    failedTests++;
    testFailures.push(`Fatal error: ${err.message}`);
  } finally {
    console.log('[Chrome] Closing browser...');
    await browser.close().catch(() => {});
    console.log('[Static Server] Stopping test server...');
    await server.close().catch(() => {});
  }

  if (failedTests > 0) {
    console.error(`\n❌ CHALLENGER HARNESS FAILED with ${failedTests} failure(s):`);
    for (const f of testFailures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\n🏆 ALL EMPIRICAL CHALLENGER STRESS TESTS PASSED WITH 100% SUCCESS RATE!\n');
    process.exit(0);
  }
}

runAdversarialHarness().catch((err) => {
  console.error('Unhandled harness exception:', err);
  process.exit(1);
});
