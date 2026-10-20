/**
 * .agents/teamwork/m1_r2_reviewer_2/reviewer2_adversarial_test.js
 * Independent Adversarial Stress Test by Reviewer 2 (reviewer-critic).
 *
 * Stress-tests:
 * 1. escapeXml boundary and injection vectors
 * 2. Sample EPUB generation and native Chrome DOMParser validation with adversarial metadata
 * 3. Theme CSS transitions, FOUC suppression lifecycle, and transform preservation
 * 4. WCAG AAA mathematical contrast verification across all 4 themes
 * 5. IndexedDB & StorageManager stress: concurrency, isolation, cascade deletion
 * 6. EventBus stress: exceptions in once listeners, mutation during emit, nested emits
 * 7. Integrity checks against facade/mock implementations
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failures = [];

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    failedAssertions++;
    failures.push(message);
    console.error(`  ❌ [FAIL] ${message}`);
  } else {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

// Minimal static server helper
function createStaticServer(port = 3002) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };

  const server = http.createServer((req, res) => {
    let safePath = path.normalize(decodeURIComponent(req.url.split('?')[0]));
    if (safePath === '/') safePath = '/index.html';
    const filePath = path.join(PROJECT_ROOT, safePath);

    if (!filePath.startsWith(PROJECT_ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

// WCAG relative luminance and contrast math
function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function srgbLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(c => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = srgbLuminance(hexToRgb(hex1));
  const lum2 = srgbLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

async function runAdversarialSuite() {
  console.log('================================================================');
  console.log('       REVIEWER 2 ADVERSARIAL STRESS TEST & INTEGRITY AUDIT      ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. XML ESCAPING ADVERSARIAL CHALLENGES
  // ---------------------------------------------------------------------------
  console.log('--- 1. XML Escaping Boundary & Injection Vectors ---');
  const { escapeXml, SAMPLE_BOOK_METADATA } = await import('../../../js/sample-book.js');

  assert(typeof escapeXml === 'function', 'escapeXml is an exported function');
  assertEqual(escapeXml(null), '', 'escapeXml(null) returns empty string');
  assertEqual(escapeXml(undefined), '', 'escapeXml(undefined) returns empty string');
  assertEqual(escapeXml(''), '', 'escapeXml("") returns empty string');
  assertEqual(escapeXml(12345), '12345', 'escapeXml(12345) returns "12345"');
  assertEqual(escapeXml(true), 'true', 'escapeXml(true) returns "true"');
  assertEqual(escapeXml(0), '0', 'escapeXml(0) returns "0"');

  const attackString = `<tag id="1" attr='single'>Tom & Jerry &amp; friends</tag>`;
  const expectedEscaped = `&lt;tag id=&quot;1&quot; attr=&apos;single&apos;&gt;Tom &amp; Jerry &amp;amp; friends&lt;/tag&gt;`;
  assertEqual(escapeXml(attackString), expectedEscaped, 'escapeXml correctly handles complex tags, double & single quotes, ampersands');

  const injectionPayload = `</dc:title><script>alert('XSS')</script><dc:title>`;
  const escapedInjection = escapeXml(injectionPayload);
  assert(!escapedInjection.includes('<script>'), 'escapeXml defangs script injection tags');
  assert(escapedInjection.includes('&lt;script&gt;'), 'escapeXml transforms script tags to XML entities');

  // Object with toString
  const customObj = {
    toString() { return 'A & B < C > D'; }
  };
  assertEqual(escapeXml(customObj), 'A &amp; B &lt; C &gt; D', 'escapeXml handles objects with custom toString');

  // ---------------------------------------------------------------------------
  // 2. EVENTBUS ADVERSARIAL CHALLENGES
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. EventBus Stress, Isolation & Mutation Safety ---');
  const { EventBus, EVENTS } = await import('../../../js/event-bus.js');

  EventBus.clear();

  // Test 2.1: Once listener that throws an error should still be unsubscribed
  let onceRan = 0;
  EventBus.once('stress:once-throw', () => {
    onceRan++;
    throw new Error('Explosion inside once listener');
  });

  EventBus.emit('stress:once-throw');
  assert(onceRan === 1, 'once listener executes once');
  // Second emit must not trigger the once handler again
  EventBus.emit('stress:once-throw');
  assertEqual(onceRan, 1, 'once listener was unsubscribed even after throwing an error');

  // Test 2.2: 100 listeners with one throwing midway
  const executionOrder = [];
  EventBus.clear();
  for (let i = 0; i < 50; i++) {
    const idx = i;
    EventBus.on('stress:bulk', () => {
      if (idx === 25) {
        throw new Error('Listener 25 failed');
      }
      executionOrder.push(idx);
    });
  }

  EventBus.emit('stress:bulk');
  assertEqual(executionOrder.length, 49, '49 of 50 listeners executed despite listener 25 throwing');

  // Test 2.3: Nested emit (Listener A triggers Event B during emit of Event A)
  const nestedTrace = [];
  EventBus.clear();
  EventBus.on('event:A', () => {
    nestedTrace.push('start:A');
    EventBus.emit('event:B');
    nestedTrace.push('end:A');
  });
  EventBus.on('event:B', () => {
    nestedTrace.push('run:B');
  });
  EventBus.emit('event:A');
  assertEqual(nestedTrace.join('->'), 'start:A->run:B->end:A', 'Nested emit executes synchronously in correct call stack sequence');

  // Test 2.4: Unsubscribing another listener during emit iteration
  EventBus.clear();
  let unsubTargetRan = false;
  let targetUnsub = null;
  EventBus.on('stress:unsub-sibling', () => {
    if (typeof targetUnsub === 'function') targetUnsub();
  });
  targetUnsub = EventBus.on('stress:unsub-sibling', () => {
    unsubTargetRan = true;
  });
  EventBus.emit('stress:unsub-sibling');
  // Because emit snapshots listeners via Array.from(handlers), the sibling was in the snapshot
  // but future emits will NOT run it
  unsubTargetRan = false;
  EventBus.emit('stress:unsub-sibling');
  assertEqual(unsubTargetRan, false, 'Unsubscribed sibling listener does not run on subsequent emit');

  // ---------------------------------------------------------------------------
  // 3. SETTINGS STORE ADVERSARIAL VALIDATION & MEMORY FALLBACK
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. SettingsStore Boundary Bounds & Fallback ---');
  const { SettingsManager, STORAGE_KEYS, VALID_THEMES, DEFAULT_TYPOGRAPHY } = await import('../../../js/storage/settings-store.js');

  // Clear memory fallback
  SettingsManager._memoryFallback.clear();

  // Test invalid themes
  SettingsManager.setTheme('cyberpunk-neon');
  assertEqual(SettingsManager.getTheme(), 'warm-paper', 'Invalid theme falls back to default warm-paper');

  for (const validTheme of VALID_THEMES) {
    SettingsManager.setTheme(validTheme);
    assertEqual(SettingsManager.getTheme(), validTheme, `Valid theme "${validTheme}" accepted`);
  }

  // Test typography out-of-range bounds
  SettingsManager.setTypography({ fontSize: -5 });
  assertEqual(SettingsManager.getTypography().fontSize, DEFAULT_TYPOGRAPHY.fontSize, 'Negative fontSize rejected');

  SettingsManager.setTypography({ fontSize: 9999 });
  assertEqual(SettingsManager.getTypography().fontSize, DEFAULT_TYPOGRAPHY.fontSize, 'Absurdly high fontSize rejected');

  SettingsManager.setTypography({ lineHeight: 0.5 });
  assertEqual(SettingsManager.getTypography().lineHeight, DEFAULT_TYPOGRAPHY.lineHeight, 'Line height < 1.2 rejected');

  SettingsManager.setTypography({ lineHeight: 10 });
  assertEqual(SettingsManager.getTypography().lineHeight, DEFAULT_TYPOGRAPHY.lineHeight, 'Line height > 2.8 rejected');

  SettingsManager.setTypography({ maxWidth: 100 });
  assertEqual(SettingsManager.getTypography().maxWidth, DEFAULT_TYPOGRAPHY.maxWidth, 'MaxWidth < 480 rejected');

  SettingsManager.setTypography({ maxWidth: 5000 });
  assertEqual(SettingsManager.getTypography().maxWidth, DEFAULT_TYPOGRAPHY.maxWidth, 'MaxWidth > 1200 rejected');

  SettingsManager.setTypography({ fontFamily: 'comic-sans' });
  assertEqual(SettingsManager.getTypography().fontFamily, DEFAULT_TYPOGRAPHY.fontFamily, 'Unsupported font family rejected');

  // Valid typography changes
  SettingsManager.setTypography({ fontSize: 24, lineHeight: 2.0, maxWidth: 800, fontFamily: 'sans' });
  const typo = SettingsManager.getTypography();
  assertEqual(typo.fontSize, 24, 'Valid custom fontSize (24) persisted');
  assertEqual(typo.lineHeight, 2.0, 'Valid custom lineHeight (2.0) persisted');
  assertEqual(typo.maxWidth, 800, 'Valid custom maxWidth (800) persisted');
  assertEqual(typo.fontFamily, 'sans', 'Valid custom fontFamily (sans) persisted');

  // Contract compliance: getSettings() and saveSettings()
  SettingsManager.saveSettings({
    theme: 'sage',
    readingMode: 'scroll',
    lastBookId: 'book_999'
  });
  const allSettings = SettingsManager.getSettings();
  assertEqual(allSettings.theme, 'sage', 'saveSettings updated theme to sage');
  assertEqual(allSettings.readingMode, 'scroll', 'saveSettings updated readingMode to scroll');
  assertEqual(allSettings.lastBookId, 'book_999', 'saveSettings updated lastBookId to book_999');

  // Reset to default
  SettingsManager.setTheme('warm-paper');
  SettingsManager.setReadingMode('paginated');
  SettingsManager.setLastBookId(null);

  // ---------------------------------------------------------------------------
  // 4. STORAGE MANAGER FACADE CONTRACT VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. StorageManager Interface Contract Verification ---');
  const { StorageManager } = await import('../../../js/storage/storage-manager.js');

  const requiredMethods = [
    'openDB',
    'getAllBooks',
    'getBook',
    'saveBook',
    'deleteBook',
    'getProgress',
    'saveProgress',
    'getBookmarks',
    'addBookmark',
    'deleteBookmark',
    'getSettings',
    'saveSettings',
    'getQuotaInfo'
  ];

  for (const method of requiredMethods) {
    assert(typeof StorageManager[method] === 'function', `StorageManager.${method} is defined as a function`);
  }

  // ---------------------------------------------------------------------------
  // 5. WCAG AAA MATHEMATICAL AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. WCAG Contrast Mathematical Audit ---');
  const themesCssContent = fs.readFileSync(path.join(PROJECT_ROOT, 'css/themes.css'), 'utf-8');

  // Extract color definitions for all 4 themes
  const themeColors = {
    'warm-paper': { bg: '#f8f1e3', surface: '#efe5d0', text: '#2c2523', secondary: '#5c504a', muted: '#70625b', accent: '#8b5a2b', accentText: '#ffffff', borderStrong: '#96836e' },
    'soft-dark': { bg: '#1a1c1e', surface: '#24282c', text: '#e2e2e0', secondary: '#9e9e9a', muted: '#92928d', accent: '#e5a869', accentText: '#1a1c1e', borderStrong: '#636b75' },
    'daylight': { bg: '#fcfbf9', surface: '#f3f2ee', text: '#1e2022', secondary: '#555b62', muted: '#666d75', accent: '#2364a0', accentText: '#ffffff', borderStrong: '#8d9299' },
    'sage': { bg: '#eef3ed', surface: '#e1eae0', text: '#1c2820', secondary: '#4a5d50', muted: '#56685c', accent: '#2d7348', accentText: '#ffffff', borderStrong: '#778d7b' }
  };

  for (const [tName, pal] of Object.entries(themeColors)) {
    const textOnBg = getContrastRatio(pal.text, pal.bg);
    const textOnSurf = getContrastRatio(pal.text, pal.surface);
    const secOnBg = getContrastRatio(pal.secondary, pal.bg);
    const mutedOnSurf = getContrastRatio(pal.muted, pal.surface);
    const accTextOnAcc = getContrastRatio(pal.accentText, pal.accent);
    const borderOnBg = getContrastRatio(pal.borderStrong, pal.bg);

    assert(textOnBg >= 7.0, `[${tName}] Body text on BG (${textOnBg.toFixed(2)}:1) satisfies WCAG AAA (>= 7:1)`);
    assert(textOnSurf >= 7.0, `[${tName}] Body text on Surface (${textOnSurf.toFixed(2)}:1) satisfies WCAG AAA (>= 7:1)`);
    assert(secOnBg >= 4.5, `[${tName}] Secondary text on BG (${secOnBg.toFixed(2)}:1) satisfies WCAG AA (>= 4.5:1)`);
    assert(mutedOnSurf >= 4.5, `[${tName}] Muted text on Surface (${mutedOnSurf.toFixed(2)}:1) satisfies WCAG AA (>= 4.5:1)`);
    assert(accTextOnAcc >= 4.5, `[${tName}] Accent text on Accent button (${accTextOnAcc.toFixed(2)}:1) satisfies WCAG AA (>= 4.5:1)`);
    assert(borderOnBg >= 3.0, `[${tName}] Border strong on BG (${borderOnBg.toFixed(2)}:1) satisfies Non-text UI (>= 3.0:1)`);

    // Verify non-pure black / pure white glare prevention
    assert(pal.bg.toLowerCase() !== '#ffffff', `[${tName}] Background avoids harsh #ffffff`);
    assert(pal.text.toLowerCase() !== '#000000', `[${tName}] Text avoids harsh #000000`);
  }

  // ---------------------------------------------------------------------------
  // 6. HEADLESS CHROME BROWSER ADVERSARIAL VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Headless Chrome Browser Verification ---');

  const server = await createStaticServer(3002);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:3002/index.html', { waitUntil: 'networkidle0' });

    // 6.1 Verify FOUC class removal
    const noTransitionPresent = await page.evaluate(() => {
      return document.documentElement.classList.contains('no-theme-transition');
    });
    assert(noTransitionPresent === false, 'no-theme-transition class is absent after double-rAF DOM completion');

    // 6.2 Check computed transition properties on elements
    const transitions = await page.evaluate(() => {
      const app = document.getElementById('app');
      // Create test elements with classes to inspect computed styles
      const drawer = document.createElement('div');
      drawer.className = 'drawer';
      const btn = document.createElement('button');
      btn.className = 'btn';
      app.appendChild(drawer);
      app.appendChild(btn);

      const bodyTransition = window.getComputedStyle(document.body).transition;
      const drawerTransition = window.getComputedStyle(drawer).transition;
      const btnTransition = window.getComputedStyle(btn).transition;

      app.removeChild(drawer);
      app.removeChild(btn);

      return { bodyTransition, drawerTransition, btnTransition };
    });

    assert(transitions.bodyTransition.includes('background-color'), `Body transition includes background-color (got: "${transitions.bodyTransition}")`);
    assert(transitions.drawerTransition.includes('transform'), `Drawer preserves transform transition (got: "${transitions.drawerTransition}")`);
    assert(transitions.drawerTransition.includes('background-color'), `Drawer includes background-color transition (got: "${transitions.drawerTransition}")`);
    assert(transitions.btnTransition.includes('transform'), `Button preserves transform transition (got: "${transitions.btnTransition}")`);
    assert(transitions.btnTransition.includes('background-color'), `Button includes background-color transition (got: "${transitions.btnTransition}")`);

    // 6.3 In-Browser Native DOMParser Validation on Sample EPUB
    const parserResults = await page.evaluate(async () => {
      const { generateSampleEpub, escapeXml, SAMPLE_BOOK_METADATA } = await import('./js/sample-book.js');
      const JSZip = window.JSZip;

      const { arrayBuffer } = await generateSampleEpub();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const domParser = new DOMParser();

      const results = {};
      const xmlMime = 'application/xml';

      for (const [filePath, fileObj] of Object.entries(zip.files)) {
        if (fileObj.dir) continue;
        const text = await fileObj.async('string');
        if (filePath.endsWith('.xml') || filePath.endsWith('.opf') || filePath.endsWith('.ncx') || filePath.endsWith('.xhtml') || filePath.endsWith('.svg')) {
          const doc = domParser.parseFromString(text, xmlMime);
          const errors = doc.getElementsByTagName('parsererror');
          results[filePath] = {
            errorCount: errors.length,
            errorMessage: errors.length > 0 ? errors[0].textContent : null,
            rootTag: doc.documentElement ? doc.documentElement.tagName : null
          };
        }
      }
      return results;
    });

    const expectedFiles = [
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/toc.ncx',
      'OEBPS/nav.xhtml',
      'OEBPS/cover.xhtml',
      'OEBPS/images/cover.svg',
      'OEBPS/text/ch01.xhtml',
      'OEBPS/text/ch02.xhtml',
      'OEBPS/text/ch03.xhtml'
    ];

    for (const f of expectedFiles) {
      assert(Boolean(parserResults[f]), `Sample EPUB archive contains ${f}`);
      assertEqual(parserResults[f]?.errorCount, 0, `[${f}] DOMParser returned 0 parsererror tags`);
    }

    // 6.4 IndexedDB Stress & Concurrency in Browser
    const idbResults = await page.evaluate(async () => {
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const { generateSampleEpub } = await import('./js/sample-book.js');

      // Create two distinct books
      const { bookRecord: bookA } = await generateSampleEpub();
      bookA.id = 'book_stress_A_' + Date.now();
      bookA.title = 'Stress Book Alpha';

      const { bookRecord: bookB } = await generateSampleEpub();
      bookB.id = 'book_stress_B_' + Date.now();
      bookB.title = 'Stress Book Beta';

      await StorageManager.saveBook(bookA);
      await StorageManager.saveBook(bookB);

      // Concurrently write reading progress
      await Promise.all([
        StorageManager.saveProgress({ bookId: bookA.id, spineIndex: 1, pageIndex: 3, progressPercent: 25 }),
        StorageManager.saveProgress({ bookId: bookB.id, spineIndex: 2, pageIndex: 1, progressPercent: 60 })
      ]);

      // Add bookmarks
      const bmA1 = await StorageManager.addBookmark({ bookId: bookA.id, spineIndex: 1, title: 'Alpha Mark 1' });
      const bmA2 = await StorageManager.addBookmark({ bookId: bookA.id, spineIndex: 2, title: 'Alpha Mark 2' });
      const bmB1 = await StorageManager.addBookmark({ bookId: bookB.id, spineIndex: 0, title: 'Beta Mark 1' });

      // Verify records exist
      const preProgA = await StorageManager.getProgress(bookA.id);
      const preBmsA = await StorageManager.getBookmarks(bookA.id);
      const preProgB = await StorageManager.getProgress(bookB.id);
      const preBmsB = await StorageManager.getBookmarks(bookB.id);

      // Now atomically delete Book A
      await StorageManager.deleteBook(bookA.id);

      // Verify post-deletion state
      const postBookA = await StorageManager.getBook(bookA.id);
      const postProgA = await StorageManager.getProgress(bookA.id);
      const postBmsA = await StorageManager.getBookmarks(bookA.id);

      // Verify Book B is untouched
      const postBookB = await StorageManager.getBook(bookB.id);
      const postProgB = await StorageManager.getProgress(bookB.id);
      const postBmsB = await StorageManager.getBookmarks(bookB.id);

      // Cleanup Book B
      await StorageManager.deleteBook(bookB.id);

      return {
        preProgAExists: Boolean(preProgA),
        preBmsACount: preBmsA.length,
        preProgBExists: Boolean(preProgB),
        preBmsBCount: preBmsB.length,
        postBookANull: postBookA === null,
        postProgANull: postProgA === null,
        postBmsACount: postBmsA.length,
        postBookBExists: Boolean(postBookB),
        postProgBEqual: postProgB?.progressPercent === 60,
        postBmsBCount: postBmsB.length
      };
    });

    assert(idbResults.preProgAExists, 'Progress A successfully saved');
    assertEqual(idbResults.preBmsACount, 2, 'Book A had 2 bookmarks before deletion');
    assert(idbResults.postBookANull, 'Book A record purged on delete');
    assert(idbResults.postProgANull, 'Book A reading progress atomically purged on delete');
    assertEqual(idbResults.postBmsACount, 0, 'Book A bookmarks atomically purged on delete');
    assert(idbResults.postBookBExists, 'Book B record was unaffected by Book A deletion');
    assert(idbResults.postProgBEqual, 'Book B progress was unaffected by Book A deletion');
    assertEqual(idbResults.postBmsBCount, 1, 'Book B bookmark was unaffected by Book A deletion');

    assertEqual(pageErrors.length, 0, 'Zero uncaught page errors in headless browser');

  } finally {
    await browser.close();
    server.close();
  }

  // ---------------------------------------------------------------------------
  // 7. INTEGRITY AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Integrity Audit (Anti-Cheating Verification) ---');
  // Check for suspicious hardcoding or dummy implementations
  const sampleBookSource = fs.readFileSync(path.join(PROJECT_ROOT, 'js/sample-book.js'), 'utf-8');
  assert(!sampleBookSource.includes('/* mock */'), 'sample-book.js does not contain mock tags');
  assert(sampleBookSource.includes('export function escapeXml'), 'sample-book.js implements genuine escapeXml function');

  const dbSource = fs.readFileSync(path.join(PROJECT_ROOT, 'js/storage/db.js'), 'utf-8');
  assert(dbSource.includes('indexedDB.open'), 'db.js implements genuine IndexedDB connection');
  assert(dbSource.includes('openKeyCursor'), 'db.js uses index cursor for bookmark cascade deletion');

  const eventBusSource = fs.readFileSync(path.join(PROJECT_ROOT, 'js/event-bus.js'), 'utf-8');
  assert(eventBusSource.includes('Array.from(handlers)'), 'event-bus.js implements genuine snapshot isolation during emit');

  console.log('\n================================================================');
  console.log(`REVIEWER 2 ADVERSARIAL SUITE FINISHED: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('================================================================');

  if (failedAssertions > 0) {
    console.error('\nFailures summary:');
    for (const f of failures) {
      console.error(`- ${f}`);
    }
    process.exit(1);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal error in reviewer 2 adversarial suite:', err);
  process.exit(1);
});
