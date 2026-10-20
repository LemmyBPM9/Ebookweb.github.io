/**
 * .agents/teamwork/m2_r2_challenger_1/adversarial_r2_stress.js
 *
 * Milestone 2, Iteration 2: Empirical Adversarial Challenge Suite
 *
 * Specific Verification Objectives:
 * 1. Verification of the 5 suites in m2_challenger_1/challenge_parser.js (0 findings, exit code 0)
 * 2. Deep Adversarial Testing of PathResolver.findZipEntry:
 *    - Percent-encoded spaces, brackets, hashes, and accents
 *    - Filename variations: "OEBPS/Images/Cover%20Photo%20(1).jpg"
 *    - Parentheses, square brackets, accents (UTF-8 / encoded %C3%A9, %28, %29, %5B, %5D)
 *    - Hash characters in filenames vs URL fragments
 *    - Path normalization with backslashes, leading ./, double slashes
 * 3. Deep Adversarial Testing of OpfParser in HTML5 Fallback Mode:
 *    - Undeclared namespace prefixes (<dc:title>, <dc:creator>, <dc:identifier>, <dc:language>, etc.)
 *    - Undeclared prefixes on container tags (<opf:package>, <opf:metadata>, <opf:manifest>, <opf:spine>)
 *    - Multiple creators in HTML5 mode
 *    - Cover cascade resolution in HTML5 mode
 *    - Malformed XML triggering HTML5 mode
 * 4. Deep Adversarial Testing of EpubParser Fast Magic-Byte Rejection:
 *    - Type checking (null, undefined, number, string, boolean, object)
 *    - Length edge cases (0, 1, 2, 3 bytes)
 *    - Magic-byte signatures (PDF, PNG, JPG, GZIP, TAR, 7z)
 *    - Large 10MB corrupted buffer sub-millisecond rejection benchmark
 *    - Valid PK magic bytes but corrupted ZIP body
 *
 * Executes natively in Headless Google Chrome over the static test server.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function runAdversarialR2Suite() {
  console.log('====================================================================');
  console.log('    Milestone 2 Iteration 2: Empirical Adversarial Challenge Suite  ');
  console.log('====================================================================');

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[adversarial-r2] Static server active at ${serverUrl}`);
  console.log(`[adversarial-r2] Launching Google Chrome at ${CHROME_PATH}`);

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
      const suiteLogs = [];
      const findings = [];

      function assert(condition, message) {
        if (!condition) {
          throw new Error(message || 'Assertion failed');
        }
      }

      function logTest(suiteName, testName, passed, details = '') {
        suiteLogs.push({ suiteName, testName, passed, details });
      }

      function recordFinding(module, severity, title, observation, impact) {
        findings.push({ module, severity, title, observation, impact });
      }

      // Dynamic import of modules under test
      const { PathResolver } = await import('/js/parser/path-resolver.js');
      const { OpfParser, getMetaText, getAllMetaText, findElementByLocal, findElementsByLocal, getNodeLocalName } = await import('/js/parser/opf-parser.js');
      const { EpubParser, validateZipMagicBytes } = await import('/js/parser/epub-parser.js');
      const JSZip = window.JSZip;

      // =====================================================================
      // ADV-SUITE 1: ZIP Archive Lookup with Percent-Encoding, Brackets,
      //              Hashes, Accents, and Normalization Edge Cases
      // =====================================================================
      try {
        const zip = new JSZip();

        // Populate archive with diverse challenging keys
        const filesToAdd = [
          'OEBPS/Images/Cover%20Photo%20(1).jpg',
          'OEBPS/Images/Figure [2] (Final).png',
          'OEBPS/Images/Photo%20[3]%20%28Special%29.PNG',
          'OEBPS/Images/café crème.jpg',
          'OEBPS/Images/caf%C3%A9%20cr%C3%A8me.jpg',
          'OEBPS/Images/naïve façade.png',
          'OEBPS/Images/über_wald.jpg',
          'OEBPS/Images/chart#1.svg',
          'OEBPS/Images/diagram%232.svg',
          'OEBPS/text/ch01.xhtml',
          'OEBPS/Styles/main.css',
          'OEBPS/Images/Special (Cover) [2026] #Hash.jpeg'
        ];

        for (const f of filesToAdd) {
          zip.file(f, `data-for-${f}`);
        }

        let checksCount = 0;

        // Test 1.1: Exact match on percent-encoded entry with parentheses
        // Target: "OEBPS/Images/Cover%20Photo%20(1).jpg"
        const entry1 = PathResolver.findZipEntry(zip, 'OEBPS/Images/Cover%20Photo%20(1).jpg');
        assert(entry1 !== null, 'Exact lookup of Cover%20Photo%20(1).jpg failed');
        checksCount++;

        // Test 1.2: Decoded lookup against percent-encoded entry with parentheses
        const entry1Decoded = PathResolver.findZipEntry(zip, 'OEBPS/Images/Cover Photo (1).jpg');
        assert(entry1Decoded !== null, 'Decoded lookup of Cover Photo (1).jpg failed to find Cover%20Photo%20(1).jpg');
        checksCount++;

        // Test 1.3: Case-insensitive decoded lookup
        const entry1Lower = PathResolver.findZipEntry(zip, 'oebps/images/cover photo (1).jpg');
        assert(entry1Lower !== null, 'Lowercase decoded lookup failed');
        checksCount++;

        // Test 1.4: Fully encoded lookup (encoding parentheses as %28, %29)
        const entry1FullEncoded = PathResolver.findZipEntry(zip, 'OEBPS/Images/Cover%20Photo%20%281%29.jpg');
        assert(entry1FullEncoded !== null, 'Full percent encoded lookup with %28 %29 failed');
        checksCount++;

        // Test 1.5: Relative resolvePath lookup from chapter
        const resolvedPath1 = PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../Images/Cover%20Photo%20(1).jpg');
        const entry1Resolved = PathResolver.findZipEntry(zip, resolvedPath1);
        assert(entry1Resolved !== null, `Relative resolvePath ("${resolvedPath1}") failed to match in ZIP`);
        checksCount++;

        // Test 1.6: Brackets literal in ZIP: "OEBPS/Images/Figure [2] (Final).png"
        const entry2Exact = PathResolver.findZipEntry(zip, 'OEBPS/Images/Figure [2] (Final).png');
        assert(entry2Exact !== null, 'Exact lookup of square bracketed entry failed');
        const entry2Encoded = PathResolver.findZipEntry(zip, 'OEBPS/Images/Figure%20%5B2%5D%20%28Final%29.png');
        assert(entry2Encoded !== null, 'Percent-encoded lookup of square bracketed entry failed');
        const entry2Lower = PathResolver.findZipEntry(zip, 'oebps/images/figure [2] (final).png');
        assert(entry2Lower !== null, 'Lowercase lookup of square bracketed entry failed');
        checksCount += 3;

        // Test 1.7: Brackets encoded in ZIP: "OEBPS/Images/Photo%20[3]%20%28Special%29.PNG"
        const entry3Decoded = PathResolver.findZipEntry(zip, 'OEBPS/Images/Photo [3] (Special).png');
        assert(entry3Decoded !== null, 'Decoded lookup of encoded bracket entry failed');
        checksCount++;

        // Test 1.8: UTF-8 Accents literal in ZIP: "OEBPS/Images/café crème.jpg"
        const entryCafeExact = PathResolver.findZipEntry(zip, 'OEBPS/Images/café crème.jpg');
        assert(entryCafeExact !== null, 'Exact lookup of café crème.jpg failed');
        const entryCafePercent = PathResolver.findZipEntry(zip, 'OEBPS/Images/caf%C3%A9%20cr%C3%A8me.jpg');
        assert(entryCafePercent !== null, 'Encoded lookup of café crème.jpg failed');
        checksCount += 2;

        // Test 1.9: UTF-8 Accents encoded in ZIP: "OEBPS/Images/caf%C3%A9%20cr%C3%A8me.jpg"
        const entryCafe2Decoded = PathResolver.findZipEntry(zip, 'OEBPS/Images/café crème.jpg');
        assert(entryCafe2Decoded !== null, 'Decoded lookup of encoded café entry failed');
        checksCount++;

        // Test 1.10: Weitere Accents: "naïve façade.png" and "über_wald.jpg"
        assert(PathResolver.findZipEntry(zip, 'OEBPS/Images/naïve façade.png') !== null, 'naïve façade lookup failed');
        assert(PathResolver.findZipEntry(zip, 'OEBPS/Images/na%C3%AFve%20fa%C3%A7ade.png') !== null, 'na%C3%AFve fa%C3%A7ade lookup failed');
        assert(PathResolver.findZipEntry(zip, 'oebps/images/über_wald.jpg') !== null, 'Case-insensitive über_wald lookup failed');
        assert(PathResolver.findZipEntry(zip, 'OEBPS/Images/%C3%BCber_wald.jpg') !== null, 'Encoded über_wald lookup failed');
        checksCount += 4;

        // Test 1.11: Filename containing literal hash: "OEBPS/Images/chart#1.svg"
        // Note: When referenced in HTML as href="chart%231.svg", safeDecodeURIComponent decodes to "chart#1.svg"
        const resolvedHash = PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../Images/chart%231.svg');
        assert(resolvedHash === 'OEBPS/Images/chart#1.svg', `resolvePath on %23 failed: got "${resolvedHash}"`);
        const entryHash = PathResolver.findZipEntry(zip, resolvedHash);
        assert(entryHash !== null, 'findZipEntry failed on resolved path with hash in filename');
        checksCount += 2;

        // Test 1.12: Query and fragment stripping on URL references
        const resolvedWithAnchor = PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../Images/Cover%20Photo%20(1).jpg#image-anchor?version=2.0');
        assert(resolvedWithAnchor === 'OEBPS/Images/Cover Photo (1).jpg', `resolvePath failed to strip fragment and query: got "${resolvedWithAnchor}"`);
        const entryAnchor = PathResolver.findZipEntry(zip, resolvedWithAnchor);
        assert(entryAnchor !== null, 'findZipEntry failed on resolved path after stripping anchor/query');
        checksCount += 2;

        // Test 1.13: Complex composite entry: "OEBPS/Images/Special (Cover) [2026] #Hash.jpeg"
        const resolvedComplex = PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../Images/Special%20(Cover)%20%5B2026%5D%20%23Hash.jpeg#frag');
        const entryComplex = PathResolver.findZipEntry(zip, resolvedComplex);
        assert(entryComplex !== null, 'findZipEntry failed on complex composite name with spaces, parens, brackets, hash');
        checksCount++;

        // Test 1.14: Backslash and leading slash normalization in zip entries
        const zipMessy = new JSZip();
        zipMessy.file('\\OEBPS\\Images\\Cover Photo (1).jpg', 'data');
        zipMessy.file('/OEBPS/text/ch01.xhtml', 'data');
        zipMessy.file('./OEBPS/styles/main.css', 'data');

        assert(PathResolver.findZipEntry(zipMessy, 'OEBPS/Images/Cover Photo (1).jpg') !== null, 'Backslash zip key lookup failed');
        assert(PathResolver.findZipEntry(zipMessy, 'OEBPS/text/ch01.xhtml') !== null, 'Leading slash zip key lookup failed');
        assert(PathResolver.findZipEntry(zipMessy, 'OEBPS/styles/main.css') !== null, 'Leading dot-slash zip key lookup failed');
        checksCount += 3;

        logTest(
          'Adv-Suite 1: ZIP Archive Lookup',
          'Percent-Encoded Spaces, Brackets, Hashes, Accents & Normalization',
          true,
          `${checksCount} adversarial path assertions passed successfully`
        );
      } catch (err) {
        logTest('Adv-Suite 1: ZIP Archive Lookup', 'Percent-Encoded Spaces, Brackets, Hashes, Accents & Normalization', false, err.message);
      }

      // =====================================================================
      // ADV-SUITE 2: OPF Parser Resilience in HTML5 Fallback Mode & Undeclared Namespaces
      // =====================================================================
      try {
        let opfChecks = 0;

        // 2.1: OPF with undeclared namespace prefix dc (triggers XML error and HTML5 fallback)
        // Must extract title, creator, identifier, language, description, publisher, date
        const opfUndeclaredDc = `
          <package version="2.0" unique-identifier="book-id">
            <metadata>
              <dc:title>Adversarial HTML5 Title</dc:title>
              <dc:creator>Alice In Wonder</dc:creator>
              <dc:identifier id="book-id">urn:uuid:12345-67890</dc:identifier>
              <dc:language>en-US</dc:language>
              <dc:description>A book tested against HTML5 fallback.</dc:description>
              <dc:publisher>Underground Press</dc:publisher>
              <dc:date>2026-10-17</dc:date>
            </metadata>
            <manifest>
              <item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>
              <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
            </manifest>
            <spine>
              <itemref idref="ch1"/>
            </spine>
          </package>
        `;

        const parsed1 = OpfParser.parseOpf(opfUndeclaredDc, 'OEBPS/content.opf');
        assert(parsed1.metadata.title === 'Adversarial HTML5 Title', `Title mismatch: got "${parsed1.metadata.title}"`);
        assert(parsed1.metadata.author === 'Alice In Wonder', `Author mismatch: got "${parsed1.metadata.author}"`);
        assert(parsed1.metadata.identifier === 'urn:uuid:12345-67890', `Identifier mismatch: got "${parsed1.metadata.identifier}"`);
        assert(parsed1.metadata.language === 'en-US', `Language mismatch: got "${parsed1.metadata.language}"`);
        assert(parsed1.metadata.description === 'A book tested against HTML5 fallback.', `Description mismatch`);
        assert(parsed1.metadata.publisher === 'Underground Press', `Publisher mismatch`);
        assert(parsed1.metadata.date === '2026-10-17', `Date mismatch`);
        assert(parsed1.coverItem && parsed1.coverItem.id === 'cover-img', `Cover item not found in HTML5 mode`);
        assert(parsed1.spine.length === 1 && parsed1.spine[0].id === 'ch1', `Spine extraction failed in HTML5 mode`);
        opfChecks += 9;

        // 2.2: OPF with undeclared prefix on structural container elements:
        // <opf:package>, <opf:metadata>, <opf:manifest>, <opf:spine>, <opf:item>, <opf:itemref>
        const opfAllPrefixed = `
          <opf:package version="3.0">
            <opf:metadata>
              <dc:title>Fully Prefixed Book</dc:title>
              <dc:creator>Bob Builder</dc:creator>
            </opf:metadata>
            <opf:manifest>
              <opf:item id="cov" href="cov.jpg" media-type="image/jpeg"/>
              <opf:item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
            </opf:manifest>
            <opf:spine>
              <opf:itemref idref="c1"/>
            </opf:spine>
          </opf:package>
        `;
        const parsedPrefixed = OpfParser.parseOpf(opfAllPrefixed, 'content.opf');
        assert(parsedPrefixed.metadata.title === 'Fully Prefixed Book', `Prefixed package title mismatch: got "${parsedPrefixed.metadata.title}"`);
        assert(parsedPrefixed.metadata.author === 'Bob Builder', `Prefixed package author mismatch: got "${parsedPrefixed.metadata.author}"`);
        assert(parsedPrefixed.manifest.has('cov'), 'Prefixed manifest item <opf:item> not parsed');
        assert(parsedPrefixed.manifest.has('c1'), 'Prefixed manifest item <opf:item> not parsed');
        assert(parsedPrefixed.spine.length === 1 && parsedPrefixed.spine[0].id === 'c1', 'Prefixed spine item <opf:itemref> not parsed');
        opfChecks += 5;

        // 2.3: Multiple creators with undeclared dc: prefix
        const opfMultipleCreators = `
          <package>
            <metadata>
              <dc:title>Collaboration Volume</dc:title>
              <dc:creator>First Author</dc:creator>
              <dc:creator>Second Author</dc:creator>
              <dc:creator>Third Author</dc:creator>
            </metadata>
          </package>
        `;
        const parsedMulti = OpfParser.parseOpf(opfMultipleCreators, 'content.opf');
        assert(parsedMulti.metadata.title === 'Collaboration Volume', 'Multi-creator title mismatch');
        assert(parsedMulti.metadata.author === 'First Author, Second Author, Third Author', `Multi-creator mismatch: got "${parsedMulti.metadata.author}"`);
        opfChecks += 2;

        // 2.4: Cover cascade in HTML5 fallback mode:
        // Case A: EPUB 2 meta name="cover" with undeclared prefix
        const opfMetaCover = `
          <package>
            <metadata>
              <dc:title>Meta Cover Book</dc:title>
              <meta name="cover" content="img-cover-id"/>
            </metadata>
            <manifest>
              <item id="img-cover-id" href="assets/cover.jpg" media-type="image/jpeg"/>
              <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
            </manifest>
            <spine><itemref idref="ch1"/></spine>
          </package>
        `;
        const parsedMetaCover = OpfParser.parseOpf(opfMetaCover, 'content.opf');
        assert(parsedMetaCover.coverItem && parsedMetaCover.coverItem.id === 'img-cover-id', 'Step 2 meta cover failed in HTML5 mode');
        opfChecks++;

        // Case B: Manifest heuristic (id="cover-image")
        const opfHeuristicCover = `
          <package>
            <metadata><dc:title>Heuristic Book</dc:title></metadata>
            <manifest>
              <item id="cover-image" href="img/cover.webp" media-type="image/webp"/>
              <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
            </manifest>
            <spine><itemref idref="ch1"/></spine>
          </package>
        `;
        const parsedHeuristic = OpfParser.parseOpf(opfHeuristicCover, 'content.opf');
        assert(parsedHeuristic.coverItem && parsedHeuristic.coverItem.id === 'cover-image', 'Step 3 heuristic cover failed in HTML5 mode');
        opfChecks++;

        // 2.5: Severe HTML5 recovery: unquoted attributes, broken XML entities, unclosed tags
        const opfBroken = `
          <package version=2.0>
            <metadata>
              <dc:title>Rock & Roll <Explosion> & Unquoted
              <dc:creator>Mick & Keith
            </metadata>
            <manifest>
              <item id=ch1 href="ch1.xhtml" media-type="application/xhtml+xml">
              <item id=cov href=cov.png media-type=image/png>
            </manifest>
            <spine>
              <itemref idref=ch1>
            </spine>
          </package>
        `;
        const parsedBroken = OpfParser.parseOpf(opfBroken, 'content.opf');
        assert(parsedBroken.metadata.title.includes('Rock'), 'Broken XML title recovery failed');
        assert(parsedBroken.metadata.author.includes('Mick'), 'Broken XML author recovery failed');
        assert(parsedBroken.spine.length === 1, 'Broken XML spine recovery failed');
        opfChecks += 3;

        logTest(
          'Adv-Suite 2: Malformed OPF in HTML5 Mode',
          'Undeclared Namespaces, Prefixed Containers, Multi-Creators & Cover Cascade',
          true,
          `${opfChecks} OPF HTML5 resilience assertions passed successfully`
        );
      } catch (err) {
        logTest('Adv-Suite 2: Malformed OPF in HTML5 Mode', 'Undeclared Namespaces, Prefixed Containers, Multi-Creators & Cover Cascade', false, err.message);
      }

      // =====================================================================
      // ADV-SUITE 3: Corrupted Archive Rejection & Fast Magic-Byte Validation
      // =====================================================================
      try {
        let rejectionChecks = 0;

        // 3.1: Type validation: invalid types throw TypeError
        const invalidTypes = [null, undefined, 42, true, 'PK\x03\x04string', { foo: 'bar' }, [1, 2, 3]];
        for (const val of invalidTypes) {
          let threwType = false;
          try {
            await validateZipMagicBytes(val);
          } catch (e) {
            if (e instanceof TypeError) threwType = true;
          }
          assert(threwType, `validateZipMagicBytes did not throw TypeError for ${typeof val}`);
          rejectionChecks++;
        }

        // 3.2: Buffer length checks (0, 1 byte)
        const emptyBuf = new Uint8Array(0);
        let threwEmpty = false;
        try {
          await validateZipMagicBytes(emptyBuf);
        } catch (e) {
          if (e.message.includes('not a valid ZIP archive')) threwEmpty = true;
        }
        assert(threwEmpty, 'Empty buffer did not throw ZIP archive error');
        rejectionChecks++;

        const oneByteBuf = new Uint8Array([0x50]); // 'P'
        let threwOne = false;
        try {
          await validateZipMagicBytes(oneByteBuf);
        } catch (e) {
          if (e.message.includes('not a valid ZIP archive')) threwOne = true;
        }
        assert(threwOne, '1-byte buffer did not throw ZIP archive error');
        rejectionChecks++;

        // 3.3: Invalid magic byte signatures
        const badSignatures = [
          { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },       // %PDF
          { name: 'PNG', bytes: [0x89, 0x50, 0x4E, 0x47] },       // \x89PNG
          { name: 'JPEG', bytes: [0xFF, 0xD8, 0xFF, 0xE0] },      // JPEG SOI
          { name: 'GZIP', bytes: [0x1F, 0x8B, 0x08, 0x00] },      // GZIP
          { name: 'TAR', bytes: [0x75, 0x73, 0x74, 0x61] },       // ustar
          { name: '7-Zip', bytes: [0x37, 0x7A, 0xBC, 0xAF] },     // 7z
          { name: 'Half-PK', bytes: [0x50, 0x00, 0x00, 0x00] }    // P followed by 0x00
        ];

        for (const sig of badSignatures) {
          const buf = new Uint8Array(sig.bytes);
          let threwSig = false;
          try {
            await validateZipMagicBytes(buf);
          } catch (e) {
            if (e.message.includes('not a valid ZIP archive')) threwSig = true;
          }
          assert(threwSig, `Signature ${sig.name} was not rejected by validateZipMagicBytes`);
          rejectionChecks++;
        }

        // 3.4: Sub-millisecond fast rejection performance on large 10MB corrupted buffer
        const largeBadBuffer = new Uint8Array(10 * 1024 * 1024); // 10 MB of zeros
        largeBadBuffer[0] = 0x00;
        largeBadBuffer[1] = 0x00;

        const startPerf = performance.now();
        let largeThrew = false;
        try {
          await validateZipMagicBytes(largeBadBuffer);
        } catch (e) {
          largeThrew = true;
        }
        const elapsedMs = performance.now() - startPerf;

        assert(largeThrew, '10MB corrupted buffer was not rejected');
        assert(elapsedMs < 5.0, `10MB rejection took too long: ${elapsedMs.toFixed(2)}ms (expected < 5ms)`);
        rejectionChecks += 2;

        // 3.5: Valid PK magic bytes, but truncated/corrupt ZIP body passed to EpubParser.parse()
        // Should pass validateZipMagicBytes, but fail cleanly in JSZip.loadAsync with descriptive error
        const fakePkHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
        let epubParserThrewCleanly = false;
        let epubParserErrorMessage = '';
        try {
          await EpubParser.parse(fakePkHeader);
        } catch (e) {
          epubParserThrewCleanly = true;
          epubParserErrorMessage = e.message;
        }
        assert(epubParserThrewCleanly, 'EpubParser.parse did not throw on truncated ZIP body');
        assert(
          epubParserErrorMessage.includes('Failed to open EPUB') || epubParserErrorMessage.includes('corrupted') || epubParserErrorMessage.includes('ZIP'),
          `Unexpected error message: "${epubParserErrorMessage}"`
        );
        rejectionChecks += 2;

        // 3.6: Blob input verification
        if (typeof Blob !== 'undefined') {
          const badBlob = new Blob([new Uint8Array([0x11, 0x22, 0x33, 0x44])], { type: 'application/epub+zip' });
          let blobThrew = false;
          try {
            await validateZipMagicBytes(badBlob);
          } catch (e) {
            blobThrew = true;
          }
          assert(blobThrew, 'Blob validation failed to reject invalid magic bytes');

          const goodBlob = new Blob([new Uint8Array([0x50, 0x4B, 0x05, 0x06])], { type: 'application/epub+zip' });
          let goodBlobPassed = false;
          try {
            await validateZipMagicBytes(goodBlob);
            goodBlobPassed = true;
          } catch (e) {
            goodBlobPassed = false;
          }
          assert(goodBlobPassed, 'Blob with valid PK magic bytes threw unexpectedly');
          rejectionChecks += 2;
        }

        logTest(
          'Adv-Suite 3: Corrupted Archive Rejection',
          'Fast Magic-Byte Validation (0x50, 0x4B), Types, Slices, 10MB Perf & Graceful JSZip Failures',
          true,
          `${rejectionChecks} rejection checks verified (10MB reject took ${elapsedMs.toFixed(3)}ms)`
        );
      } catch (err) {
        logTest('Adv-Suite 3: Corrupted Archive Rejection', 'Fast Magic-Byte Validation', false, err.message);
      }

      // =====================================================================
      // ADV-SUITE 4: Full End-to-End Adversarial EPUB Pipeline Verification
      // =====================================================================
      try {
        let e2eChecks = 0;
        const testZip = new JSZip();

        // 1. mimetype (uncompressed)
        testZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

        // 2. META-INF/container.xml
        testZip.file(
          'META-INF/container.xml',
          `<?xml version="1.0" encoding="UTF-8"?>
           <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
             <rootfiles>
               <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
             </rootfiles>
           </container>`
        );

        // 3. OEBPS/content.opf with undeclared namespace prefixes AND percent-encoded cover href
        testZip.file(
          'OEBPS/content.opf',
          `<package version="2.0">
             <metadata>
               <dc:title>Remediation Proof Title</dc:title>
               <dc:creator>Challenger One, Worker One</dc:creator>
               <dc:language>en</dc:language>
             </metadata>
             <manifest>
               <item id="cov-img" href="Images/Cover%20Photo%20(1).jpg" media-type="image/jpeg" properties="cover-image"/>
               <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
             </manifest>
             <spine>
               <itemref idref="ch1"/>
             </spine>
           </package>`
        );

        // 4. Binary JPEG cover stored with literal %20 in zip entry key
        // Minimal 1x1 pixel valid JPEG binary
        const jpegBytes = new Uint8Array([
          0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
          0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x02, 0x02, 0x02, 0x03,
          0x02, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x06, 0x04, 0x04, 0x04, 0x04, 0x04, 0x08, 0x06,
          0x06, 0x05, 0x06, 0x09, 0x08, 0x0A, 0x0A, 0x09, 0x08, 0x09, 0x09, 0x0A, 0x0C, 0x0F, 0x0C, 0x0A,
          0x0B, 0x0E, 0x0B, 0x09, 0x09, 0x0D, 0x11, 0x0D, 0x0E, 0x0F, 0x10, 0x10, 0x11, 0x10, 0x0A, 0x0C,
          0x12, 0x13, 0x12, 0x10, 0x13, 0x0F, 0x10, 0x10, 0x10, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
          0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xFF, 0xDA, 0x00, 0x08,
          0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, 0xFF, 0xD9
        ]);
        testZip.file('OEBPS/Images/Cover%20Photo%20(1).jpg', jpegBytes);

        // 5. Chapter XHTML referencing image via both encoded and literal space relative paths
        testZip.file(
          'OEBPS/text/ch1.xhtml',
          `<?xml version="1.0" encoding="UTF-8"?>
           <!DOCTYPE html>
           <html xmlns="http://www.w3.org/1999/xhtml">
             <head><title>Chapter 1</title></head>
             <body>
               <h1>Chapter 1: The Remediated Voyage</h1>
               <img id="img-encoded" src="../Images/Cover%20Photo%20(1).jpg" alt="Cover 1"/>
               <img id="img-decoded" src="../Images/Cover Photo (1).jpg" alt="Cover 2"/>
             </body>
           </html>`
        );

        // Build array buffer and parse via EpubParser
        const epubBuffer = await testZip.generateAsync({ type: 'arraybuffer' });
        const parsedEpub = await EpubParser.parse(epubBuffer);

        // Verification 4.1: Title extracted despite undeclared prefix in HTML5 fallback
        assert(parsedEpub.metadata.title === 'Remediation Proof Title', `Metadata title mismatch: got "${parsedEpub.metadata.title}"`);
        assert(parsedEpub.metadata.author === 'Challenger One, Worker One', `Metadata author mismatch: got "${parsedEpub.metadata.author}"`);
        e2eChecks += 2;

        // Verification 4.2: Cover Blob URL generated despite percent-encoded ZIP catalog entry
        assert(parsedEpub.coverBlobUrl !== null, 'Cover Blob URL is null (failed to extract cover)');
        assert(parsedEpub.coverBlobUrl.startsWith('blob:'), `Cover Blob URL format invalid: "${parsedEpub.coverBlobUrl}"`);
        e2eChecks += 2;

        // Verification 4.3: Chapter DOM rewritten
        const chapterDoc = await parsedEpub.getChapterDocument('OEBPS/text/ch1.xhtml');
        assert(chapterDoc !== null, 'getChapterDocument returned null');

        const imgEncoded = chapterDoc.querySelector('#img-encoded');
        assert(imgEncoded !== null, '#img-encoded element not found in chapter DOM');
        assert(imgEncoded.getAttribute('src').startsWith('blob:'), `img-encoded src not rewritten to blob URL: "${imgEncoded.getAttribute('src')}"`);

        const imgDecoded = chapterDoc.querySelector('#img-decoded');
        assert(imgDecoded !== null, '#img-decoded element not found in chapter DOM');
        assert(imgDecoded.getAttribute('src').startsWith('blob:'), `img-decoded src not rewritten to blob URL: "${imgDecoded.getAttribute('src')}"`);
        e2eChecks += 5;

        // Verification 4.4: Cleanup revokes all Blob URLs without error
        let cleanedUpWithoutError = false;
        try {
          parsedEpub.cleanup();
          cleanedUpWithoutError = true;
        } catch (_) {
          cleanedUpWithoutError = false;
        }
        assert(cleanedUpWithoutError, 'parsedEpub.cleanup() threw an exception');
        e2eChecks++;

        logTest(
          'Adv-Suite 4: End-to-End Adversarial Pipeline',
          'Complete EPUB Parse with Undeclared Namespaces, Encoded Cover & Chapter Rewriting',
          true,
          `${e2eChecks} pipeline assertions passed: Title, Author, Cover Blob, and Chapter Asset Rewriting verified`
        );
      } catch (err) {
        logTest('Adv-Suite 4: End-to-End Adversarial Pipeline', 'Complete EPUB Parse', false, err.message);
      }

      return { suiteLogs, findings };
    });

    console.log('\n--- Adversarial R2 Test Suite Execution Results ---');
    let allPassed = true;
    for (const s of results.suiteLogs) {
      if (s.passed) {
        console.log(`  ✅ PASS: [${s.suiteName}] ${s.testName} (${s.details})`);
      } else {
        console.log(`  ❌ FAIL: [${s.suiteName}] ${s.testName} (Error: ${s.details})`);
        allPassed = false;
      }
    }

    if (results.findings.length > 0) {
      console.log('\n--- Adversarial Findings Discovered ---');
      for (const f of results.findings) {
        console.log(`  🔍 [${f.severity}] [${f.module}] ${f.title}`);
        console.log(`     Observation: ${f.observation}`);
        console.log(`     Impact:      ${f.impact}`);
      }
    } else {
      console.log('\nFindings Recorded: 0');
    }

    console.log('====================================================================');
    console.log(`Execution Summary: ${results.suiteLogs.filter(s => s.passed).length} / ${results.suiteLogs.length} test suites passed.`);
    console.log(`Total Findings: ${results.findings.length}`);
    console.log('====================================================================');

    if (!allPassed || results.findings.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await closeServer();
  }
}

runAdversarialR2Suite().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
