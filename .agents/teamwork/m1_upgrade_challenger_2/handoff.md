# Handoff Report: M1 Upgrade Adversarial Challenge

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### Observation 1.1: `validateFileFormat` Hostile Input Robustness
- **File**: `js/ui/library-view.js:48-140`
- **Verification Harness**: `test/challenger_m1_adversarial.js`
- **Command & Output**:
  ```bash
  $ node test/challenger_m1_adversarial.js
  [1. validateFileFormat] ✓ PASSED: Zero-byte files throw clear exception for all formats
  [1. validateFileFormat] ✓ PASSED: EPUB corrupted magic bytes & truncated headers throw clear exceptions
  [1. validateFileFormat] ✓ PASSED: PDF corrupted magic bytes (%PDX, truncated) throw clear exceptions
  [1. validateFileFormat] ✓ PASSED: MOBI corrupted magic bytes & truncated headers < 68 bytes throw clear exceptions
  [1. validateFileFormat] ✓ PASSED: Disguised binaries with null bytes disguised as .txt/.md throw binary data exceptions
  [1. validateFileFormat] ✓ PASSED: Unsupported format identifiers throw descriptive exception
  ```
- **Observed behavior**:
  - Zero-byte files (`new Blob([])`, `new File([], ...)`, `null`, `undefined`) throw verbatim: `"File is empty (0 bytes)."`
  - EPUB with `PK\x01\x02` throws verbatim: `"Not a valid EPUB: Corrupted ZIP header."`
  - EPUB with truncated header (< 4 bytes) throws verbatim: `"Not a valid EPUB: Missing ZIP archive signature (PK)."`
  - PDF with `%PDX-1.7` or truncated header throws verbatim: `"Not a valid PDF: Missing %PDF document signature."`
  - MOBI with truncated headers (< 68 bytes) or corrupted Type/Creator at offset 60..67 (`BOOKXXXX`) throws verbatim: `"Not a valid MOBI/AZW e-book: Missing BOOKMOBI or PalmDOC header signature."`
  - Disguised ELF (`\x7FELF...`), Windows PE (`MZ...`), and Mach-O (`\xCF\xFA\xED\xFE...`) containing binary null bytes (>2 null bytes in 4KB) throw verbatim: `"Not a valid TXT file: File contains binary data (null bytes)."` and `"Not a valid MD file: File contains binary data (null bytes)."`
  - Invalid UTF-8 bytes throw verbatim: `"Not a valid TXT file: Invalid character encoding (expected UTF-8 text)."`
  - Unsupported formats (`'exe'`, `'docx'`) throw verbatim: `"Unsupported format \"<format>\"."`

---

### Observation 1.2: Vulnerability in `DOMSanitizer.sanitize(root)` on Detached Dangerous Nodes
- **File**: `js/parser/asset-extractor.js:103-117`
  ```javascript
  103:     // Check if root itself is a dangerous element
  104:     if (root.nodeType === 1) { // Node.ELEMENT_NODE
  105:       const tag = root.tagName.toLowerCase();
  106:       if (
  107:         tag === 'script' ||
  108:         ['object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset'].includes(tag)
  109:       ) {
  110:         root.remove();
  111:         return root;
  112:       }
  113:       if (tag === 'meta' && root.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
  114:         root.remove();
  115:         return root;
  116:       }
  117:     }
  ```
- **Verification Harness**: `test/challenger_m1_adversarial.js` (Test 2.1b)
- **Verbatim Error & Execution Output**:
  ```bash
  $ node test/challenger_m1_adversarial.js
  [2. DOMSanitizer] ✗ FAILED: Detached root <script> must be neutralized so it cannot execute when mounted
     Error: Detached script textContent must be cleared by DOMSanitizer.sanitize(), got "window.__xssTriggered = true;"
  ```
- **Live Chrome Reproduction Output**:
  ```javascript
  // Execution in Google Chrome via Puppeteer:
  const detachedScript = document.createElement('script');
  detachedScript.textContent = 'window.__xssTriggered = true;';
  const sanitized = DOMSanitizer.sanitize(detachedScript);
  document.body.appendChild(sanitized);
  // Result:
  {
    xssTriggered: true,
    sanitizedTag: 'SCRIPT',
    sanitizedText: 'window.__xssTriggered = true;'
  }
  ```
- **Observed behavior**:
  - When `root` is a `<script>` element with no parent (`root.parentNode === null`), `root.remove()` is a no-op under W3C DOM specifications (§4.2.4 Mutation algorithms).
  - Line 111 immediately executes `return root;`, bypassing the rest of `DOMSanitizer.sanitize`.
  - As a result, the `<script>`'s `textContent`, child nodes, and dangerous attributes (`src`) remain completely unmodified.
  - When the sanitized element is subsequently attached to the live document, Chrome executes the script, setting `window.__xssTriggered = true`.
  - The same bypass applies to detached `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<frame>`, and `<frameset>`.

---

### Observation 1.3: Other DOMSanitizer Vectors Function Correctly
- **Verification Harness**: `test/challenger_m1_adversarial.js`
- **Observed behavior**:
  - `DOMSanitizer.sanitizeHtml('<script>window.__xssTriggered = true;</script>')` returns `""` (clean HTML).
  - `DOMSanitizer.sanitizeHtml('<div onclick="window.__xssTriggered = true">Safe</div>')` returns `<div>Safe</div>` (clean HTML).
  - `DOMSanitizer.sanitize(root)` on `<div onclick="...">` successfully removes the `onclick` and `onmouseover` attributes; clicking does not trigger `window.__xssTriggered`.
  - `DOMSanitizer.sanitize(root)` on `<a href="javascript:...">` removes the `href` attribute across all tested variants (`javascript:`, `JAVASCRIPT:`, `  javascript:`, `java\0script:`, `vbscript:`, `data:text/html`); clicking does not trigger `window.__xssTriggered`.
  - `DOMSanitizer.sanitize(root)` on `<svg><script>...</script></svg>` successfully removes the child `<script>` element from the SVG root element (`svg.querySelector('script') === null`).
  - `DOMSanitizer.sanitize(root)` on `<form action="javascript:...">` and `<button formaction="javascript:...">` strips `action` and `formaction`.

---

### Observation 1.4: Format Badges & In-DOM Filtering
- **File**: `js/ui/library-view.js:187-201, 248-303, 505-508`
- **Verification Harness**: `test/challenger_m1_adversarial.js` (Test 3)
- **Observed behavior**:
  - Format badges on cards render with `.book-format-badge.format-<format>.format-badge-<format>` with correct text (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`).
  - `card.setAttribute('data-format', format)` is set accurately.
  - Switching to a format tab (`epub`, `pdf`, `mobi`, `txt`): matching cards retain `display: ""` while non-matching cards have `display: "none"`.
  - Switching to a format tab with 0 books (`md`): all cards are hidden (`display: "none"`), and `.library-empty-filter-state` is created inside `#library-grid` with title `"No MD books found"` and subtitle containing `".md"`.
  - Rapid stress switching (60+ switches between all 6 tabs) did not cause state corruption or duplicate empty state elements (`grid.querySelectorAll('.library-empty-filter-state').length === 1`).
  - Switching back to `'all'` completely removes `.library-empty-filter-state` and restores all cards to `display: ""`.
  - Clicking filter buttons in `#format-filter-bar` properly toggles `.is-active` and `aria-selected="true"` / `aria-selected="false"`.

---

### Observation 1.5: Test Infrastructure Issue in `test/e2e_upgrade.test.js`
- **File**: `test/e2e_upgrade.test.js:450`
- **Code**:
  ```javascript
  const pdfTab = await waitForAnySelector(page, '[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf, button:has-text("PDF")');
  ```
- **Error in Chrome**:
  ```
  SyntaxError: Failed to execute 'querySelector' on 'Document': '[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf, button:has-text("PDF")' is not a valid selector.
  ```
- **Observed behavior**:
  - `:has-text(...)` is a Playwright-specific pseudo-selector not supported in standard CSS or Puppeteer's native `document.querySelector`.
  - Because it is included in a comma-separated selector string passed to `page.waitForSelector`, Chrome rejects the entire selector list with a `SyntaxError`, causing test 1.3 to time out even though `[data-filter="pdf"]` exists in `index.html`.

---

## 2. Logic Chain

1. **Premise 1**: The security contract (PROJECT.md Feature 44 and ORIGINAL_REQUEST.md AC) requires: *"Universal DOMSanitizer sanitizes all untrusted markup across all formats (`window.__xssTriggered` stays falsy)"*.
2. **From Observation 1.2**: In `DOMSanitizer.sanitize(root)` (`js/parser/asset-extractor.js:103-112`), if `root` is an element whose tag name is in `['script', 'object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset']`, the function executes `root.remove()` and immediately returns `root`.
3. **From DOM Specification**: Calling `.remove()` on a detached element (`root.parentNode === null`) does not modify the element, its child nodes, its attributes, or its text content.
4. **Empirical Proof**: When a detached `<script>` node is passed to `DOMSanitizer.sanitize(root)` and then appended to the DOM, the script executes and sets `window.__xssTriggered = true`.
5. **Deduction**: `DOMSanitizer.sanitize(root)` fails to neutralize detached root `<script>` and dangerous elements, creating an XSS bypass.
6. **Required Mitigation**: In `js/parser/asset-extractor.js`, when `root` is a dangerous tag, the sanitizer must actively neutralize the element before returning (or return a harmless inert node):
   ```javascript
   if (root.nodeType === 1) {
     const tag = root.tagName.toLowerCase();
     if (
       tag === 'script' ||
       ['object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset'].includes(tag)
     ) {
       root.remove();
       root.textContent = '';
       while (root.firstChild) root.removeChild(root.firstChild);
       if (root.attributes) {
         Array.from(root.attributes).forEach(attr => root.removeAttribute(attr.name));
       }
       return root;
     }
     // ...
   ```
7. **From Observation 1.5**: In `test/e2e_upgrade.test.js:450`, removing the non-standard `button:has-text("PDF")` pseudo-selector or splitting the selector list prevents the `SyntaxError` in Puppeteer.

---

## 3. Caveats

- **Scope boundary**: This review specifically evaluated `validateFileFormat`, format badges, header filter bar logic, and `DOMSanitizer`. Reader engine parsers for MOBI/TXT/MD (`MobiParser`, `TxtParser`, `MarkdownParser`, `PdfParser`) belong to subsequent milestones (M3/M4) and were not evaluated in this review.
- **Fast pre-flight vs full parsing**: `validateFileFormat` for MOBI/AZW performs magic byte inspection at offset 60..67 with a 4KB fallback scan for `'BOOKMOBI'`/`'TEXtREAd'`. A malicious file intentionally embedding `'BOOKMOBI'` without valid Palm Database structures would pass pre-flight validation but fail during full parsing in M4.

---

## 4. Conclusion

1. **Multi-Format Validation (`validateFileFormat`)**: **APPROVED**. Handled all hostile zero-byte inputs, corrupted headers (`PK\x01\x02`, `%PDX`, truncated < 68 bytes), disguised executables containing null bytes, invalid UTF-8 sequences, and unsupported format strings with descriptive error messages.
2. **Format Badges & In-DOM Filter Bar**: **APPROVED**. Card display toggling, format badge rendering, rapid tab switching (60+ cycles), and 0-book empty state messages function accurately without DOM leakage or duplicates.
3. **DOMSanitizer**: **REJECTED (REQUEST_CHANGES)** due to the security flaw where detached root dangerous nodes (`<script>`, `<iframe>`, etc.) are returned unneutralized, executing when mounted.
4. **Overall Verdict**: **REQUEST_CHANGES** pending neutralization of detached dangerous root elements in `js/parser/asset-extractor.js`.

---

## 5. Verification Method

To independently reproduce and verify all observations:

1. **Run Standalone Empirical Challenger Suite**:
   ```bash
   node test/challenger_m1_adversarial.js
   ```
   - Confirms all 6 `validateFileFormat` tests pass.
   - Confirms format badges and filter tab switching tests pass.
   - Demonstrates the failure in Test 2.1b on detached root `<script>` element.

2. **Run One-Liner Reproduction in Chrome**:
   ```bash
   node -e "
   const puppeteer = require('puppeteer-core');
   const { startServer } = require('./test/server.js');
   const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
   (async () => {
     const { url, close } = await startServer({ port: 0, autoPortFallback: true });
     const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new' });
     const page = await browser.newPage();
     await page.goto(url + '/index.html');
     const res = await page.evaluate(async () => {
       const { DOMSanitizer } = await import('/js/parser/asset-extractor.js');
       window.__xssTriggered = false;
       const s = document.createElement('script');
       s.textContent = 'window.__xssTriggered = true;';
       const clean = DOMSanitizer.sanitize(s);
       document.body.appendChild(clean);
       await new Promise(r => setTimeout(r, 50));
       return { xssTriggered: window.__xssTriggered };
     });
     console.log('XSS Triggered:', res.xssTriggered);
     await browser.close();
     await close();
   })();
   "
   ```
   **Expected Invalidation Condition**: Once `DOMSanitizer.sanitize(root)` clears `root.textContent = ''` and removes attributes on dangerous root nodes, `XSS Triggered` will output `false`, and all 13 tests in `test/challenger_m1_adversarial.js` will pass.
