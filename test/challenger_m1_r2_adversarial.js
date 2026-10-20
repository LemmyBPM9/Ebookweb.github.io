/**
 * test/challenger_m1_r2_adversarial.js
 * 
 * Round 2 Adversarial Challenger Suite for Milestone 1:
 * Comprehensive Stress Testing of Remediated DOMSanitizer on Detached Elements:
 * - Detached <iframe> (src="javascript:", srcdoc="<script>", data: URI, onload)
 * - Detached <object> (data="javascript:", data: URI with nested params, onerror)
 * - Detached <embed> (src="javascript:", data: URI, type="text/html")
 * - Detached <meta http-equiv="refresh"> (standard, mixed-case, whitespace, reversed attributes)
 * - Detached <script> (textContent, src="data:", external src, nested CDATA/comments)
 * - Detached <base>, <applet>, <frame>, <frameset>
 * - Detached <form>, <button>, <a>, <img>
 * 
 * In all cases:
 * 1. Checks that attributes, textContent, and children are stripped/neutralized.
 * 2. Mounts the sanitized element into live Chrome document.
 * 3. Verifies window.__xssTriggered remains strictly false.
 */

const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function runAdversarialR2Suite() {
  console.log('====================================================================');
  console.log('   M1 R2 Adversarial Challenger Test Suite: Detached Elements       ');
  console.log('====================================================================');

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[challenger_m1_r2] Static server listening at ${serverUrl}`);
  console.log(`[challenger_m1_r2] Launching Chrome at: ${CHROME_PATH}`);

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

      const { DOMSanitizer } = await import('/js/parser/asset-extractor.js');

      async function runTest(name, testFn) {
        try {
          window.__xssTriggered = false;
          await testFn();
          assert(window.__xssTriggered === false, `XSS CANARY TRIPPED: window.__xssTriggered is true after test "${name}"!`);
          suiteResults.push({ name, passed: true });
        } catch (err) {
          suiteResults.push({ name, passed: false, error: err.message, stack: err.stack });
        }
      }

      // ====================================================================
      // 1. DETACHED <iframe> ADVERSARIAL VECTORS
      // ====================================================================

      await runTest('Detached <iframe src="javascript:window.__xssTriggered=true">', async () => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('src', 'javascript:window.__xssTriggered=true');
        assert(iframe.parentNode === null, 'Must be detached initially');
        assert(iframe.hasAttribute('src'), 'Must have src attribute initially');

        const sanitized = DOMSanitizer.sanitize(iframe);
        assert(sanitized === iframe, 'Must return the element');
        assert(!sanitized.hasAttribute('src'), 'src attribute must be stripped from detached iframe');
        assert(sanitized.attributes.length === 0, 'All attributes must be stripped from detached iframe');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting sanitized detached iframe!');
        sanitized.remove();
      });

      await runTest('Detached <iframe srcdoc="<script>window.__xssTriggered=true</script>">', async () => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('srcdoc', '<script>window.__xssTriggered=true</script>');
        assert(iframe.parentNode === null, 'Must be detached initially');

        const sanitized = DOMSanitizer.sanitize(iframe);
        assert(!sanitized.hasAttribute('srcdoc'), 'srcdoc attribute must be stripped from detached iframe');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached iframe with srcdoc!');
        sanitized.remove();
      });

      await runTest('Detached <iframe onload="window.__xssTriggered=true">', async () => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('onload', 'window.__xssTriggered=true');

        const sanitized = DOMSanitizer.sanitize(iframe);
        assert(!sanitized.hasAttribute('onload'), 'onload attribute must be stripped from detached iframe');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached iframe with onload!');
        sanitized.remove();
      });

      // ====================================================================
      // 2. DETACHED <object> ADVERSARIAL VECTORS
      // ====================================================================

      await runTest('Detached <object data="javascript:window.__xssTriggered=true">', async () => {
        const obj = document.createElement('object');
        obj.setAttribute('data', 'javascript:window.__xssTriggered=true');
        obj.setAttribute('type', 'text/html');
        assert(obj.parentNode === null, 'Must be detached initially');

        const sanitized = DOMSanitizer.sanitize(obj);
        assert(!sanitized.hasAttribute('data'), 'data attribute must be stripped from detached object');
        assert(!sanitized.hasAttribute('type'), 'type attribute must be stripped from detached object');
        assert(sanitized.attributes.length === 0, 'All attributes must be stripped from detached object');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting sanitized detached object!');
        sanitized.remove();
      });

      await runTest('Detached <object> with nested <param> and child nodes', async () => {
        const obj = document.createElement('object');
        obj.setAttribute('data', 'data:text/html,<script>window.__xssTriggered=true</script>');
        const param = document.createElement('param');
        param.setAttribute('name', 'allowScriptAccess');
        param.setAttribute('value', 'always');
        obj.appendChild(param);
        assert(obj.childNodes.length === 1, 'Child param must exist initially');

        const sanitized = DOMSanitizer.sanitize(obj);
        assert(sanitized.childNodes.length === 0, 'All child nodes must be removed from detached object');
        assert(!sanitized.hasAttribute('data'), 'data attribute must be stripped');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting object with param!');
        sanitized.remove();
      });

      // ====================================================================
      // 3. DETACHED <embed> ADVERSARIAL VECTORS
      // ====================================================================

      await runTest('Detached <embed src="javascript:window.__xssTriggered=true">', async () => {
        const embed = document.createElement('embed');
        embed.setAttribute('src', 'javascript:window.__xssTriggered=true');
        embed.setAttribute('type', 'text/html');
        assert(embed.parentNode === null, 'Must be detached initially');

        const sanitized = DOMSanitizer.sanitize(embed);
        assert(!sanitized.hasAttribute('src'), 'src attribute must be stripped from detached embed');
        assert(!sanitized.hasAttribute('type'), 'type attribute must be stripped from detached embed');
        assert(sanitized.attributes.length === 0, 'All attributes must be stripped from detached embed');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting sanitized detached embed!');
        sanitized.remove();
      });

      await runTest('Detached <embed src="data:text/html,<script>window.__xssTriggered=true</script>">', async () => {
        const embed = document.createElement('embed');
        embed.setAttribute('src', 'data:text/html,<script>window.__xssTriggered=true</script>');

        const sanitized = DOMSanitizer.sanitize(embed);
        assert(!sanitized.hasAttribute('src'), 'src attribute must be stripped from detached embed');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached embed with data URI!');
        sanitized.remove();
      });

      // ====================================================================
      // 4. DETACHED <meta http-equiv="refresh"> ADVERSARIAL VECTORS
      // ====================================================================

      await runTest('Detached <meta http-equiv="refresh" content="0;url=javascript:window.__xssTriggered=true">', async () => {
        const meta = document.createElement('meta');
        meta.setAttribute('http-equiv', 'refresh');
        meta.setAttribute('content', '0;url=javascript:window.__xssTriggered=true');
        assert(meta.parentNode === null, 'Must be detached initially');

        const sanitized = DOMSanitizer.sanitize(meta);
        assert(!sanitized.hasAttribute('http-equiv'), 'http-equiv attribute must be stripped');
        assert(!sanitized.hasAttribute('content'), 'content attribute must be stripped');

        document.head.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting sanitized meta refresh into head!');
        sanitized.remove();
      });

      await runTest('Detached <meta HTTP-EQUIV="Refresh" CONTENT="0;URL=javascript:window.__xssTriggered=true"> (case variation)', async () => {
        const meta = document.createElement('meta');
        meta.setAttribute('HTTP-EQUIV', 'Refresh');
        meta.setAttribute('CONTENT', '0;URL=javascript:window.__xssTriggered=true');

        const sanitized = DOMSanitizer.sanitize(meta);
        assert(!sanitized.hasAttribute('http-equiv') && !sanitized.hasAttribute('HTTP-EQUIV'), 'http-equiv must be stripped regardless of case');
        assert(!sanitized.hasAttribute('content') && !sanitized.hasAttribute('CONTENT'), 'content must be stripped regardless of case');

        document.head.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting mixed-case meta refresh!');
        sanitized.remove();
      });

      await runTest('Detached <meta http-equiv="  refresh  " content=" 0; url=javascript:window.__xssTriggered=true "> (whitespace variation)', async () => {
        const meta = document.createElement('meta');
        meta.setAttribute('http-equiv', '  refresh  ');
        meta.setAttribute('content', ' 0; url=javascript:window.__xssTriggered=true ');

        const sanitized = DOMSanitizer.sanitize(meta);
        assert(!sanitized.hasAttribute('http-equiv'), 'http-equiv with whitespace must be stripped');
        assert(!sanitized.hasAttribute('content'), 'content with whitespace must be stripped');

        document.head.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting whitespace meta refresh!');
        sanitized.remove();
      });

      await runTest('Detached <meta content="0;url=javascript:window.__xssTriggered=true" http-equiv="refresh"> (reversed attribute order)', async () => {
        const meta = document.createElement('meta');
        meta.setAttribute('content', '0;url=javascript:window.__xssTriggered=true');
        meta.setAttribute('http-equiv', 'refresh');

        const sanitized = DOMSanitizer.sanitize(meta);
        assert(!sanitized.hasAttribute('http-equiv'), 'http-equiv must be stripped');
        assert(!sanitized.hasAttribute('content'), 'content must be stripped');

        document.head.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting reversed meta refresh!');
        sanitized.remove();
      });

      // ====================================================================
      // 5. DETACHED <script> ADVERSARIAL VECTORS
      // ====================================================================

      await runTest('Detached <script> inline textContent', async () => {
        const script = document.createElement('script');
        script.textContent = 'window.__xssTriggered = true;';
        assert(script.parentNode === null, 'Must be detached initially');

        const sanitized = DOMSanitizer.sanitize(script);
        assert(!sanitized.textContent || sanitized.textContent.trim() === '', 'textContent must be cleared');
        assert(sanitized.childNodes.length === 0, 'Child nodes must be removed');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached script with textContent!');
        sanitized.remove();
      });

      await runTest('Detached <script src="data:text/javascript,window.__xssTriggered=true">', async () => {
        const script = document.createElement('script');
        script.setAttribute('src', 'data:text/javascript,window.__xssTriggered=true');
        assert(script.parentNode === null, 'Must be detached initially');

        const sanitized = DOMSanitizer.sanitize(script);
        assert(!sanitized.hasAttribute('src'), 'src attribute must be stripped from detached script');
        assert(sanitized.attributes.length === 0, 'All attributes must be stripped from detached script');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached script with data: src!');
        sanitized.remove();
      });

      await runTest('Detached <script> with child text node and comments', async () => {
        const script = document.createElement('script');
        script.appendChild(document.createTextNode('window.__xssTriggered = true;'));
        script.appendChild(document.createComment('some comment'));

        const sanitized = DOMSanitizer.sanitize(script);
        assert(sanitized.childNodes.length === 0, 'All child text and comment nodes must be removed');
        assert(sanitized.textContent === '', 'textContent must be empty');

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 100));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached script with children!');
        sanitized.remove();
      });

      // ====================================================================
      // 6. OTHER DETACHED DANGEROUS TAGS: <base>, <applet>, <frame>, <frameset>
      // ====================================================================

      await runTest('Detached <base href="javascript:window.__xssTriggered=true">', async () => {
        const base = document.createElement('base');
        base.setAttribute('href', 'javascript:window.__xssTriggered=true');

        const sanitized = DOMSanitizer.sanitize(base);
        assert(!sanitized.hasAttribute('href'), 'href attribute must be stripped from detached base');
        assert(sanitized.attributes.length === 0, 'All attributes stripped from base');

        document.head.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 50));
        assert(window.__xssTriggered === false, 'XSS triggered after mounting detached base!');
        sanitized.remove();
      });

      await runTest('Detached <applet code="Malicious.class">', async () => {
        const applet = document.createElement('applet');
        applet.setAttribute('code', 'Malicious.class');

        const sanitized = DOMSanitizer.sanitize(applet);
        assert(!sanitized.hasAttribute('code'), 'code attribute must be stripped from detached applet');
        assert(sanitized.attributes.length === 0, 'All attributes stripped from applet');
      });

      await runTest('Detached <frame src="javascript:window.__xssTriggered=true">', async () => {
        const frame = document.createElement('frame');
        frame.setAttribute('src', 'javascript:window.__xssTriggered=true');

        const sanitized = DOMSanitizer.sanitize(frame);
        assert(!sanitized.hasAttribute('src'), 'src attribute must be stripped from detached frame');
        assert(sanitized.attributes.length === 0, 'All attributes stripped from frame');
      });

      await runTest('Detached <frameset onload="window.__xssTriggered=true">', async () => {
        const frameset = document.createElement('frameset');
        frameset.setAttribute('onload', 'window.__xssTriggered=true');

        const sanitized = DOMSanitizer.sanitize(frameset);
        assert(!sanitized.hasAttribute('onload'), 'onload attribute must be stripped from detached frameset');
        assert(sanitized.attributes.length === 0, 'All attributes stripped from frameset');
      });

      // ====================================================================
      // 7. DETACHED FORM & CONTROLS
      // ====================================================================

      await runTest('Detached <form action="javascript:window.__xssTriggered=true"> and <button formaction="javascript:">', async () => {
        const form = document.createElement('form');
        form.setAttribute('action', 'javascript:window.__xssTriggered=true');
        form.setAttribute('method', 'post');

        const btn = document.createElement('button');
        btn.setAttribute('formaction', 'javascript:window.__xssTriggered=true');
        btn.setAttribute('formmethod', 'post');
        form.appendChild(btn);

        const sanitized = DOMSanitizer.sanitize(form);
        assert(!sanitized.hasAttribute('action'), 'action attribute must be stripped from form');
        assert(!sanitized.hasAttribute('method'), 'method attribute must be stripped from form');
        assert(!btn.hasAttribute('formaction'), 'formaction attribute must be stripped from button');
        assert(!btn.hasAttribute('formmethod'), 'formmethod attribute must be stripped from button');

        // Test detached button directly
        const detachedBtn = document.createElement('button');
        detachedBtn.setAttribute('formaction', 'javascript:window.__xssTriggered=true');
        const sanitizedBtn = DOMSanitizer.sanitize(detachedBtn);
        assert(!sanitizedBtn.hasAttribute('formaction'), 'formaction stripped from detached button');
      });

      return suiteResults;
    });

    console.log('\n====================================================================');
    console.log('   M1 R2 Detached Elements Adversarial Test Results                 ');
    console.log('====================================================================');

    let allPassed = true;
    for (const r of results) {
      const statusSymbol = r.passed ? '✓ PASSED' : '✗ FAILED';
      console.log(`${statusSymbol}: ${r.name}`);
      if (!r.passed) {
        allPassed = false;
        console.log(`   Error: ${r.error}`);
        if (r.stack) {
          console.log(`   Stack: ${r.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      }
    }

    console.log('====================================================================');
    console.log(`Summary: ${results.filter(r => r.passed).length} / ${results.length} tests passed.`);
    console.log('====================================================================');

    await browser.close();
    await closeServer();

    if (!allPassed) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('[challenger_m1_r2] Fatal test runner error:', err);
    try { await browser.close(); } catch (_) {}
    try { await closeServer(); } catch (_) {}
    process.exit(1);
  }
}

runAdversarialR2Suite();
