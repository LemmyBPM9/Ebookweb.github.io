/**
 * .agents/teamwork/m2_reviewer_2/adversarial_test.js
 * Adversarial Stress-Test Suite for Milestone 2:
 * EPUB 2/3 Parser, Asset Extractor & Security Sandbox.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function runAdversarialTests() {
  console.log('====================================================================');
  console.log('       Adversarial Stress-Testing: Milestone 2 Reviewer 2            ');
  console.log('====================================================================');

  // Start static test server
  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[adversarial] Test server running at ${serverUrl}`);

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

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failureDetails = [];

  function record(category, testName, passed, detail = '') {
    totalTests++;
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}: [${category}] ${testName}${detail ? ' (' + detail + ')' : ''}`);
    if (passed) {
      passedTests++;
    } else {
      failedTests++;
      failureDetails.push({ category, testName, detail });
    }
  }

  try {
    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate(async (serverUrl) => {
      const suiteResults = [];

      function assert(cond, msg) {
        if (!cond) throw new Error(msg);
      }

      const { PathResolver } = await import('/js/parser/path-resolver.js');
      const { OpfParser } = await import('/js/parser/opf-parser.js');
      const { TocParser } = await import('/js/parser/toc-parser.js');
      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { EpubParser, validateZipMagicBytes, getJSZip } = await import('/js/parser/epub-parser.js');

      const JSZip = getJSZip();

      // =============================================================
      // CATEGORY 1: Security Sandboxing & Sanitization (XSS Vectors)
      // =============================================================
      try {
        const maliciousHtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="refresh" content="0;url=https://attacker.com/steal"/>
  <base href="https://attacker.com/"/>
  <script>window.__HACKED_SCRIPT__ = true;</script>
  <script src="https://attacker.com/evil.js"></script>
  <sCrIpt>alert('case-insensitive')</sCrIpT>
  <style>body { color: red; }</style>
</head>
<body onload="window.__HACKED_ONLOAD__ = true;" onpageshow="alert(1)" ONCLICK="alert(2)">
  <div id="content">
    <p>Harmless paragraph</p>
    <img src="avatar.jpg" onerror="window.__HACKED_IMG__ = true;"/>
    <svg xmlns="http://www.w3.org/2000/svg" onload="window.__HACKED_SVG__ = true;">
      <circle r="10"/>
      <image href="javascript:alert('svg-href')" xlink:href="javascript:alert('svg-xlink')"/>
      <use href="javascript:alert('svg-use')"/>
    </svg>
    <a id="link-js" href="javascript:alert('link')">Click me</a>
    <a id="link-js-spaces" href="  javascript:alert('spaces')  ">Spaces</a>
    <a id="link-js-control" href="java\0script:alert('null-byte')">Control</a>
    <a id="link-js-case" href="JaVaScRiPt:alert('case')">Mixed Case</a>
    <a id="link-vbs" href="vbscript:msgbox(1)">VBScript</a>
    <a id="link-data-html" href="data:text/html,<script>alert(1)</script>">Data HTML</a>
    <a id="link-data-xhtml" href="data:application/xhtml+xml,<script>alert(2)</script>">Data XHTML</a>
    <form action="https://attacker.com/submit" method="POST" onsubmit="alert(1)">
      <button formaction="javascript:alert(1)">Submit</button>
    </form>
    <object data="malware.swf" type="application/x-shockwave-flash"></object>
    <embed src="malware.swf"></embed>
    <applet code="Malware.class"></applet>
  </div>
</body>
</html>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(maliciousHtml, 'text/html');
        DOMSanitizer.sanitize(doc);

        assert(doc.querySelectorAll('script').length === 0, 'Script tags were not stripped');
        assert(doc.querySelectorAll('meta[http-equiv="refresh" i]').length === 0, 'meta refresh was not stripped');
        assert(doc.querySelectorAll('base').length === 0, 'base element was not stripped');
        assert(doc.querySelectorAll('object').length === 0, 'object was not stripped');
        assert(doc.querySelectorAll('embed').length === 0, 'embed was not stripped');
        assert(doc.querySelectorAll('applet').length === 0, 'applet was not stripped');

        const allElements = doc.querySelectorAll('*');
        for (const el of allElements) {
          for (const attr of el.attributes) {
            assert(!attr.name.toLowerCase().startsWith('on'), `Event handler ${attr.name} was not stripped from <${el.tagName}>`);
          }
        }

        const testLinks = [
          '#link-js',
          '#link-js-spaces',
          '#link-js-case',
          '#link-vbs',
          '#link-data-html',
          '#link-data-xhtml'
        ];
        for (const sel of testLinks) {
          const a = doc.querySelector(sel);
          assert(!a.hasAttribute('href') || a.getAttribute('href') === '', `Dangerous link ${sel} was not neutralized`);
        }

        const svgImage = doc.querySelector('image');
        if (svgImage) {
          assert(!svgImage.hasAttribute('href') || !svgImage.getAttribute('href').toLowerCase().startsWith('javascript:'), 'SVG image href not sanitized');
          assert(!svgImage.hasAttribute('xlink:href') || !svgImage.getAttribute('xlink:href').toLowerCase().startsWith('javascript:'), 'SVG image xlink:href not sanitized');
        }

        const form = doc.querySelector('form');
        assert(!form.hasAttribute('action'), 'Form action attribute was not removed');
        assert(!form.hasAttribute('method'), 'Form method attribute was not removed');

        suiteResults.push({ category: 'Security Sanitization', name: 'DOMSanitizer neutralizes scripts, on* handlers, and dangerous URIs', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Security Sanitization', name: 'DOMSanitizer neutralizes scripts, on* handlers, and dangerous URIs', passed: false, detail: err.message });
      }

      // =============================================================
      // CATEGORY 2: Memory Management & URL.revokeObjectURL Lifecycle
      // =============================================================
      try {
        const createdUrls = new Set();
        const revokedUrls = new Set();

        const origCreate = URL.createObjectURL;
        const origRevoke = URL.revokeObjectURL;

        URL.createObjectURL = function(blob) {
          const url = origCreate.call(URL, blob);
          createdUrls.add(url);
          return url;
        };

        URL.revokeObjectURL = function(url) {
          revokedUrls.add(url);
          return origRevoke.call(URL, url);
        };

        try {
          const zip = new JSZip();
          zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
          zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

          zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.openpackage.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Memory Test</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="cov" href="images/cov.png" media-type="image/png" properties="cover-image"/>
    <item id="style" href="styles/style.css" media-type="text/css"/>
    <item id="bg" href="images/bg.png" media-type="image/png"/>
    <item id="img1" href="images/pic1.png" media-type="image/png"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);

          zip.file('OEBPS/images/cov.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
          zip.file('OEBPS/images/bg.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
          zip.file('OEBPS/images/pic1.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
          zip.file('OEBPS/styles/style.css', `body { background-image: url("../images/bg.png"); }`);
          zip.file('OEBPS/text/ch1.xhtml', `<?xml version="1.0"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <link rel="stylesheet" href="../styles/style.css"/>
</head>
<body>
  <h1>Chapter 1</h1>
  <img src="../images/pic1.png"/>
</body>
</html>`);

          const epubBuffer = await zip.generateAsync({ type: 'arraybuffer' });

          const parsed = await EpubParser.parse(epubBuffer);

          assert(parsed.coverBlobUrl !== null, 'Cover blob URL missing');
          assert(createdUrls.has(parsed.coverBlobUrl), 'Cover URL not tracked in createdUrls');

          const doc = await parsed.getChapterDocument(parsed.spine[0].fullPath);
          assert(doc !== null, 'Chapter doc null');

          const img = doc.querySelector('img');
          assert(img && img.getAttribute('src').startsWith('blob:'), 'Image src not rewritten to blob URL');

          const link = doc.querySelector('link[rel~="stylesheet"]');
          assert(link && link.getAttribute('href').startsWith('blob:'), 'Stylesheet href not rewritten to blob URL');

          assert(createdUrls.size >= 4, `Expected at least 4 blob URLs (cover, stylesheet, bg, pic1), got: ${createdUrls.size}`);

          parsed.cleanup();

          for (const url of createdUrls) {
            assert(revokedUrls.has(url), `Blob URL was not revoked: ${url}`);
          }

          assert(parsed.assetMap.size === 0, 'assetMap was not cleared after cleanup()');

          let secondCleanupThrew = false;
          try {
            parsed.cleanup();
          } catch (_) {
            secondCleanupThrew = true;
          }
          assert(!secondCleanupThrew, 'Second call to cleanup() threw an error');

          let chapterAfterCleanupThrew = false;
          try {
            await parsed.getChapterDocument(parsed.spine[0].fullPath);
          } catch (err) {
            chapterAfterCleanupThrew = true;
            assert(err.message.includes('cleaned up'), 'Expected error mentioning cleaned up, got: ' + err.message);
          }
          assert(chapterAfterCleanupThrew, 'getChapterDocument after cleanup did not throw');

          suiteResults.push({ category: 'Memory Management', name: 'cleanup() revokes 100% of created Blob URLs and guards post-cleanup calls', passed: true });
        } finally {
          URL.createObjectURL = origCreate;
          URL.revokeObjectURL = origRevoke;
        }
      } catch (err) {
        suiteResults.push({ category: 'Memory Management', name: 'cleanup() revokes 100% of created Blob URLs and guards post-cleanup calls', passed: false, detail: err.message });
      }

      // =============================================================
      // CATEGORY 3: CSS URL Rewriting, Comments, Duplicates & Circular Imports
      // =============================================================
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('OEBPS/images/cat.png', new Uint8Array([1, 2, 3]));
        zip.file('OEBPS/fonts/font.woff2', new Uint8Array([4, 5, 6]));

        zip.file('OEBPS/styles/a.css', `@import "b.css";\nbody { font-family: 'Test'; }`);
        zip.file('OEBPS/styles/b.css', `@import "a.css";\nh1 { color: blue; }`);

        const extractor = new AssetExtractor(zip);

        const catBlobUrl = await extractor.extractAsset('OEBPS/images/cat.png', 'image/png');
        const fontBlobUrl = await extractor.extractAsset('OEBPS/fonts/font.woff2', 'font/woff2');

        const cssInput = `
/* Comment with url("../images/fake.png") */
@import url("b.css");
@font-face {
  font-family: 'TestFont';
  src: url('../fonts/font.woff2') format('woff2');
}
.header { background-image: url('../images/cat.png'); }
.footer { background-image: url('../images/cat.png'); }
.banner {
  background: url('../images/cat.png#fragment') no-repeat;
  filter: url(#svg-blur);
  background-external: url("https://cdn.example.com/ext.jpg");
  data-uri: url("data:image/svg+xml;utf8,<svg></svg>");
}
`;

        const rewritten = await extractor.rewriteCss(cssInput, 'OEBPS/styles/a.css');

        assert(rewritten.includes('/* Comment with url("../images/fake.png") */'), 'CSS comment was corrupted');
        assert(rewritten.includes(`url("${fontBlobUrl}")`), 'Font URL not rewritten to blob URL');

        const matches = rewritten.match(new RegExp(catBlobUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        assert(matches && matches.length >= 3, `Expected at least 3 occurrences of rewritten cat image, found: ${matches ? matches.length : 0}`);

        assert(rewritten.includes(`url("${catBlobUrl}#fragment")`), 'Cat image URL with hash fragment not rewritten correctly');
        assert(rewritten.includes('url(#svg-blur)'), 'SVG anchor filter was improperly modified');
        assert(rewritten.includes('url("https://cdn.example.com/ext.jpg")'), 'External HTTPS URL was improperly modified');
        assert(rewritten.includes('url("data:image/svg+xml;utf8,<svg></svg>")'), 'Data URI was improperly modified');
        assert(rewritten.includes('/* Circular @import omitted */') || rewritten.includes('color: blue;'), 'Circular @import loop did not terminate safely');

        extractor.cleanup();
        suiteResults.push({ category: 'CSS URL Rewriting', name: 'Rewrites relative fonts/images, handles duplicates, preserves fragments/comments, terminates circular @import', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'CSS URL Rewriting', name: 'Rewrites relative fonts/images, handles duplicates, preserves fragments/comments, terminates circular @import', passed: false, detail: err.message });
      }

      // =============================================================
      // CATEGORY 4: Robustness & Corrupted Input Handling
      // =============================================================
      // 4.1 Corrupted ZIP Magic Bytes
      try {
        const nonZipBuffer = new TextEncoder().encode('Hello World this is definitely not a zip file');
        let errorThrown = false;
        try {
          await EpubParser.parse(nonZipBuffer);
        } catch (err) {
          errorThrown = true;
          assert(err.message.includes('not a valid ZIP archive'), 'Unexpected error message: ' + err.message);
        }
        assert(errorThrown, 'nonZipBuffer did not throw');
        suiteResults.push({ category: 'Robustness', name: 'Rejects non-ZIP buffers immediately on magic-byte check', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Rejects non-ZIP buffers immediately on magic-byte check', passed: false, detail: err.message });
      }

      // 4.2 Truncated / Short Buffer
      try {
        const shortBuffer = new Uint8Array([0x50]); // Only 1 byte
        let errorThrown = false;
        try {
          await EpubParser.parse(shortBuffer);
        } catch (err) {
          errorThrown = true;
        }
        assert(errorThrown, '1-byte buffer did not throw');
        suiteResults.push({ category: 'Robustness', name: 'Rejects truncated 1-byte buffer without crashing', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Rejects truncated 1-byte buffer without crashing', passed: false, detail: err.message });
      }

      // 4.3 Missing container.xml with .opf fallback
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('OPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.openpackage.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Orphan OPF Book</dc:title>
    <dc:creator>Explorer</dc:creator>
  </metadata>
  <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`);
        zip.file('OPS/ch1.xhtml', '<html><body><h1>Orphan</h1></body></html>');

        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const parsed = await EpubParser.parse(buffer);

        assert(parsed.metadata.title === 'Orphan OPF Book', 'Failed to recover OPF via fallback');
        assert(parsed.spine.length === 1, 'Spine length mismatch in fallback');

        parsed.cleanup();
        suiteResults.push({ category: 'Robustness', name: 'Recovers via .opf scan when META-INF/container.xml is missing', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Recovers via .opf scan when META-INF/container.xml is missing', passed: false, detail: err.message });
      }

      // 4.4 Missing both container.xml and .opf document
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('hello.txt', 'Just a text file in zip');

        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        let threw = false;
        try {
          await EpubParser.parse(buffer);
        } catch (err) {
          threw = true;
          assert(err.message.includes('Unable to locate OPF package document'), 'Wrong error: ' + err.message);
        }
        assert(threw, 'Did not throw for missing OPF');
        suiteResults.push({ category: 'Robustness', name: 'Throws descriptive error when no OPF package exists', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Throws descriptive error when no OPF package exists', passed: false, detail: err.message });
      }

      // 4.5 Bare ampersands in NCX TOC
      try {
        const ncxXmlWithBareAmp = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="p1" playOrder="1">
      <navLabel><text>Barnes & Noble & Friends</text></navLabel>
      <content src="ch1.xhtml?book=1&chapter=2"/>
    </navPoint>
  </navMap>
</ncx>`;

        const toc = TocParser.parseNcxDocument(ncxXmlWithBareAmp, 'OEBPS/toc.ncx');
        assert(toc.length === 1, 'NCX with bare & failed to parse');
        assert(toc[0].title === 'Barnes & Noble & Friends', 'NCX bare & title mismatch: ' + toc[0].title);
        assert(toc[0].fullPath === 'OEBPS/ch1.xhtml', 'NCX fullPath mismatch: ' + toc[0].fullPath);

        suiteResults.push({ category: 'Robustness', name: 'Tolerates bare unescaped ampersands in NCX XML', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Tolerates bare unescaped ampersands in NCX XML', passed: false, detail: err.message });
      }

      // 4.6 Missing Cover Graceful Handling
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
        zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.openpackage.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>No Cover Book</dc:title>
    <dc:creator>Jane Doe</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`);
        zip.file('ch1.xhtml', '<html><body><p>Hello</p></body></html>');

        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const parsed = await EpubParser.parse(buffer);

        assert(parsed.coverBlobUrl === null, 'Cover should be null');
        assert(parsed.metadata.title === 'No Cover Book', 'Title mismatch');

        parsed.cleanup();
        suiteResults.push({ category: 'Robustness', name: 'Missing cover results in coverBlobUrl === null without error', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Missing cover results in coverBlobUrl === null without error', passed: false, detail: err.message });
      }

      // 4.7 Synthetic Spine TOC Fallback when neither Nav Doc nor NCX exist
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
        zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.openpackage.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>No TOC Book</dc:title>
    <dc:creator>Jane Doe</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`);
        zip.file('ch1.xhtml', '<html><body><h1>The Beginning</h1><p>Text</p></body></html>');
        zip.file('ch2.xhtml', '<html><body><h2>The Middle</h2><p>Text</p></body></html>');

        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const parsed = await EpubParser.parse(buffer);

        assert(parsed.toc.length === 2, 'Expected 2 synthetic TOC entries, got: ' + parsed.toc.length);
        assert(parsed.toc[0].title === 'The Beginning', 'Expected title "The Beginning", got: ' + parsed.toc[0].title);
        assert(parsed.toc[1].title === 'The Middle', 'Expected title "The Middle", got: ' + parsed.toc[1].title);

        parsed.cleanup();
        suiteResults.push({ category: 'Robustness', name: 'Generates synthetic spine TOC with extracted headings when TOC documents are absent', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Generates synthetic spine TOC with extracted headings when TOC documents are absent', passed: false, detail: err.message });
      }

      // 4.8 Zip-Slip Directory Traversal Containment
      try {
        assert(PathResolver.normalizePath('../../../../../../etc/passwd') === 'etc/passwd', 'Zip-slip normalize failed');
        assert(PathResolver.resolvePath('OEBPS/text/ch1.xhtml', '../../../../secret.txt') === 'secret.txt', 'Zip-slip resolvePath failed');
        suiteResults.push({ category: 'Robustness', name: 'Zip-Slip path resolution bounds traversal strictly at archive root', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'Zip-Slip path resolution bounds traversal strictly at archive root', passed: false, detail: err.message });
      }

      // 4.9 Deeply Nested TOC (Recursion Guard)
      try {
        let deepNavHtml = '<nav epub:type="toc"><ol>';
        let closeTags = '';
        for (let i = 0; i < 30; i++) {
          deepNavHtml += `<li><a href="ch.xhtml#sec-${i}">Section ${i}</a><ol>`;
          closeTags += '</ol></li>';
        }
        deepNavHtml += closeTags + '</ol></nav>';

        const toc = TocParser.parseNavDocument(deepNavHtml, 'OEBPS/nav.xhtml');
        assert(toc.length === 1, 'Deep TOC should parse');
        const flat = TocParser.flatten(toc);
        assert(flat.length <= 20, `Recursion guard failed: flat length was ${flat.length}, expected <= 20`);
        suiteResults.push({ category: 'Robustness', name: 'TOC recursion guard bounds recursion at MAX_RECURSION_DEPTH', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Robustness', name: 'TOC recursion guard bounds recursion at MAX_RECURSION_DEPTH', passed: false, detail: err.message });
      }

      // 4.10 Chapter with Inline <style> and style="" attributes with url(...)
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
        zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.openpackage.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Inline Style Book</dc:title>
    <dc:creator>Jane Doe</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="flower.png" media-type="image/png"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`);
        zip.file('flower.png', new Uint8Array([1, 2, 3, 4]));
        zip.file('ch1.xhtml', `<!DOCTYPE html>
<html>
<head>
  <style>
    .flower-box { background: url('flower.png'); }
  </style>
</head>
<body>
  <div class="flower-box" style="background-image: url('flower.png');">Content</div>
</body>
</html>`);

        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const parsed = await EpubParser.parse(buffer);
        const doc = await parsed.getChapterDocument('ch1.xhtml');

        const styleTag = doc.querySelector('style');
        assert(styleTag && styleTag.textContent.includes('blob:'), 'Inline <style> tag url was not rewritten to blob URL');

        const div = doc.querySelector('div.flower-box');
        assert(div && div.getAttribute('style').includes('blob:'), 'Inline style="" attribute url was not rewritten to blob URL');

        parsed.cleanup();
        suiteResults.push({ category: 'CSS URL Rewriting', name: 'Rewrites url(...) inside inline <style> elements and style="" attributes', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'CSS URL Rewriting', name: 'Rewrites url(...) inside inline <style> elements and style="" attributes', passed: false, detail: err.message });
      }

      // 4.11 Cover Cascade 4-Tier Priority Verification
      try {
        const makeOpf = (extraManifest, extraMeta) => `<?xml version="1.0"?>
<package xmlns="http://www.openpackage.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Cover Cascade</dc:title>
    <dc:creator>Author</dc:creator>
    ${extraMeta}
  </metadata>
  <manifest>
    ${extraManifest}
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

        // Tier 1 beats Tier 2, 3, 4
        const opf1 = makeOpf(`
          <item id="img1" href="t1.jpg" media-type="image/jpeg" properties="cover-image"/>
          <item id="img2" href="t2.jpg" media-type="image/jpeg"/>
          <item id="cover-image" href="t3.jpg" media-type="image/jpeg"/>
          <item id="other-cover" href="book_cover.png" media-type="image/png"/>
        `, `<meta name="cover" content="img2"/>`);
        const p1 = OpfParser.parseOpf(opf1, 'content.opf');
        assert(p1.coverItem && p1.coverItem.id === 'img1', 'Tier 1 properties="cover-image" failed to win priority');

        // Tier 2 beats Tier 3, 4
        const opf2 = makeOpf(`
          <item id="img2" href="t2.jpg" media-type="image/jpeg"/>
          <item id="cover-image" href="t3.jpg" media-type="image/jpeg"/>
          <item id="other-cover" href="book_cover.png" media-type="image/png"/>
        `, `<meta name="cover" content="img2"/>`);
        const p2 = OpfParser.parseOpf(opf2, 'content.opf');
        assert(p2.coverItem && p2.coverItem.id === 'img2', 'Tier 2 meta[name="cover"] failed to win priority');

        // Tier 3 beats Tier 4
        const opf3 = makeOpf(`
          <item id="cover-image" href="t3.jpg" media-type="image/jpeg"/>
          <item id="other-cover" href="book_cover.png" media-type="image/png"/>
        `, '');
        const p3 = OpfParser.parseOpf(opf3, 'content.opf');
        assert(p3.coverItem && p3.coverItem.id === 'cover-image', 'Tier 3 id="cover-image" failed to win priority');

        // Tier 4 wins when no earlier tiers exist
        const opf4 = makeOpf(`
          <item id="random-id" href="front_cover.png" media-type="image/png"/>
        `, '');
        const p4 = OpfParser.parseOpf(opf4, 'content.opf');
        assert(p4.coverItem && p4.coverItem.id === 'random-id', 'Tier 4 heuristic href.includes("cover") failed');

        suiteResults.push({ category: 'OpfParser', name: '4-step cover resolution cascade respects strict priority hierarchy', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'OpfParser', name: '4-step cover resolution cascade respects strict priority hierarchy', passed: false, detail: err.message });
      }

      // 4.12 Case-Insensitive and Percent-Decoded ZIP Entry Lookup
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('OEBPS/Images/Special%20Picture.PNG', new Uint8Array([1, 2, 3]));

        // Search with exact
        assert(PathResolver.findZipEntry(zip, 'OEBPS/Images/Special%20Picture.PNG') !== null, 'Exact lookup failed');
        // Search with decoded spaces
        assert(PathResolver.findZipEntry(zip, 'OEBPS/Images/Special Picture.PNG') !== null, 'Decoded space lookup failed');
        // Search with lower case
        assert(PathResolver.findZipEntry(zip, 'oebps/images/special%20picture.png') !== null, 'Case-insensitive lookup failed');

        suiteResults.push({ category: 'PathResolver', name: 'findZipEntry resolves exact, percent-encoded, and case-insensitive ZIP keys', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'PathResolver', name: 'findZipEntry resolves exact, percent-encoded, and case-insensitive ZIP keys', passed: false, detail: err.message });
      }

      // =============================================================
      // CATEGORY 5: Interface Contract & Integrity Verification
      // =============================================================
      try {
        const resp = await fetch('/test/test-fixtures/valid-sample.epub');
        const buffer = await resp.arrayBuffer();
        const parsed = await EpubParser.parse(buffer);

        const expectedKeys = ['metadata', 'coverBlobUrl', 'spine', 'toc', 'getChapterDocument', 'assetMap', 'cleanup'];
        for (const k of expectedKeys) {
          assert(k in parsed, `ParsedEpub missing property "${k}"`);
        }

        const meta = parsed.metadata;
        assert(typeof meta.title === 'string' && meta.title.length > 0, 'metadata.title missing/invalid');
        assert(typeof meta.author === 'string' && meta.author.length > 0, 'metadata.author missing/invalid');

        assert(Array.isArray(parsed.spine), 'spine is not an Array');
        for (const s of parsed.spine) {
          assert(typeof s.id === 'string', 'spine item missing id');
          assert(typeof s.href === 'string', 'spine item missing href');
          assert(typeof s.fullPath === 'string', 'spine item missing fullPath');
          assert(typeof s.isLinear === 'boolean', 'spine item missing isLinear boolean');
        }

        assert(Array.isArray(parsed.toc), 'toc is not an Array');
        for (const t of parsed.toc) {
          assert(typeof t.id === 'string', 'toc item missing id');
          assert(typeof t.title === 'string', 'toc item missing title');
          assert(typeof t.href === 'string', 'toc item missing href');
          assert(typeof t.fullPath === 'string', 'toc item missing fullPath');
          assert(typeof t.hash === 'string', 'toc item missing hash');
          assert(Array.isArray(t.children), 'toc item children is not an Array');
        }

        const doc = await parsed.getChapterDocument(parsed.spine[0].fullPath);
        assert(doc && typeof doc.querySelector === 'function', 'getChapterDocument did not return a Document');

        assert(parsed.assetMap instanceof Map, 'assetMap is not a Map');
        assert(typeof parsed.cleanup === 'function', 'cleanup is not a function');

        parsed.cleanup();
        suiteResults.push({ category: 'Interface Contract', name: 'ParsedEpub fulfills 100% of PROJECT.md:88-99 interface contract', passed: true });
      } catch (err) {
        suiteResults.push({ category: 'Interface Contract', name: 'ParsedEpub fulfills 100% of PROJECT.md:88-99 interface contract', passed: false, detail: err.message });
      }

      return suiteResults;
    }, serverUrl);

    for (const r of results) {
      record(r.category, r.name, r.passed, r.detail);
    }

  } finally {
    await browser.close();
    await closeServer();
  }

  console.log('====================================================================');
  console.log(`Adversarial Execution Summary: ${passedTests} / ${totalTests} passed.`);
  if (failedTests > 0) {
    console.error(`FAILED: ${failedTests} adversarial test(s) failed.`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All adversarial stress-tests PASSED flawlessly!');
  }
}

runAdversarialTests().catch(err => {
  console.error('Fatal error in adversarial test:', err);
  process.exit(1);
});
