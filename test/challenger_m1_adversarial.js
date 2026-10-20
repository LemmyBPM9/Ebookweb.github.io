/**
 * test/challenger_m1_adversarial.js
 * 
 * Adversarial Challenger Stress Suite for Milestone 1:
 * 1. validateFileFormat against hostile inputs (zero-byte files, corrupted magic bytes, null-byte binaries)
 * 2. DOMSanitizer hostile attack vectors (root script, root div onclick, root a javascript:href, root svg script)
 * 3. Format badges and in-DOM filtering logic (rapid tab switching, card display toggling, empty state)
 */

const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function runAdversarialSuite() {
  console.log('====================================================================');
  console.log('   M1 Upgrade Adversarial Challenger Test Suite                     ');
  console.log('====================================================================');

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[challenger_m1] Static server listening at ${serverUrl}`);
  console.log(`[challenger_m1] Launching Chrome at: ${CHROME_PATH}`);

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

      function assertThrows(fn, expectedSubstr, msg) {
        let threw = false;
        let caughtErr = null;
        try {
          const res = fn();
          if (res && typeof res.then === 'function') {
            throw new Error(`assertThrows was called with async function without await; got Promise for "${msg}"`);
          }
        } catch (err) {
          threw = true;
          caughtErr = err;
        }
        if (!threw) {
          throw new Error(`Expected exception for "${msg}", but none was thrown.`);
        }
        if (expectedSubstr && !caughtErr.message.includes(expectedSubstr)) {
          throw new Error(`Expected error message to include "${expectedSubstr}", got "${caughtErr.message}" for "${msg}".`);
        }
      }

      async function assertThrowsAsync(asyncFn, expectedSubstr, msg) {
        let threw = false;
        let caughtErr = null;
        try {
          await asyncFn();
        } catch (err) {
          threw = true;
          caughtErr = err;
        }
        if (!threw) {
          throw new Error(`Expected exception for "${msg}", but none was thrown.`);
        }
        if (expectedSubstr && !caughtErr.message.includes(expectedSubstr)) {
          throw new Error(`Expected error message to include "${expectedSubstr}", got "${caughtErr.message}" for "${msg}".`);
        }
      }

      // Import modules under test
      const { validateFileFormat, LibraryView, detectFormatFromFilename } = await import('/js/ui/library-view.js');
      const { DOMSanitizer } = await import('/js/parser/asset-extractor.js');
      const { EventBus } = await import('/js/event-bus.js');

      // Helper to record test results
      async function runTest(category, name, testFn) {
        try {
          await testFn();
          suiteResults.push({ category, name, passed: true });
        } catch (err) {
          suiteResults.push({ category, name, passed: false, error: err.message, stack: err.stack });
        }
      }

      // ====================================================================
      // 1. validateFileFormat HOSTILE INPUT STRESS TESTING
      // ====================================================================

      // 1.1 Zero-byte files
      await runTest('1. validateFileFormat', 'Zero-byte files throw clear exception for all formats', async () => {
        const formats = ['epub', 'pdf', 'mobi', 'txt', 'md'];
        for (const fmt of formats) {
          const zeroBlob = new Blob([], { type: 'application/octet-stream' });
          await assertThrowsAsync(
            () => validateFileFormat(zeroBlob, fmt),
            'File is empty (0 bytes).',
            `zero-byte Blob for format ${fmt}`
          );
          const zeroFile = new File([], `empty.${fmt}`);
          await assertThrowsAsync(
            () => validateFileFormat(zeroFile, fmt),
            'File is empty (0 bytes).',
            `zero-byte File for format ${fmt}`
          );
        }
        await assertThrowsAsync(
          () => validateFileFormat(null, 'epub'),
          'File is empty (0 bytes).',
          'null input'
        );
        await assertThrowsAsync(
          () => validateFileFormat(undefined, 'pdf'),
          'File is empty (0 bytes).',
          'undefined input'
        );
      });

      // 1.2 Corrupted magic bytes - EPUB
      await runTest('1. validateFileFormat', 'EPUB corrupted magic bytes & truncated headers throw clear exceptions', async () => {
        // PK\x01\x02 (Central directory header instead of local file header PK\x03\x04)
        const pk0102 = new Uint8Array([0x50, 0x4B, 0x01, 0x02, 0x00, 0x00]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pk0102]), 'epub'),
          'Corrupted ZIP header',
          'PK\\x01\\x02 instead of PK\\x03\\x04'
        );

        // PK\x00\x00
        const pk0000 = new Uint8Array([0x50, 0x4B, 0x00, 0x00, 0x12, 0x34]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pk0000]), 'epub'),
          'Corrupted ZIP header',
          'PK\\x00\\x00 corrupted header'
        );

        // Truncated headers (< 4 bytes)
        const pk2Bytes = new Uint8Array([0x50, 0x4B]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pk2Bytes]), 'epub'),
          'Missing ZIP archive signature (PK)',
          'Truncated 2-byte PK'
        );

        const p1Byte = new Uint8Array([0x50]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([p1Byte]), 'epub'),
          'Missing ZIP archive signature (PK)',
          'Truncated 1-byte P'
        );

        // Corrupted first two bytes
        const badSig = new Uint8Array([0x00, 0x00, 0x03, 0x04]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([badSig]), 'epub'),
          'Missing ZIP archive signature (PK)',
          'Corrupted first 2 bytes'
        );

        // Valid EPUB magic bytes PK\x03\x04 does not throw
        const validEpubHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00]);
        await validateFileFormat(new Blob([validEpubHeader]), 'epub');
      });

      // 1.3 Corrupted magic bytes - PDF
      await runTest('1. validateFileFormat', 'PDF corrupted magic bytes (%PDX, truncated) throw clear exceptions', async () => {
        // %PDX instead of %PDF
        const pdxBytes = new TextEncoder().encode('%PDX-1.7\n%corrupted pdf stream\n');
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pdxBytes]), 'pdf'),
          'Missing %PDF document signature',
          '%PDX instead of %PDF'
        );

        // Truncated headers
        const pdfTrunc3 = new TextEncoder().encode('%PD');
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pdfTrunc3]), 'pdf'),
          'Missing %PDF document signature',
          'Truncated 3-byte %PD'
        );

        const pdfTrunc1 = new TextEncoder().encode('%');
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pdfTrunc1]), 'pdf'),
          'Missing %PDF document signature',
          'Truncated 1-byte %'
        );

        // Missing leading '%'
        const pdfNoPercent = new TextEncoder().encode('PDF-1.4\nstream\n');
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([pdfNoPercent]), 'pdf'),
          'Missing %PDF document signature',
          'PDF-1.4 without leading %'
        );

        // Garbage bytes without %PDF
        const garbageBytes = new Uint8Array(64).fill(0xAA);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([garbageBytes]), 'pdf'),
          'Missing %PDF document signature',
          '64 bytes of 0xAA'
        );

        // Valid PDF header does not throw
        const validPdf = new TextEncoder().encode('%PDF-1.4\n%âãÏÓ\n');
        await validateFileFormat(new Blob([validPdf]), 'pdf');

        // Valid PDF with leading bytes (up to 1024 allowed per PDF spec)
        const leadingZeros = new Uint8Array(32);
        const pdfMagic = new TextEncoder().encode('%PDF-1.5\n');
        const combined = new Uint8Array(leadingZeros.length + pdfMagic.length);
        combined.set(leadingZeros, 0);
        combined.set(pdfMagic, 32);
        await validateFileFormat(new Blob([combined]), 'pdf');
      });

      // 1.4 Corrupted magic bytes - MOBI / AZW
      await runTest('1. validateFileFormat', 'MOBI corrupted magic bytes & truncated headers < 68 bytes throw clear exceptions', async () => {
        // Truncated headers (< 68 bytes)
        const trunc10 = new Uint8Array(10);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([trunc10]), 'mobi'),
          'Missing BOOKMOBI or PalmDOC header signature',
          'Truncated 10 bytes'
        );

        const trunc32 = new Uint8Array(32);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([trunc32]), 'mobi'),
          'Missing BOOKMOBI or PalmDOC header signature',
          'Truncated 32 bytes'
        );

        const trunc60 = new Uint8Array(60);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([trunc60]), 'mobi'),
          'Missing BOOKMOBI or PalmDOC header signature',
          'Truncated 60 bytes'
        );

        const trunc67 = new Uint8Array(67);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([trunc67]), 'mobi'),
          'Missing BOOKMOBI or PalmDOC header signature',
          'Truncated 67 bytes'
        );

        // 68 bytes with corrupted Type/Creator at offset 60..67
        const mobiCorrupt68 = new Uint8Array(68);
        const badTypeCreator = new TextEncoder().encode('BOOKXXXX');
        mobiCorrupt68.set(badTypeCreator, 60);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([mobiCorrupt68]), 'mobi'),
          'Missing BOOKMOBI or PalmDOC header signature',
          'Corrupted type/creator BOOKXXXX at offset 60'
        );

        const mobiAllGarbage = new Uint8Array(128).fill(0x58); // 'XXXX...'
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([mobiAllGarbage]), 'mobi'),
          'Missing BOOKMOBI or PalmDOC header signature',
          '128 bytes of garbage without signature'
        );

        // Valid MOBI header with 'BOOKMOBI' at offset 60..67 does not throw
        const validMobiHeader = new Uint8Array(72);
        const bookMobiSig = new TextEncoder().encode('BOOKMOBI');
        validMobiHeader.set(bookMobiSig, 60);
        await validateFileFormat(new Blob([validMobiHeader]), 'mobi');

        // Valid PalmDOC header with 'TEXtREAd' at offset 60..67 does not throw
        const validPalmDocHeader = new Uint8Array(72);
        const textReadSig = new TextEncoder().encode('TEXtREAd');
        validPalmDocHeader.set(textReadSig, 60);
        await validateFileFormat(new Blob([validPalmDocHeader]), 'mobi');
      });

      // 1.5 Disguised executable binaries as .txt or .md
      await runTest('1. validateFileFormat', 'Disguised binaries with null bytes disguised as .txt/.md throw binary data exceptions', async () => {
        // ELF binary header: \x7FELF followed by null bytes
        const elfBinary = new Uint8Array([
          0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x02, 0x00, 0x3E, 0x00, 0x01, 0x00, 0x00, 0x00
        ]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([elfBinary]), 'txt'),
          'File contains binary data (null bytes)',
          'ELF binary disguised as .txt'
        );
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([elfBinary]), 'md'),
          'File contains binary data (null bytes)',
          'ELF binary disguised as .md'
        );

        // Windows PE binary header: MZ with null bytes
        const peBinary = new Uint8Array([
          0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
          0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00
        ]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([peBinary]), 'txt'),
          'File contains binary data (null bytes)',
          'Windows PE executable disguised as .txt'
        );
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([peBinary]), 'md'),
          'File contains binary data (null bytes)',
          'Windows PE executable disguised as .md'
        );

        // Mach-O binary header: \xCF\xFA\xED\xFE with null bytes
        const machOBinary = new Uint8Array([
          0xCF, 0xFA, 0xED, 0xFE, 0x07, 0x00, 0x00, 0x01,
          0x03, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00
        ]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([machOBinary]), 'txt'),
          'File contains binary data (null bytes)',
          'Mach-O binary disguised as .txt'
        );
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([machOBinary]), 'md'),
          'File contains binary data (null bytes)',
          'Mach-O binary disguised as .md'
        );

        // Invalid UTF-8 encoding sequence without null bytes
        const invalidUtf8 = new Uint8Array([0xC3, 0x28, 0xA0, 0xA1, 0xFF, 0xFE]);
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([invalidUtf8]), 'txt'),
          'Invalid character encoding',
          'Invalid UTF-8 sequence for .txt'
        );
        await assertThrowsAsync(
          () => validateFileFormat(new Blob([invalidUtf8]), 'md'),
          'Invalid character encoding',
          'Invalid UTF-8 sequence for .md'
        );

        // Clean UTF-8 text files must pass
        const validTxt = new TextEncoder().encode('Chapter 1: The Beginning\n\nOnce upon a time in a land far away.');
        await validateFileFormat(new Blob([validTxt]), 'txt');

        const validMd = new TextEncoder().encode('# Chapter 1: The Beginning\n\n**Bold text** and *italic text*.');
        await validateFileFormat(new Blob([validMd]), 'md');
      });

      // 1.6 Unsupported formats
      await runTest('1. validateFileFormat', 'Unsupported format identifiers throw descriptive exception', async () => {
        const dummyBlob = new Blob([new Uint8Array(10)]);
        await assertThrowsAsync(
          () => validateFileFormat(dummyBlob, 'exe'),
          'Unsupported format "exe"',
          'format "exe"'
        );
        await assertThrowsAsync(
          () => validateFileFormat(dummyBlob, 'docx'),
          'Unsupported format "docx"',
          'format "docx"'
        );
      });

      // ====================================================================
      // 2. DOMSanitizer ADVERSARIAL SECURITY ATTACK VECTORS
      // ====================================================================

      // Reset test canary
      window.__xssTriggered = false;

      // 2.1 Root <script> tag
      await runTest('2. DOMSanitizer', 'Root <script> tag in parent container is stripped and neutralized', async () => {
        window.__xssTriggered = false;

        // A. Root script in a parent container: sanitize(script) removes it from container
        const container = document.createElement('div');
        const scriptEl = document.createElement('script');
        scriptEl.textContent = 'window.__xssTriggered = true;';
        container.appendChild(scriptEl);
        assert(container.children.length === 1, 'Script must be in container initially');

        DOMSanitizer.sanitize(scriptEl);
        assert(container.contains(scriptEl) === false, 'DOMSanitizer.sanitize(script) must remove script from parent container');
        assert(container.children.length === 0, 'Container children count must be 0 after script removal');

        // B. Sanitize root container containing script
        const container2 = document.createElement('div');
        container2.innerHTML = '<script>window.__xssTriggered = true;</script><p>Safe Content</p>';
        DOMSanitizer.sanitize(container2);
        assert(container2.querySelector('script') === null, 'DOMSanitizer.sanitize(container) must strip all <script> tags');
        assert(container2.querySelector('p') !== null, 'Safe <p> element must be preserved');

        // C. DOMSanitizer.sanitizeHtml('<script>window.__xssTriggered = true;</script>')
        const cleanHtml = DOMSanitizer.sanitizeHtml('<script>window.__xssTriggered = true;</script>');
        assert(!cleanHtml.includes('<script>'), 'sanitizeHtml must not include <script> tags');
        assert(!cleanHtml.includes('__xssTriggered'), 'sanitizeHtml must strip script payload');

        // Insert into live DOM to confirm no execution
        const testBed = document.createElement('div');
        testBed.innerHTML = cleanHtml;
        document.body.appendChild(testBed);
        await new Promise(r => setTimeout(r, 50));
        assert(window.__xssTriggered === false, 'window.__xssTriggered must remain false after inserting sanitized html');
        testBed.remove();
      });

      // 2.1b Detached Root <script> adversarial test
      await runTest('2. DOMSanitizer', 'Detached root <script> must be neutralized so it cannot execute when mounted', async () => {
        window.__xssTriggered = false;

        const detachedScript = document.createElement('script');
        detachedScript.textContent = 'window.__xssTriggered = true;';
        const sanitized = DOMSanitizer.sanitize(detachedScript);

        // Assert that sanitized script element has its executable content stripped/neutralized
        assert(
          !sanitized.textContent || sanitized.textContent.trim() === '',
          `Detached script textContent must be cleared by DOMSanitizer.sanitize(), got "${sanitized.textContent}"`
        );

        document.body.appendChild(sanitized);
        await new Promise(r => setTimeout(r, 50));
        assert(
          window.__xssTriggered === false,
          'window.__xssTriggered was triggered because detached <script> was not neutralized by DOMSanitizer.sanitize()!'
        );
        sanitized.remove();
      });

      // 2.2 Root <div onclick="window.__xssTriggered = true">
      await runTest('2. DOMSanitizer', 'Root <div onclick="..."> inline handler is stripped', async () => {
        window.__xssTriggered = false;

        const rootDiv = document.createElement('div');
        rootDiv.setAttribute('onclick', 'window.__xssTriggered = true;');
        rootDiv.setAttribute('onmouseover', 'window.__xssTriggered = true;');
        rootDiv.textContent = 'Test Clickable Element';

        DOMSanitizer.sanitize(rootDiv);

        assert(rootDiv.hasAttribute('onclick') === false, 'onclick attribute must be removed from root element');
        assert(rootDiv.hasAttribute('onmouseover') === false, 'onmouseover attribute must be removed from root element');

        // Attach to DOM and click
        document.body.appendChild(rootDiv);
        rootDiv.click();
        await new Promise(r => setTimeout(r, 30));
        assert(window.__xssTriggered === false, 'window.__xssTriggered must remain false after clicking sanitized div');
        rootDiv.remove();

        // Test sanitizeHtml
        const sanitized = DOMSanitizer.sanitizeHtml('<div onclick="window.__xssTriggered = true;">Clean Text</div>');
        assert(!sanitized.includes('onclick'), 'sanitizeHtml must strip inline onclick handler');
        assert(sanitized.includes('Clean Text'), 'sanitizeHtml must preserve legitimate inner text');

        const testBed = document.createElement('div');
        testBed.innerHTML = sanitized;
        document.body.appendChild(testBed);
        testBed.firstElementChild?.click();
        await new Promise(r => setTimeout(r, 30));
        assert(window.__xssTriggered === false, 'window.__xssTriggered must remain false after clicking sanitizedHtml output');
        testBed.remove();
      });

      // 2.3 Root <a href="javascript:window.__xssTriggered=true">
      await runTest('2. DOMSanitizer', 'Root <a href="javascript:..."> dangerous URI scheme is stripped', async () => {
        window.__xssTriggered = false;

        const vectors = [
          'javascript:window.__xssTriggered=true',
          'JAVASCRIPT:window.__xssTriggered=true',
          '  javascript:window.__xssTriggered=true',
          'java\0script:window.__xssTriggered=true',
          'vbscript:window.__xssTriggered=true',
          'data:text/html,<script>window.__xssTriggered=true</script>',
          'data:application/xhtml+xml,<script xmlns="http://www.w3.org/1999/xhtml">window.__xssTriggered=true</script>'
        ];

        for (const uri of vectors) {
          const rootA = document.createElement('a');
          rootA.setAttribute('href', uri);
          rootA.textContent = 'Link';

          DOMSanitizer.sanitize(rootA);

          assert(rootA.hasAttribute('href') === false, `href attribute must be stripped for scheme: "${uri}"`);

          // Test sanitizeHtml variant
          const htmlPayload = `<a href="${uri}">Click Me</a>`;
          const clean = DOMSanitizer.sanitizeHtml(htmlPayload);
          assert(!clean.includes('javascript:'), `sanitizeHtml must not include javascript: for "${uri}"`);
          assert(!clean.includes('vbscript:'), `sanitizeHtml must not include vbscript: for "${uri}"`);
          assert(!clean.includes('data:text/html'), `sanitizeHtml must not include data:text/html for "${uri}"`);
        }

        // Test legitimate href is preserved
        const safeA = document.createElement('a');
        safeA.setAttribute('href', 'https://example.com/books');
        safeA.textContent = 'Safe Link';
        DOMSanitizer.sanitize(safeA);
        assert(safeA.getAttribute('href') === 'https://example.com/books', 'Legitimate https href must be preserved');
      });

      // 2.4 Root <svg><script>window.__xssTriggered = true;</script></svg>
      await runTest('2. DOMSanitizer', 'Root <svg><script> embedded script is stripped', async () => {
        window.__xssTriggered = false;

        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__xssTriggered = true;</script><circle cx="50" cy="50" r="40"/></svg>',
          'image/svg+xml'
        );
        const svgRoot = svgDoc.documentElement;
        assert(svgRoot.querySelector('script') !== null, 'Initial SVG must contain <script>');

        DOMSanitizer.sanitize(svgRoot);

        assert(svgRoot.querySelector('script') === null, 'DOMSanitizer.sanitize must remove <script> inside <svg>');
        assert(svgRoot.querySelector('circle') !== null, 'Safe <circle> element must be preserved');

        // Test sanitizeHtml
        const cleanSvgHtml = DOMSanitizer.sanitizeHtml(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__xssTriggered = true;</script><rect width="10" height="10"/></svg>'
        );
        assert(!cleanSvgHtml.includes('<script>'), 'sanitizeHtml must not include <script> inside <svg>');
        assert(cleanSvgHtml.includes('<rect'), 'sanitizeHtml must preserve safe SVG geometry');

        // Append to DOM and check canary
        const testBed = document.createElement('div');
        testBed.innerHTML = cleanSvgHtml;
        document.body.appendChild(testBed);
        await new Promise(r => setTimeout(r, 50));
        assert(window.__xssTriggered === false, 'window.__xssTriggered must remain false after inserting sanitized SVG');
        testBed.remove();
      });

      // 2.5 Additional adversarial vectors: <iframe>, <object>, <form> action
      await runTest('2. DOMSanitizer', 'Root <iframe>, <object>, <form action="javascript:"> are neutralized', async () => {
        // Root iframe
        const parent = document.createElement('div');
        const iframe = document.createElement('iframe');
        iframe.setAttribute('src', 'javascript:window.__xssTriggered=true');
        parent.appendChild(iframe);
        DOMSanitizer.sanitize(iframe);
        assert(!parent.contains(iframe), 'Root iframe must be removed from parent');

        // Root form with action="javascript:..."
        const form = document.createElement('form');
        form.setAttribute('action', 'javascript:window.__xssTriggered=true');
        form.setAttribute('method', 'post');
        const submitBtn = document.createElement('button');
        submitBtn.setAttribute('formaction', 'javascript:window.__xssTriggered=true');
        form.appendChild(submitBtn);

        DOMSanitizer.sanitize(form);
        assert(!form.hasAttribute('action'), 'Form action attribute must be stripped');
        assert(!form.hasAttribute('method'), 'Form method attribute must be stripped');
        assert(!submitBtn.hasAttribute('formaction'), 'Button formaction attribute must be stripped');
      });

      // ====================================================================
      // 3. FORMAT BADGES AND IN-DOM FILTERING LOGIC
      // ====================================================================

      await runTest('3. Format Badges & Filtering', 'Badges and in-DOM filter tab switching & empty state work accurately', async () => {
        const libraryContainer = document.querySelector('#library-view');
        assert(libraryContainer !== null, '#library-view must exist in DOM');

        const libraryView = new LibraryView(libraryContainer);
        const grid = libraryContainer.querySelector('#library-grid');
        assert(grid !== null, '#library-grid must exist in DOM');

        // Clean out existing cards in test grid
        grid.innerHTML = '';

        // Helper to synthesize realistic book cards with format badges
        function createMockCard(id, title, author, format) {
          const card = document.createElement('article');
          card.className = 'card book-card';
          card.setAttribute('data-book-id', id);
          card.setAttribute('data-format', format);
          card.dataset.format = format;

          const coverWrap = document.createElement('div');
          coverWrap.className = 'book-cover-wrapper';

          const formatBadge = document.createElement('span');
          formatBadge.className = `book-format-badge format-${format} format-badge-${format}`;
          formatBadge.textContent = format.toUpperCase();
          coverWrap.appendChild(formatBadge);

          const titleEl = document.createElement('h3');
          titleEl.className = 'book-card-title';
          titleEl.textContent = title;

          const authorEl = document.createElement('p');
          authorEl.className = 'book-card-author';
          authorEl.textContent = author;

          card.appendChild(coverWrap);
          card.appendChild(titleEl);
          card.appendChild(authorEl);
          return card;
        }

        // Seed 4 books across 4 distinct formats: epub, pdf, mobi, txt (0 md books)
        const mockBooks = [
          { id: 'b_epub_1', title: 'Test EPUB', author: 'Author E', format: 'epub' },
          { id: 'b_pdf_1', title: 'Test PDF', author: 'Author P', format: 'pdf' },
          { id: 'b_mobi_1', title: 'Test MOBI', author: 'Author M', format: 'mobi' },
          { id: 'b_txt_1', title: 'Test TXT', author: 'Author T', format: 'txt' }
        ];

        for (const b of mockBooks) {
          grid.appendChild(createMockCard(b.id, b.title, b.author, b.format));
        }

        // Verify format badges on all 4 cards
        const cards = grid.querySelectorAll('.book-card');
        assert(cards.length === 4, 'Must have 4 mock cards in grid');

        for (const card of cards) {
          const fmt = card.getAttribute('data-format');
          const badge = card.querySelector('.book-format-badge');
          assert(badge !== null, `Card ${card.getAttribute('data-book-id')} must have format badge`);
          assert(badge.textContent === fmt.toUpperCase(), `Badge text must be uppercase format "${fmt.toUpperCase()}", got "${badge.textContent}"`);
          assert(badge.classList.contains(`format-${fmt}`), `Badge class must include format-${fmt}`);
        }

        // 3.1 Initial filter 'all'
        libraryView.setFilter('all');
        for (const card of cards) {
          assert(card.style.display !== 'none', `Card ${card.getAttribute('data-format')} must be visible in 'all' view`);
        }
        assert(grid.querySelector('.library-empty-filter-state') === null, 'No empty filter state in "all" view');

        // 3.2 Filter 'epub'
        libraryView.setFilter('epub');
        assert(grid.querySelector('.book-card[data-format="epub"]').style.display !== 'none', 'EPUB card must be visible');
        assert(grid.querySelector('.book-card[data-format="pdf"]').style.display === 'none', 'PDF card must be hidden in EPUB filter');
        assert(grid.querySelector('.book-card[data-format="mobi"]').style.display === 'none', 'MOBI card must be hidden in EPUB filter');
        assert(grid.querySelector('.book-card[data-format="txt"]').style.display === 'none', 'TXT card must be hidden in EPUB filter');
        assert(grid.querySelector('.library-empty-filter-state') === null, 'No empty state when EPUB books exist');

        // 3.3 Filter 'pdf'
        libraryView.setFilter('pdf');
        assert(grid.querySelector('.book-card[data-format="pdf"]').style.display !== 'none', 'PDF card must be visible');
        assert(grid.querySelector('.book-card[data-format="epub"]').style.display === 'none', 'EPUB card must be hidden in PDF filter');
        assert(grid.querySelector('.book-card[data-format="mobi"]').style.display === 'none', 'MOBI card must be hidden in PDF filter');
        assert(grid.querySelector('.book-card[data-format="txt"]').style.display === 'none', 'TXT card must be hidden in PDF filter');
        assert(grid.querySelector('.library-empty-filter-state') === null, 'No empty state when PDF books exist');

        // 3.4 Filter 'mobi'
        libraryView.setFilter('mobi');
        assert(grid.querySelector('.book-card[data-format="mobi"]').style.display !== 'none', 'MOBI card must be visible');
        assert(grid.querySelector('.book-card[data-format="pdf"]').style.display === 'none', 'PDF card must be hidden in MOBI filter');

        // 3.5 Filter 'txt'
        libraryView.setFilter('txt');
        assert(grid.querySelector('.book-card[data-format="txt"]').style.display !== 'none', 'TXT card must be visible');
        assert(grid.querySelector('.book-card[data-format="mobi"]').style.display === 'none', 'MOBI card must be hidden in TXT filter');

        // 3.6 Filter 'md' (which has 0 books)
        libraryView.setFilter('md');
        for (const card of cards) {
          assert(card.style.display === 'none', `Card ${card.getAttribute('data-format')} must be hidden in MD filter`);
        }
        const emptyState = grid.querySelector('.library-empty-filter-state');
        assert(emptyState !== null, 'Empty filter state must be displayed when MD filter has 0 books');
        const emptyTitle = emptyState.querySelector('.empty-title');
        assert(emptyTitle !== null && emptyTitle.textContent.includes('No MD books found'), `Empty title must state "No MD books found", got "${emptyTitle?.textContent}"`);
        const emptySubtitle = emptyState.querySelector('.empty-subtitle');
        assert(emptySubtitle !== null && emptySubtitle.textContent.includes('.md'), 'Empty subtitle must mention .md extension');

        // 3.7 Rapid Tab Switching Stress Test
        const tabs = ['all', 'epub', 'pdf', 'mobi', 'txt', 'md'];
        for (let i = 0; i < 60; i++) {
          const tab = tabs[i % tabs.length];
          libraryView.setFilter(tab);
        }

        // End on 'md'
        libraryView.setFilter('md');
        const mdEmptyStates = grid.querySelectorAll('.library-empty-filter-state');
        assert(mdEmptyStates.length === 1, `Must have exactly 1 empty state element, found ${mdEmptyStates.length}`);

        // Switch back to 'all'
        libraryView.setFilter('all');
        assert(grid.querySelector('.library-empty-filter-state') === null, 'Empty state must be completely removed when switching back to "all"');
        for (const card of cards) {
          assert(card.style.display !== 'none', `Card ${card.getAttribute('data-format')} must be visible again in 'all' view`);
        }

        // 3.8 Button UI Interaction & ARIA attributes
        const filterBar = libraryContainer.querySelector('#format-filter-bar');
        if (filterBar) {
          const pdfBtn = filterBar.querySelector('.format-filter-btn[data-filter="pdf"]');
          assert(pdfBtn !== null, 'PDF filter button must exist in #format-filter-bar');

          // Click PDF button
          pdfBtn.click();
          assert(pdfBtn.classList.contains('is-active'), 'PDF button must receive .is-active class on click');
          assert(pdfBtn.getAttribute('aria-selected') === 'true', 'PDF button must have aria-selected="true"');

          const allBtn = filterBar.querySelector('.format-filter-btn[data-filter="all"]');
          assert(allBtn.getAttribute('aria-selected') === 'false', 'All button must have aria-selected="false" when PDF is selected');

          // Reset to All
          allBtn.click();
          assert(allBtn.classList.contains('is-active'), 'All button must have .is-active');
          assert(allBtn.getAttribute('aria-selected') === 'true', 'All button must have aria-selected="true"');
        }

        // Clean up mock cards
        grid.innerHTML = '';
      });

      return suiteResults;
    });

    console.log('\n====================================================================');
    console.log('   M1 Upgrade Adversarial Test Results                              ');
    console.log('====================================================================');

    let allPassed = true;
    for (const r of results) {
      const statusSymbol = r.passed ? '✓ PASSED' : '✗ FAILED';
      console.log(`[${r.category}] ${statusSymbol}: ${r.name}`);
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
    console.error('[challenger_m1] Fatal test runner error:', err);
    try { await browser.close(); } catch (_) {}
    try { await closeServer(); } catch (_) {}
    process.exit(1);
  }
}

runAdversarialSuite();
