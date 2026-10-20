/**
 * independent_audit_r2.js
 * Milestone 1 Iteration 2 Independent Forensic Audit Harness
 * 
 * Verifies:
 * 1. JSZip authenticity and binary operations
 * 2. EventBus error isolation and subscription memory safety
 * 3. SettingsManager defensive bounds and localStorage resilience
 * 4. Sample EPUB binary OCF 3.3 conformance
 * 5. Native DOMParser XML well-formedness and zero parsererror tags across all 9 archive files
 * 6. escapeXml implementation authenticity and adversarial edge cases
 * 7. FOUC lifecycle & CSS transition preservation (drawer/button transforms)
 * 8. WCAG AAA contrast ratios across all 4 themes
 * 9. IndexedDB WebReaderDB relational isolation and atomic cascade deletion
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import puppeteer from 'puppeteer-core';

const REPO_ROOT = '/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function check(desc, condition, detail = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`[PASS] ${desc}`);
  } else {
    failedChecks++;
    failures.push({ desc, detail });
    console.error(`[FAIL] ${desc} :: ${detail}`);
  }
}

// Minimal MIME lookup
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xhtml': 'application/xhtml+xml; charset=utf-8'
};

function createAuditServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(REPO_ROOT, reqPath);

    if (!filePath.startsWith(REPO_ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

async function runAudit() {
  console.log('================================================================');
  console.log('       INDEPENDENT FORENSIC AUDIT - MILESTONE 1 (ITERATION 2)   ');
  console.log('================================================================');

  // --- Phase 1: JSZip Authenticity ---
  console.log('\n--- Phase 1: JSZip Authenticity & Integrity ---');
  const jszipPath = path.join(REPO_ROOT, 'vendor/jszip.min.js');
  check('vendor/jszip.min.js exists and is readable', fs.existsSync(jszipPath));
  const jszipContent = fs.readFileSync(jszipPath, 'utf8');
  check('vendor/jszip.min.js size in expected range (90KB - 150KB)', jszipContent.length > 90000 && jszipContent.length < 150000);
  check('vendor/jszip.min.js contains Stuart Knightley copyright header', jszipContent.includes('Stuart Knightley'));
  check('vendor/jszip.min.js contains Pako deflate/inflate routines', jszipContent.includes('pako') || jszipContent.includes('deflate'));

  const sandbox = {
    window: {},
    self: {},
    global: {},
    globalThis: {},
    console,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    Buffer,
    Uint8Array,
    ArrayBuffer
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jszipContent, sandbox);
  const JSZipConstructor = sandbox.JSZip;
  check('JSZip constructor is callable in VM context', typeof JSZipConstructor === 'function');

  // --- Phase 2: EventBus Pub/Sub Stress-Testing ---
  console.log('\n--- Phase 2: EventBus Pub/Sub Stress-Testing ---');
  const { EventBus } = await import(path.join(REPO_ROOT, 'js/event-bus.js'));
  check('EventBus has on and emit methods', typeof EventBus.on === 'function' && typeof EventBus.emit === 'function');

  let callCount = 0;
  const unsub = EventBus.on('test:event', () => { callCount++; });
  EventBus.emit('test:event');
  check('EventBus listener called on emit', callCount === 1);
  unsub();
  EventBus.emit('test:event');
  check('EventBus unsubscription closure works cleanly', callCount === 1);

  // Error isolation
  let survivorCalled = false;
  EventBus.on('test:err_iso', () => { throw new Error('Adversarial fault'); });
  EventBus.on('test:err_iso', () => { survivorCalled = true; });
  EventBus.emit('test:err_iso');
  check('EventBus executes all listeners despite errors (error isolation)', survivorCalled);

  // --- Phase 3: SettingsStore Defensive & Bounds Testing ---
  console.log('\n--- Phase 3: SettingsStore Defensive & Bounds Testing ---');
  const { SettingsManager } = await import(path.join(REPO_ROOT, 'js/storage/settings-store.js'));
  SettingsManager.setTheme('malicious_theme');
  check('SettingsManager rejects invalid theme, defaults to warm-paper', SettingsManager.getTheme() === 'warm-paper');

  SettingsManager.setTypography({ fontSize: 9999, lineHeight: -10, maxWidth: 5 });
  const typo = SettingsManager.getTypography();
  check('SettingsManager clamps out-of-bounds fontSize to valid range (18)', typo.fontSize === 18);
  check('SettingsManager clamps out-of-bounds lineHeight to valid range (1.75)', typo.lineHeight === 1.75);
  check('SettingsManager clamps out-of-bounds maxWidth to valid range (720)', typo.maxWidth === 720);

  // --- Phase 4: escapeXml Implementation & Adversarial Edge Cases ---
  console.log('\n--- Phase 4: escapeXml Implementation & Adversarial Edge Cases ---');
  const { escapeXml, generateSampleEpub, SAMPLE_BOOK_METADATA } = await import(path.join(REPO_ROOT, 'js/sample-book.js'));
  check('escapeXml function is exported', typeof escapeXml === 'function');
  check('escapeXml handles null cleanly', escapeXml(null) === '');
  check('escapeXml handles undefined cleanly', escapeXml(undefined) === '');
  check('escapeXml handles number 0 cleanly', escapeXml(0) === '0');
  check('escapeXml handles number 42 cleanly', escapeXml(42) === '42');
  check('escapeXml handles boolean true cleanly', escapeXml(true) === 'true');
  check('escapeXml handles raw ampersand & -> &amp;', escapeXml('A & B') === 'A &amp; B');
  check('escapeXml handles left bracket < -> &lt;', escapeXml('<tag>') === '&lt;tag&gt;');
  check('escapeXml handles double quote " -> &quot;', escapeXml('a="b"') === 'a=&quot;b&quot;');
  check('escapeXml handles single quote \' -> &apos;', escapeXml("it's") === 'it&apos;s');
  check('escapeXml avoids double-escaping entities in single pass', escapeXml('&lt;') === '&amp;lt;');
  check('escapeXml neutralizes script tags completely', escapeXml('<script>alert("xss")</script>') === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

  // --- Phase 5: Sample EPUB Binary OCF 3.3 Conformance ---
  console.log('\n--- Phase 5: Sample EPUB Binary OCF 3.3 Conformance ---');
  globalThis.JSZip = JSZipConstructor;
  const sampleEpubResult = await generateSampleEpub();
  const epubBuffer = Buffer.from(sampleEpubResult.arrayBuffer);

  const magic = epubBuffer.readUInt32BE(0);
  check('EPUB begins with ZIP Local File Header Magic 0x504b0304', magic === 0x504b0304);
  const compressionMethod = epubBuffer.readUInt16LE(8);
  check('First entry compression method is 0 (STORED uncompressed)', compressionMethod === 0);
  const filenameLen = epubBuffer.readUInt16LE(26);
  check('First entry filename length is 8 (mimetype)', filenameLen === 8);
  const extraFieldLen = epubBuffer.readUInt16LE(28);
  check('First entry extra field length is 0 (strict OCF 3.3 requirement)', extraFieldLen === 0);
  const filename = epubBuffer.subarray(30, 30 + filenameLen).toString('utf8');
  check('First entry filename is exact "mimetype"', filename === 'mimetype');
  const mimetypeData = epubBuffer.subarray(38, 38 + 20).toString('utf8');
  check('Mimetype content at offset 38 is "application/epub+zip"', mimetypeData === 'application/epub+zip');

  const unpackedEpub = await JSZipConstructor.loadAsync(epubBuffer);
  const containerXml = await unpackedEpub.file('META-INF/container.xml').async('string');
  check('META-INF/container.xml contains full-path="OEBPS/content.opf"', containerXml.includes('full-path="OEBPS/content.opf"'));

  const contentOpf = await unpackedEpub.file('OEBPS/content.opf').async('string');
  check('OEBPS/content.opf contains <dc:title>', contentOpf.includes('<dc:title>'));
  check('OEBPS/content.opf properly escapes title ampersand as &amp;', contentOpf.includes(escapeXml(SAMPLE_BOOK_METADATA.title)));
  check('OEBPS/content.opf contains ZERO raw unescaped & outside of entity references', !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(contentOpf));
  check('OEBPS/content.opf specifies properties="nav"', contentOpf.includes('properties="nav"'));
  check('OEBPS/content.opf specifies properties="cover-image"', contentOpf.includes('properties="cover-image"'));

  const tocNcx = await unpackedEpub.file('OEBPS/toc.ncx').async('string');
  check('OEBPS/toc.ncx contains ZERO raw unescaped & outside of entity references', !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(tocNcx));
  check('OEBPS/toc.ncx contains escaped title', tocNcx.includes(escapeXml(SAMPLE_BOOK_METADATA.title)));

  // --- Phase 6: CSS Themes & Contrast Calculations ---
  console.log('\n--- Phase 6: CSS Themes & Photopic Eye-Comfort Verification ---');
  const themesCss = fs.readFileSync(path.join(REPO_ROOT, 'css/themes.css'), 'utf8');
  check('css/themes.css defines warm-paper theme', themesCss.includes('[data-theme="warm-paper"]'));
  check('css/themes.css defines soft-dark theme', themesCss.includes('[data-theme="soft-dark"]'));
  check('css/themes.css defines daylight theme', themesCss.includes('[data-theme="daylight"]'));
  check('css/themes.css defines sage theme', themesCss.includes('[data-theme="sage"]'));

  const hasPureBlackOnWhite = /--color-bg:\s*#ffffff;[\s\S]*?--color-text:\s*#000000;/i.test(themesCss);
  check('No theme uses harsh pure black on white (glare avoidance)', !hasPureBlackOnWhite);

  check('themes.css preserves drawer transform transition', themesCss.includes('transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)'));
  check('themes.css preserves button transform transition', themesCss.includes('transform 0.1s ease'));
  check('themes.css includes .no-theme-transition suppression rules', themesCss.includes('.no-theme-transition'));

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
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

  const palettes = [
    { name: 'warm-paper', bg: '#f8f1e3', text: '#2c2523', surface: '#efe5d0', accent: '#8b5a2b', accentText: '#ffffff' },
    { name: 'soft-dark', bg: '#1a1c1e', text: '#e2e2e0', surface: '#24282c', accent: '#e5a869', accentText: '#1a1c1e' },
    { name: 'daylight', bg: '#fcfbf9', text: '#1e2022', surface: '#f3f2ee', accent: '#2364a0', accentText: '#ffffff' },
    { name: 'sage', bg: '#eef3ed', text: '#1c2820', surface: '#e1eae0', accent: '#2d7348', accentText: '#ffffff' }
  ];

  for (const pal of palettes) {
    const textOnBg = getContrastRatio(pal.text, pal.bg);
    const textOnSurface = getContrastRatio(pal.text, pal.surface);
    const accentOnBtn = getContrastRatio(pal.accentText, pal.accent);
    check(`[${pal.name}] Body text on BG contrast is >= 7:1 (AAA) (Actual: ${textOnBg.toFixed(2)}:1)`, textOnBg >= 7.0);
    check(`[${pal.name}] Body text on Surface contrast is >= 7:1 (AAA) (Actual: ${textOnSurface.toFixed(2)}:1)`, textOnSurface >= 7.0);
    check(`[${pal.name}] Accent text on Button contrast is >= 4.5:1 (AA) (Actual: ${accentOnBtn.toFixed(2)}:1)`, accentOnBtn >= 4.5);
  }

  // --- Phase 7: Headless Chrome Browser Verification & DOMParser XML Validation ---
  console.log('\n--- Phase 7: Headless Chrome Browser Execution & Relational Data Isolation ---');
  const { server, port } = await createAuditServer();
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle0' });

    // 7.1 FOUC lifecycle verification
    const transitionLifecycle = await page.evaluate(async () => {
      // Check whether no-theme-transition is removed after initial paint
      const hasClassAfterBoot = document.documentElement.classList.contains('no-theme-transition');
      const bodyStyle = window.getComputedStyle(document.body);
      const bodyTransition = bodyStyle.transition;
      return { hasClassAfterBoot, bodyTransition };
    });
    check('no-theme-transition class removed after boot', !transitionLifecycle.hasClassAfterBoot);
    check('body has active theme transition after boot', transitionLifecycle.bodyTransition.includes('background-color'));

    // 7.2 Native DOMParser validation of all 9 files in generated EPUB
    const domParserAudit = await page.evaluate(async () => {
      const { generateSampleEpub, SAMPLE_BOOK_METADATA } = await import('./js/sample-book.js');
      const sample = await generateSampleEpub();
      const zip = await window.JSZip.loadAsync(sample.arrayBuffer);
      const parser = new DOMParser();

      const xmlFiles = [
        { path: 'META-INF/container.xml', type: 'application/xml' },
        { path: 'OEBPS/content.opf', type: 'application/xml' },
        { path: 'OEBPS/toc.ncx', type: 'application/xml' },
        { path: 'OEBPS/nav.xhtml', type: 'application/xhtml+xml' },
        { path: 'OEBPS/cover.xhtml', type: 'application/xhtml+xml' },
        { path: 'OEBPS/images/cover.svg', type: 'image/svg+xml' },
        { path: 'OEBPS/text/ch01.xhtml', type: 'application/xhtml+xml' },
        { path: 'OEBPS/text/ch02.xhtml', type: 'application/xhtml+xml' },
        { path: 'OEBPS/text/ch03.xhtml', type: 'application/xhtml+xml' }
      ];

      const results = [];
      for (const f of xmlFiles) {
        const content = await zip.file(f.path).async('string');
        const doc = parser.parseFromString(content, f.type);
        const parserErrors = doc.querySelectorAll('parsererror');
        results.push({
          path: f.path,
          errorCount: parserErrors.length,
          errorMessage: parserErrors.length > 0 ? parserErrors[0].textContent : null,
          rootTag: doc.documentElement ? doc.documentElement.tagName : null
        });
      }

      // Check decoded title in content.opf and toc.ncx
      const opfDoc = parser.parseFromString(await zip.file('OEBPS/content.opf').async('string'), 'application/xml');
      const ncxDoc = parser.parseFromString(await zip.file('OEBPS/toc.ncx').async('string'), 'application/xml');

      const opfTitleEl = opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0] || opfDoc.querySelector('title');
      const ncxTitleEl = ncxDoc.querySelector('docTitle text');

      return {
        results,
        opfDecodedTitle: opfTitleEl ? opfTitleEl.textContent : null,
        ncxDecodedTitle: ncxTitleEl ? ncxTitleEl.textContent : null,
        expectedTitle: SAMPLE_BOOK_METADATA.title
      };
    });

    for (const res of domParserAudit.results) {
      check(`[${res.path}] parses cleanly with ZERO <parsererror> tags`, res.errorCount === 0, res.errorMessage || '');
    }

    check('OPF decoded <dc:title> matches human title exactly', domParserAudit.opfDecodedTitle === domParserAudit.expectedTitle);
    check('NCX decoded <docTitle> matches human title exactly', domParserAudit.ncxDecodedTitle === domParserAudit.expectedTitle);

    // 7.3 Relational IndexedDB isolation test
    const idbResult = await page.evaluate(async () => {
      const { StorageManager } = await import('./js/storage/storage-manager.js');
      const db = await StorageManager.openDB();

      // Clear stores
      const clearTx = db.transaction(['books', 'reading_progress', 'bookmarks'], 'readwrite');
      clearTx.objectStore('books').clear();
      clearTx.objectStore('reading_progress').clear();
      clearTx.objectStore('bookmarks').clear();
      await new Promise(r => clearTx.oncomplete = r);

      // Insert Book Alpha and Book Beta
      await StorageManager.saveBook({ id: 'book_alpha', title: 'Alpha', author: 'Author A', addedAt: Date.now() });
      await StorageManager.saveProgress({ bookId: 'book_alpha', spineIndex: 1, pageIndex: 0, progressPercent: 25 });
      await StorageManager.addBookmark({ bookId: 'book_alpha', title: 'Mark A1', spineIndex: 1 });
      await StorageManager.addBookmark({ bookId: 'book_alpha', title: 'Mark A2', spineIndex: 2 });

      await StorageManager.saveBook({ id: 'book_beta', title: 'Beta', author: 'Author B', addedAt: Date.now() });
      await StorageManager.saveProgress({ bookId: 'book_beta', spineIndex: 2, pageIndex: 1, progressPercent: 50 });
      await StorageManager.addBookmark({ bookId: 'book_beta', title: 'Mark B1', spineIndex: 2 });

      // Delete Book Alpha
      await StorageManager.deleteBook('book_alpha');

      const alphaBook = await StorageManager.getBook('book_alpha');
      const alphaProg = await StorageManager.getProgress('book_alpha');
      const alphaBms = await StorageManager.getBookmarks('book_alpha');

      const betaBook = await StorageManager.getBook('book_beta');
      const betaProg = await StorageManager.getProgress('book_beta');
      const betaBms = await StorageManager.getBookmarks('book_beta');

      return {
        alphaPurged: alphaBook === null && alphaProg === null && alphaBms.length === 0,
        betaPreserved: betaBook !== null && betaProg !== null && betaBms.length === 1
      };
    });

    check('StorageManager.deleteBook atomically cascades and purges target book data', idbResult.alphaPurged);
    check('StorageManager.deleteBook preserves unrelated foreign book data (isolation)', idbResult.betaPreserved);
    check('Headless browser execution had zero page errors', pageErrors.length === 0, pageErrors.join(', '));

  } finally {
    if (browser) await browser.close();
    server.close();
  }

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

runAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
