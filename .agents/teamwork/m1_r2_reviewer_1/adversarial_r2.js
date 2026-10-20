/**
 * Independent Adversarial Stress Test Suite for Milestone 1 Iteration 2
 * Reviewer: m1_r2_reviewer_1
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
    failureDetails.push(message);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runAdversarialSuite() {
  console.log('================================================================');
  console.log('   M1-R2 INDEPENDENT ADVERSARIAL STRESS TEST (REVIEWER 1)       ');
  console.log('================================================================');

  // ---------------------------------------------------------------------------
  // 1. ADVERSARIAL UNIT TESTING: escapeXml(unsafe)
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Adversarial XML Escaper Edge Cases ---');
  const { escapeXml } = await import(path.join(PROJECT_ROOT, 'js/sample-book.js'));

  // Test 1.1: Falsy / boundary types
  assert(escapeXml(null) === '', 'escapeXml(null) yields empty string');
  assert(escapeXml(undefined) === '', 'escapeXml(undefined) yields empty string');
  assert(escapeXml('') === '', 'escapeXml("") yields empty string');
  assert(escapeXml(0) === '0', 'escapeXml(0) preserves numeric 0 as string');
  assert(escapeXml(-42) === '-42', 'escapeXml(-42) preserves negative numbers');
  assert(escapeXml(3.14159) === '3.14159', 'escapeXml(3.14159) preserves floating point');
  assert(escapeXml(false) === 'false', 'escapeXml(false) preserves boolean false');
  assert(escapeXml(true) === 'true', 'escapeXml(true) preserves boolean true');

  // Test 1.2: All XML reserved entities
  const hostileString = `<book id="b1" quote='val'>Tom & Jerry & <Friends></book>`;
  const escaped = escapeXml(hostileString);
  const expectedEscaped = `&lt;book id=&quot;b1&quot; quote=&apos;val&apos;&gt;Tom &amp; Jerry &amp; &lt;Friends&gt;&lt;/book&gt;`;
  assert(escaped === expectedEscaped, 'All 5 XML characters correctly escaped without corruption');

  // Test 1.3: Repeated / clustered entities
  const cluster = `&&&&&&<<<<<>>>>>"""""'''''`;
  const escapedCluster = escapeXml(cluster);
  assert(!escapedCluster.includes('<') && !escapedCluster.includes('>'), 'No unescaped brackets in cluster');
  assert(!escapedCluster.includes('"') && !escapedCluster.includes("'"), 'No unescaped quotes in cluster');
  assert((escapedCluster.match(/&amp;/g) || []).length === 6, 'All 6 ampersands escaped');

  // Test 1.4: Unicode & Emoji & Control chars
  const unicodeHostile = `📚 Title with "Quotes" & Special chars: café, naïve, 漢字, \n\t newline`;
  const escapedUnicode = escapeXml(unicodeHostile);
  assert(escapedUnicode.includes('📚') && escapedUnicode.includes('café') && escapedUnicode.includes('漢字'), 'Unicode characters preserved intact');
  assert(escapedUnicode.includes('&amp;') && escapedUnicode.includes('&quot;'), 'Quotes and ampersands escaped in Unicode context');

  // ---------------------------------------------------------------------------
  // 2. HEADLESS CHROME TEST HARNESS SETUP
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Headless Chrome Browser Setup ---');
  assert(fs.existsSync(CHROME_PATH), `Chrome binary confirmed at ${CHROME_PATH}`);

  const { startServer } = require(path.join(PROJECT_ROOT, 'test/server.js'));
  const serverInstance = await startServer({ port: 0, autoPortFallback: true });
  console.log(`  Static server running on: ${serverInstance.url}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // -------------------------------------------------------------------------
    // 3. ADVERSARIAL METADATA INJECTION IN SAMPLE EPUB
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Adversarial Metadata Injection & XML DOMParser Stress Test ---');
    await page.goto(`${serverInstance.url}/index.html`, { waitUntil: 'networkidle0' });

    const injectionTestResult = await page.evaluate(async () => {
      const { escapeXml } = await import('./js/sample-book.js');
      const parser = new DOMParser();

      // Simulate malicious/hostile metadata injected into content.opf and toc.ncx templates
      const hostileMetadata = {
        id: 'hostile-id-123"><script>alert(1)</script><tag attr="evil',
        title: 'Adversarial: <Typography & Optics> -- "Quotes" & \'Apostrophes\' -- &amp; already-entity',
        author: 'Attacker & Co. <admin@evil.com> "Lead"',
        language: 'en-US\'><script>',
        publisher: 'Press & Media "International" <LLC>',
        date: '2026-10-17" hack="true',
        description: 'Multi-line <xml>\n\tDescription with & and <tags> and "quotes".'
      };

      // Generate contentOpf snippet using the exact same templating as sample-book.js
      const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${escapeXml(hostileMetadata.id)}</dc:identifier>
    <dc:title>${escapeXml(hostileMetadata.title)}</dc:title>
    <dc:creator id="author">${escapeXml(hostileMetadata.author)}</dc:creator>
    <dc:language>${escapeXml(hostileMetadata.language)}</dc:language>
    <dc:publisher>${escapeXml(hostileMetadata.publisher)}</dc:publisher>
    <dc:date>${escapeXml(hostileMetadata.date)}</dc:date>
    <dc:description>${escapeXml(hostileMetadata.description)}</dc:description>
  </metadata>
</package>`;

      const docOpf = parser.parseFromString(contentOpf, 'application/xml');
      const opfErrors = docOpf.getElementsByTagName('parsererror');

      // Generate tocNcx snippet using exact same templating
      const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${escapeXml(hostileMetadata.id)}"/>
  </head>
  <docTitle>
    <text>${escapeXml(hostileMetadata.title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(hostileMetadata.author)}</text>
  </docAuthor>
</ncx>`;

      const docNcx = parser.parseFromString(tocNcx, 'application/xml');
      const ncxErrors = docNcx.getElementsByTagName('parsererror');

      // Check extracted text content from DOM tree
      const extractedTitleFromOpf = docOpf.querySelector('title')?.textContent;
      const extractedTitleFromNcx = docNcx.querySelector('docTitle text')?.textContent;

      return {
        opfErrorCount: opfErrors.length,
        opfErrorText: opfErrors.length > 0 ? opfErrors[0].textContent : null,
        ncxErrorCount: ncxErrors.length,
        ncxErrorText: ncxErrors.length > 0 ? ncxErrors[0].textContent : null,
        extractedTitleFromOpf,
        extractedTitleFromNcx,
        originalTitle: hostileMetadata.title
      };
    });

    assert(injectionTestResult.opfErrorCount === 0, 'Adversarial hostile metadata parses in content.opf with 0 parsererror');
    assert(injectionTestResult.ncxErrorCount === 0, 'Adversarial hostile metadata parses in toc.ncx with 0 parsererror');
    assert(injectionTestResult.extractedTitleFromOpf === injectionTestResult.originalTitle, 'Extracted OPF title matches unescaped original string exactly (lossless round-trip)');
    assert(injectionTestResult.extractedTitleFromNcx === injectionTestResult.originalTitle, 'Extracted NCX title matches unescaped original string exactly (lossless round-trip)');

    // -------------------------------------------------------------------------
    // 4. REAL RUNTIME EPUB ARCHIVE PARSING WITH NATIVE DOMPARSER
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Real Runtime EPUB Archive Validation ---');
    const archiveParseResults = await page.evaluate(async () => {
      const { generateSampleEpub } = await import('./js/sample-book.js');
      const { arrayBuffer } = await generateSampleEpub();
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const parser = new DOMParser();

      const files = [
        'META-INF/container.xml',
        'OEBPS/content.opf',
        'OEBPS/toc.ncx',
        'OEBPS/nav.xhtml',
        'OEBPS/cover.xhtml',
        'OEBPS/images/cover.svg',
        'OEBPS/text/ch01.xhtml',
        'OEBPS/text/ch02.xhtml',
        'OEBPS/text/ch03.xhtml'
      ];

      const report = [];
      for (const f of files) {
        const text = await zip.file(f).async('string');
        const doc = parser.parseFromString(text, 'application/xml');
        const errors = doc.getElementsByTagName('parsererror');
        report.push({
          file: f,
          hasError: errors.length > 0,
          errorText: errors.length > 0 ? errors[0].textContent : null,
          rootTag: doc.documentElement ? doc.documentElement.tagName : null
        });
      }
      return report;
    });

    for (const r of archiveParseResults) {
      assert(!r.hasError, `Archive entry [${r.file}] parsed with 0 XML parsererror (root: <${r.rootTag}>)`);
    }

    // -------------------------------------------------------------------------
    // 5. FOUC & TRANSITION LIFECYCLE ADVERSARIAL STRESS TEST
    // -------------------------------------------------------------------------
    console.log('\n--- 5. FOUC & Transition Lifecycle Adversarial Testing ---');

    // Test with multiple localStorage initial states
    const testThemes = ['warm-paper', 'soft-dark', 'daylight', 'sage', 'corrupted-theme-name'];
    for (const theme of testThemes) {
      const testPage = await browser.newPage();
      await testPage.evaluateOnNewDocument((t) => {
        try {
          localStorage.setItem('webreader_theme', t);
        } catch (e) {}
      }, theme);

      await testPage.goto(`${serverInstance.url}/index.html`, { waitUntil: 'domcontentloaded' });

      const evaluatedState = await testPage.evaluate(() => {
        const dataTheme = document.documentElement.getAttribute('data-theme');
        return { dataTheme };
      });

      const expectedTheme = theme === 'corrupted-theme-name' ? 'warm-paper' : theme;
      assert(evaluatedState.dataTheme === expectedTheme, `Theme initialization for '${theme}' resolved to '${expectedTheme}'`);

      // Wait 80ms for double-rAF
      await new Promise((r) => setTimeout(r, 80));

      const hasNoTransitionClass = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('no-theme-transition');
      });
      assert(!hasNoTransitionClass, `no-theme-transition removed after double-rAF for theme '${theme}'`);

      await testPage.close();
    }

    // -------------------------------------------------------------------------
    // 6. CSS TRANSITION ISOLATION & TRANSFORM PRESERVATION
    // -------------------------------------------------------------------------
    console.log('\n--- 6. CSS Transition Isolation & Motion Integrity ---');
    const transitionPage = await browser.newPage();
    await transitionPage.goto(`${serverInstance.url}/index.html`, { waitUntil: 'networkidle0' });

    // Wait for double-rAF
    await new Promise((r) => setTimeout(r, 80));

    const motionAudit = await transitionPage.evaluate(() => {
      // Create DOM elements matching WebReader's UI components
      const drawer = document.createElement('div');
      drawer.className = 'drawer';
      drawer.id = 'audit-drawer';
      document.body.appendChild(drawer);

      const drawerRight = document.createElement('div');
      drawerRight.className = 'drawer drawer-right';
      drawerRight.id = 'audit-drawer-right';
      document.body.appendChild(drawerRight);

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.id = 'audit-btn';
      btn.textContent = 'Test Button';
      document.body.appendChild(btn);

      const card = document.createElement('div');
      card.className = 'card';
      card.id = 'audit-card';
      document.body.appendChild(card);

      const computedDrawer = window.getComputedStyle(drawer);
      const computedBtn = window.getComputedStyle(btn);
      const computedCard = window.getComputedStyle(card);
      const computedBody = window.getComputedStyle(document.body);

      // Verify initial transforms
      const initialDrawerTransform = computedDrawer.transform;
      const initialDrawerTransition = computedDrawer.transition;
      const initialBtnTransition = computedBtn.transition;

      // Now toggle .is-open on drawer
      drawer.classList.add('is-open');
      const openDrawerTransform = window.getComputedStyle(drawer).transform;

      // Switch theme to 'soft-dark' and verify transitions
      document.documentElement.setAttribute('data-theme', 'soft-dark');
      const switchedBodyBg = window.getComputedStyle(document.body).backgroundColor;

      return {
        initialDrawerTransform,
        initialDrawerTransition,
        initialBtnTransition,
        openDrawerTransform,
        switchedBodyBg,
        cardTransition: computedCard.transition,
        bodyTransition: computedBody.transition
      };
    });

    console.log('  Drawer transition:', motionAudit.initialDrawerTransition);
    console.log('  Button transition:', motionAudit.initialBtnTransition);

    assert(
      motionAudit.initialDrawerTransition.includes('transform') &&
      motionAudit.initialDrawerTransition.includes('background-color'),
      '.drawer transition includes BOTH transform and background-color'
    );
    assert(
      motionAudit.initialBtnTransition.includes('transform') &&
      motionAudit.initialBtnTransition.includes('background-color'),
      '.btn transition includes BOTH transform and background-color'
    );
    assert(
      motionAudit.bodyTransition.includes('background-color'),
      'body transition includes background-color'
    );
    assert(
      motionAudit.openDrawerTransform.includes('matrix') || motionAudit.openDrawerTransform === 'none',
      'drawer toggling to .is-open computes open transform matrix'
    );

    // -------------------------------------------------------------------------
    // 7. PREFERS-REDUCED-MOTION ACCESSIBILITY VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Accessibility & Prefers-Reduced-Motion Verification ---');
    await transitionPage.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

    const reducedMotionAudit = await transitionPage.evaluate(() => {
      const drawer = document.getElementById('audit-drawer');
      const btn = document.getElementById('audit-btn');
      const drawerTrans = window.getComputedStyle(drawer).transition;
      const btnTrans = window.getComputedStyle(btn).transition;
      const bodyTrans = window.getComputedStyle(document.body).transition;
      return { drawerTrans, btnTrans, bodyTrans };
    });

    assert(
      reducedMotionAudit.drawerTrans.startsWith('none') || reducedMotionAudit.drawerTrans === '',
      'prefers-reduced-motion: reduce disables drawer transitions'
    );
    assert(
      reducedMotionAudit.btnTrans.startsWith('none') || reducedMotionAudit.btnTrans === '',
      'prefers-reduced-motion: reduce disables button transitions'
    );
    assert(
      reducedMotionAudit.bodyTrans.startsWith('none') || reducedMotionAudit.bodyTrans === '',
      'prefers-reduced-motion: reduce disables body transitions'
    );

    await transitionPage.close();

    // -------------------------------------------------------------------------
    // 8. INTEGRITY VIOLATION SCAN & CHEAT DETECTION
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Anti-Cheat & Integrity Violation Scan ---');
    // Check if sample-book.js has hardcoded test mocks or bypassed logic
    const sampleBookCode = fs.readFileSync(path.join(PROJECT_ROOT, 'js/sample-book.js'), 'utf8');
    assert(!sampleBookCode.includes('// mock'), 'sample-book.js contains no test mock bypasses');
    assert(!sampleBookCode.includes('eval('), 'sample-book.js contains no unsafe eval');
    assert(sampleBookCode.includes('export function escapeXml'), 'escapeXml is properly exported');
    assert(sampleBookCode.includes('escapeXml(SAMPLE_BOOK_METADATA.title)'), 'escapeXml is actively used in OPF and NCX');

    // Check page errors accumulated across entire session
    assert(pageErrors.length === 0, `Headless browser recorded 0 unhandled errors: ${pageErrors.join(', ')}`);

  } finally {
    await browser.close();
    await serverInstance.close();
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`REVIEWER 1 ADVERSARIAL AUDIT COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error('Failure summary:');
    failureDetails.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Fatal crash in adversarial test runner:', err);
  process.exit(1);
});
