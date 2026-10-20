# Remediation Blueprint & Investigation Handoff Report

**Milestone**: Milestone 2, Iteration 2 (Remediation)  
**Agent**: Explorer 2 (`m2_r2_explorer_2`)  
**Date**: 2026-10-17T04:10:00Z  
**Target**: `js/parser/opf-parser.js` XML / HTML5 DOM Traversal & Prefix-Splitting Remediation  
**Status**: Ready for Implementation by Worker  

---

## 1. Observation

Direct empirical observations from executing adversarial tests against `js/parser/opf-parser.js` and inspecting DOMParser behavior across strict XML (`application/xml`), XHTML, and HTML5 fallback (`text/html`) in headless Google Chrome (v155.0.8059.82 via `puppeteer-core`):

### A. Gate Failure Reproduction in `challenge_parser.js`
In `m2_challenger_1/challenge_parser.js` (lines 298–316):
```javascript
const opfUndeclaredPrefix = `
  <package>
    <metadata>
      <dc:title>Undeclared Prefix Book</dc:title>
      <dc:creator>Anonymous Author</dc:creator>
    </metadata>
  </package>
`;
const resUndeclared = OpfParser.parseOpf(opfUndeclaredPrefix, 'content.opf');
```
When an OPF uses `<dc:title>` without declaring `xmlns:dc="..."`, XML `DOMParser.parseFromString(xmlText, 'application/xml')` throws:
```
error on line 1: Namespace prefix dc on title is not defined
```
Line 202 of `js/parser/opf-parser.js` then executes the HTML recovery fallback:
```javascript
doc = parser.parseFromString(xmlText, 'text/html');
```

### B. Empirical Chrome DOM Inspection of HTML5 Fallback
Running `DOMParser.parseFromString('<package><metadata><dc:title>Undeclared Prefix Book</dc:title></metadata></package>', 'text/html')` in Google Chrome yields:
```json
{
  "tagNsLen": 0,
  "childTag": "DC:TITLE",
  "childLocal": "dc:title",
  "childNode": "DC:TITLE",
  "childPrefix": null,
  "childNs": "http://www.w3.org/1999/xhtml"
}
```
Key observations:
1. `getElementsByTagNameNS('*', 'title')` returns length `0` because in HTML5 mode, unknown colon-prefixed elements receive `namespaceURI = "http://www.w3.org/1999/xhtml"` and `localName = "dc:title"`. Since `'dc:title' !== 'title'`, wildcard namespace lookup does not match.
2. In `getMetaText()` (`js/parser/opf-parser.js:55`) and `getAllMetaText()` (`js/parser/opf-parser.js:92`):
   ```javascript
   const nodeLocal = (node.localName || node.nodeName.split(':').pop() || '').toLowerCase();
   ```
   Because `node.localName` is truthy (`'dc:title'`), the fallback `node.nodeName.split(':').pop()` is short-circuited.
   Consequently, `nodeLocal` remains `'dc:title'`.
   The equality check `nodeLocal === localName.toLowerCase()` (`'dc:title' === 'title'`) evaluates to `false`.
   The title extraction fails, erroneously returning fallback `'Untitled Book'`.
   Likewise, `getAllMetaText` fails to extract `<dc:creator>`, returning empty array `[]` and causing author to fall back to `'Unknown Author'`.

### C. Secondary Observation: HTML5 Tokenization of Self-Closing XML Elements
During the comprehensive audit of `opf-parser.js`, an additional HTML5 parser anomaly was empirically observed:
In `text/html` mode, custom tags (e.g. `<item ... />` and `<itemref ... />`) are **not** HTML void elements (unlike `<img>` or `<meta>`). The HTML5 tokenizer ignores the trailing self-closing slash `/` and considers the tag unclosed.
When an OPF containing multiple manifest items:
```html
<manifest>
  <item id="ch1" href="ch1.xhtml"/>
  <item id="ch2" href="ch2.xhtml"/>
</manifest>
```
is parsed by `text/html`, Chrome parses `ch2` as a **child** of `ch1`:
```javascript
{ tag: 'ITEM', id: 'ch1', parent: 'MANIFEST' },
{ tag: 'ITEM', id: 'ch2', parent: 'ITEM' }
```
In `js/parser/opf-parser.js:253` and `287`:
```javascript
if (itemEl.parentElement && itemEl.parentElement.localName && itemEl.parentElement.localName.toLowerCase() !== 'manifest') {
  continue;
}
```
Because `ch2.parentElement.localName` is `'item'` (or `'opf:item'`), this check skips `ch2` and all subsequent chapters, retaining only the very first manifest item and first spine item!

### D. Tertiary Observation: Prefixed Structural Elements
When an OPF uses `<opf:package>` and `<opf:metadata>` without XML namespace declarations:
In HTML5 fallback mode, `doc.querySelector('package')` and `doc.querySelector('metadata')` evaluate to `null` because CSS tag selectors require escaping colons (e.g. `doc.querySelector('opf\\:metadata')`). As a result, `packageEl` and `metadataEl` fell back to `doc.documentElement` (`<html>`), preventing child iteration from finding metadata elements.

---

## 2. Logic Chain

1. **Root Cause Analysis of Prefix Stripping**:
   - In standard XML (`application/xml`), the XML parser handles `xmlns:dc` properly: `node.localName` is `'title'` and `node.prefix` is `'dc'`.
   - In HTML5 (`text/html`), the HTML tokenizer does not recognize XML namespaces. It tokenizes the entire string before the space or `>` as the tag name. Therefore, `node.tagName` is `"DC:TITLE"`, `node.nodeName` is `"DC:TITLE"`, and `node.localName` is `"dc:title"`.
   - The expression `(node.localName || node.nodeName.split(':').pop() || '')` assumes `node.localName` is either missing or already stripped. But when `node.localName` contains a prefix (`"dc:title"`), the logical OR short-circuits.
   - **Remediation**: Split by `:` on the raw string from either `localName` or `nodeName`:
     ```javascript
     const rawName = node.localName || node.nodeName || '';
     const nodeLocal = (rawName.split(':').pop() || '').toLowerCase();
     ```
     This safely strips prefixes in strict XML, XHTML, and HTML5 fallback modes.

2. **Descendant Traversal for HTML5 Mode**:
   - In `getMetaText` and `getAllMetaText`, Step 1 (`getElementsByTagNameNS('*', localName)`) fails in HTML5 mode when tags have prefixes.
   - Step 2 iterates direct children of `parentNode`. If `parentNode` is `<metadata>`, direct children are checked.
   - To guard against cases where metadata elements are nested deeper or `metadataEl` is a wrapper, Step 3 scans all descendants using prefix-split matching.

3. **Resilient Structural Element Discovery**:
   - Rather than relying solely on `doc.querySelector('metadata')`, `doc.querySelector('manifest')`, and `doc.querySelector('spine')`, a prefix-tolerant helper `findElementByLocal(root, 'metadata')` checks:
     1. `root.querySelector(target)`
     2. `root.getElementsByTagNameNS('*', target)`
     3. Fallback scan matching `getNodeLocalName(el) === target`
   - This ensures `<opf:package>`, `<opf:metadata>`, `<opf:manifest>`, and `<opf:spine>` are located reliably across all document types.

4. **Manifest and Spine Scoping vs. Parent Checks**:
   - In HTML5 mode, because self-closing XML tags (`<item .../>`) become nested inside previous items, checking `itemEl.parentElement.localName.toLowerCase() === 'manifest'` fails for all items after the first.
   - By querying `itemElements = findElementsByLocal(manifestEl, 'item')`, every returned element is guaranteed to be within the manifest.
   - If `<manifest>` was omitted (malformed OPF), items are filtered by ensuring no ancestor is `metadata` or `spine`.
   - The exact same principle applies to `<itemref>` elements within `<spine>`.

---

## 3. Caveats

1. **Scope Boundary**:
   Per project rules, this agent is an explorer and does not write directly to `js/parser/opf-parser.js`. The proposed drop-in file is placed at `.agents/teamwork/m2_r2_explorer_2/proposed_opf-parser.js` and patch at `.agents/teamwork/m2_r2_explorer_2/proposed_opf-parser.patch`.
2. **Related File Pattern in `toc-parser.js`**:
   During the codebase audit, an identical pattern was spotted in `js/parser/toc-parser.js:85`:
   `const local = (child.localName || child.nodeName.split(':').pop() || '').toLowerCase();`
   While outside the immediate scope of `opf-parser.js`, updating `toc-parser.js` with `getNodeLocalName` in a subsequent task is recommended for uniform resilience.
3. **Browser Engine Consistency**:
   The HTML5 tokenization behavior (`localName === 'dc:title'`) is defined by the WHATWG HTML specification (§13.2.5 Tokenization) and behaves identically across Google Chrome (Blink), Apple Safari (WebKit), and Mozilla Firefox (Gecko).

---

## 4. Conclusion & Actionable Remediation Blueprint

The root cause of Challenger 1's gate failure finding has been fully identified, analyzed, and solved.

### Deliverables Produced in Working Directory:
1. **Drop-in Remediation File**:
   `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_r2_explorer_2/proposed_opf-parser.js`
2. **Unified Git Patch**:
   `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_r2_explorer_2/proposed_opf-parser.patch`

### Exact Code Architecture in `proposed_opf-parser.js`:

#### A. Universal Prefix-Splitting Helper
```javascript
export function getNodeLocalName(node) {
  if (!node) return '';
  const rawName = node.localName || node.nodeName || '';
  return (rawName.split(':').pop() || '').toLowerCase();
}
```

#### B. Prefix-Tolerant DOM Query Helpers
```javascript
export function findElementByLocal(root, targetLocal) {
  if (!root) return null;
  const target = (targetLocal || '').toLowerCase();

  try {
    const el = root.querySelector(target);
    if (el) return el;
  } catch (_) {}

  if (typeof root.getElementsByTagNameNS === 'function') {
    const els = root.getElementsByTagNameNS('*', target);
    if (els && els.length > 0) return els[0];
  }

  if (typeof root.getElementsByTagName === 'function') {
    const all = root.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (getNodeLocalName(all[i]) === target) return all[i];
    }
  }

  return null;
}

export function findElementsByLocal(root, targetLocal) {
  if (!root) return [];
  const target = (targetLocal || '').toLowerCase();

  try {
    const qsa = root.querySelectorAll(target);
    if (qsa && qsa.length > 0) return Array.from(qsa);
  } catch (_) {}

  if (typeof root.getElementsByTagNameNS === 'function') {
    const els = root.getElementsByTagNameNS('*', target);
    if (els && els.length > 0) return Array.from(els);
  }

  if (typeof root.getElementsByTagName === 'function') {
    const all = root.getElementsByTagName('*');
    const matched = [];
    for (let i = 0; i < all.length; i++) {
      if (getNodeLocalName(all[i]) === target) matched.push(all[i]);
    }
    return matched;
  }

  return [];
}
```

#### C. Remediated `getMetaText` and `getAllMetaText`
```javascript
export function getMetaText(parentNode, localName, fallback = '') {
  if (!parentNode) return fallback;
  const target = (localName || '').toLowerCase();

  // 1. Fast path: getElementsByTagNameNS with wildcard namespace for valid XML/XHTML
  if (typeof parentNode.getElementsByTagNameNS === 'function') {
    const elements = parentNode.getElementsByTagNameNS('*', localName);
    for (let i = 0; i < elements.length; i++) {
      const text = elements[i].textContent ? elements[i].textContent.trim() : '';
      if (text) return text;
    }
  }

  // 2. Immediate children checking prefix-stripped localName
  const children = parentNode.children || parentNode.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 1) {
      const nodeLocal = getNodeLocalName(node);
      if (nodeLocal === target) {
        const text = node.textContent ? node.textContent.trim() : '';
        if (text) return text;
      }
    }
  }

  // 3. Descendants fallback for HTML5 fallback mode or nested wrappers
  if (typeof parentNode.getElementsByTagName === 'function') {
    const elements = parentNode.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const node = elements[i];
      const nodeLocal = getNodeLocalName(node);
      if (nodeLocal === target) {
        const text = node.textContent ? node.textContent.trim() : '';
        if (text) return text;
      }
    }
  }

  return fallback;
}
```

#### D. Remediated Manifest & Spine Item Resolution
```javascript
    // Manifest items scoped to manifestEl to prevent HTML5 self-closing nesting drop
    const manifestEl = findElementByLocal(doc, 'manifest');
    const itemElements = manifestEl
      ? findElementsByLocal(manifestEl, 'item')
      : findElementsByLocal(doc, 'item').filter(el => {
          let parent = el.parentElement;
          while (parent) {
            const pName = getNodeLocalName(parent);
            if (pName === 'metadata' || pName === 'spine') return false;
            parent = parent.parentElement;
          }
          return true;
        });

    // Spine items scoped to spineEl
    const spineEl = findElementByLocal(doc, 'spine');
    const spineTocId = spineEl ? spineEl.getAttribute('toc') || undefined : undefined;
    const itemrefElements = spineEl
      ? findElementsByLocal(spineEl, 'itemref')
      : findElementsByLocal(doc, 'itemref').filter(el => {
          let parent = el.parentElement;
          while (parent) {
            const pName = getNodeLocalName(parent);
            if (pName === 'metadata' || pName === 'manifest') return false;
            parent = parent.parentElement;
          }
          return true;
        });
```

---

## 5. Verification Method

To independently verify this blueprint:

1. **Verify Proposed File via Automated Headless Chrome Execution**:
   Execute the following command:
   ```bash
   node -e "
   const puppeteer = require('puppeteer-core');
   const fs = require('node:fs');
   const path = require('node:path');
   const { startServer } = require('./test/server.js');

   (async () => {
     const { url: serverUrl, close } = await startServer({ port: 0, autoPortFallback: true });
     const browser = await puppeteer.launch({
       executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
       headless: 'new',
       args: ['--no-sandbox']
     });
     const page = await browser.newPage();
     await page.goto(serverUrl + '/index.html');

     let proposedCode = fs.readFileSync(path.resolve('.agents/teamwork/m2_r2_explorer_2/proposed_opf-parser.js'), 'utf8');
     proposedCode = proposedCode.replace('./path-resolver.js', serverUrl + '/js/parser/path-resolver.js');

     const testReport = await page.evaluate(async (code) => {
       const blob = new Blob([code], { type: 'application/javascript' });
       const blobUrl = URL.createObjectURL(blob);
       const proposed = await import(blobUrl);
       URL.revokeObjectURL(blobUrl);

       const { OpfParser, getNodeLocalName } = proposed;
       const results = [];

       // 1. Undeclared prefix in HTML5 fallback
       const opf1 = '<package><metadata><dc:title>Adversarial Title</dc:title><dc:creator>Author One</dc:creator><dc:creator>Author Two</dc:creator></metadata></package>';
       const res1 = OpfParser.parseOpf(opf1, 'content.opf');
       if (res1.metadata.title !== 'Adversarial Title') throw new Error('Title failed');
       if (res1.metadata.author !== 'Author One, Author Two') throw new Error('Author failed');
       results.push('Undeclared prefix verified');

       // 2. Fully prefixed OPF with multiple manifest and spine items
       const opf2 = '<opf:package><opf:metadata><dc:title>Prefixed Book</dc:title></opf:metadata><opf:manifest><opf:item id=\"c1\" href=\"c1.xhtml\" media-type=\"application/xhtml+xml\"/><opf:item id=\"c2\" href=\"c2.xhtml\" media-type=\"application/xhtml+xml\"/></opf:manifest><opf:spine><opf:itemref idref=\"c1\"/><opf:itemref idref=\"c2\"/></opf:spine></opf:package>';
       const res2 = OpfParser.parseOpf(opf2, 'package.opf');
       if (res2.metadata.title !== 'Prefixed Book') throw new Error('Prefixed title failed');
       if (res2.manifest.size !== 2) throw new Error('Manifest size failed');
       if (res2.spine.length !== 2) throw new Error('Spine length failed');
       results.push('Fully prefixed verified');

       return results;
     }, proposedCode);

     console.log('Verification Success:', testReport);
     await browser.close();
     await close();
   })();
   "
   ```
   *Expected Output*: `Verification Success: [ 'Undeclared prefix verified', 'Fully prefixed verified' ]` and exit code `0`.

2. **Run Existing Worker Verification Harness**:
   ```bash
   node .agents/teamwork/m2_worker_1/verify_m2.js
   ```
   *Expected Output*: `Execution Summary: 8 / 8 passed.` Exit code `0`.

3. **Run Existing E2E Test Suite**:
   ```bash
   node test/e2e.test.js --verify-infra
   ```
   *Expected Output*: `Tier 0: 4 / 4 passed.` Exit code `0`.

4. **Invalidation Conditions**:
   - `OpfParser.parseOpf('<package><metadata><dc:title>Book</dc:title></metadata></package>', 'content.opf')` returns `'Untitled Book'`.
   - Manifest items after the first item are omitted when OPF is parsed in `text/html` mode.
   - Any regression in strict XML (`application/xml`) or EPUB 3 metadata extraction.
