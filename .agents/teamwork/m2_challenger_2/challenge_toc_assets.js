/**
 * .agents/teamwork/m2_challenger_2/challenge_toc_assets.js
 * Adversarial Empirical Stress Test Suite for Milestone 2:
 * TocParser, AssetExtractor, and Security Sanitization
 *
 * Runs in headless Google Chrome via Puppeteer-core.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function runAdversarialChallenges() {
  console.log('====================================================================');
  console.log('   Milestone 2 Adversarial Stress Suite (Challenger 2: TOC & Assets) ');
  console.log('====================================================================');

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[challenge] Test server listening at ${serverUrl}`);
  console.log(`[challenge] Launching Chrome at: ${CHROME_PATH}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[browser-error] ${msg.text()}`);
    }
  });

  try {
    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate(async () => {
      const suiteResults = [];

      function assert(condition, message) {
        if (!condition) {
          throw new Error(message);
        }
      }

      // Import modules
      const { PathResolver } = await import('/js/parser/path-resolver.js');
      const { TocParser, splitHrefAnchor, sanitizeXmlEntities } = await import('/js/parser/toc-parser.js');
      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { EpubParser } = await import('/js/parser/epub-parser.js');
      const JSZip = window.JSZip;

      // ====================================================================
      // 1. DUAL TOC STRESS TESTING
      // ====================================================================

      // 1.1 Deeply nested EPUB 3 Navigation Document (6 levels)
      try {
        const deepNavHtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Table of Contents</h1>
    <ol>
      <li id="item-l1">
        <a href="text/ch1.xhtml">Level 1 - Universe</a>
        <ol>
          <li id="item-l2">
            <a href="text/ch1.xhtml#galaxy">Level 2 - Galaxy</a>
            <ol>
              <li id="item-l3">
                <a href="text/ch1.xhtml#solarsystem">Level 3 - Solar System</a>
                <ol>
                  <li id="item-l4">
                    <a href="text/ch1.xhtml#earth">Level 4 - Earth</a>
                    <ol>
                      <li id="item-l5">
                        <a href="text/ch1.xhtml#continent">Level 5 - Continent</a>
                        <ol>
                          <li id="item-l6">
                            <a href="text/ch1.xhtml#city">Level 6 - City</a>
                          </li>
                        </ol>
                      </li>
                    </ol>
                  </li>
                </ol>
              </li>
            </ol>
          </li>
        </ol>
      </li>
    </ol>
  </nav>
</body>
</html>`;

        const toc = TocParser.parseNavDocument(deepNavHtml, 'OEBPS/nav.xhtml');

        assert(toc.length === 1, `Expected 1 root item, got ${toc.length}`);
        assert(toc[0].title === 'Level 1 - Universe', `L1 title mismatch: ${toc[0].title}`);
        assert(toc[0].id === 'item-l1', 'L1 id mismatch');

        const l2 = toc[0].children;
        assert(l2.length === 1, `Expected 1 child at L2, got ${l2.length}`);
        assert(l2[0].title === 'Level 2 - Galaxy', `L2 title mismatch: ${l2[0].title}`);
        assert(l2[0].hash === 'galaxy', `L2 hash mismatch: ${l2[0].hash}`);

        const l3 = l2[0].children;
        assert(l3.length === 1, `Expected 1 child at L3, got ${l3.length}`);
        assert(l3[0].title === 'Level 3 - Solar System', `L3 title mismatch: ${l3[0].title}`);
        assert(l3[0].hash === 'solarsystem', `L3 hash mismatch: ${l3[0].hash}`);

        const l4 = l3[0].children;
        assert(l4.length === 1, `Expected 1 child at L4, got ${l4.length}`);
        assert(l4[0].title === 'Level 4 - Earth', `L4 title mismatch: ${l4[0].title}`);

        const l5 = l4[0].children;
        assert(l5.length === 1, `Expected 1 child at L5, got ${l5.length}`);
        assert(l5[0].title === 'Level 5 - Continent', `L5 title mismatch: ${l5[0].title}`);

        const l6 = l5[0].children;
        assert(l6.length === 1, `Expected 1 child at L6, got ${l6.length}`);
        assert(l6[0].title === 'Level 6 - City', `L6 title mismatch: ${l6[0].title}`);
        assert(l6[0].hash === 'city', `L6 hash mismatch: ${l6[0].hash}`);
        assert(l6[0].children.length === 0, 'L6 should have no children');

        // Test flatten on deep hierarchy
        const flattened = TocParser.flatten(toc);
        assert(flattened.length === 6, `Expected 6 flattened items, got ${flattened.length}`);
        for (let i = 0; i < 6; i++) {
          assert(flattened[i].depth === i, `Expected depth ${i} at index ${i}, got ${flattened[i].depth}`);
        }

        // Test findItem at level 6
        const foundL6 = TocParser.findItem(toc, 'OEBPS/text/ch1.xhtml', 'city');
        assert(foundL6 !== null && foundL6.title === 'Level 6 - City', 'Failed finding deeply nested L6 item');

        // Test findItem with predicate
        const foundPred = TocParser.findItem(toc, item => item.id === 'item-l4');
        assert(foundPred !== null && foundPred.title === 'Level 4 - Earth', 'Predicate findItem failed');

        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'Deeply Nested EPUB 3 Navigation Document (6 levels)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'Deeply Nested EPUB 3 Navigation Document (6 levels)',
          passed: false,
          error: err.message
        });
      }

      // 1.2 EPUB 2 NCX with hostile unescaped & entities & namespace prefixes
      try {
        const hostileNcxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx:ncx xmlns:ncx="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <ncx:navMap>
    <ncx:navPoint id="np-1" playOrder="1">
      <ncx:navLabel><ncx:text>Science & Health</ncx:text></ncx:navLabel>
      <ncx:content src="text/ch1.xhtml"/>
    </ncx:navPoint>
    <ncx:navPoint id="np-2" playOrder="2">
      <ncx:navLabel><ncx:text>Research & Development &amp; Operations</ncx:text></ncx:navLabel>
      <ncx:content src="text/ch2.xhtml?sec=1&sort=asc"/>
    </ncx:navPoint>
    <ncx:navPoint id="np-3" playOrder="3">
      <ncx:navLabel><ncx:text>Tom & Jerry && Spike &</ncx:text></ncx:navLabel>
      <ncx:content src="text/ch3.xhtml#part&section"/>
    </ncx:navPoint>
  </ncx:navMap>
</ncx:ncx>`;

        const toc = TocParser.parseNcxDocument(hostileNcxXml, 'OEBPS/toc.ncx');

        assert(toc.length === 3, `Expected 3 NCX items, got ${toc.length}`);
        assert(toc[0].title === 'Science & Health', `Item 0 title mismatch: ${toc[0].title}`);
        assert(toc[1].title === 'Research & Development & Operations', `Item 1 title mismatch: ${toc[1].title}`);
        assert(toc[2].title === 'Tom & Jerry && Spike &', `Item 2 title mismatch: ${toc[2].title}`);

        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'EPUB 2 NCX with hostile unescaped & entities & namespace prefix',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'EPUB 2 NCX with hostile unescaped & entities & namespace prefix',
          passed: false,
          error: err.message
        });
      }

      // 1.3 Unlinked <span> section headers in EPUB 3 Nav Document
      try {
        const spanNavHtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="toc">
    <ol>
      <li id="sec-1">
        <span>Part I: Foundations of Optics</span>
        <ol>
          <li><a href="text/ch01.xhtml">Chapter 1: Rays and Waves</a></li>
          <li><a href="text/ch02.xhtml">Chapter 2: Reflection</a></li>
        </ol>
      </li>
      <li id="sec-2">
        <div><span>Part II: Advanced Phenomena</span></div>
        <ol>
          <li><a href="text/ch03.xhtml">Chapter 3: Quantum Interference</a></li>
        </ol>
      </li>
    </ol>
  </nav>
</body>
</html>`;

        const toc = TocParser.parseNavDocument(spanNavHtml, 'OEBPS/nav.xhtml');

        assert(toc.length === 2, `Expected 2 section headers, got ${toc.length}`);
        assert(toc[0].title === 'Part I: Foundations of Optics', `Part I title mismatch: ${toc[0].title}`);
        assert(toc[0].href === '', `Part I href should be empty string, got: "${toc[0].href}"`);
        assert(toc[0].fullPath === '', `Part I fullPath should be empty string, got: "${toc[0].fullPath}"`);
        assert(toc[0].children.length === 2, `Part I should have 2 children, got ${toc[0].children.length}`);
        assert(toc[0].children[0].title === 'Chapter 1: Rays and Waves', 'Child 1 title mismatch');
        assert(toc[0].children[0].fullPath === 'OEBPS/text/ch01.xhtml', 'Child 1 fullPath mismatch');

        assert(toc[1].title === 'Part II: Advanced Phenomena', `Part II wrapped span title mismatch: ${toc[1].title}`);
        assert(toc[1].children.length === 1, `Part II should have 1 child, got ${toc[1].children.length}`);

        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'Unlinked <span> section headers',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'Unlinked <span> section headers',
          passed: false,
          error: err.message
        });
      }

      // 1.4 Anchor splitting (ch01.xhtml#sub-section)
      try {
        const split1 = splitHrefAnchor('text/ch01.xhtml#sub-section');
        assert(split1.pathPart === 'text/ch01.xhtml', `pathPart mismatch: ${split1.pathPart}`);
        assert(split1.hash === 'sub-section', `hash mismatch: ${split1.hash}`);

        const split2 = splitHrefAnchor('text/ch02.xhtml#optical%20mechanism%20test');
        assert(split2.pathPart === 'text/ch02.xhtml', 'pathPart mismatch');
        assert(split2.hash === 'optical mechanism test', `hash decode mismatch: ${split2.hash}`);

        const split3 = splitHrefAnchor('#in-page-anchor');
        assert(split3.pathPart === '', 'in-page pathPart should be empty');
        assert(split3.hash === 'in-page-anchor', 'in-page hash mismatch');

        const split4 = splitHrefAnchor('text/ch03.xhtml#');
        assert(split4.pathPart === 'text/ch03.xhtml', 'trailing hash pathPart mismatch');
        assert(split4.hash === '', 'trailing hash should yield empty hash string');

        const split5 = splitHrefAnchor('');
        assert(split5.pathPart === '' && split5.hash === '', 'empty href mismatch');

        // Test with TocParser in action
        const navAnchorHtml = `
<nav xmlns="http://www.w3.org/1999/xhtml" epub:type="toc">
  <ol>
    <li><a href="text/ch01.xhtml#sub-section">Section 1.1</a></li>
    <li><a href="text/ch01.xhtml#optical%20density">Section 1.2 Encoded</a></li>
    <li><a href="#local-summary">Summary</a></li>
  </ol>
</nav>`;
        const toc = TocParser.parseNavDocument(navAnchorHtml, 'OEBPS/nav.xhtml');
        assert(toc[0].fullPath === 'OEBPS/text/ch01.xhtml', `TOC fullPath mismatch: ${toc[0].fullPath}`);
        assert(toc[0].hash === 'sub-section', `TOC hash mismatch: ${toc[0].hash}`);
        assert(toc[1].hash === 'optical density', `TOC encoded hash decode mismatch: ${toc[1].hash}`);
        assert(toc[2].fullPath === 'OEBPS/nav.xhtml', 'Local anchor should resolve to nav document fullPath');
        assert(toc[2].hash === 'local-summary', 'Local anchor hash mismatch');

        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'Anchor splitting (ch01.xhtml#sub-section & encoded fragments)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Dual TOC Stress',
          name: 'Anchor splitting (ch01.xhtml#sub-section & encoded fragments)',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 2. SYNTHETIC TOC FALLBACK (Zero navigation documents)
      // ====================================================================
      try {
        const zip = new JSZip();

        // 5 Chapter XHTML files with various heading scenarios
        zip.file('OEBPS/text/ch1.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Ignored Page Title</title></head>
<body>
  <h1>The Quantum Beginning</h1>
  <p>First chapter body text...</p>
</body>
</html>`);

        zip.file('OEBPS/text/ch2.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Ignored Page Title</title></head>
<body>
  <h2>Wave-Particle Duality</h2>
  <p>Second chapter body text...</p>
</body>
</html>`);

        zip.file('OEBPS/text/ch3.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Thermal Radiation Insights</title></head>
<body>
  <div><p>No h1-h4 tags in this chapter.</p></div>
</body>
</html>`);

        zip.file('OEBPS/text/ch4.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head></head>
<body>
  <p>No headings and no title tag.</p>
</body>
</html>`);

        zip.file('OEBPS/text/ch5.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
</body>
</html>`);

        const spine = [
          { id: 'ch1', href: 'text/ch1.xhtml', fullPath: 'OEBPS/text/ch1.xhtml', isLinear: true },
          { id: 'ch2', href: 'text/ch2.xhtml', fullPath: 'OEBPS/text/ch2.xhtml', isLinear: true },
          { id: 'ch3', href: 'text/ch3.xhtml', fullPath: 'OEBPS/text/ch3.xhtml', isLinear: true },
          { id: 'glossary_notes', href: 'text/ch4.xhtml', fullPath: 'OEBPS/text/ch4.xhtml', isLinear: true },
          { id: '', href: 'text/ch5.xhtml', fullPath: 'OEBPS/text/ch5.xhtml', isLinear: true }
        ];

        // Manifest has NO nav document (no nav property, no ncx)
        const manifest = new Map([
          ['ch1', { id: 'ch1', href: 'text/ch1.xhtml', fullPath: 'OEBPS/text/ch1.xhtml' }],
          ['ch2', { id: 'ch2', href: 'text/ch2.xhtml', fullPath: 'OEBPS/text/ch2.xhtml' }],
          ['ch3', { id: 'ch3', href: 'text/ch3.xhtml', fullPath: 'OEBPS/text/ch3.xhtml' }],
          ['glossary_notes', { id: 'glossary_notes', href: 'text/ch4.xhtml', fullPath: 'OEBPS/text/ch4.xhtml' }],
          ['ch5', { id: '', href: 'text/ch5.xhtml', fullPath: 'OEBPS/text/ch5.xhtml' }]
        ]);

        const fallbackToc = await TocParser.parse({
          zip,
          manifest,
          spine,
          spineTocId: null,
          opfPath: 'OEBPS/content.opf'
        });

        assert(fallbackToc.length === 5, `Expected 5 fallback items, got ${fallbackToc.length}`);
        assert(fallbackToc[0].title === 'The Quantum Beginning', `Ch1 title mismatch: ${fallbackToc[0].title}`);
        assert(fallbackToc[1].title === 'Wave-Particle Duality', `Ch2 title mismatch: ${fallbackToc[1].title}`);
        assert(fallbackToc[2].title === 'Thermal Radiation Insights', `Ch3 title mismatch: ${fallbackToc[2].title}`);
        assert(fallbackToc[3].title === 'Glossary Notes', `Ch4 title from id mismatch: ${fallbackToc[3].title}`);
        assert(fallbackToc[4].title === 'Chapter 5', `Ch5 generic title mismatch: ${fallbackToc[4].title}`);

        suiteResults.push({
          suite: 'Synthetic TOC Fallback',
          name: 'Clean fallback TOC from spine chapter headings & titles',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Synthetic TOC Fallback',
          name: 'Clean fallback TOC from spine chapter headings & titles',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 3. SECURITY SANITIZATION STRESS
      // ====================================================================
      try {
        const hostileXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="refresh" content="0;url=http://evil.com" />
  <base href="http://evil.com/" />
  <script>alert('xss-head')</script>
</head>
<body onload="alert('body-onload')">
  <script>alert('xss-body')</script>
  <img src="x" onerror="alert(1)"/>
  <a href="javascript:alert(1)">Click</a>
  <a href="JAVASCRIPT:alert(2)">Uppercase JS</a>
  <a href="  javascript:alert(3)">Padded JS</a>
  <a href="vbscript:msgbox(1)">VBScript</a>
  <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data URI</a>
  <a href="data:application/xhtml+xml,<script>alert(1)</script>">Data XHTML</a>
  <iframe src="http://evil.com"></iframe>
  <object data="http://evil.com/malware.swf"></object>
  <embed src="http://evil.com/exploit.swf"></embed>
  <applet code="Malware.class"></applet>
  <form action="http://evil.com/phish" method="POST">
    <input type="text" name="password" />
    <button type="submit">Send</button>
  </form>
  <svg onload="alert('svg-onload')">
    <script>alert('svg-xss')</script>
  </svg>
  <div onclick="alert('div-click')" onmouseover="alert('div-hover')">Clean Text Content</div>
</body>
</html>`;

        const zip = new JSZip();
        zip.file('OEBPS/text/hostile.xhtml', hostileXhtml);

        const extractor = new AssetExtractor(zip);
        const preparedDoc = await extractor.getChapterDocument('OEBPS/text/hostile.xhtml');

        // Check 1: script tags completely removed
        const scripts = preparedDoc.querySelectorAll('script');
        assert(scripts.length === 0, `Expected 0 script tags, found ${scripts.length}`);

        // Check 2: inline event handlers removed
        const elementsWithOn = Array.from(preparedDoc.querySelectorAll('*')).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.toLowerCase().startsWith('on'));
        });
        assert(elementsWithOn.length === 0, `Expected 0 inline on* handlers, found ${elementsWithOn.length}`);

        // Check 3: javascript: / vbscript: / data: dangerous hrefs neutralized
        const allAnchors = preparedDoc.querySelectorAll('a');
        for (const a of allAnchors) {
          const href = (a.getAttribute('href') || '').toLowerCase();
          assert(!href.startsWith('javascript:'), `Found unstripped javascript: href: ${href}`);
          assert(!href.startsWith('vbscript:'), `Found unstripped vbscript: href: ${href}`);
          assert(!href.startsWith('data:text/html'), `Found unstripped data:text/html href: ${href}`);
          assert(!href.startsWith('data:application/xhtml'), `Found unstripped data:application/xhtml href: ${href}`);
        }

        // Check 4: meta http-equiv="refresh" removed
        const metaRefresh = preparedDoc.querySelectorAll('meta[http-equiv="refresh" i]');
        assert(metaRefresh.length === 0, `Expected 0 meta refresh tags, found ${metaRefresh.length}`);

        // Check 5: object, embed, applet, base removed
        const dangerousObjects = preparedDoc.querySelectorAll('object, embed, applet, base');
        assert(dangerousObjects.length === 0, `Expected 0 object/embed/applet/base tags, found ${dangerousObjects.length}`);

        // Check 6: form action sanitized / neutralized
        const forms = preparedDoc.querySelectorAll('form');
        for (const f of forms) {
          assert(!f.hasAttribute('action'), `Form action was not removed`);
        }

        // Check 7: iframe completely stripped!
        const iframes = preparedDoc.querySelectorAll('iframe');
        assert(iframes.length === 0, `Expected 0 iframe tags, found ${iframes.length} (iframe was NOT stripped!)`);

        extractor.cleanup();

        suiteResults.push({
          suite: 'Security Sanitization',
          name: 'Hostile XHTML Sanitization (script, onerror, javascript:, iframe, meta refresh)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Security Sanitization',
          name: 'Hostile XHTML Sanitization (script, onerror, javascript:, iframe, meta refresh)',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 4. CSS URL REWRITING & CYCLE STRESS
      // ====================================================================
      try {
        const zip = new JSZip();

        // Circular @import: A imports B, B imports A
        zip.file('OEBPS/css/styleA.css', `
@import "styleB.css";
body { color: #111111; }
h1 { font-family: 'TitleFont'; }
`);

        zip.file('OEBPS/css/styleB.css', `
@import "styleA.css";
p { line-height: 1.6; }
`);

        // Self-importing stylesheet
        zip.file('OEBPS/css/self.css', `
@import "self.css";
.quote { font-style: italic; }
`);

        // 3-way circular @import: C1 -> C2 -> C3 -> C1
        zip.file('OEBPS/css/c1.css', `@import "c2.css"; .c1 { display: block; }`);
        zip.file('OEBPS/css/c2.css', `@import "c3.css"; .c2 { display: inline; }`);
        zip.file('OEBPS/css/c3.css', `@import "c1.css"; .c3 { display: flex; }`);

        // Stylesheet with relative font, image, data URL, and external URL
        zip.file('OEBPS/css/assets.css', `
@font-face {
  font-family: 'CustomSerif';
  src: url('../fonts/serif.woff2') format('woff2');
}
.hero {
  background-image: url('../images/banner.jpg');
}
.icon {
  mask-image: url('../images/icons.svg#star');
}
.inline-badge {
  background: url('data:image/svg+xml;utf8,<svg></svg>');
}
.external {
  background: url('https://example.com/external.png');
}
`);

        zip.file('OEBPS/fonts/serif.woff2', new Uint8Array([0x77, 0x4F, 0x46, 0x32])); // WOFF2 magic
        zip.file('OEBPS/images/banner.jpg', new Uint8Array([0xFF, 0xD8, 0xFF])); // JPEG magic
        zip.file('OEBPS/images/icons.svg', '<svg id="star"></svg>');

        const extractor = new AssetExtractor(zip);

        // Test 4.1: Circular mutual @import does NOT crash with stack overflow
        const blobUrlA = await extractor.processStylesheet('OEBPS/css/styleA.css');
        assert(blobUrlA && blobUrlA.startsWith('blob:'), 'styleA did not generate blob URL');

        // Test 4.2: Self @import does NOT crash
        const blobUrlSelf = await extractor.processStylesheet('OEBPS/css/self.css');
        assert(blobUrlSelf && blobUrlSelf.startsWith('blob:'), 'self.css did not generate blob URL');

        // Test 4.3: 3-way cycle does NOT crash
        const blobUrlC1 = await extractor.processStylesheet('OEBPS/css/c1.css');
        assert(blobUrlC1 && blobUrlC1.startsWith('blob:'), 'c1.css did not generate blob URL');

        // Test 4.4: Relative url(...) rewritten to blob URLs
        const rawAssetsCss = await zip.file('OEBPS/css/assets.css').async('string');
        const rewrittenAssetsCss = await extractor.rewriteCss(rawAssetsCss, 'OEBPS/css/assets.css');

        // Assert relative font and image became blob:
        assert(rewrittenAssetsCss.includes('url("blob:'), 'Relative font/image was not rewritten to blob URL');
        assert(!rewrittenAssetsCss.includes('../fonts/serif.woff2'), 'Unrewritten font path remains');
        assert(!rewrittenAssetsCss.includes('../images/banner.jpg'), 'Unrewritten banner path remains');

        // Assert SVG hash fragment preserved
        assert(rewrittenAssetsCss.includes('#star"'), 'SVG hash fragment #star was lost in rewrite');

        // Assert data: and https:// URLs untouched
        assert(rewrittenAssetsCss.includes('data:image/svg+xml'), 'data: URL was corrupted');
        assert(rewrittenAssetsCss.includes('https://example.com/external.png'), 'https: URL was corrupted');

        extractor.cleanup();

        suiteResults.push({
          suite: 'CSS URL Rewriting & Cycle Stress',
          name: 'Circular @import resolution & relative url(...) rewriting',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'CSS URL Rewriting & Cycle Stress',
          name: 'Circular @import resolution & relative url(...) rewriting',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 5. MEMORY LEAK AUDIT (50 Blob URLs & URL.revokeObjectURL verification)
      // ====================================================================
      try {
        const zip = new JSZip();

        // Create 50 distinct dummy files in zip
        for (let i = 1; i <= 50; i++) {
          zip.file(`OEBPS/assets/asset_${i}.dat`, new Uint8Array([i, i + 1, i + 2]));
        }

        const extractor = new AssetExtractor(zip);

        // Extract all 50 assets
        const createdBlobUrls = [];
        for (let i = 1; i <= 50; i++) {
          const url = await extractor.extractAsset(`OEBPS/assets/asset_${i}.dat`, 'application/octet-stream');
          assert(url && url.startsWith('blob:'), `Asset ${i} failed generating blob URL`);
          createdBlobUrls.push(url);
        }

        assert(extractor.assetMap.size === 50, `Expected assetMap.size === 50, got ${extractor.assetMap.size}`);
        assert(extractor.blobUrls.size === 50, `Expected blobUrls.size === 50, got ${extractor.blobUrls.size}`);

        // Spy on URL.revokeObjectURL
        const originalRevoke = URL.revokeObjectURL;
        const revokedUrls = new Set();
        let revokeCallCount = 0;

        URL.revokeObjectURL = function (url) {
          revokeCallCount++;
          revokedUrls.add(url);
          originalRevoke.call(URL, url);
        };

        try {
          extractor.cleanup();

          // Verify every single created Blob URL was revoked
          assert(revokeCallCount === 50, `Expected exactly 50 revoke calls, got ${revokeCallCount}`);
          for (const url of createdBlobUrls) {
            assert(revokedUrls.has(url), `Blob URL was not revoked: ${url}`);
          }

          // Verify internal maps are completely cleared
          assert(extractor.assetMap.size === 0, `Expected assetMap to be empty, got ${extractor.assetMap.size}`);
          assert(extractor.blobUrls.size === 0, `Expected blobUrls to be empty, got ${extractor.blobUrls.size}`);
          assert(extractor.isCleanedUp === true, 'extractor.isCleanedUp flag should be true');

          // Verify that post-cleanup extraction returns null or throws safely without reallocating
          const postExtract = await extractor.extractAsset('OEBPS/assets/asset_1.dat');
          assert(postExtract === null, 'extractAsset after cleanup must return null');
        } finally {
          URL.revokeObjectURL = originalRevoke;
        }

        suiteResults.push({
          suite: 'Memory Leak Audit',
          name: 'Revocation of 50 Blob URLs & assetMap clearing',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Memory Leak Audit',
          name: 'Revocation of 50 Blob URLs & assetMap clearing',
          passed: false,
          error: err.message
        });
      }

      return suiteResults;
    });

    console.log('\n--- Challenge Results ---');
    let hasFailures = false;
    for (const r of results) {
      if (r.passed) {
        console.log(`  ✅ PASS: [${r.suite}] ${r.name}`);
      } else {
        hasFailures = true;
        console.log(`  ❌ FAIL: [${r.suite}] ${r.name}`);
        console.log(`     Error: ${r.error}`);
      }
    }
    console.log('-------------------------\n');

    return { results, hasFailures };
  } finally {
    await browser.close();
    closeServer();
  }
}

// Execute
runAdversarialChallenges().then(({ results, hasFailures }) => {
  if (hasFailures) {
    console.error('CHALLENGE FAILED: Bugs found during empirical stress testing.');
    process.exit(1);
  } else {
    console.log('CHALLENGE PASSED: All adversarial scenarios verified.');
    process.exit(0);
  }
}).catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(2);
});
