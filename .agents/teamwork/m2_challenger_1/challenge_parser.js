/**
 * .agents/teamwork/m2_challenger_1/challenge_parser.js
 *
 * Empirical Adversarial Test Harness for Milestone 2:
 * EPUB 2/3 Parser, Asset Extractor & Security Sandbox
 *
 * Stress-tests PathResolver, OpfParser, and EpubParser across 5 attack vectors:
 * 1. Zip-Slip directory traversal & RFC 3986 normalization stress
 * 2. Case-insensitivity & Percent-encoding (e.g. OEBPS/Images/Cover Photo%20(1).JPG) with query & hash
 * 3. Malformed OPF package stress (missing metadata/manifest/spine, empty titles, unclosed tags, namespaces)
 * 4. Corrupted archive fast magic-byte rejection (0x50, 0x4B)
 * 5. 4-step cover resolution cascade priority & non-image rejection
 *
 * Runs in Node.js and headless Google Chrome against the local static HTTP server.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function runChallengeHarness() {
  console.log('====================================================================');
  console.log('       Milestone 2 Empirical Challenger 1 Stress Harness            ');
  console.log('====================================================================');

  // 1. Start static test server on dynamic port
  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[challenge] Test server active at ${serverUrl}`);

  // 2. Launch headless Google Chrome
  console.log(`[challenge] Launching Google Chrome at: ${CHROME_PATH}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[browser-console-error] ${msg.text()}`);
    }
  });

  try {
    await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });

    // Execute the full empirical challenge battery inside Google Chrome
    const suiteResults = await page.evaluate(async (serverUrl) => {
      const results = [];
      const findings = [];

      function assert(cond, msg) {
        if (!cond) throw new Error(msg);
      }

      function recordTest(suite, testName, passed, detail = '') {
        results.push({ suite, testName, passed, detail });
      }

      function recordFinding(category, severity, title, observation, impact) {
        findings.push({ category, severity, title, observation, impact });
      }

      // Load ES Modules from server
      const { PathResolver } = await import('/js/parser/path-resolver.js');
      const { OpfParser, isImageItem, getMetaText, getAllMetaText } = await import('/js/parser/opf-parser.js');
      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { EpubParser, validateZipMagicBytes, getJSZip } = await import('/js/parser/epub-parser.js');

      const JSZip = getJSZip();

      // ===================================================================
      // SUITE 1: Zip-Slip Directory Traversal & Path Normalization Stress
      // ===================================================================
      try {
        const hostilePaths = [
          { input: '../../../../etc/passwd', expected: 'etc/passwd' },
          { input: '..\\..\\windows\\system32', expected: 'windows/system32' },
          { input: '/root.txt', expected: 'root.txt' },
          { input: 'foo/../../bar', expected: 'bar' },
          { input: '..', expected: '' },
          { input: '../', expected: '' },
          { input: '../../../../', expected: '' },
          { input: 'a/b/../../../../c', expected: 'c' },
          { input: 'foo/../../../bar/../../baz', expected: 'baz' },
          { input: '//etc/shadow', expected: 'etc/shadow' },
          { input: '///var/log/secret.log', expected: 'var/log/secret.log' },
          { input: '\\\\server\\share\\evil.exe', expected: 'server/share/evil.exe' },
          { input: 'OEBPS/../../../../etc/hosts', expected: 'etc/hosts' }
        ];

        for (const item of hostilePaths) {
          const norm = PathResolver.normalizePath(item.input);
          assert(norm === item.expected, `normalizePath failed for "${item.input}": got "${norm}", expected "${item.expected}"`);
          assert(!norm.startsWith('..') && !norm.includes('/../'), `normalizePath permitted directory escape for "${item.input}" -> "${norm}"`);

          // Test resolution against root and subdirectories
          const resRoot = PathResolver.resolvePath('', item.input);
          assert(!resRoot.startsWith('..') && !resRoot.includes('/../'), `resolvePath from root escaped: "${item.input}" -> "${resRoot}"`);

          const resSub = PathResolver.resolvePath('OEBPS/text/ch01.xhtml', item.input);
          assert(!resSub.startsWith('..') && !resSub.includes('/../'), `resolvePath from chapter escaped: "${item.input}" -> "${resSub}"`);
        }

        // Hostile percent-encoded traversal inputs via resolvePath
        const encodedHostiles = [
          { input: '..%2f..%2fetc/passwd', expected: 'etc/passwd' },
          { input: '%2e%2e/%2e%2e/shadow', expected: 'shadow' },
          { input: '..%5c..%5cwindows%5csystem32', expected: 'windows/system32' },
          { input: '/..%2f..%2froot.txt', expected: 'root.txt' }
        ];

        for (const item of encodedHostiles) {
          const resolved = PathResolver.resolvePath('OEBPS/content.opf', item.input);
          assert(!resolved.startsWith('..') && !resolved.includes('/../'), `Encoded traversal escaped: "${item.input}" -> "${resolved}"`);
        }

        recordTest('Suite 1: Zip-Slip Stress', 'Hostile Traversal & Normalization Invariants', true, `${hostilePaths.length + encodedHostiles.length} paths tested`);
      } catch (err) {
        recordTest('Suite 1: Zip-Slip Stress', 'Hostile Traversal & Normalization Invariants', false, err.message);
      }

      // ===================================================================
      // SUITE 2: Case-Insensitivity, Percent-Encoding & Query/Hash Permutations
      // ===================================================================
      try {
        const testZip = new JSZip();

        // 1. Target with literal %20 in zip entry name (per prompt specification)
        testZip.file('OEBPS/Images/Cover Photo%20(1).JPG', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]));
        // 2. Target with literal space in zip entry name
        testZip.file('OEBPS/Images/Normal Cover (1).jpg', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]));
        // 3. Target chapter
        testZip.file('OEBPS/text/ch01.xhtml', '<html><body>Chapter 1</body></html>');

        // Test splitUri & resolveUri with query and hash permutations
        const uri1 = PathResolver.resolveUri('OEBPS/text/ch01.xhtml', '../Images/Cover Photo%20(1).JPG?v=1.0#cover-fig');
        assert(uri1.hash === 'cover-fig', `resolveUri hash mismatch: got "${uri1.hash}"`);
        assert(uri1.query === 'v=1.0', `resolveUri query mismatch: got "${uri1.query}"`);
        assert(uri1.fullPath === 'OEBPS/Images/Cover Photo (1).JPG', `resolveUri fullPath decoded mismatch: got "${uri1.fullPath}"`);

        const uri2 = PathResolver.resolveUri('OEBPS/text/ch01.xhtml', '../Images/Cover%20Photo%20(1).JPG?rev=2.1&cache=0#sec%201');
        assert(uri2.hash === 'sec 1', `resolveUri percent-decoded hash mismatch: got "${uri2.hash}"`);
        assert(uri2.query === 'rev=2.1&cache=0', `resolveUri query mismatch: got "${uri2.query}"`);

        // Case-insensitivity lookup on literal space zip entry
        assert(PathResolver.findZipEntry(testZip, 'OEBPS/Images/Normal Cover (1).jpg') !== null, 'Exact lookup failed');
        assert(PathResolver.findZipEntry(testZip, 'oebps/images/normal cover (1).jpg') !== null, 'Lowercase lookup failed');
        assert(PathResolver.findZipEntry(testZip, 'OEBPS/IMAGES/NORMAL COVER (1).JPG') !== null, 'Uppercase lookup failed');
        assert(PathResolver.findZipEntry(testZip, 'OEBPS/Images/Normal%20Cover%20(1).jpg') !== null, 'Percent lookup for space zip entry failed');
        assert(PathResolver.findZipEntry(testZip, 'oebps/images/normal%20cover%20(1).jpg') !== null, 'Lowercase percent lookup for space zip entry failed');

        // Case-insensitivity lookup on literal %20 zip entry
        // Target in ZIP: "OEBPS/Images/Cover Photo%20(1).JPG"
        const exactMatch = PathResolver.findZipEntry(testZip, 'OEBPS/Images/Cover Photo%20(1).JPG');
        assert(exactMatch !== null, 'Exact lookup of literal %20 zip entry failed');

        const lowerMatch = PathResolver.findZipEntry(testZip, 'oebps/images/cover photo%20(1).jpg');
        assert(lowerMatch !== null, 'Lowercase lookup of literal %20 zip entry failed');

        // Lookups via decoded path (which is what resolvePath produces from HTML hrefs)
        const decodedLookup = PathResolver.findZipEntry(testZip, 'OEBPS/Images/Cover Photo (1).JPG');
        const encodedFullLookup = PathResolver.findZipEntry(testZip, 'OEBPS/Images/Cover%20Photo%20(1).JPG');

        // Check if findZipEntry handles decoded lookup against %20 zip entry
        if (!decodedLookup || !encodedFullLookup) {
          recordFinding(
            'PathResolver',
            'MEDIUM',
            'findZipEntry asymmetry when ZIP entry filename contains literal percent sequences',
            `When a ZIP entry is named "OEBPS/Images/Cover Photo%20(1).JPG", looking it up via the decoded path produced by resolvePath ("OEBPS/Images/Cover Photo (1).JPG") returns null. In findZipEntry step 5 (case-insensitive loop), safeDecodeURIComponent is not applied to archive keys, preventing decoded/mixed-encoded paths from matching percent-encoded ZIP entry names.`,
            `If an EPUB contains archive files with literal percent encoding in their ZIP catalog and chapters reference them via standard URL-encoded hrefs, AssetExtractor may fail to locate the asset in the archive.`
          );
        }

        recordTest('Suite 2: Case & Encoding Stress', 'Query, Hash & Dual-Encoding Permutations', true, `Literal space lookup: 5/5 ok; Literal %20 zip entry: exact & lower match ok`);
      } catch (err) {
        recordTest('Suite 2: Case & Encoding Stress', 'Query, Hash & Dual-Encoding Permutations', false, err.message);
      }

      // ===================================================================
      // SUITE 3: Malformed OPF Stress & Graceful Fallbacks
      // ===================================================================
      try {
        let opfSubTests = 0;

        // 3.1: Missing <metadata>
        const opfNoMeta = `
          <package version="2.0">
            <manifest>
              <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
            </manifest>
            <spine>
              <itemref idref="c1"/>
            </spine>
          </package>
        `;
        const resNoMeta = OpfParser.parseOpf(opfNoMeta, 'content.opf');
        assert(resNoMeta.metadata.title === 'Untitled Book', `Missing metadata title fallback failed: got "${resNoMeta.metadata.title}"`);
        assert(resNoMeta.metadata.author === 'Unknown Author', `Missing metadata author fallback failed: got "${resNoMeta.metadata.author}"`);
        assert(resNoMeta.spine.length === 1, `Missing metadata spine extraction failed`);
        opfSubTests++;

        // 3.2: Missing <manifest>
        const opfNoManifest = `
          <package version="2.0">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Orphan Book</dc:title>
            </metadata>
            <spine></spine>
          </package>
        `;
        const resNoManifest = OpfParser.parseOpf(opfNoManifest, 'content.opf');
        assert(resNoManifest.metadata.title === 'Orphan Book', `Title extraction failed`);
        assert(resNoManifest.manifest.size === 0, `Manifest should be empty Map`);
        assert(resNoManifest.spine.length === 0, `Spine should be empty Array`);
        opfSubTests++;

        // 3.3: Missing <spine> (should synthesize spine from manifest XHTML items)
        const opfNoSpine = `
          <package version="2.0">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Spine-less Book</dc:title>
            </metadata>
            <manifest>
              <item id="ch1" href="text/ch01.xhtml" media-type="application/xhtml+xml"/>
              <item id="ch2" href="text/ch02.xhtml" media-type="application/xhtml+xml"/>
              <item id="css" href="style.css" media-type="text/css"/>
            </manifest>
          </package>
        `;
        const resNoSpine = OpfParser.parseOpf(opfNoSpine, 'content.opf');
        assert(resNoSpine.spine.length === 2, `Synthetic spine fallback failed: expected 2 chapters, got ${resNoSpine.spine.length}`);
        assert(resNoSpine.spine[0].id === 'ch1' && resNoSpine.spine[1].id === 'ch2', `Synthetic spine order mismatch`);
        opfSubTests++;

        // 3.4: Empty & Whitespace-only Titles
        const opfEmptyTitle1 = `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title></dc:title></metadata></package>`;
        const opfEmptyTitle2 = `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>   \t\n   </dc:title></metadata></package>`;
        const opfEmptyTitle3 = `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><title/></metadata></package>`;
        assert(OpfParser.parseOpf(opfEmptyTitle1, 'content.opf').metadata.title === 'Untitled Book', 'Empty title 1 fallback failed');
        assert(OpfParser.parseOpf(opfEmptyTitle2, 'content.opf').metadata.title === 'Untitled Book', 'Whitespace title 2 fallback failed');
        assert(OpfParser.parseOpf(opfEmptyTitle3, 'content.opf').metadata.title === 'Untitled Book', 'Self-closing title 3 fallback failed');
        opfSubTests++;

        // 3.5: Unknown & Nested XML Namespaces
        const opfCustomNs = `
          <custom:package xmlns:custom="http://example.com/ns" xmlns:calibre="http://calibre.kovidgoyal.net/2009/metadata" xmlns:dc="http://purl.org/dc/elements/1.1/">
            <custom:metadata>
              <dc:title>The Cosmic Odyssey</dc:title>
              <dc:creator>Arthur C. Clarke</dc:creator>
              <calibre:series>Space Series</calibre:series>
              <calibre:rating>5</calibre:rating>
              <custom:editor>Jane Doe</custom:editor>
            </custom:metadata>
            <custom:manifest>
              <custom:item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
            </custom:manifest>
            <custom:spine>
              <custom:itemref idref="c1"/>
            </custom:spine>
          </custom:package>
        `;
        const resCustomNs = OpfParser.parseOpf(opfCustomNs, 'content.opf');
        assert(resCustomNs.metadata.title === 'The Cosmic Odyssey', 'Custom NS title extraction failed');
        assert(resCustomNs.metadata.author === 'Arthur C. Clarke', 'Custom NS creator extraction failed');
        assert(resCustomNs.spine.length === 1, 'Custom NS spine extraction failed');
        opfSubTests++;

        // 3.6: Unclosed Tags & Malformed XML (HTML5 Recovery Fallback)
        const opfUnclosed = `
          <package version="2.0">
            <metadata>
              <title>Resilient Title
              <creator>Resilient Author
            </metadata>
            <manifest>
              <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml">
            </manifest>
            <spine>
              <itemref idref="c1">
            </spine>
          </package>
        `;
        const resUnclosed = OpfParser.parseOpf(opfUnclosed, 'content.opf');
        assert(resUnclosed.metadata.title !== '', 'Unclosed tag title recovery failed');
        opfSubTests++;

        // 3.7: HTML5 Fallback Mode with Namespaced Prefixes (<dc:title>)
        // Note: When XML parser fails due to undeclared namespace prefix (e.g. dc without xmlns:dc),
        // text/html creates elements with localName === 'dc:title'.
        const opfUndeclaredPrefix = `
          <package>
            <metadata>
              <dc:title>Undeclared Prefix Book</dc:title>
              <dc:creator>Anonymous Author</dc:creator>
            </metadata>
          </package>
        `;
        const resUndeclared = OpfParser.parseOpf(opfUndeclaredPrefix, 'content.opf');
        if (resUndeclared.metadata.title === 'Untitled Book') {
          recordFinding(
            'OpfParser',
            'LOW',
            'HTML5 parser fallback does not match prefixed tags (<dc:title>) when xmlns:dc is omitted',
            `When an OPF uses <dc:title> without declaring xmlns:dc, the XML DOMParser throws a namespace error and triggers the text/html fallback. In text/html mode, Chrome sets node.localName to "dc:title". In getMetaText(), line 55 evaluates (node.localName || node.nodeName.split(':').pop()), which returns "dc:title" instead of splitting off the prefix, causing the comparison nodeLocal === 'title' to fail and title to fall back to "Untitled Book".`,
            `OPF files with malformed or missing namespace declarations lose their metadata and fall back to "Untitled Book".`
          );
        }
        opfSubTests++;

        recordTest('Suite 3: Malformed OPF Stress', 'Resilience across Missing Sections, Namespaces & Malformations', true, `${opfSubTests} malformed variations verified`);
      } catch (err) {
        recordTest('Suite 3: Malformed OPF Stress', 'Resilience across Missing Sections, Namespaces & Malformations', false, err.message);
      }

      // ===================================================================
      // SUITE 4: Corrupted Archive Fast Magic-Byte Rejection
      // ===================================================================
      try {
        const rejectionInputs = [
          { name: 'null input', val: null, expectError: 'TypeError' },
          { name: 'undefined input', val: undefined, expectError: 'TypeError' },
          { name: 'number input', val: 12345, expectError: 'TypeError' },
          { name: 'string input', val: 'not a buffer', expectError: 'TypeError' },
          { name: 'empty Uint8Array', val: new Uint8Array(0), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: '1-byte buffer [0x50]', val: new Uint8Array([0x50]), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: '2-byte wrong buffer [0x00, 0x00]', val: new Uint8Array([0x00, 0x00]), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: 'text string bytes', val: new TextEncoder().encode('Hello Plain Text File'), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: 'PDF magic bytes %PDF', val: new Uint8Array([0x25, 0x50, 0x44, 0x46]), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: 'GZIP magic bytes', val: new Uint8Array([0x1F, 0x8B, 0x08, 0x00]), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: 'Corrupt ZIP payload (valid PK.. header + random bytes)', val: new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0xDE, 0xAD, 0xBE, 0xEF]), expectError: 'Error', match: /Corrupted zip|Failed to open EPUB/i },
          { name: 'Blob with bad magic bytes', val: new Blob(['Plain text in blob'], { type: 'application/epub+zip' }), expectError: 'Error', match: /not a valid ZIP archive/i },
          { name: 'ArrayBuffer with bad magic bytes', val: new Uint8Array([0x01, 0x02, 0x03, 0x04]).buffer, expectError: 'Error', match: /not a valid ZIP archive/i }
        ];

        for (const input of rejectionInputs) {
          let threw = false;
          let thrownType = '';
          let thrownMsg = '';

          try {
            await EpubParser.parse(input.val);
          } catch (e) {
            threw = true;
            thrownType = e.constructor.name;
            thrownMsg = e.message;
          }

          assert(threw, `Expected rejection for "${input.name}", but EpubParser.parse succeeded!`);
          assert(thrownType === input.expectError, `Expected ${input.expectError} for "${input.name}", but got ${thrownType}: "${thrownMsg}"`);
          if (input.match) {
            assert(input.match.test(thrownMsg), `Error message for "${input.name}" did not match expected pattern: "${thrownMsg}"`);
          }
        }

        recordTest('Suite 4: Corrupted Archive Rejection', 'Fast Magic-Byte Validation (0x50, 0x4B) & Graceful Error Handling', true, `${rejectionInputs.length}/${rejectionInputs.length} rejection vectors verified`);
      } catch (err) {
        recordTest('Suite 4: Corrupted Archive Rejection', 'Fast Magic-Byte Validation (0x50, 0x4B) & Graceful Error Handling', false, err.message);
      }

      // ===================================================================
      // SUITE 5: 4-Step Cover Resolution Cascade Stress
      // ===================================================================
      try {
        let cascadeSubTests = 0;

        // Cascade Priority 1: Step 1 (properties="cover-image") beats all other steps
        const opfP1 = `
          <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Priority 1</dc:title>
              <meta name="cover" content="step2-cover"/>
            </metadata>
            <manifest>
              <item id="step1-cover" href="covers/step1.jpg" media-type="image/jpeg" properties="cover-image"/>
              <item id="step2-cover" href="covers/step2.jpg" media-type="image/jpeg"/>
              <item id="cover-image" href="covers/step3.jpg" media-type="image/jpeg"/>
              <item id="misc-cover" href="covers/any-cover.png" media-type="image/png"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resP1 = OpfParser.parseOpf(opfP1, 'content.opf');
        assert(resP1.coverItem && resP1.coverItem.id === 'step1-cover', `Step 1 priority failed: got "${resP1.coverItem?.id}"`);
        cascadeSubTests++;

        // Cascade Priority 2: Step 2 (<meta name="cover">) beats Steps 3 & 4
        const opfP2 = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Priority 2</dc:title>
              <meta name="cover" content="step2-cover"/>
            </metadata>
            <manifest>
              <item id="step2-cover" href="covers/step2.jpg" media-type="image/jpeg"/>
              <item id="cover-image" href="covers/step3.jpg" media-type="image/jpeg"/>
              <item id="misc-cover" href="covers/any-cover.png" media-type="image/png"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resP2 = OpfParser.parseOpf(opfP2, 'content.opf');
        assert(resP2.coverItem && resP2.coverItem.id === 'step2-cover', `Step 2 priority failed: got "${resP2.coverItem?.id}"`);
        cascadeSubTests++;

        // Cascade Priority 3A: Step 3 (id="cover-image") beats Step 4
        const opfP3A = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Priority 3A</dc:title>
            </metadata>
            <manifest>
              <item id="cover-image" href="covers/step3a.jpg" media-type="image/jpeg"/>
              <item id="cover" href="covers/step3b.jpg" media-type="image/jpeg"/>
              <item id="misc-cover" href="covers/any-cover.png" media-type="image/png"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resP3A = OpfParser.parseOpf(opfP3A, 'content.opf');
        assert(resP3A.coverItem && resP3A.coverItem.id === 'cover-image', `Step 3A priority failed: got "${resP3A.coverItem?.id}"`);
        cascadeSubTests++;

        // Cascade Priority 3B: Step 3 (id="cover") beats Step 4
        const opfP3B = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Priority 3B</dc:title>
            </metadata>
            <manifest>
              <item id="cover" href="covers/step3b.jpg" media-type="image/jpeg"/>
              <item id="misc-cover" href="covers/any-cover.png" media-type="image/png"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resP3B = OpfParser.parseOpf(opfP3B, 'content.opf');
        assert(resP3B.coverItem && resP3B.coverItem.id === 'cover', `Step 3B priority failed: got "${resP3B.coverItem?.id}"`);
        cascadeSubTests++;

        // Cascade Priority 4: Step 4 (first image item containing 'cover' in href or id)
        const opfP4 = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Priority 4</dc:title>
            </metadata>
            <manifest>
              <item id="illus-1" href="images/illustration.png" media-type="image/png"/>
              <item id="jacket-art" href="assets/book-cover-final.webp" media-type="image/webp"/>
              <item id="illus-2" href="images/map.png" media-type="image/png"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resP4 = OpfParser.parseOpf(opfP4, 'content.opf');
        assert(resP4.coverItem && resP4.coverItem.id === 'jacket-art', `Step 4 priority failed: got "${resP4.coverItem?.id}"`);
        cascadeSubTests++;

        // Non-Image Rejection: Step 1 points to XHTML document -> must fall through to Step 2
        const opfRej1 = `
          <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Rejection 1</dc:title>
              <meta name="cover" content="real-image"/>
            </metadata>
            <manifest>
              <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml" properties="cover-image"/>
              <item id="real-image" href="cover.jpg" media-type="image/jpeg"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resRej1 = OpfParser.parseOpf(opfRej1, 'content.opf');
        assert(resRej1.coverItem && resRej1.coverItem.id === 'real-image', `Non-image rejection in Step 1 failed: got "${resRej1.coverItem?.id}"`);
        cascadeSubTests++;

        // Non-Image Rejection: Step 2 points to XHTML document -> must fall through to Step 3
        const opfRej2 = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Rejection 2</dc:title>
              <meta name="cover" content="cover-page"/>
            </metadata>
            <manifest>
              <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>
              <item id="cover-image" href="cover.png" media-type="image/png"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resRej2 = OpfParser.parseOpf(opfRej2, 'content.opf');
        assert(resRej2.coverItem && resRej2.coverItem.id === 'cover-image', `Non-image rejection in Step 2 failed: got "${resRej2.coverItem?.id}"`);
        cascadeSubTests++;

        // Non-Image Rejection: Step 3 points to XHTML -> must fall through to Step 4
        const opfRej3 = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>Rejection 3</dc:title>
            </metadata>
            <manifest>
              <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
              <item id="img-fallback" href="images/front_cover.avif" media-type="image/avif"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resRej3 = OpfParser.parseOpf(opfRej3, 'content.opf');
        assert(resRej3.coverItem && resRej3.coverItem.id === 'img-fallback', `Non-image rejection in Step 3 failed: got "${resRej3.coverItem?.id}"`);
        cascadeSubTests++;

        // Zero Cover Case: Manifest has zero images -> coverItem is null
        const opfZero = `
          <package version="2.0" xmlns="http://www.idpf.org/2007/opf">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:title>No Cover Book</dc:title>
            </metadata>
            <manifest>
              <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
            </manifest>
            <spine></spine>
          </package>
        `;
        const resZero = OpfParser.parseOpf(opfZero, 'content.opf');
        assert(resZero.coverItem === null, 'Zero cover case failed: coverItem should be null');
        cascadeSubTests++;

        recordTest('Suite 5: 4-Step Cover Cascade', 'Priority Hierarchy & Non-Image Rejection', true, `${cascadeSubTests} cascade variations verified with 100% precision`);
      } catch (err) {
        recordTest('Suite 5: 4-Step Cover Cascade', 'Priority Hierarchy & Non-Image Rejection', false, err.message);
      }

      return { results, findings };
    }, serverUrl);

    console.log('\n--- Challenge Test Suite Execution Results ---');
    let allPassed = true;
    for (const r of suiteResults.results) {
      const mark = r.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${mark}: [${r.suite}] ${r.testName}${r.detail ? ' (' + r.detail + ')' : ''}`);
      if (!r.passed) allPassed = false;
    }

    if (suiteResults.findings.length > 0) {
      console.log('\n--- Adversarial Findings Discovered ---');
      for (const f of suiteResults.findings) {
        console.log(`  🔍 [${f.severity}] [${f.category}] ${f.title}`);
        console.log(`     Observation: ${f.observation}`);
        console.log(`     Impact:      ${f.impact}`);
      }
    }

    console.log('====================================================================');
    console.log(`Execution Summary: ${suiteResults.results.filter(r => r.passed).length} / ${suiteResults.results.length} test suites passed.`);
    console.log(`Findings Recorded: ${suiteResults.findings.length}`);
    console.log('====================================================================');

    return { allPassed, suiteResults };
  } finally {
    await browser.close();
    closeServer();
  }
}

// Self-executing runner
if (require.main === module) {
  runChallengeHarness().then(({ allPassed }) => {
    process.exit(allPassed ? 0 : 1);
  }).catch(err => {
    console.error('Fatal challenge harness failure:', err);
    process.exit(1);
  });
}

module.exports = { runChallengeHarness };
