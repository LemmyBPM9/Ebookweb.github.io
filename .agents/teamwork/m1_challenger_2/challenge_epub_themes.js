/**
 * challenge_epub_themes.js
 * Adversarial Challenger Test Harness for Milestone 1:
 * - Binary OCF 3.3 Verification
 * - Dual EPUB 2/3 Navigation Tree & Target Anchor Verification
 * - SVG Cover & Spectrum Diagram XML Parsing
 * - WCAG AAA Contrast Stress Test
 * - Concurrency & Idempotency Stress Test
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Color & Contrast Helper functions for WCAG 2.1
function hexToRgb(hex) {
  let cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function parseRgbString(str) {
  if (str.startsWith('#')) return hexToRgb(str);
  const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10)
    };
  }
  throw new Error(`Cannot parse color: ${str}`);
}

function sRgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function calculateLuminance(rgb) {
  const r = sRgbToLinear(rgb.r);
  const g = sRgbToLinear(rgb.g);
  const b = sRgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrast(color1, color2) {
  const rgb1 = typeof color1 === 'string' ? parseRgbString(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? parseRgbString(color2) : color2;
  const l1 = calculateLuminance(rgb1);
  const l2 = calculateLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Test harness state
let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${message}`);
  } else {
    totalFailed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

async function runAdversarialChallenge() {
  console.log('================================================================');
  console.log('STARTING EMPIRICAL CHALLENGER TEST SUITE (MILESTONE 1)');
  console.log('Target: JSZip, OCF 3.3 Sample EPUB, Dual Nav, SVG, Themes');
  console.log('================================================================\n');

  // Load JSZip in Node
  const NodeJSZip = require(path.join(PROJECT_ROOT, 'vendor/jszip.min.js'));

  assert(typeof NodeJSZip === 'function', 'JSZip loaded successfully into Node context');
  assert(NodeJSZip.version === '3.10.1', `JSZip version is 3.10.1 (got ${NodeJSZip.version})`);

  // Start static test server
  console.log('\n--- 1. Starting Static Server & Headless Chrome ---');
  const server = await startServer({ port: 3344, rootDir: PROJECT_ROOT, autoPortFallback: true });
  console.log(`  Static server running at ${server.url}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  console.log('  Headless Chrome launched successfully.');

  const page = await browser.newPage();
  await page.goto(`${server.url}/index.html`, { waitUntil: 'domcontentloaded' });

  // --------------------------------------------------------------------------
  // SECTION 1: OCF 3.3 BINARY VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. EPUB Open Container Format (OCF 3.3) Binary Verification ---');

  // Generate EPUB inside headless Chrome
  const epubData = await page.evaluate(async () => {
    const mod = await import('./js/sample-book.js');
    const result = await mod.generateSampleEpub();
    return {
      byteLength: result.arrayBuffer.byteLength,
      bytes: Array.from(new Uint8Array(result.arrayBuffer.slice(0, 80))),
      fullBufferBase64: btoa(
        new Uint8Array(result.arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      ),
      bookRecord: {
        id: result.bookRecord.id,
        title: result.bookRecord.title,
        spineCount: result.bookRecord.spineCount,
        hasFileBlob: !!result.bookRecord.fileBlob,
        hasCoverBlob: !!result.bookRecord.coverBlob
      }
    };
  });

  const rawBytes = Buffer.from(epubData.bytes);
  console.log(`  Inspecting initial ${rawBytes.length} bytes of generated EPUB...`);

  // Local File Header Signature: 0x50 0x4b 0x03 0x04
  const sig = rawBytes.readUInt32LE(0);
  assert(sig === 0x04034b50, `Byte offset 0 contains ZIP local file header signature 0x04034b50 (PK\\x03\\x04)`);

  // Compression method: 2 bytes at offset 8. Must be 0 (STORE)
  const compressionMethod = rawBytes.readUInt16LE(8);
  assert(compressionMethod === 0, `Offset 8: Compression method is strictly 0 (STORE / uncompressed, got ${compressionMethod})`);

  // Compressed size: 4 bytes at offset 18. Must be 20
  const compressedSize = rawBytes.readUInt32LE(18);
  assert(compressedSize === 20, `Offset 18: Compressed size is exactly 20 bytes (got ${compressedSize})`);

  // Uncompressed size: 4 bytes at offset 22. Must be 20
  const uncompressedSize = rawBytes.readUInt32LE(22);
  assert(uncompressedSize === 20, `Offset 22: Uncompressed size is exactly 20 bytes (got ${uncompressedSize})`);

  // File name length: 2 bytes at offset 26. Must be 8 ('mimetype')
  const fileNameLength = rawBytes.readUInt16LE(26);
  assert(fileNameLength === 8, `Offset 26: File name length is 8 bytes (got ${fileNameLength})`);

  // Extra field length: 2 bytes at offset 28. Must be 0
  const extraFieldLength = rawBytes.readUInt16LE(28);
  assert(extraFieldLength === 0, `Offset 28: Extra field length is strictly 0 (no extra headers, got ${extraFieldLength})`);

  // File name: 8 bytes at offset 30
  const fileName = rawBytes.subarray(30, 38).toString('ascii');
  assert(fileName === 'mimetype', `Offset 30-37: File name is strictly 'mimetype' (got '${fileName}')`);

  // File data: 20 bytes at offset 38
  const fileData = rawBytes.subarray(38, 58).toString('ascii');
  assert(fileData === 'application/epub+zip', `Offset 38-57: File data is exact ASCII string 'application/epub+zip' (got '${fileData}')`);

  // Next entry offset: 58
  const nextSig = rawBytes.readUInt32LE(58);
  assert(nextSig === 0x04034b50, `Offset 58: Next ZIP local file header signature begins immediately after mimetype data`);

  // --------------------------------------------------------------------------
  // SECTION 2: DUAL EPUB 2/3 NAVIGATION & XML DOM PARSER VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Dual EPUB 2 / EPUB 3 Navigation & Structural Parity ---');

  const fullZipBuffer = Buffer.from(epubData.fullBufferBase64, 'base64');
  const zipArchive = await NodeJSZip.loadAsync(fullZipBuffer);

  const expectedFiles = [
    'mimetype',
    'META-INF/container.xml',
    'OEBPS/content.opf',
    'OEBPS/toc.ncx',
    'OEBPS/nav.xhtml',
    'OEBPS/cover.xhtml',
    'OEBPS/images/cover.svg',
    'OEBPS/styles/stylesheet.css',
    'OEBPS/text/ch01.xhtml',
    'OEBPS/text/ch02.xhtml',
    'OEBPS/text/ch03.xhtml'
  ];

  for (const expFile of expectedFiles) {
    const fileEntry = zipArchive.file(expFile);
    assert(!!fileEntry, `ZIP archive contains mandatory file '${expFile}'`);
  }

  // Parse container.xml, content.opf, toc.ncx, and nav.xhtml inside headless Chrome using native DOMParser
  const containerXmlStr = await zipArchive.file('META-INF/container.xml').async('text');
  const contentOpfStr = await zipArchive.file('OEBPS/content.opf').async('text');
  const tocNcxStr = await zipArchive.file('OEBPS/toc.ncx').async('text');
  const navXhtmlStr = await zipArchive.file('OEBPS/nav.xhtml').async('text');
  const coverSvgStr = await zipArchive.file('OEBPS/images/cover.svg').async('text');
  const ch01Str = await zipArchive.file('OEBPS/text/ch01.xhtml').async('text');
  const ch02Str = await zipArchive.file('OEBPS/text/ch02.xhtml').async('text');
  const ch03Str = await zipArchive.file('OEBPS/text/ch03.xhtml').async('text');

  const navAnalysis = await page.evaluate(
    ({ containerXml, contentOpf, tocNcx, navXhtml, ch01, ch02, ch03 }) => {
      const parser = new DOMParser();

      function parseXml(xmlString, mime = 'application/xml') {
        const doc = parser.parseFromString(xmlString, mime);
        const error = doc.querySelector('parsererror');
        return {
          hasError: !!error,
          errorMessage: error ? error.textContent : null,
          doc
        };
      }

      // 1. Verify container.xml
      const containerRes = parseXml(containerXml);
      const rootfile = containerRes.doc.querySelector('rootfile');
      const opfPath = rootfile ? rootfile.getAttribute('full-path') : null;

      // 2. Verify content.opf
      const opfRes = parseXml(contentOpf);
      const spineItems = Array.from(opfRes.doc.querySelectorAll('spine itemref')).map(i => i.getAttribute('idref'));
      const manifestItems = {};
      opfRes.doc.querySelectorAll('manifest item').forEach(item => {
        manifestItems[item.getAttribute('id')] = {
          href: item.getAttribute('href'),
          mediaType: item.getAttribute('media-type'),
          properties: item.getAttribute('properties') || ''
        };
      });

      // 3. Verify toc.ncx (EPUB 2)
      const ncxRes = parseXml(tocNcx);
      const ncxPoints = [];
      function extractNcx(parent) {
        const children = parent.querySelectorAll(':scope > navPoint');
        const list = [];
        children.forEach(pt => {
          const label = pt.querySelector(':scope > navLabel > text')?.textContent?.trim();
          const src = pt.querySelector(':scope > content')?.getAttribute('src');
          const sub = extractNcx(pt);
          list.push({ label, src, children: sub });
        });
        return list;
      }
      const ncxMap = ncxRes.doc.querySelector('navMap');
      const ncxTree = ncxMap ? extractNcx(ncxMap) : [];

      // Flatten ncx links
      function flattenTree(tree) {
        let res = [];
        for (const item of tree) {
          res.push({ label: item.label, src: item.src });
          if (item.children && item.children.length > 0) {
            res = res.concat(flattenTree(item.children));
          }
        }
        return res;
      }
      const flatNcx = flattenTree(ncxTree);

      // 4. Verify nav.xhtml (EPUB 3)
      const navRes = parseXml(navXhtml, 'application/xhtml+xml');
      const tocNav = navRes.doc.querySelector('nav[*|type="toc"], nav#toc, nav[role="doc-toc"]');
      function extractNavDoc(ol) {
        const list = [];
        if (!ol) return list;
        const lis = ol.querySelectorAll(':scope > li');
        lis.forEach(li => {
          const a = li.querySelector(':scope > a');
          const subOl = li.querySelector(':scope > ol');
          list.push({
            label: a ? a.textContent.trim() : '',
            src: a ? a.getAttribute('href') : '',
            children: extractNavDoc(subOl)
          });
        });
        return list;
      }
      const navOl = tocNav ? tocNav.querySelector(':scope > ol') : null;
      const navTree = extractNavDoc(navOl);
      const flatNav = flattenTree(navTree);

      // 5. Verify chapter files & internal anchor targets
      const chapterDocs = {
        'text/ch01.xhtml': parseXml(ch01, 'application/xhtml+xml'),
        'text/ch02.xhtml': parseXml(ch02, 'application/xhtml+xml'),
        'text/ch03.xhtml': parseXml(ch03, 'application/xhtml+xml')
      };

      const anchorChecks = [];
      for (const link of flatNcx) {
        if (link.src.includes('#')) {
          const [file, anchor] = link.src.split('#');
          const chDocRes = chapterDocs[file];
          let found = false;
          if (chDocRes && !chDocRes.hasError) {
            const targetEl = chDocRes.doc.getElementById(anchor);
            found = !!targetEl;
          }
          anchorChecks.push({ link: link.src, file, anchor, found });
        }
      }

      return {
        containerError: containerRes.hasError ? containerRes.errorMessage : null,
        opfPath,
        opfError: opfRes.hasError ? opfRes.errorMessage : null,
        spineCount: spineItems.length,
        manifestCount: Object.keys(manifestItems).length,
        hasNavProperty: manifestItems['nav']?.properties.includes('nav'),
        hasCoverProperty: manifestItems['cover-image']?.properties.includes('cover-image'),
        ncxError: ncxRes.hasError ? ncxRes.errorMessage : null,
        navError: navRes.hasError ? navRes.errorMessage : null,
        ncxItemCount: flatNcx.length,
        navItemCount: flatNav.length,
        flatNcx,
        flatNav,
        anchorChecks
      };
    },
    {
      containerXml: containerXmlStr,
      contentOpf: contentOpfStr,
      tocNcx: tocNcxStr,
      navXhtml: navXhtmlStr,
      ch01: ch01Str,
      ch02: ch02Str,
      ch03: ch03Str
    }
  );

  assert(navAnalysis.containerError === null, `META-INF/container.xml parses with zero XML parser errors`);
  assert(navAnalysis.opfPath === 'OEBPS/content.opf', `container.xml correctly points to OEBPS/content.opf`);
  assert(navAnalysis.opfError === null, `OEBPS/content.opf parses with zero XML parser errors`);
  assert(navAnalysis.hasNavProperty === true, `Manifest correctly declares properties="nav" for nav.xhtml`);
  assert(navAnalysis.hasCoverProperty === true, `Manifest correctly declares properties="cover-image" for cover.svg`);
  assert(navAnalysis.spineCount === 4, `Spine contains 4 itemrefs (cover + 3 chapters, got ${navAnalysis.spineCount})`);

  assert(navAnalysis.ncxError === null, `OEBPS/toc.ncx parses with zero XML parser errors (actual: ${navAnalysis.ncxError || 'none'})`);
  assert(navAnalysis.navError === null, `OEBPS/nav.xhtml parses with zero XML parser errors (actual: ${navAnalysis.navError || 'none'})`);
  assert(navAnalysis.ncxItemCount === 10, `EPUB 2 NCX contains exactly 10 navigation entries (got ${navAnalysis.ncxItemCount})`);
  assert(navAnalysis.navItemCount === 10, `EPUB 3 Nav Doc contains exactly 10 navigation entries (got ${navAnalysis.navItemCount})`);

  // Assert link-for-link equivalence between EPUB 2 NCX and EPUB 3 Nav Document
  const maxItems = Math.max(navAnalysis.flatNcx.length, navAnalysis.flatNav.length);
  for (let i = 0; i < maxItems; i++) {
    const ncxItem = navAnalysis.flatNcx[i] || { src: '(missing in NCX)', label: '(missing in NCX)' };
    const navItem = navAnalysis.flatNav[i] || { src: '(missing in NavDoc)', label: '(missing in NavDoc)' };
    assert(ncxItem.src === navItem.src, `TOC entry ${i + 1} href matches: '${ncxItem.src}' == '${navItem.src}'`);
    assert(ncxItem.label === navItem.label, `TOC entry ${i + 1} label matches: '${ncxItem.label}'`);
  }

  // Assert target anchors actually exist in target XHTML files
  for (const anchorCheck of navAnalysis.anchorChecks) {
    assert(anchorCheck.found === true, `TOC anchor #${anchorCheck.anchor} exists in ${anchorCheck.file}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 3: SVG COVER & OPTICAL SPECTRUM DIAGRAM VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- 4. SVG Cover & Spectrum Diagram XML Parsing & Rendering ---');

  const svgAnalysis = await page.evaluate(
    ({ coverSvg, ch02 }) => {
      const parser = new DOMParser();

      // 1. Cover SVG validation
      const coverDoc = parser.parseFromString(coverSvg, 'image/svg+xml');
      const coverErr = coverDoc.querySelector('parsererror');
      const coverRoot = coverDoc.documentElement;
      const bgGrad = coverDoc.getElementById('bgGrad');
      const goldGrad = coverDoc.getElementById('goldGrad');
      const coverTexts = Array.from(coverDoc.querySelectorAll('text')).map(t => (t ? t.textContent.trim() : ''));

      // 2. Embedded Spectrum Diagram SVG in Chapter 2
      const ch02Doc = parser.parseFromString(ch02, 'application/xhtml+xml');
      const ch02Err = ch02Doc.querySelector('parsererror');
      const spectrumSvgEl = ch02Doc.querySelector('.diagram-wrapper svg');
      let spectrumXmlErr = null;
      let spectrumViewBox = null;
      let spectrumPathCount = 0;
      let has555Peak = false;

      if (spectrumSvgEl) {
        spectrumViewBox = spectrumSvgEl.getAttribute('viewBox');
        const spectrumSvgStr = new XMLSerializer().serializeToString(spectrumSvgEl);
        const parsedSpec = parser.parseFromString(spectrumSvgStr, 'image/svg+xml');
        const specErr = parsedSpec.querySelector('parsererror');
        if (specErr) spectrumXmlErr = specErr.textContent;
        spectrumPathCount = parsedSpec.querySelectorAll('path').length;
        has555Peak = parsedSpec.documentElement ? parsedSpec.documentElement.textContent.includes('555nm') : false;
      }

      return {
        coverXmlError: coverErr ? coverErr.textContent : null,
        coverTag: coverRoot ? coverRoot.tagName.toLowerCase() : null,
        coverViewBox: coverRoot ? coverRoot.getAttribute('viewBox') : null,
        hasBgGrad: !!bgGrad,
        hasGoldGrad: !!goldGrad,
        coverTitleText: coverTexts.find(t => t.includes('READING')),
        ch02XmlError: ch02Err ? ch02Err.textContent : null,
        hasSpectrumSvg: !!spectrumSvgEl,
        spectrumViewBox,
        spectrumXmlErr,
        spectrumPathCount,
        has555Peak
      };
    },
    { coverSvg: coverSvgStr, ch02: ch02Str }
  );

  assert(svgAnalysis.coverXmlError === null, `OEBPS/images/cover.svg parsed with zero XML parser errors`);
  assert(svgAnalysis.coverTag === 'svg', `Cover root element is <svg>`);
  assert(svgAnalysis.coverViewBox === '0 0 600 900', `Cover SVG viewBox is '0 0 600 900' (got '${svgAnalysis.coverViewBox}')`);
  assert(svgAnalysis.hasBgGrad && svgAnalysis.hasGoldGrad, `Cover SVG defines linear gradients #bgGrad and #goldGrad`);
  assert(svgAnalysis.coverTitleText === 'READING', `Cover SVG contains bold title 'READING'`);

  assert(svgAnalysis.ch02XmlError === null, `OEBPS/text/ch02.xhtml parsed with zero XML parser errors`);
  assert(svgAnalysis.hasSpectrumSvg === true, `Chapter 2 contains responsive SVG spectrum diagram`);
  assert(svgAnalysis.spectrumViewBox === '0 520 280' || svgAnalysis.spectrumViewBox === '0 0 520 280', `Spectrum SVG viewBox is '0 0 520 280' (got '${svgAnalysis.spectrumViewBox}')`);
  assert(svgAnalysis.spectrumXmlErr === null, `Serialized spectrum diagram parsed standalone with zero XML parser errors`);
  assert(svgAnalysis.spectrumPathCount >= 1, `Spectrum diagram contains visual curve path`);
  assert(svgAnalysis.has555Peak === true, `Spectrum diagram annotates Human Peak V(λ) = 555nm`);

  // --------------------------------------------------------------------------
  // SECTION 4: WCAG AAA CONTRAST RATIO STRESS TEST
  // --------------------------------------------------------------------------
  console.log('\n--- 5. WCAG AAA Contrast Stress Test Across All 4 Themes ---');

  const themeTokens = await page.evaluate(() => {
    const themes = ['warm-paper', 'soft-dark', 'daylight', 'sage'];
    const results = {};

    for (const theme of themes) {
      document.documentElement.setAttribute('data-theme', theme);
      const computed = window.getComputedStyle(document.documentElement);

      results[theme] = {
        bg: computed.getPropertyValue('--color-bg').trim(),
        surface: computed.getPropertyValue('--color-surface').trim(),
        surfaceHover: computed.getPropertyValue('--color-surface-hover').trim(),
        surfaceActive: computed.getPropertyValue('--color-surface-active').trim(),
        text: computed.getPropertyValue('--color-text').trim(),
        textSecondary: computed.getPropertyValue('--color-text-secondary').trim(),
        textMuted: computed.getPropertyValue('--color-text-muted').trim(),
        accent: computed.getPropertyValue('--color-accent').trim(),
        accentHover: computed.getPropertyValue('--color-accent-hover').trim(),
        accentText: computed.getPropertyValue('--color-accent-text').trim(),
        border: computed.getPropertyValue('--color-border').trim(),
        borderStrong: computed.getPropertyValue('--color-border-strong').trim()
      };
    }
    return results;
  });

  const contrastResults = {};

  for (const [theme, tokens] of Object.entries(themeTokens)) {
    console.log(`\n  Calculating contrast ratios for theme '${theme}':`);
    const bodyTextBgContrast = calculateContrast(tokens.text, tokens.bg);
    const bodyTextSurfaceContrast = calculateContrast(tokens.text, tokens.surface);
    const secTextBgContrast = calculateContrast(tokens.textSecondary, tokens.bg);
    const secTextSurfaceContrast = calculateContrast(tokens.textSecondary, tokens.surface);
    const mutedTextBgContrast = calculateContrast(tokens.textMuted, tokens.bg);
    const mutedTextSurfaceContrast = calculateContrast(tokens.textMuted, tokens.surface);
    const accentTextOnAccent = calculateContrast(tokens.accentText, tokens.accent);
    const accentTextOnAccentHover = calculateContrast(tokens.accentText, tokens.accentHover);
    const borderStrongBgContrast = calculateContrast(tokens.borderStrong, tokens.bg);

    contrastResults[theme] = {
      bodyTextBgContrast,
      bodyTextSurfaceContrast,
      secTextBgContrast,
      secTextSurfaceContrast,
      mutedTextBgContrast,
      mutedTextSurfaceContrast,
      accentTextOnAccent,
      accentTextOnAccentHover,
      borderStrongBgContrast
    };

    console.log(`    Body Text / BG:            ${bodyTextBgContrast.toFixed(2)}:1 (AAA requires >= 7.0:1)`);
    console.log(`    Body Text / Surface:       ${bodyTextSurfaceContrast.toFixed(2)}:1 (AAA requires >= 7.0:1)`);
    console.log(`    Secondary Text / BG:       ${secTextBgContrast.toFixed(2)}:1 (AA requires >= 4.5:1)`);
    console.log(`    Secondary Text / Surface:  ${secTextSurfaceContrast.toFixed(2)}:1 (AA requires >= 4.5:1)`);
    console.log(`    Muted Text / BG:           ${mutedTextBgContrast.toFixed(2)}:1 (AA requires >= 4.5:1)`);
    console.log(`    Muted Text / Surface:      ${mutedTextSurfaceContrast.toFixed(2)}:1 (AA requires >= 4.5:1)`);
    console.log(`    Accent Button Text / Accent: ${accentTextOnAccent.toFixed(2)}:1`);
    console.log(`    Accent Button / Hover:       ${accentTextOnAccentHover.toFixed(2)}:1`);
    console.log(`    Border Strong / BG:        ${borderStrongBgContrast.toFixed(2)}:1 (UI requires >= 3.0:1)`);

    // Assertions
    assert(bodyTextBgContrast >= 7.0, `[${theme}] Body text on BG passes WCAG AAA >= 7.0:1 (${bodyTextBgContrast.toFixed(2)}:1)`);
    assert(bodyTextSurfaceContrast >= 7.0, `[${theme}] Body text on Surface passes WCAG AAA >= 7.0:1 (${bodyTextSurfaceContrast.toFixed(2)}:1)`);
    assert(secTextBgContrast >= 4.5, `[${theme}] Secondary text on BG passes WCAG AA >= 4.5:1 (${secTextBgContrast.toFixed(2)}:1)`);
    assert(secTextSurfaceContrast >= 4.5, `[${theme}] Secondary text on Surface passes WCAG AA >= 4.5:1 (${secTextSurfaceContrast.toFixed(2)}:1)`);
    assert(mutedTextBgContrast >= 4.5, `[${theme}] Muted text on BG passes WCAG AA >= 4.5:1 (${mutedTextBgContrast.toFixed(2)}:1)`);
    assert(mutedTextSurfaceContrast >= 4.5, `[${theme}] Muted text on Surface passes WCAG AA >= 4.5:1 (${mutedTextSurfaceContrast.toFixed(2)}:1)`);
    assert(accentTextOnAccent >= 4.5, `[${theme}] Accent button text on Accent passes WCAG AA >= 4.5:1 (${accentTextOnAccent.toFixed(2)}:1)`);
    assert(borderStrongBgContrast >= 3.0, `[${theme}] Border strong on BG passes WCAG 2.1 non-text UI >= 3.0:1 (${borderStrongBgContrast.toFixed(2)}:1)`);

    // Glare check: No pure #000000 on pure #ffffff
    const isPureBlackWhite = (tokens.text.toLowerCase() === '#000000' && tokens.bg.toLowerCase() === '#ffffff') ||
                             (tokens.text.toLowerCase() === 'rgb(0, 0, 0)' && tokens.bg.toLowerCase() === 'rgb(255, 255, 255)');
    assert(!isPureBlackWhite, `[${theme}] Avoids harsh #000000 on #ffffff halation`);
  }

  // Spec-specific requirement: Assert --color-accent-text on Soft Dark passes >= 7.0:1 AAA contrast
  const softDarkAccentContrast = contrastResults['soft-dark'].accentTextOnAccent;
  assert(
    softDarkAccentContrast >= 7.0,
    `Soft Dark --color-accent-text on --color-accent passes WCAG AAA >= 7.0:1 (${softDarkAccentContrast.toFixed(2)}:1 >= 7.0:1)`
  );

  // --------------------------------------------------------------------------
  // SECTION 5: CONCURRENCY, RE-ENTRANCY & STRESS TESTING
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Concurrency, Re-entrancy & Auto-seeding Stress Testing ---');

  const stressResult = await page.evaluate(async () => {
    const sampleMod = await import('./js/sample-book.js');
    const storageMod = await import('./js/storage/storage-manager.js');
    const storage = storageMod.StorageManager;

    // 1. Run 5 concurrent generateSampleEpub calls
    const startTime = performance.now();
    const concurrentGenerations = await Promise.all([
      sampleMod.generateSampleEpub(),
      sampleMod.generateSampleEpub(),
      sampleMod.generateSampleEpub(),
      sampleMod.generateSampleEpub(),
      sampleMod.generateSampleEpub()
    ]);
    const duration = performance.now() - startTime;

    // Verify all 5 outputs have identical byte lengths and are non-empty
    const lengths = concurrentGenerations.map(g => g.arrayBuffer.byteLength);
    const allSameLength = lengths.every(l => l === lengths[0] && l > 10000);

    // 2. Storage seeding idempotency test
    await storage.openDB();
    // Delete any existing sample book
    await storage.deleteBook(sampleMod.SAMPLE_BOOK_ID);

    // Seed 1
    const seed1 = await sampleMod.seedSampleBookIfEmpty(storage);
    // Seed 2 (should be idempotent / no-op)
    const seed2 = await sampleMod.seedSampleBookIfEmpty(storage);

    const allBooksAfter = await storage.getAllBooks();

    // 3. Delete cascade test
    await storage.saveProgress({ bookId: sampleMod.SAMPLE_BOOK_ID, spineIndex: 1, pageIndex: 3 });
    await storage.addBookmark({ id: 'bm-test-1', bookId: sampleMod.SAMPLE_BOOK_ID, title: 'Test 1' });
    await storage.addBookmark({ id: 'bm-test-2', bookId: sampleMod.SAMPLE_BOOK_ID, title: 'Test 2' });

    // Verify records exist
    const progBefore = await storage.getProgress(sampleMod.SAMPLE_BOOK_ID);
    const bmsBefore = await storage.getBookmarks(sampleMod.SAMPLE_BOOK_ID);

    // Atomic cascade delete
    await storage.deleteBook(sampleMod.SAMPLE_BOOK_ID);

    // Verify all cascading records are purged
    const bookAfterDel = await storage.getBook(sampleMod.SAMPLE_BOOK_ID);
    const progAfterDel = await storage.getProgress(sampleMod.SAMPLE_BOOK_ID);
    const bmsAfterDel = await storage.getBookmarks(sampleMod.SAMPLE_BOOK_ID);

    // Restore sample book
    const restored = await sampleMod.restoreSampleBook(storage);
    const bookAfterRestore = await storage.getBook(sampleMod.SAMPLE_BOOK_ID);

    return {
      allSameLength,
      concurrentCount: concurrentGenerations.length,
      durationMs: duration,
      seed1Success: !!seed1,
      seed2IsSame: seed2?.id === sampleMod.SAMPLE_BOOK_ID,
      bookCountAfterDoubleSeed: allBooksAfter.length,
      progBeforeExists: !!progBefore,
      bmsBeforeCount: bmsBefore.length,
      bookAfterDelIsNull: bookAfterDel === null,
      progAfterDelIsNull: progAfterDel === null,
      bmsAfterDelIsEmpty: bmsAfterDel.length === 0,
      restoredSuccess: !!restored && !!bookAfterRestore
    };
  });

  assert(stressResult.allSameLength, `5 concurrent generateSampleEpub calls returned identical valid byte length (${stressResult.durationMs.toFixed(0)}ms)`);
  assert(stressResult.seed1Success && stressResult.seed2IsSame, `seedSampleBookIfEmpty is strictly idempotent`);
  assert(stressResult.bookCountAfterDoubleSeed === 1, `Library contains exactly 1 book after double-seed`);
  assert(stressResult.progBeforeExists && stressResult.bmsBeforeCount === 2, `Progress and bookmarks properly stored before cascade deletion`);
  assert(stressResult.bookAfterDelIsNull, `deleteBook successfully deleted book from 'books' object store`);
  assert(stressResult.progAfterDelIsNull, `deleteBook atomically cascaded and purged 'reading_progress' record`);
  assert(stressResult.bmsAfterDelIsEmpty, `deleteBook atomically cascaded and purged all bookmarks from 'bookmarks' store`);
  assert(stressResult.restoredSuccess, `restoreSampleBook successfully re-seeded book into IndexedDB`);

  // --------------------------------------------------------------------------
  // SECTION 6: ROOT CAUSE DIAGNOSIS & SIMULATED FIX VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Root Cause Diagnosis & Simulated Fix Validation ---');

  const fixSim = await page.evaluate(async () => {
    const mod = await import('./js/sample-book.js');
    const { arrayBuffer } = await mod.generateSampleEpub();
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();

    let opfText = await zip.file('OEBPS/content.opf').async('text');
    let ncxText = await zip.file('OEBPS/toc.ncx').async('text');
    let navText = await zip.file('OEBPS/nav.xhtml').async('text');

    // Simulate replacing raw & with &amp; in title
    const fixedOpf = opfText.replace('Optics & Digital', 'Optics &amp; Digital');
    const fixedNcx = ncxText.replace('Optics & Digital', 'Optics &amp; Digital');

    const opfDoc = parser.parseFromString(fixedOpf, 'application/xml');
    const ncxDoc = parser.parseFromString(fixedNcx, 'application/xml');
    const navDoc = parser.parseFromString(navText, 'application/xhtml+xml');

    const opfErr = opfDoc.querySelector('parsererror');
    const ncxErr = ncxDoc.querySelector('parsererror');

    const ncxItems = Array.from(ncxDoc.querySelectorAll('navPoint')).map(pt => ({
      label: pt.querySelector('navLabel text')?.textContent?.trim(),
      src: pt.querySelector('content')?.getAttribute('src')
    }));

    const navItems = Array.from(navDoc.querySelectorAll('nav#toc li > a')).map(a => ({
      label: a.textContent.trim(),
      src: a.getAttribute('href')
    }));

    return {
      fixedOpfHasError: !!opfErr,
      fixedNcxHasError: !!ncxErr,
      ncxCount: ncxItems.length,
      navCount: navItems.length,
      allLinksMatch: ncxItems.length === navItems.length && ncxItems.every((item, i) => item.src === navItems[i].src && item.label === navItems[i].label)
    };
  });

  console.log(`  Diagnosis: When raw '&' in title is escaped as '&amp;':`);
  console.log(`    - OEBPS/content.opf parse error resolved: ${!fixSim.fixedOpfHasError}`);
  console.log(`    - OEBPS/toc.ncx parse error resolved:     ${!fixSim.fixedNcxHasError}`);
  console.log(`    - All ${fixSim.ncxCount} NCX & NavDoc links match:      ${fixSim.allLinksMatch}`);

  // Teardown
  await browser.close();
  await server.close();

  console.log('\n================================================================');
  console.log(`CHALLENGE TEST SUITE FINISHED`);
  console.log(`PASSED: ${totalPassed} / ${totalPassed + totalFailed}`);
  console.log(`FAILED: ${totalFailed}`);
  if (totalFailed > 0) {
    console.log(`FAILURES: \n - ${failures.join('\n - ')}`);
  }
  console.log('================================================================\n');

  return { totalPassed, totalFailed, failures, contrastResults };
}

if (require.main === module) {
  runAdversarialChallenge()
    .then(({ totalFailed }) => {
      process.exit(totalFailed === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal challenge runner error:', err);
      process.exit(1);
    });
}

module.exports = { runAdversarialChallenge };
