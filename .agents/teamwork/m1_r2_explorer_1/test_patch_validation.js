/**
 * test_patch_validation.js
 * Independent verification of the proposed js/sample-book.js replacement.
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  console.log('--- 1. Testing escapeXml Logic on Adversarial Inputs ---');
  function escapeXml(unsafe) {
    if (unsafe === null || unsafe === undefined) {
      return '';
    }
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  const testCases = [
    { input: null, expected: '' },
    { input: undefined, expected: '' },
    { input: 0, expected: '0' },
    { input: 'Hello & World', expected: 'Hello &amp; World' },
    { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;' },
    { input: "It's a test & 'quotes'", expected: 'It&apos;s a test &amp; &apos;quotes&apos;' },
    { input: 'The Art of Reading: Typography, Optics & Digital Comfort', expected: 'The Art of Reading: Typography, Optics &amp; Digital Comfort' }
  ];

  for (const tc of testCases) {
    const actual = escapeXml(tc.input);
    if (actual !== tc.expected) {
      console.error(`FAIL: escapeXml(${tc.input}) -> '${actual}', expected '${tc.expected}'`);
      process.exit(1);
    }
  }
  console.log('✅ PASS: escapeXml handles null, undefined, 0, numbers, and special characters correctly.');

  console.log('\n--- 2. Simulating Patched js/sample-book.js in Headless Chrome ---');
  let sampleBookCode = fs.readFileSync(path.join(PROJECT_ROOT, 'js/sample-book.js'), 'utf8');

  // Insert escapeXml export
  sampleBookCode = sampleBookCode.replace(
    'export const SAMPLE_BOOK_METADATA = {',
    `/**
 * Safely escapes characters with special meaning in XML/XHTML.
 * Converts:
 *   & -> &amp;
 *   < -> &lt;
 *   > -> &gt;
 *   " -> &quot;
 *   ' -> &apos;
 * Handles null, undefined, numbers, and strings safely.
 *
 * @param {unknown} unsafe - Value to escape
 * @returns {string} XML-safe string
 */
export function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const SAMPLE_BOOK_METADATA = {`
  );

  // Replace content.opf interpolations
  sampleBookCode = sampleBookCode.replace(
    '<dc:identifier id="pub-id">urn:uuid:${SAMPLE_BOOK_METADATA.id}</dc:identifier>',
    '<dc:identifier id="pub-id">urn:uuid:${escapeXml(SAMPLE_BOOK_METADATA.id)}</dc:identifier>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<dc:title>${SAMPLE_BOOK_METADATA.title}</dc:title>',
    '<dc:title>${escapeXml(SAMPLE_BOOK_METADATA.title)}</dc:title>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<dc:creator id="author">${SAMPLE_BOOK_METADATA.author}</dc:creator>',
    '<dc:creator id="author">${escapeXml(SAMPLE_BOOK_METADATA.author)}</dc:creator>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<dc:language>${SAMPLE_BOOK_METADATA.language}</dc:language>',
    '<dc:language>${escapeXml(SAMPLE_BOOK_METADATA.language)}</dc:language>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<dc:publisher>${SAMPLE_BOOK_METADATA.publisher}</dc:publisher>',
    '<dc:publisher>${escapeXml(SAMPLE_BOOK_METADATA.publisher)}</dc:publisher>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<dc:date>${SAMPLE_BOOK_METADATA.date}</dc:date>',
    '<dc:date>${escapeXml(SAMPLE_BOOK_METADATA.date)}</dc:date>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<dc:description>${SAMPLE_BOOK_METADATA.description}</dc:description>',
    '<dc:description>${escapeXml(SAMPLE_BOOK_METADATA.description)}</dc:description>'
  );

  // Replace toc.ncx interpolations
  sampleBookCode = sampleBookCode.replace(
    '<meta name="dtb:uid" content="urn:uuid:${SAMPLE_BOOK_METADATA.id}"/>',
    '<meta name="dtb:uid" content="urn:uuid:${escapeXml(SAMPLE_BOOK_METADATA.id)}"/>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<text>${SAMPLE_BOOK_METADATA.title}</text>',
    '<text>${escapeXml(SAMPLE_BOOK_METADATA.title)}</text>'
  );
  sampleBookCode = sampleBookCode.replace(
    '<text>${SAMPLE_BOOK_METADATA.author}</text>',
    '<text>${escapeXml(SAMPLE_BOOK_METADATA.author)}</text>'
  );

  const server = await startServer({ port: 3390, rootDir: PROJECT_ROOT, autoPortFallback: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(`${server.url}/index.html`, { waitUntil: 'domcontentloaded' });

  const auditResult = await page.evaluate(async (patchedCode) => {
    const blob = new Blob([patchedCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    URL.revokeObjectURL(url);

    const { arrayBuffer } = await mod.generateSampleEpub();
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();

    const xmlFiles = [
      { path: 'META-INF/container.xml', mime: 'application/xml' },
      { path: 'OEBPS/content.opf', mime: 'application/xml' },
      { path: 'OEBPS/toc.ncx', mime: 'application/xml' },
      { path: 'OEBPS/nav.xhtml', mime: 'application/xhtml+xml' },
      { path: 'OEBPS/cover.xhtml', mime: 'application/xhtml+xml' },
      { path: 'OEBPS/images/cover.svg', mime: 'image/svg+xml' },
      { path: 'OEBPS/text/ch01.xhtml', mime: 'application/xhtml+xml' },
      { path: 'OEBPS/text/ch02.xhtml', mime: 'application/xhtml+xml' },
      { path: 'OEBPS/text/ch03.xhtml', mime: 'application/xhtml+xml' }
    ];

    const results = [];
    for (const f of xmlFiles) {
      const content = await zip.file(f.path).async('string');
      // Regex check for illegal raw unescaped ampersands:
      // An ampersand not followed by an entity name or character code and semicolon
      const rawAmps = content.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g) || [];
      const doc = parser.parseFromString(content, f.mime);
      const err = doc.querySelector('parsererror');
      results.push({
        file: f.path,
        rawAmpsCount: rawAmps.length,
        hasParserError: !!err,
        errorMessage: err ? err.textContent : null
      });
    }

    // Check title in parsed OPF and NCX
    const opfContent = await zip.file('OEBPS/content.opf').async('string');
    const opfDoc = parser.parseFromString(opfContent, 'application/xml');
    const opfTitle = opfDoc.querySelector('title')?.textContent;

    const ncxContent = await zip.file('OEBPS/toc.ncx').async('string');
    const ncxDoc = parser.parseFromString(ncxContent, 'application/xml');
    const ncxTitle = ncxDoc.querySelector('docTitle text')?.textContent;

    return {
      results,
      opfTitle,
      ncxTitle,
      ncxNavPointCount: ncxDoc.querySelectorAll('navPoint').length,
      opfSpineCount: opfDoc.querySelectorAll('spine itemref').length
    };
  }, sampleBookCode);

  await browser.close();
  await server.close();

  let allPassed = true;
  for (const r of auditResult.results) {
    if (r.rawAmpsCount === 0 && !r.hasParserError) {
      console.log(`  ✅ PASS: ${r.file} (raw ampersands: 0, parser errors: 0)`);
    } else {
      console.error(`  ❌ FAIL: ${r.file} (raw ampersands: ${r.rawAmpsCount}, error: ${r.errorMessage})`);
      allPassed = false;
    }
  }

  console.log(`\nOPF decoded dc:title: "${auditResult.opfTitle}"`);
  console.log(`NCX decoded docTitle: "${auditResult.ncxTitle}"`);
  console.log(`NCX navPoint count: ${auditResult.ncxNavPointCount}`);
  console.log(`OPF spine count: ${auditResult.opfSpineCount}`);

  if (
    allPassed &&
    auditResult.opfTitle === 'The Art of Reading: Typography, Optics & Digital Comfort' &&
    auditResult.ncxTitle === 'The Art of Reading: Typography, Optics & Digital Comfort' &&
    auditResult.ncxNavPointCount === 10 &&
    auditResult.opfSpineCount === 4
  ) {
    console.log('\n🎉 ALL XML / DOMPARSER TESTS PASSED FLAWLESSLY!');
  } else {
    console.error('\n❌ VALIDATION FAILED!');
    process.exit(1);
  }
})();
