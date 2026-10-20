/**
 * Standalone Verification Test Suite for Milestone 1 Remediation (Finding 2):
 * FOUC Lifecycle, Smooth Theme Transitions & prefers-reduced-motion
 */

const puppeteer = require('puppeteer-core');
const http = require('node:http');
const assert = require('node:assert');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Exact proposed index.html inline script content
const PROPOSED_BOOTSTRAP_SCRIPT = `
  (function() {
    try {
      var theme = localStorage.getItem('webreader_theme') || 'warm-paper';
      var allowed = ['warm-paper', 'soft-dark', 'daylight', 'sage'];
      if (allowed.indexOf(theme) === -1) theme = 'warm-paper';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.add('no-theme-transition');
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'warm-paper');
    }

    function removeNoTransition() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          document.documentElement.classList.remove('no-theme-transition');
        });
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', removeNoTransition);
    } else {
      removeNoTransition();
    }
  })();
`;

// Exact proposed css/themes.css transitions section
const PROPOSED_THEMES_CSS_SECTION = `
/* ==========================================================================
   FOUC Prevention & Smooth Transitions
   ========================================================================== */

/* Explicitly suppress all transitions during initial boot to prevent FOUC */
.no-theme-transition,
.no-theme-transition *,
.no-theme-transition *::before,
.no-theme-transition *::after {
  -webkit-transition: none !important;
  -moz-transition: none !important;
  -o-transition: none !important;
  -ms-transition: none !important;
  transition: none !important;
}

/* Apply calm transitions when user toggles themes, but suppress during initial boot */
html:not(.no-theme-transition) body,
html:not(.no-theme-transition) .app-header,
html:not(.no-theme-transition) .app-footer,
html:not(.no-theme-transition) .card,
html:not(.no-theme-transition) .segmented-control,
html:not(.no-theme-transition) .theme-swatch-btn {
  transition: background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;
}

/* Preserve drawer transform while adding smooth theme color transition */
html:not(.no-theme-transition) .drawer {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;
}

/* Preserve button active press transform while adding smooth theme color transition */
html:not(.no-theme-transition) .btn {
  transition: background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease, transform 0.1s ease;
}

/* Disable transitions if user requested reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
`;

function buildFullHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Remediation Test Page</title>
  <script>${PROPOSED_BOOTSTRAP_SCRIPT}</script>
  <style>
    /* Theme variables */
    :root, [data-theme="warm-paper"] {
      --color-bg: #f8f1e3;
      --color-surface: #efe5d0;
      --color-text: #2c2523;
      --color-border: #dfd3bd;
      --color-accent: #8b5a2b;
    }
    [data-theme="soft-dark"] {
      --color-bg: #1a1c1e;
      --color-surface: #22252a;
      --color-text: #e2e2e0;
      --color-border: #33383f;
      --color-accent: #e5a869;
    }
    [data-theme="daylight"] {
      --color-bg: #fcfbf9;
      --color-surface: #f2f0eb;
      --color-text: #1e2022;
      --color-border: #e0ded9;
      --color-accent: #2364a0;
    }
    [data-theme="sage"] {
      --color-bg: #eef3ed;
      --color-surface: #e2ebe1;
      --color-text: #1c2820;
      --color-border: #cfdcd0;
      --color-accent: #2d7348;
    }

    body {
      margin: 0;
      background-color: var(--color-bg);
      color: var(--color-text);
    }

    .drawer {
      position: fixed;
      top: 0; left: 0; bottom: 0; width: 300px;
      background-color: var(--color-surface);
      border-right: 1px solid var(--color-border);
      transform: translateX(-100%);
    }
    .drawer.is-open {
      transform: translateX(0);
    }

    .btn {
      background-color: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      transform: scale(1);
    }
    .btn:active {
      transform: scale(0.98);
    }

    .card {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
    }

    ${PROPOSED_THEMES_CSS_SECTION}
  </style>
</head>
<body>
  <div id="app">
    <header class="app-header">Header</header>
    <button id="test-btn" class="btn">Test Button</button>
    <div id="test-card" class="card">Test Card</div>
    <aside id="test-drawer" class="drawer">Test Drawer</aside>
  </div>
</body>
</html>`;
}

function startTestServer(port = 3088) {
  return new Promise((resolve, reject) => {
    const html = buildFullHtml();
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(resClose => server.close(resClose))
      });
    });
    server.on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting FOUC Remediation Verification ---');
  const { server, url, close } = await startTestServer(3088);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox']
  });

  let passed = 0;
  let failed = 0;

  function record(title, ok, detail) {
    if (ok) {
      console.log('PASS: ' + title);
      passed++;
    } else {
      console.error('FAIL: ' + title + ' (' + detail + ')');
      failed++;
    }
  }

  try {
    const page = await browser.newPage();

    // Setup origin localStorage
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.setItem('webreader_theme', 'soft-dark');
    });

    // Capture state DURING load using CDP or evaluateOnNewDocument
    await page.evaluateOnNewDocument(() => {
      window.__bootLog = [];
      const obs = new MutationObserver(() => {
        if (document.documentElement) {
          window.__bootLog.push({
            theme: document.documentElement.getAttribute('data-theme'),
            hasClass: document.documentElement.classList.contains('no-theme-transition'),
            time: performance.now()
          });
        }
      });
      obs.observe(document, { attributes: true, subtree: true, childList: true });
    });

    // Reload with saved 'soft-dark' theme
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Check boot log
    const bootLog = await page.evaluate(() => window.__bootLog);
    const hadClassOnBoot = bootLog.some(entry => entry.hasClass === true && entry.theme === 'soft-dark');
    record(
      'Synchronous data-theme is soft-dark and no-theme-transition class is present during initial boot',
      hadClassOnBoot === true,
      JSON.stringify(bootLog)
    );

    // Initial background color is immediately soft-dark (no white FOUC)
    const initialBodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    record(
      'Initial body background color matches soft-dark (rgb(26, 28, 30)) with zero FOUC',
      initialBodyBg === 'rgb(26, 28, 30)',
      'got ' + initialBodyBg
    );

    // Wait for double rAF removal of no-theme-transition
    await page.waitForFunction(() => !document.documentElement.classList.contains('no-theme-transition'), { timeout: 2000 });
    const classAfterLoad = await page.evaluate(() => document.documentElement.classList.contains('no-theme-transition'));
    record(
      'no-theme-transition class is removed after initial render',
      classAfterLoad === false,
      'got ' + classAfterLoad
    );

    // Check restored transitions
    const bodyTrans = await page.evaluate(() => window.getComputedStyle(document.body).transition);
    const cardTrans = await page.evaluate(() => window.getComputedStyle(document.getElementById('test-card')).transition);
    record(
      'body transition active with 0.22s ease',
      bodyTrans.includes('0.22s'),
      'got ' + bodyTrans
    );
    record(
      'card transition active with 0.22s ease',
      cardTrans.includes('0.22s'),
      'got ' + cardTrans
    );

    // Drawer transform transition (0.28s) preserved alongside 0.22s color
    const drawerTrans = await page.evaluate(() => window.getComputedStyle(document.getElementById('test-drawer')).transition);
    record(
      'drawer transition preserves transform 0.28s and includes 0.22s color transition',
      drawerTrans.includes('transform 0.28s') && drawerTrans.includes('0.22s'),
      'got ' + drawerTrans
    );

    // Button active transform (0.1s) preserved alongside 0.22s color
    const btnTrans = await page.evaluate(() => window.getComputedStyle(document.getElementById('test-btn')).transition);
    record(
      'btn transition preserves transform 0.1s and includes 0.22s color transition',
      btnTrans.includes('transform 0.1s') && btnTrans.includes('0.22s'),
      'got ' + btnTrans
    );

    // Dynamic theme switch from soft-dark to warm-paper interpolates smoothly
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'warm-paper'));
    await new Promise(r => setTimeout(r, 100)); // mid-transition
    const midBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    await new Promise(r => setTimeout(r, 200)); // finished
    const finalBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);

    record(
      'Body background color smoothly interpolates mid-transition (midBg: ' + midBg + ')',
      midBg !== 'rgb(26, 28, 30)' && midBg !== 'rgb(248, 241, 227)',
      'midBg: ' + midBg
    );
    record(
      'Body background color settles accurately on warm-paper',
      finalBg === 'rgb(248, 241, 227)',
      'finalBg: ' + finalBg
    );

    // prefers-reduced-motion: reduce
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reducedBodyTrans = await page.evaluate(() => window.getComputedStyle(document.body).transition);
    const reducedDrawerTrans = await page.evaluate(() => window.getComputedStyle(document.getElementById('test-drawer')).transition);
    const reducedBtnTrans = await page.evaluate(() => window.getComputedStyle(document.getElementById('test-btn')).transition);

    record(
      'Reduced motion suppresses body transition',
      reducedBodyTrans === 'none',
      'got ' + reducedBodyTrans
    );
    record(
      'Reduced motion suppresses drawer transition',
      reducedDrawerTrans === 'none',
      'got ' + reducedDrawerTrans
    );
    record(
      'Reduced motion suppresses btn transition',
      reducedBtnTrans === 'none',
      'got ' + reducedBtnTrans
    );

    // Dynamic switch with reduced motion snaps immediately
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sage'));
    await new Promise(r => setTimeout(r, 20));
    const immediateSageBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    record(
      'Theme switch snaps instantly with prefers-reduced-motion (no intermediate transition)',
      immediateSageBg === 'rgb(238, 243, 237)',
      'expected rgb(238, 243, 237), got ' + immediateSageBg
    );

    // Cycling all 4 themes completes with accurate final settled colors
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    const themes = [
      { name: 'warm-paper', bg: 'rgb(248, 241, 227)' },
      { name: 'soft-dark', bg: 'rgb(26, 28, 30)' },
      { name: 'daylight', bg: 'rgb(252, 251, 249)' },
      { name: 'sage', bg: 'rgb(238, 243, 237)' }
    ];

    let cycleOk = true;
    for (const t of themes) {
      await page.evaluate((themeName) => document.documentElement.setAttribute('data-theme', themeName), t.name);
      await new Promise(r => setTimeout(r, 260));
      const currentBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
      if (currentBg !== t.bg) {
        cycleOk = false;
        console.error('Theme cycle failed for ' + t.name + ': expected ' + t.bg + ', got ' + currentBg);
      }
    }
    record(
      'Cycling all 4 themes completes with accurate final settled colors',
      cycleOk === true,
      'theme cycling settled check'
    );

  } finally {
    await browser.close();
    await close();
  }

  console.log('\n--- TEST SUMMARY: ' + passed + ' PASSED, ' + failed + ' FAILED ---');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error during test run:', err);
  process.exit(1);
});
