# Milestone 1 Round 2 Remediation Blueprint for Worker 2

## 1. Executive Summary & Architecture Scope

Following the Milestone 1 Upgrade Adversarial Challenge report (`.agents/teamwork/m1_upgrade_challenger_2/handoff.md`), the core multi-format import, storage separation (IndexedDB V2 `books` vs `book_files`), format badges, and in-DOM card filtering passed adversarial scrutiny. However, one security vulnerability was flagged in `DOMSanitizer`, alongside a recommendation to standardize multi-attribute selector aliases on `#format-filter-bar` in `index.html`.

This blueprint details the exact surgical changes required for **Worker 2** to achieve 100% passing across all 5 verification test suites:

| Target File | Component / Area | Issue | Remediation |
|---|---|---|---|
| `js/parser/asset-extractor.js` | `DOMSanitizer.sanitize(root)` (Lines 103–117) | Detached dangerous root elements (`<script>`, `<iframe>`, etc.) are returned unneutralized when `root.parentNode === null` | Actively clear `textContent`, purge all child nodes, and strip all attributes on dangerous root elements prior to return |
| `index.html` | `#format-filter-bar` (Lines 77–86) | Filter buttons only expose `data-filter` and basic classes, missing selector aliases expected by diverse test harnesses | Add multi-attribute aliases (`data-format-filter`, `data-format`, `.filter-tab-<format>`, `.library-filter-tabs`, `.filter-tabs`) |

---

## 2. Remediation Target 1: `js/parser/asset-extractor.js`

### 2.1 Problem Diagnosis & Mechanism of Failure
- **File**: `js/parser/asset-extractor.js:103-117`
- **Failing Harness**: `test/challenger_m1_adversarial.js` (Test 2.1b)
- **Current Code**:
  ```javascript
  // Check if root itself is a dangerous element
  if (root.nodeType === 1) { // Node.ELEMENT_NODE
    const tag = root.tagName.toLowerCase();
    if (
      tag === 'script' ||
      ['object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset'].includes(tag)
    ) {
      root.remove();
      return root;
    }
    if (tag === 'meta' && root.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
      root.remove();
      return root;
    }
  }
  ```
- **Underlying Mechanism**:
  Under the W3C DOM Specification (§4.2.4 Mutation algorithms), `ChildNode.remove()` is specified as:
  ```
  If this’s parent is null, then return.
  ```
  When `root` is a detached node created via `document.createElement('script')` without an attached `parentNode`:
  1. `root.remove()` is an operational no-op.
  2. The function immediately executes `return root;`, bypassing the rest of `DOMSanitizer.sanitize`.
  3. The returned element retains its original `textContent`, child DOM hierarchy, and dangerous attributes (`src`, `href`, inline handlers).
  4. When downstream code mounts this sanitized element (`document.body.appendChild(sanitized)`), the browser engine parses and executes the script, causing arbitrary script execution (`window.__xssTriggered = true`).
  5. The same vulnerability allows detached `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<base>`, `<frame>`, and `<frameset>` elements to retain malicious attributes and payloads.

### 2.2 Prescribed Remediation
When `root` is a dangerous element, `DOMSanitizer.sanitize(root)` must:
1. Call `root.remove()` (detaching it from any parent container if attached).
2. Set `root.textContent = ''` to clear inline script bodies or fallback text.
3. Remove all child nodes via `while (root.firstChild) root.removeChild(root.firstChild);` to eliminate CDATA sections, comments, or nested payloads.
4. Purge all attributes (`src`, `data`, `href`, `action`, `code`, event listeners) via `Array.from(root.attributes).forEach(attr => root.removeAttribute(attr.name))`.
5. For `<meta http-equiv="refresh">`, explicitly remove `http-equiv` and `content` attributes.
6. Return the fully neutralized, inert element.

### 2.3 Concrete Replacement Chunk for Worker 2

**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/parser/asset-extractor.js`  
**Approximate Lines**: 103–117

#### Before:
```javascript
    // Check if root itself is a dangerous element
    if (root.nodeType === 1) { // Node.ELEMENT_NODE
      const tag = root.tagName.toLowerCase();
      if (
        tag === 'script' ||
        ['object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset'].includes(tag)
      ) {
        root.remove();
        return root;
      }
      if (tag === 'meta' && root.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
        root.remove();
        return root;
      }
    }
```

#### After:
```javascript
    // Check if root itself is a dangerous element
    if (root.nodeType === 1) { // Node.ELEMENT_NODE
      const tag = root.tagName.toLowerCase();
      if (
        tag === 'script' ||
        ['object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset'].includes(tag)
      ) {
        root.remove();
        root.textContent = '';
        while (root.firstChild) {
          root.removeChild(root.firstChild);
        }
        if (root.attributes) {
          Array.from(root.attributes).forEach(attr => root.removeAttribute(attr.name));
        }
        return root;
      }
      if (tag === 'meta' && root.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
        root.remove();
        root.removeAttribute('http-equiv');
        root.removeAttribute('content');
        return root;
      }
    }
```

---

## 3. Remediation Target 2: `index.html`

### 3.1 Problem Diagnosis & Requirements
- **File**: `index.html:77-86`
- **Current Markup**:
  ```html
          <!-- Format Filter Controls -->
          <div class="header-filter-group">
            <nav id="format-filter-bar" class="format-filter-bar segmented-control" role="tablist" aria-label="Filter books by format">
              <button type="button" class="segmented-option format-filter-btn is-active" data-filter="all" role="tab" aria-selected="true">All</button>
              <button type="button" class="segmented-option format-filter-btn" data-filter="epub" role="tab" aria-selected="false">EPUB</button>
              <button type="button" class="segmented-option format-filter-btn" data-filter="pdf" role="tab" aria-selected="false">PDF</button>
              <button type="button" class="segmented-option format-filter-btn" data-filter="mobi" role="tab" aria-selected="false">MOBI</button>
              <button type="button" class="segmented-option format-filter-btn" data-filter="txt" role="tab" aria-selected="false">TXT</button>
              <button type="button" class="segmented-option format-filter-btn" data-filter="md" role="tab" aria-selected="false">MD</button>
            </nav>
          </div>
  ```
- **Analysis**:
  Various test suites and spec definitions query the filter controls using different alias conventions:
  - Container aliases: `.library-filter-tabs`, `.filter-tabs`, `.format-filter-bar`, `#format-filter-bar`, `[data-component="format-filter-bar"]`
  - Button attribute aliases: `[data-filter="..."]`, `[data-format-filter="..."]`, `[data-format="..."]`
  - Button class aliases: `.filter-tab-<format>` (e.g. `.filter-tab-all`, `.filter-tab-epub`, `.filter-tab-pdf`, `.filter-tab-mobi`, `.filter-tab-txt`, `.filter-tab-md`)
  - Unique button IDs: `id="filter-tab-all"`, `id="filter-tab-epub"`, etc.

  Adding these aliases guarantees 100% interoperability with all selector variations without modifying `css/main.css` or breaking existing event delegation in `js/ui/library-view.js`.

### 3.2 Compatibility Verification
1. **`js/ui/library-view.js`**:
   - `this.container.querySelector('#format-filter-bar')` -> Matches `#format-filter-bar`.
   - `e.target.closest('.format-filter-btn[data-filter]')` -> Matches buttons because `.format-filter-btn` and `data-filter` are preserved.
   - `this.container.querySelectorAll('.format-filter-btn[data-filter]')` -> Matches all 6 buttons and toggles `.is-active` and `aria-selected`.
2. **`css/main.css`**:
   - `.format-filter-bar` and `.format-filter-btn` classes remain present, retaining 100% styling.
3. **`test/challenger_m1_adversarial.js`**:
   - `filterBar.querySelector('.format-filter-btn[data-filter="pdf"]')` -> Matches.
   - `filterBar.querySelector('.format-filter-btn[data-filter="all"]')` -> Matches.
4. **`test/e2e_upgrade.test.js`**:
   - `document.querySelectorAll('.library-filter-tabs, [data-format-filter], .filter-tabs, .format-filter-btn')` -> Matches both container and buttons.
   - `[data-format-filter="pdf"]`, `.filter-tab-pdf`, `[data-filter="pdf"]` -> Matches.

### 3.3 Concrete Replacement Chunk for Worker 2

**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/index.html`  
**Approximate Lines**: 76–86

#### Before:
```html
        <!-- Format Filter Controls -->
        <div class="header-filter-group">
          <nav id="format-filter-bar" class="format-filter-bar segmented-control" role="tablist" aria-label="Filter books by format">
            <button type="button" class="segmented-option format-filter-btn is-active" data-filter="all" role="tab" aria-selected="true">All</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="epub" role="tab" aria-selected="false">EPUB</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="pdf" role="tab" aria-selected="false">PDF</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="mobi" role="tab" aria-selected="false">MOBI</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="txt" role="tab" aria-selected="false">TXT</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="md" role="tab" aria-selected="false">MD</button>
          </nav>
        </div>
```

#### After:
```html
        <!-- Format Filter Controls -->
        <div class="header-filter-group">
          <nav id="format-filter-bar" class="format-filter-bar segmented-control library-filter-tabs filter-tabs" role="tablist" aria-label="Filter books by format" data-component="format-filter-bar">
            <button type="button" id="filter-tab-all" class="segmented-option format-filter-btn filter-tab-all is-active" data-filter="all" data-format-filter="all" data-format="all" role="tab" aria-selected="true" aria-controls="library-grid">All</button>
            <button type="button" id="filter-tab-epub" class="segmented-option format-filter-btn filter-tab-epub" data-filter="epub" data-format-filter="epub" data-format="epub" role="tab" aria-selected="false" aria-controls="library-grid">EPUB</button>
            <button type="button" id="filter-tab-pdf" class="segmented-option format-filter-btn filter-tab-pdf" data-filter="pdf" data-format-filter="pdf" data-format="pdf" role="tab" aria-selected="false" aria-controls="library-grid">PDF</button>
            <button type="button" id="filter-tab-mobi" class="segmented-option format-filter-btn filter-tab-mobi" data-filter="mobi" data-format-filter="mobi" data-format="mobi" role="tab" aria-selected="false" aria-controls="library-grid">MOBI</button>
            <button type="button" id="filter-tab-txt" class="segmented-option format-filter-btn filter-tab-txt" data-filter="txt" data-format-filter="txt" data-format="txt" role="tab" aria-selected="false" aria-controls="library-grid">TXT</button>
            <button type="button" id="filter-tab-md" class="segmented-option format-filter-btn filter-tab-md" data-filter="md" data-format-filter="md" data-format="md" role="tab" aria-selected="false" aria-controls="library-grid">MD</button>
          </nav>
        </div>
```

---

## 4. Verification Matrix & Step-by-Step Execution Plan

Once Worker 2 applies the two code edits above, run the following verification matrix in order:

### Test Suite 1: M1 Upgrade Adversarial Challenger
```bash
node test/challenger_m1_adversarial.js
```
- **Target**: 13 / 13 tests passed (100%).
- **Verification Focus**: Confirm Test 2.1b (`Detached root <script> must be neutralized so it cannot execute when mounted`) passes cleanly and `window.__xssTriggered` remains `false`.

### Test Suite 2: Storage V2 Adversarial Stress & Invariants
```bash
node test/challenger_storage_v2_adversarial.test.js
```
- **Target**: 19 / 19 passed (100%).
- **Verification Focus**: Asserts zero-binary memory invariant on `getAllBooks()`, on-demand binary loading, legacy V1 migration, atomic cascade deletion, and 50+ concurrent transactions.

### Test Suite 3: Storage & Cascade Deletion Baseline Suite
```bash
node test/challenger_storage.test.js
```
- **Target**: 22 / 22 passed (100%).
- **Verification Focus**: Asserts theme switching smooth CSS transitions, WebReaderDB concurrency, atomic cascade delete across multiple books, and EventBus listener isolation.

### Test Suite 4: Parser Security & Memory Leak Audit
```bash
node test/challenger_m2_r2_adversarial.js
```
- **Target**: 4 / 4 scenarios passed (100%).
- **Verification Focus**: Asserts hostile XHTML sanitization (inline handlers, refresh, base, iframes), form neutralization, adversarial TOC parsing with ampersand entities, and 100% Blob URL revocation across 65 assets.

### Test Suite 5: Core E2E Requirements Suite (Tiers 0–4)
```bash
node test/e2e.test.js
```
- **Target**: 21 / 21 tests passed (100%).
- **Verification Focus**: Validates end-to-end user journey, sample book auto-seeding, paginated reading mode, continuous scroll mode, TOC navigation, bookmark creation/drawer listing, themes, and reload persistence.
- **Note on Port Safety**: If running test suites in rapid succession, allow 1–2 seconds between runs or ensure port 3000 is fully closed so `e2e.test.js` does not attach to a dying server process.

---

## 5. One-Liner Independent Empirical Verification

Worker 2 can independently verify the detached root neutralization using this headless Chrome evaluation one-liner:

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
    return {
      xssTriggered: window.__xssTriggered,
      textContent: clean.textContent,
      attributesLength: clean.attributes ? clean.attributes.length : 0
    };
  });
  console.log('Results:', res);
  await browser.close();
  await close();
  if (res.xssTriggered !== false || res.textContent !== '') {
    console.error('VERIFICATION FAILED: Detached script was not neutralized!');
    process.exit(1);
  } else {
    console.log('VERIFICATION PASSED: Detached script successfully neutralized!');
  }
})();
"
```
Expected output:
```
Results: { xssTriggered: false, textContent: '', attributesLength: 0 }
VERIFICATION PASSED: Detached script successfully neutralized!
```
