/**
 * .agents/teamwork/m2_r2_auditor_1/independent_audit_m2_r2.js
 * Independent Forensic Audit Test Runner for Milestone 2 (Iteration 2 Remediation):
 * EPUB 2/3 Parser, Asset Extractor & Security Sandbox
 *
 * Verifies:
 * 1. Node-level unit checks for PathResolver logic, Zip Slip defense, and findZipEntry symmetric key matching.
 * 2. Headless Chrome runtime validation of all 5 parser modules.
 * 3. Specific validation of Iteration 2 remediations:
 *    - Remediation 1: findZipEntry percent-decoded & encoded archive key symmetry.
 *    - Remediation 2: OpfParser prefix splitting in HTML5 mode & container-scoped manifest/spine item extraction.
 *    - Remediation 3: AssetExtractor / DOMSanitizer Defense Layer 1: complete stripping of iframe, frame, frameset,
 *      form neutralization, and elimination of all inline on* handlers.
 * 4. Dynamic anti-cheating challenge: random UUID metadata, dynamic spine, and dynamic chapter content.
 * 5. Genuine parsing of fixtures (valid-sample, empty-title, corrupted, programmatic sample-book-001).
 * 6. Full lifecycle cleanup & Blob URL revocation verification.
 */

const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');
const { buildAllFixtures } = require('../../../test/test-fixtures/generate-fixtures.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function runIndependentAudit() {
  console.log('========================================================================');
  console.log('  FORENSIC INTEGRITY AUDIT: Milestone 2 Remediation (Iteration 2)      ');
  console.log('========================================================================');

  // Build any missing fixtures first
  buildAllFixtures();

  const auditLog = [];
  let integrityClean = true;

  function reportCheck(suite, checkName, passed, evidence = '') {
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}: [${suite}] ${checkName}`);
    if (evidence) {
      console.log(`         Evidence: ${evidence}`);
    }
    auditLog.push({ suite, checkName, passed, evidence });
    if (!passed) integrityClean = false;
  }

  // -------------------------------------------------------------------------
  // Part 1: Node-level Pure Logic Audit of PathResolver & findZipEntry
  // -------------------------------------------------------------------------
  console.log('\n--- Phase 1: Node-level PathResolver & Key Matching Checks ---');
  try {
    const pathResolverModule = await import(path.join(PROJECT_ROOT, 'js/parser/path-resolver.js'));
    const { PathResolver } = pathResolverModule;

    // Test 1: Normalize & Zip-Slip defense
    const norm1 = PathResolver.normalizePath('OEBPS/text/../../styles/main.css');
    const normSlip = PathResolver.normalizePath('../../../../../../etc/passwd');
    const normWin = PathResolver.normalizePath('OEBPS\\text\\chapter1.xhtml');
    const passNorm = norm1 === 'styles/main.css' && normSlip === 'etc/passwd' && normWin === 'OEBPS/text/chapter1.xhtml';
    reportCheck('PathResolver', 'Normalize & Zip-Slip containment', passNorm, `norm1=${norm1}, normSlip=${normSlip}, normWin=${normWin}`);

    // Test 2: URI Splitting and safe decoding
    const uri1 = PathResolver.splitUri('folder/sub%20dir/page.xhtml?ver=1.2#heading-3');
    const passUri = uri1.path === 'folder/sub%20dir/page.xhtml' && uri1.query === 'ver=1.2' && uri1.hash === 'heading-3';
    const dec1 = PathResolver.safeDecodeURIComponent('hello%20world');
    const decMalformed = PathResolver.safeDecodeURIComponent('broken%zzseq');
    const passDec = dec1 === 'hello world' && decMalformed === 'broken%zzseq';
    reportCheck('PathResolver', 'URI splitting & malformed URI safe-decode', passUri && passDec, `uri1=${JSON.stringify(uri1)}, dec1=${dec1}`);

    // Test 3: External URL detection
    const isExt1 = PathResolver.isExternalUrl('https://example.com/image.png');
    const isExt2 = PathResolver.isExternalUrl('//cdn.jsdelivr.net/script.js');
    const isExt3 = PathResolver.isExternalUrl('data:image/svg+xml;base64,...');
    const isExt4 = PathResolver.isExternalUrl('blob:http://localhost:3000/123');
    const isExt5 = PathResolver.isExternalUrl('#local-anchor');
    const isInt1 = PathResolver.isExternalUrl('images/cover.jpg');
    const isInt2 = PathResolver.isExternalUrl('../styles/main.css');
    const passExt = isExt1 && isExt2 && isExt3 && isExt4 && isExt5 && !isInt1 && !isInt2;
    reportCheck('PathResolver', 'External & Absolute URL detection', passExt, `isExt1=${isExt1}, isInt1=${isInt1}`);

    // Test 4: Relative path resolution against file and directory
    const resFile = PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../images/fig1.png');
    const resDir = PathResolver.resolvePath('OEBPS/text', '../images/fig1.png', true);
    const passRes = resFile === 'OEBPS/images/fig1.png' && resDir === 'OEBPS/images/fig1.png';
    reportCheck('PathResolver', 'Relative path resolution (file vs dir base)', passRes, `resFile=${resFile}, resDir=${resDir}`);

    // Test 5: Remediation 1: Symmetric percent-encoding & case-insensitive matching in findZipEntry
    const mockZipFiles = {
      'OEBPS/images/Cover%20Photo.jpg': { name: 'OEBPS/images/Cover%20Photo.jpg' },
      'OEBPS/text/Chapter%201.xhtml': { name: 'OEBPS/text/Chapter%201.xhtml' },
      'OEBPS\\styles\\main.css': { name: 'OEBPS\\styles\\main.css' },
      'OEBPS/plain name.xhtml': { name: 'OEBPS/plain name.xhtml' }
    };
    const mockZip = {
      files: mockZipFiles,
      file: (name) => mockZipFiles[name] || null
    };

    // Query with decoded space path against percent-encoded archive key
    const matchDecodedQuery = PathResolver.findZipEntry(mockZip, 'OEBPS/images/Cover Photo.jpg');
    // Query with lower-case decoded space path
    const matchLowerQuery = PathResolver.findZipEntry(mockZip, 'oebps/images/cover photo.jpg');
    // Query with encoded path against space-separated archive key
    const matchEncodedAgainstPlain = PathResolver.findZipEntry(mockZip, 'OEBPS/plain%20name.xhtml');
    // Query with forward slash against backslash archive key
    const matchSlashAgainstBackslash = PathResolver.findZipEntry(mockZip, 'OEBPS/styles/main.css');

    const passRemediation1 = (
      matchDecodedQuery?.name === 'OEBPS/images/Cover%20Photo.jpg' &&
      matchLowerQuery?.name === 'OEBPS/images/Cover%20Photo.jpg' &&
      matchEncodedAgainstPlain?.name === 'OEBPS/plain name.xhtml' &&
      matchSlashAgainstBackslash?.name === 'OEBPS\\styles\\main.css'
    );
    reportCheck(
      'PathResolver',
      'Remediation 1: findZipEntry symmetric percent-decode and key normalization',
      passRemediation1,
      `matchDecoded=${matchDecodedQuery?.name}, matchLower=${matchLowerQuery?.name}, matchEncoded=${matchEncodedAgainstPlain?.name}, matchSlash=${matchSlashAgainstBackslash?.name}`
    );
  } catch (err) {
    reportCheck('PathResolver', 'Node-level execution error', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Part 2: Headless Google Chrome In-Browser Full Runtime Audit
  // -------------------------------------------------------------------------
  console.log('\n--- Phase 2: Headless Chrome In-Browser Full Runtime Audit ---');
  let serverInfo = null;
  let browser = null;

  try {
    serverInfo = await startServer({ port: 0, autoPortFallback: true });
    console.log(`[audit-runner] Test server started at ${serverInfo.url}`);

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`  [browser-console-error] ${msg.text()}`);
      }
    });

    // Navigate to index.html to load vendor/jszip.min.js and established origin
    await page.goto(`${serverInfo.url}/index.html`, { waitUntil: 'domcontentloaded' });

    // Run in-browser forensic verification
    const browserAuditResults = await page.evaluate(async (serverUrl) => {
      const results = [];

      function assert(cond, msg) {
        if (!cond) throw new Error(msg);
      }

      // Import parser modules
      const { PathResolver } = await import('/js/parser/path-resolver.js');
      const { OpfParser, getNodeLocalName, findElementByLocal, findElementsByLocal, getMetaText, getAllMetaText } = await import('/js/parser/opf-parser.js');
      const { TocParser, splitHrefAnchor, sanitizeXmlEntities } = await import('/js/parser/toc-parser.js');
      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { EpubParser, validateZipMagicBytes } = await import('/js/parser/epub-parser.js');
      const { generateSampleEpub, SAMPLE_BOOK_METADATA } = await import('/js/sample-book.js');

      // ---------------------------------------------------------------------
      // 1. OpfParser Forensic Checks & Remediation 2 Verification
      // ---------------------------------------------------------------------
      try {
        // 1a. Namespaces with custom prefixes and multiple authors
        const complexOpfXml = `<?xml version="1.0" encoding="utf-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
            <dc:title>Forensic Audit Book</dc:title>
            <dc:creator id="c1">First Author</dc:creator>
            <dc:creator id="c2">Second Author</dc:creator>
            <dc:identifier id="pub-id">urn:uuid:12345-67890</dc:identifier>
            <dc:language>en-US</dc:language>
            <dc:description>Forensic verification test</dc:description>
          </metadata>
          <manifest>
            <item id="c1" href="cover.png" media-type="image/png" properties="cover-image"/>
            <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
          </manifest>
          <spine>
            <itemref idref="ch1"/>
          </spine>
        </package>`;

        const parsedOpf = OpfParser.parseOpf(complexOpfXml, 'OEBPS/content.opf');
        assert(parsedOpf.metadata.title === 'Forensic Audit Book', 'Title parsing failed');
        assert(parsedOpf.metadata.author === 'First Author, Second Author', 'Multiple creators failed');
        assert(parsedOpf.metadata.identifier === 'urn:uuid:12345-67890', 'Identifier failed');
        assert(parsedOpf.coverItem && parsedOpf.coverItem.id === 'c1', 'EPUB 3 cover-image property failed');
        assert(parsedOpf.spine.length === 1 && parsedOpf.spine[0].isLinear === true, 'Spine linear failed');

        // 1b. Cover Cascade Isolation: Test all 4 cascade tiers
        // Tier 2: <meta name="cover" content="cov2">
        const tier2Xml = `
        <package version="2.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>T2</dc:title>
            <meta name="cover" content="cov2"/>
          </metadata>
          <manifest>
            <item id="cov2" href="my-cover.jpg" media-type="image/jpeg"/>
          </manifest>
          <spine><itemref idref="cov2"/></spine>
        </package>`;
        const parsedT2 = OpfParser.parseOpf(tier2Xml, 'content.opf');
        assert(parsedT2.coverItem && parsedT2.coverItem.id === 'cov2', 'Cover cascade Tier 2 failed');

        // Tier 3: id="cover-image" or id="cover"
        const tier3Xml = `
        <package version="2.0">
          <metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">T3</dc:title></metadata>
          <manifest>
            <item id="cover-image" href="jacket.png" media-type="image/png"/>
          </manifest>
          <spine/>
        </package>`;
        const parsedT3 = OpfParser.parseOpf(tier3Xml, 'content.opf');
        assert(parsedT3.coverItem && parsedT3.coverItem.id === 'cover-image', 'Cover cascade Tier 3 failed');

        // Tier 4: filename contains cover
        const tier4Xml = `
        <package version="2.0">
          <metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">T4</dc:title></metadata>
          <manifest>
            <item id="img_01" href="images/front_cover_art.webp" media-type="image/webp"/>
          </manifest>
          <spine/>
        </package>`;
        const parsedT4 = OpfParser.parseOpf(tier4Xml, 'content.opf');
        assert(parsedT4.coverItem && parsedT4.coverItem.id === 'img_01', 'Cover cascade Tier 4 failed');

        // Tier 5: No cover -> null
        const tier5Xml = `
        <package version="2.0">
          <metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">T5</dc:title></metadata>
          <manifest><item id="t" href="ch.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="t"/></spine>
        </package>`;
        const parsedT5 = OpfParser.parseOpf(tier5Xml, 'content.opf');
        assert(parsedT5.coverItem === null, 'Cover cascade Tier 5 non-null');

        // 1c. Remediation 2 Verification: HTML5 DOMParser fallback with undeclared colon prefixes & self-closing tags
        // In text/html parsing, <dc:title> receives node.localName === 'dc:title' and self-closing <item/> can nest
        const malformedHtml5Opf = `
        <package version="2.0">
          <metadata>
            <dc:title>Unprefixed DC Namespace Title</dc:title>
            <dc:creator>Undeclared Creator</dc:creator>
            <dc:identifier>ID-HTML5-TEST</dc:identifier>
          </metadata>
          <manifest>
            <item id="i1" href="c1.xhtml" media-type="application/xhtml+xml"/>
            <item id="i2" href="c2.xhtml" media-type="application/xhtml+xml"/>
            <item id="i3" href="c3.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="i1"/>
            <itemref idref="i2"/>
            <itemref idref="i3"/>
          </spine>
        </package>`;

        // Parse intentionally with HTML parser
        const htmlDoc = new DOMParser().parseFromString(malformedHtml5Opf, 'text/html');
        const extractedTitle = getMetaText(htmlDoc, 'title');
        const extractedCreator = getMetaText(htmlDoc, 'creator');
        const extractedId = getMetaText(htmlDoc, 'identifier');
        const extractedManifestItems = findElementsByLocal(findElementByLocal(htmlDoc, 'manifest'), 'item');
        const extractedSpineItems = findElementsByLocal(findElementByLocal(htmlDoc, 'spine'), 'itemref');

        assert(extractedTitle === 'Unprefixed DC Namespace Title', `Remediation 2 HTML5 title failed: got "${extractedTitle}"`);
        assert(extractedCreator === 'Undeclared Creator', `Remediation 2 HTML5 creator failed: got "${extractedCreator}"`);
        assert(extractedId === 'ID-HTML5-TEST', `Remediation 2 HTML5 identifier failed: got "${extractedId}"`);
        assert(extractedManifestItems.length === 3, `Remediation 2 manifest items dropped: expected 3, got ${extractedManifestItems.length}`);
        assert(extractedSpineItems.length === 3, `Remediation 2 spine items dropped: expected 3, got ${extractedSpineItems.length}`);

        results.push({
          suite: 'OpfParser',
          check: 'Metadata extraction, 4-step cover cascade & Remediation 2 HTML5 fallback prefix traversal',
          passed: true,
          evidence: 'All 4 cascade tiers verified; HTML5 dc:title and 3/3 manifest/spine items cleanly extracted'
        });
      } catch (err) {
        results.push({
          suite: 'OpfParser',
          check: 'Metadata extraction, 4-step cover cascade & Remediation 2 HTML5 fallback prefix traversal',
          passed: false,
          evidence: err.message
        });
      }

      // ---------------------------------------------------------------------
      // 2. TocParser Forensic Checks
      // ---------------------------------------------------------------------
      try {
        // 2a. EPUB 3 Nav Doc with nested hierarchy and landmark exclusion
        const navHtml = `
        <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body>
          <nav epub:type="landmarks">
            <ol><li><a href="cover.xhtml">Cover</a></li></ol>
          </nav>
          <nav epub:type="toc" id="toc">
            <h1>Contents</h1>
            <ol>
              <li>
                <a href="text/ch1.xhtml">Chapter 1: The Beginning</a>
                <ol>
                  <li><a href="text/ch1.xhtml#sec1_1">Section 1.1</a></li>
                </ol>
              </li>
              <li>
                <span>Chapter 2 (Span Title)</span>
                <ol>
                  <li><a href="text/ch2.xhtml#partA">Part A</a></li>
                </ol>
              </li>
            </ol>
          </nav>
        </body>
        </html>`;

        const tocFromNav = TocParser.parseNavDocument(navHtml, 'OEBPS/nav.xhtml');
        assert(tocFromNav.length === 2, `Expected 2 top items, got ${tocFromNav.length}`);
        assert(tocFromNav[0].title === 'Chapter 1: The Beginning', 'Ch1 title failed');
        assert(tocFromNav[0].fullPath === 'OEBPS/text/ch1.xhtml', 'Ch1 fullPath failed');
        assert(tocFromNav[0].children.length === 1, 'Ch1 nested children failed');
        assert(tocFromNav[0].children[0].hash === 'sec1_1', 'Ch1 child hash failed');
        assert(tocFromNav[1].title === 'Chapter 2 (Span Title)', 'Ch2 span title failed');

        // 2b. EPUB 2 NCX with bare unescaped ampersands and namespaces
        const ncxXml = `<?xml version="1.0" encoding="utf-8"?>
        <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
          <navMap>
            <navPoint id="p1" playOrder="1">
              <navLabel><text>Science & Technology & Art</text></navLabel>
              <content src="text/ch1.xhtml"/>
              <navPoint id="p1_1" playOrder="2">
                <navLabel><text>Sub-Chapter A</text></navLabel>
                <content src="text/ch1.xhtml#sub-a"/>
              </navPoint>
            </navPoint>
          </navMap>
        </ncx>`;

        const tocFromNcx = TocParser.parseNcxDocument(ncxXml, 'OEBPS/toc.ncx');
        assert(tocFromNcx.length === 1, 'NCX top item count failed');
        assert(tocFromNcx[0].title === 'Science & Technology & Art', 'NCX bare & entity failed');
        assert(tocFromNcx[0].playOrder === 1, 'NCX playOrder failed');
        assert(tocFromNcx[0].children.length === 1, 'NCX nested navpoint failed');
        assert(tocFromNcx[0].children[0].hash === 'sub-a', 'NCX child hash failed');

        // 2c. Utilities: flatten and findItem
        const flat = TocParser.flatten(tocFromNav);
        assert(flat.length === 4, `Flatten length expected 4, got ${flat.length}`);
        assert(flat[0].depth === 0 && flat[1].depth === 1, 'Flatten depths failed');

        const foundExact = TocParser.findItem(tocFromNav, 'OEBPS/text/ch1.xhtml', 'sec1_1');
        assert(foundExact && foundExact.id === flat[1].id, 'findItem exact match failed');

        results.push({
          suite: 'TocParser',
          check: 'EPUB 3 Nav, EPUB 2 NCX with bare ampersand & hierarchy',
          passed: true,
          evidence: '4 items flattened with depths 0 and 1; exact hash matching verified'
        });
      } catch (err) {
        results.push({
          suite: 'TocParser',
          check: 'EPUB 3 Nav, EPUB 2 NCX with bare ampersand & hierarchy',
          passed: false,
          evidence: err.message
        });
      }

      // ---------------------------------------------------------------------
      // 3. AssetExtractor & DOMSanitizer (Security Defense Layer 1 & Remediation 3)
      // ---------------------------------------------------------------------
      try {
        const dummyZip = new JSZip();
        dummyZip.file('OEBPS/images/cat.jpg', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]));
        dummyZip.file('OEBPS/styles/style.css', 'body { color: black; background: url("../images/cat.jpg"); }');
        dummyZip.file('OEBPS/text/ch01.xhtml', `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="../styles/style.css"/>
          <script>window.HACKED = true;</script>
        </head>
        <body onload="window.HACKED = true;">
          <!-- Remediation 3 targets: iframe, frame, frameset, forms, buttons with formaction -->
          <iframe src="https://malicious.example.com/embed"></iframe>
          <frame src="about:blank"></frame>
          <frameset><frame src="about:blank"></frameset>
          <form action="/steal" method="POST" target="_self">
            <input type="text" name="data"/>
            <button type="submit" formaction="/steal2" formmethod="POST" formtarget="_top">Submit</button>
            <input type="submit" formaction="/steal3"/>
          </form>
          <img src="../images/cat.jpg" onerror="alert(1)"/>
          <svg><image xlink:href="../images/cat.jpg"/></svg>
          <a href="javascript:alert('pwn')">Malicious link</a>
          <a href="ch02.xhtml#section-2">Next Chapter</a>
          <a href="https://example.com">External Link</a>
        </body>
        </html>`);

        const extractor = new AssetExtractor(dummyZip);
        const chapterDoc = await extractor.getChapterDocument('OEBPS/text/ch01.xhtml');

        // Security Assertions (Remediation 3 Defense Layer 1)
        assert(chapterDoc.querySelectorAll('iframe').length === 0, 'iframe element was NOT stripped!');
        assert(chapterDoc.querySelectorAll('frame').length === 0, 'frame element was NOT stripped!');
        assert(chapterDoc.querySelectorAll('frameset').length === 0, 'frameset element was NOT stripped!');
        assert(chapterDoc.querySelectorAll('script').length === 0, 'script element was NOT stripped!');
        assert(!chapterDoc.body.hasAttribute('onload'), 'onload handler was NOT stripped!');
        assert(chapterDoc.querySelectorAll('[onerror]').length === 0, 'onerror attribute was NOT stripped!');
        assert(chapterDoc.querySelectorAll('a[href^="javascript:"]').length === 0, 'javascript: link was NOT stripped!');

        // Check form neutralization
        const form = chapterDoc.querySelector('form');
        assert(form !== null, 'Form element should still exist (content preserved)');
        assert(!form.hasAttribute('action'), 'Form action attribute was NOT stripped!');
        assert(!form.hasAttribute('method'), 'Form method attribute was NOT stripped!');
        assert(!form.hasAttribute('target'), 'Form target attribute was NOT stripped!');

        // Check formaction stripping
        const buttons = chapterDoc.querySelectorAll('button[formaction], input[formaction]');
        assert(buttons.length === 0, 'formaction on button/input was NOT stripped!');

        // Check zero on* attributes across the entire document
        const allElements = Array.from(chapterDoc.querySelectorAll('*'));
        let foundOnAttr = false;
        for (const el of allElements) {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.toLowerCase().startsWith('on')) {
              foundOnAttr = true;
              break;
            }
          }
          if (foundOnAttr) break;
        }
        assert(!foundOnAttr, 'Found lingering inline on* attribute in sanitized DOM!');

        // Asset Rewriting Assertions
        const img = chapterDoc.querySelector('img');
        assert(img.getAttribute('src').startsWith('blob:'), 'Image src not rewritten to blob URL');

        const svgImage = chapterDoc.querySelector('image');
        assert(svgImage.getAttribute('href').startsWith('blob:') && svgImage.getAttribute('xlink:href').startsWith('blob:'), 'SVG image xlink:href not rewritten to blob URL');

        const cssLink = chapterDoc.querySelector('link[rel~="stylesheet"]');
        assert(cssLink.getAttribute('href').startsWith('blob:'), 'CSS link not rewritten to blob URL');

        // Cross-chapter link transformation
        const crossLink = chapterDoc.querySelector('a[data-chapter-link="true"]');
        assert(crossLink && crossLink.getAttribute('data-epub-href') === 'OEBPS/text/ch02.xhtml', 'Cross chapter data-epub-href failed');
        assert(crossLink.getAttribute('data-epub-hash') === 'section-2', 'Cross chapter data-epub-hash failed');
        assert(crossLink.getAttribute('href') === '#reader-jump:OEBPS/text/ch02.xhtml#section-2', 'Cross chapter href neutralization failed');

        // External link transformation
        const extLink = chapterDoc.querySelector('a[href="https://example.com"]');
        assert(extLink && extLink.getAttribute('target') === '_blank' && extLink.getAttribute('rel') === 'noopener noreferrer', 'External link hardening failed');

        // CSS Rewriting & Circular @import defense
        const cssWithImport = `@import "style.css"; body { background: url("../images/cat.jpg"); }`;
        const rewrittenCss = await extractor.rewriteCss(cssWithImport, 'OEBPS/styles/other.css');
        assert(rewrittenCss.includes('blob:'), 'CSS url rewriting failed');

        // Test cleanup
        const blobCountBefore = extractor.blobUrls.size;
        assert(blobCountBefore > 0, 'No blob URLs tracked before cleanup');
        extractor.cleanup();
        assert(extractor.isCleanedUp === true, 'isCleanedUp flag not set');
        assert(extractor.assetMap.size === 0, 'assetMap not cleared on cleanup');
        assert(extractor.blobUrls.size === 0, 'blobUrls not cleared on cleanup');

        results.push({
          suite: 'AssetExtractor',
          check: 'Defense Layer 1 (iframe, frame, frameset, forms & on* stripping) & Blob cleanup (Remediation 3)',
          passed: true,
          evidence: `0 iframe/frame/frameset tags remain; form action stripped; 0 on* attributes remain; ${blobCountBefore} Blob URLs revoked`
        });
      } catch (err) {
        results.push({
          suite: 'AssetExtractor',
          check: 'Defense Layer 1 (iframe, frame, frameset, forms & on* stripping) & Blob cleanup (Remediation 3)',
          passed: false,
          evidence: err.message
        });
      }

      // ---------------------------------------------------------------------
      // 4. Dynamic Anti-Cheating & Facade Test (Random UUID Metadata)
      // ---------------------------------------------------------------------
      try {
        const randomId = 'book-' + Math.random().toString(36).substring(2, 9);
        const randomTitle = 'Dynamic Verification Title ' + Math.random().toString(36).substring(2, 9);
        const randomAuthor = 'Dynamic Author ' + Math.random().toString(36).substring(2, 9);
        const randomBodyText = 'Dynamic body content ' + Math.random().toString(36).substring(2, 9);

        const dynamicZip = new JSZip();
        dynamicZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        dynamicZip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
        </container>`);
        dynamicZip.file('EPUB/package.opf', `<?xml version="1.0" encoding="utf-8"?>
        <package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:identifier id="id">${randomId}</dc:identifier>
            <dc:title>${randomTitle}</dc:title>
            <dc:creator>${randomAuthor}</dc:creator>
            <dc:language>en</dc:language>
          </metadata>
          <manifest>
            <item id="ch1" href="c1.xhtml" media-type="application/xhtml+xml"/>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
          </manifest>
          <spine><itemref idref="ch1"/></spine>
        </package>`);
        dynamicZip.file('EPUB/nav.xhtml', `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter One</a></li></ol></nav></body></html>`);
        dynamicZip.file('EPUB/c1.xhtml', `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml">
        <body><h1>Chapter One</h1><p>${randomBodyText}</p></body></html>`);

        const dynamicBlob = await dynamicZip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
        const parsedDynamic = await EpubParser.parse(dynamicBlob);

        assert(parsedDynamic.metadata.title === randomTitle, `Dynamic title mismatch: expected "${randomTitle}", got "${parsedDynamic.metadata.title}"`);
        assert(parsedDynamic.metadata.author === randomAuthor, `Dynamic author mismatch: expected "${randomAuthor}", got "${parsedDynamic.metadata.author}"`);
        assert(parsedDynamic.spine.length === 1 && parsedDynamic.spine[0].fullPath === 'EPUB/c1.xhtml', 'Dynamic spine mismatch');
        assert(parsedDynamic.toc.length === 1 && parsedDynamic.toc[0].title === 'Chapter One', 'Dynamic TOC mismatch');

        const dynDoc = await parsedDynamic.getChapterDocument('EPUB/c1.xhtml');
        assert(dynDoc.body.textContent.includes(randomBodyText), `Dynamic chapter text mismatch: could not find "${randomBodyText}"`);

        parsedDynamic.cleanup();
        results.push({
          suite: 'AntiCheating',
          check: 'Dynamic UUID metadata & chapter payload verification',
          passed: true,
          evidence: `Generated and parsed dynamic title "${randomTitle}" with 100% fidelity`
        });
      } catch (err) {
        results.push({
          suite: 'AntiCheating',
          check: 'Dynamic UUID metadata & chapter payload verification',
          passed: false,
          evidence: err.message
        });
      }

      // ---------------------------------------------------------------------
      // 4b. Adversarial Stress Tests (Sanitization & Synthetic Fallbacks)
      // ---------------------------------------------------------------------
      try {
        // 4b.1: Advanced Sanitization Stress Test
        const advZip = new JSZip();
        advZip.file('OEBPS/images/hi.png', new Uint8Array([1, 2, 3]));
        advZip.file('OEBPS/images/lo.png', new Uint8Array([4, 5, 6]));
        advZip.file('OEBPS/text/adv.xhtml', `
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="refresh" content="5;url=https://attacker.com/leak"/>
        </head>
        <body>
          <object data="malicious.swf"></object>
          <embed src="malicious.swf"/>
          <img src="../images/lo.png" srcset="../images/lo.png 1x, ../images/hi.png 2x"/>
          <div style="background-image: url('../images/hi.png'); font-size: 16px;">Styled</div>
        </body>
        </html>`);

        const advExtractor = new AssetExtractor(advZip);
        const advDoc = await advExtractor.getChapterDocument('OEBPS/text/adv.xhtml');

        assert(advDoc.querySelectorAll('meta[http-equiv="refresh" i]').length === 0, 'meta refresh not stripped');
        assert(advDoc.querySelectorAll('object, embed').length === 0, 'object/embed not stripped');

        const srcsetImg = advDoc.querySelector('img');
        const rewrittenSrcset = srcsetImg.getAttribute('srcset');
        assert(rewrittenSrcset.includes('blob:') && !rewrittenSrcset.includes('../images/'), 'srcset not rewritten to blob URLs');

        const styledDiv = advDoc.querySelector('div[style]');
        assert(styledDiv.getAttribute('style').includes('blob:') && !styledDiv.getAttribute('style').includes('../images/'), 'inline style url not rewritten');

        advExtractor.cleanup();

        // 4b.2: Synthetic Spine Fallback TOC Test
        const fallbackZip = new JSZip();
        fallbackZip.file('OEBPS/c1.xhtml', '<html><body><h1>Prologue: The Awakening</h1></body></html>');
        fallbackZip.file('OEBPS/c2.xhtml', '<html><body><title>Chapter II: Journey</title></body></html>');
        fallbackZip.file('OEBPS/c3.xhtml', '<html><body><p>No headings here</p></body></html>');

        const spineItems = [
          { id: 'item-1', href: 'c1.xhtml', fullPath: 'OEBPS/c1.xhtml' },
          { id: 'item-2', href: 'c2.xhtml', fullPath: 'OEBPS/c2.xhtml' },
          { id: 'item-3', href: 'c3.xhtml', fullPath: 'OEBPS/c3.xhtml' }
        ];

        const fallbackToc = await TocParser.parse({
          zip: fallbackZip,
          manifest: spineItems,
          spine: spineItems,
          opfPath: 'OEBPS/content.opf'
        });

        assert(fallbackToc.length === 3, `Synthetic TOC length expected 3, got ${fallbackToc.length}`);
        assert(fallbackToc[0].title === 'Prologue: The Awakening', `Fallback 0 title expected 'Prologue: The Awakening', got '${fallbackToc[0].title}'`);
        assert(fallbackToc[1].title === 'Chapter II: Journey', `Fallback 1 title expected 'Chapter II: Journey', got '${fallbackToc[1].title}'`);
        assert(fallbackToc[2].title === 'Item 1' || fallbackToc[2].title === 'Item 3' || fallbackToc[2].title === 'Chapter 3', `Fallback 2 title got '${fallbackToc[2].title}'`);

        results.push({
          suite: 'Adversarial',
          check: 'Advanced DOM sanitization & synthetic spine fallback',
          passed: true,
          evidence: 'meta refresh/embed stripped, srcset & style blob rewritten, synthetic headings extracted'
        });
      } catch (err) {
        results.push({
          suite: 'Adversarial',
          check: 'Advanced DOM sanitization & synthetic spine fallback',
          passed: false,
          evidence: err.message
        });
      }

      // ---------------------------------------------------------------------
      // 5. Real Fixtures Verification
      // ---------------------------------------------------------------------
      // 5a. valid-sample.epub
      try {
        const resp = await fetch('/test/test-fixtures/valid-sample.epub');
        const buf = await resp.arrayBuffer();
        const parsed = await EpubParser.parse(buf);

        assert(parsed.metadata.title === 'The Art of Minimalist Reading', `valid-sample expected 'The Art of Minimalist Reading', got '${parsed.metadata.title}'`);
        assert(parsed.metadata.author === 'Arthur Pendelton', `valid-sample expected 'Arthur Pendelton', got '${parsed.metadata.author}'`);
        assert(parsed.spine.length === 3, `valid-sample spine length expected 3, got ${parsed.spine.length}`);
        assert(parsed.coverBlobUrl !== null && parsed.coverBlobUrl.startsWith('blob:'), 'valid-sample coverBlobUrl missing');

        const ch1Doc = await parsed.getChapterDocument(parsed.spine[0].fullPath);
        assert(ch1Doc.querySelector('h1').textContent === 'Chapter 1: The Sanctuary of Words', 'valid-sample ch1 h1 failed');

        parsed.cleanup();
        results.push({
          suite: 'Fixtures',
          check: 'valid-sample.epub full parse & chapter DOM',
          passed: true,
          evidence: '3 spine chapters, valid coverBlobUrl, chapter 1 title confirmed'
        });
      } catch (err) {
        results.push({
          suite: 'Fixtures',
          check: 'valid-sample.epub full parse & chapter DOM',
          passed: false,
          evidence: err.message
        });
      }

      // 5b. empty-title.epub
      try {
        const resp = await fetch('/test/test-fixtures/empty-title.epub');
        const buf = await resp.arrayBuffer();
        const parsed = await EpubParser.parse(buf);

        assert(parsed.metadata.title === 'Untitled Book', `empty-title expected 'Untitled Book', got '${parsed.metadata.title}'`);
        assert(parsed.metadata.author === 'Unknown Author', `empty-title expected 'Unknown Author', got '${parsed.metadata.author}'`);
        assert(parsed.spine.length === 1, 'empty-title spine length failed');

        parsed.cleanup();
        results.push({
          suite: 'Fixtures',
          check: 'empty-title.epub graceful fallbacks',
          passed: true,
          evidence: 'Title defaulted to "Untitled Book", author to "Unknown Author"'
        });
      } catch (err) {
        results.push({
          suite: 'Fixtures',
          check: 'empty-title.epub graceful fallbacks',
          passed: false,
          evidence: err.message
        });
      }

      // 5c. corrupted.epub rejection
      try {
        const resp = await fetch('/test/test-fixtures/corrupted.epub');
        const buf = await resp.arrayBuffer();
        let rejected = false;
        try {
          await EpubParser.parse(buf);
        } catch {
          rejected = true;
        }
        assert(rejected, 'Corrupted EPUB was not rejected');
        results.push({
          suite: 'Fixtures',
          check: 'corrupted.epub fast rejection via magic bytes',
          passed: true,
          evidence: 'Magic byte check threw error as expected'
        });
      } catch (err) {
        results.push({
          suite: 'Fixtures',
          check: 'corrupted.epub fast rejection via magic bytes',
          passed: false,
          evidence: err.message
        });
      }

      // 5d. sample-book.js programmatic sample
      try {
        const sampleResult = await generateSampleEpub();
        const sampleBlob = sampleResult.blob;
        const parsed = await EpubParser.parse(sampleBlob);

        assert(parsed.metadata.title === SAMPLE_BOOK_METADATA.title, 'Sample book title failed');
        assert(parsed.metadata.author === SAMPLE_BOOK_METADATA.author, 'Sample book author failed');
        assert(parsed.coverBlobUrl !== null, 'Sample book coverBlobUrl failed');
        assert(parsed.spine.length === 4, `Sample book spine expected 4, got ${parsed.spine.length}`);
        assert(parsed.toc.length === 4, `Sample book root TOC items expected 4, got ${parsed.toc.length}`);
        const flatToc = TocParser.flatten(parsed.toc);
        assert(flatToc.length === 10, `Sample book flat TOC expected 10 entries, got ${flatToc.length}`);

        // Load chapter 2 (spine index 2) and verify SVG diagrams and stylesheets
        const ch2Doc = await parsed.getChapterDocument(parsed.spine[2].fullPath);
        assert(ch2Doc.querySelector('svg') !== null, 'Sample book chapter 2 SVG missing');
        assert(ch2Doc.querySelector('link[rel~="stylesheet"]').getAttribute('href').startsWith('blob:'), 'Sample book stylesheet blob rewriting failed');

        parsed.cleanup();
        results.push({
          suite: 'Fixtures',
          check: 'Programmatic sample-book-001 with 10 TOC & SVG diagrams',
          passed: true,
          evidence: 'All 3 chapters, 10 TOC entries, SVG diagrams, and cover parsed cleanly'
        });
      } catch (err) {
        results.push({
          suite: 'Fixtures',
          check: 'Programmatic sample-book-001 with 10 TOC & SVG diagrams',
          passed: false,
          evidence: err.message
        });
      }

      return results;
    }, serverInfo.url);

    for (const r of browserAuditResults) {
      reportCheck(r.suite, r.check, r.passed, r.evidence);
    }
  } catch (err) {
    reportCheck('BrowserExecution', 'Headless Chrome execution failed', false, err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    if (serverInfo && serverInfo.close) {
      await serverInfo.close();
      console.log('[audit-runner] Test server closed.');
    }
  }

  // -------------------------------------------------------------------------
  // Summary & Forensic Verdict
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  const total = auditLog.length;
  const passedCount = auditLog.filter(x => x.passed).length;
  const failedCount = total - passedCount;
  console.log(`Independent Audit Summary: ${passedCount} / ${total} checks PASSED (${failedCount} failed).`);

  if (integrityClean && failedCount === 0) {
    console.log('FINAL AUDIT VERDICT: CLEAN');
    process.exit(0);
  } else {
    console.error('FINAL AUDIT VERDICT: INTEGRITY VIOLATION');
    process.exit(1);
  }
}

runIndependentAudit().catch(err => {
  console.error('Fatal independent audit error:', err);
  process.exit(1);
});
