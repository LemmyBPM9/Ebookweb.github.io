# Milestone 2 Iteration 2 (Remediation) Blueprint: Security Sanitization & Verification

**Author**: Explorer 3 (`m2_r2_explorer_3`)  
**Roles**: Investigator, Synthesis  
**Date**: 2026-10-17T04:08:00Z  
**Target Milestone**: Milestone 2 (Iteration 2 Remediation)  
**Status**: COMPLETE  

---

## 1. Observation

### 1.1 Empirical Defect Reproduction (Challenger 2 Failure)
Running the adversarial test suite `node .agents/teamwork/m2_challenger_2/challenge_toc_assets.js` produced the following failure:
```
--- Challenge Results ---
  ✅ PASS: [Dual TOC Stress] Deeply Nested EPUB 3 Navigation Document (6 levels)
  ✅ PASS: [Dual TOC Stress] EPUB 2 NCX with hostile unescaped & entities & namespace prefix
  ✅ PASS: [Dual TOC Stress] Unlinked <span> section headers
  ✅ PASS: [Dual TOC Stress] Anchor splitting (ch01.xhtml#sub-section & encoded fragments)
  ✅ PASS: [Synthetic TOC Fallback] Clean fallback TOC from spine chapter headings & titles
  ❌ FAIL: [Security Sanitization] Hostile XHTML Sanitization (script, onerror, javascript:, iframe, meta refresh)
     Error: Expected 0 iframe tags, found 1 (iframe was NOT stripped!)
  ✅ PASS: [CSS URL Rewriting & Cycle Stress] Circular @import resolution & relative url(...) rewriting
  ✅ PASS: [Memory Leak Audit] Revocation of 50 Blob URLs & assetMap clearing
-------------------------

CHALLENGE FAILED: Bugs found during empirical stress testing.
```
In `challenge_toc_assets.js:420`, the test input includes `<iframe src="http://evil.com"></iframe>`. At line 476, the assertion fails:
```javascript
// Check 7: iframe completely stripped!
const iframes = preparedDoc.querySelectorAll('iframe');
assert(iframes.length === 0, `Expected 0 iframe tags, found ${iframes.length} (iframe was NOT stripped!)`);
```

### 1.2 Code Inspection of `js/parser/asset-extractor.js:95-125`
In `js/parser/asset-extractor.js`:
```javascript
95:    // 2. Remove dangerous elements
96:    const dangerousTags = root.querySelectorAll('meta[http-equiv="refresh" i], object, embed, applet, base');
97:    for (let i = 0; i < dangerousTags.length; i++) {
98:      dangerousTags[i].remove();
99:    }
100:
101:   // 3. Neutralize <form> elements
102:   const forms = root.querySelectorAll('form');
103:   for (let i = 0; i < forms.length; i++) {
104:     forms[i].removeAttribute('action');
105:     forms[i].removeAttribute('method');
106:     forms[i].setAttribute('onsubmit', 'return false;');
107:   }
108:
109:   // 4. Strip inline event handlers (on*) and dangerous URI schemes
110:   const dangerousAttrs = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster'];
111:   const allElements = root.querySelectorAll('*');
112:
113:   for (let i = 0; i < allElements.length; i++) {
114:     const el = allElements[i];
115:     const attrs = Array.from(el.attributes);
116:
117:     for (let j = 0; j < attrs.length; j++) {
118:       const attr = attrs[j];
119:       const name = attr.name.toLowerCase();
120:
121:       // Strip inline on* event listeners
122:       if (name.startsWith('on')) {
123:         el.removeAttribute(attr.name);
124:         continue;
125:       }
```

Observations:
1. Line 96 selects `meta[http-equiv="refresh" i], object, embed, applet, base`. Tags `iframe`, `frame`, and `frameset` are completely omitted.
2. In lines 101–107 (Step 3), `forms[i].setAttribute('onsubmit', 'return false;')` is called. In lines 109–125 (Step 4), all attributes whose name starts with `'on'` are stripped unconditionally via `el.removeAttribute(attr.name)`. Consequently, the `onsubmit` attribute set in line 106 is deleted within microseconds — pure dead code.
3. Both `challenge_toc_assets.js:446-450` and `adversarial_test.js:124-129` assert that the sanitized DOM must contain **zero** attributes matching `name.toLowerCase().startsWith('on')`.

### 1.3 Inspection of Worker Verification Suite (`verify_m2.js:245-279`)
In `.agents/teamwork/m2_worker_1/verify_m2.js`:
```javascript
248:   // DOM Sanitizer test
249:   const dirtyHtml = `
250: <!DOCTYPE html>
251: <html>
252: <head>
253:   <meta http-equiv="refresh" content="5;url=http://evil.com">
254:   <script>window.pwned = true;</script>
255: </head>
256: <body onload="alert(1)">
257:   <img src="pic.jpg" onerror="alert(2)">
258:   <a href="javascript:alert(3)">Dangerous Link</a>
259:   <a href="data:text/html,<script>alert(4)</script>">Dangerous Data Link</a>
260:   <form action="http://evil.com" method="POST"><input type="text"/></form>
261:   <object data="malware.swf"></object>
262: </body>
263: </html>`;
```
`dirtyHtml` does NOT contain `<iframe>`, `<frame>`, `<frameset>`, `<embed>`, `<applet>`, `<base>`, `vbscript:`, `data:application/xhtml+xml`, or `button[formaction]`. Nor did `verify_m2.js` assert that `doc.querySelectorAll('iframe').length === 0` or that all `on*` attributes are zero across the DOM. This test blindspot allowed the sanitizer omission to pass the initial worker self-verification.

---

## 2. Logic Chain

1. **Root Cause Analysis of the Iframe Defect**:
   - `DOMSanitizer` serves as Defense Layer 1 before chapter content enters the reader DOM (`AssetExtractor.getChapterDocument`).
   - While Milestone 3 mounts chapters inside a sandboxed `<iframe>` (Defense Layer 2), Defense Layer 1 must enforce defense-in-depth by eliminating all embedded browsing contexts (`iframe`, `frame`, `frameset`) as required by `PROJECT.md:34` and the milestone specification.
   - Expanding `dangerousTags` to `meta[http-equiv="refresh" i], object, embed, applet, base, iframe, frame, frameset` ensures that every nested frame and frameset is stripped during DOM traversal.

2. **Form Neutralization Audit & Resolution**:
   - *Why `onsubmit="return false;"` is an Anti-Pattern here*:
     1. Setting `onsubmit="return false;"` is an inline JavaScript event handler. In reader documents, scripts are forbidden.
     2. In Milestone 3, reader chapters render in `sandbox="allow-same-origin"` without `allow-scripts` and without `allow-forms`. In that sandbox, inline scripts cannot execute, and form submissions are blocked natively by the browser engine.
     3. Setting `onsubmit="return false;"` immediately conflicts with the invariant enforced by both Challenger 2 and Reviewer 2: `elementsWithOn.length === 0` (zero inline `on*` event handlers). If `onsubmit` were preserved, it would fail the zero-`on*` security invariant.
     4. Because Step 4 immediately deletes any attribute starting with `'on'`, line 106 was non-functional dead code.
   - *Proper Form Neutralization Strategy*:
     - Preserve `<form>` and form controls (`<input>`, `<button>`) in the DOM to preserve book layout, styling, and text content (e.g. interactive quizzes, formatted forms in educational EPUBs).
     - Strip `action`, `method`, and `target` attributes from `<form>`.
     - Strip `formaction`, `formmethod`, and `formtarget` attributes from submit buttons and inputs (`button[formaction]`, `input[formaction]`).
     - Do NOT set `onsubmit="return false;"`.
     - In Step 4, remove all author-supplied `on*` event handlers across all elements.
     - Result: Forms are rendered completely inert, form submission targets are eliminated, and zero inline `on*` handlers exist in the DOM.

3. **Verification Suite Enhancement**:
   - `verify_m2.js` must be updated with identical rigor to `challenge_toc_assets.js`:
     1. Test a comprehensive dirty payload including `iframe`, `frame`, `frameset`, `base`, `object`, `embed`, `applet`, `on*` attributes, dangerous URIs (`javascript:`, `vbscript:`, `data:text/html`, `data:application/xhtml+xml`), `<form>`, and `<button formaction="...">`.
     2. Assert `iframe`, `frame`, `frameset` counts are strictly 0.
     3. Assert `elementsWithOn.length === 0`.
     4. Assert form `action`, `method`, `target`, and `formaction` are removed.
     5. Test end-to-end chapter document preparation (`AssetExtractor.getChapterDocument`) against an in-memory ZIP containing hostile XHTML with an `<iframe>` and verify that the resulting chapter document has 0 `iframe` tags.
   - This prevents regression and verifies the fix both at unit level (`DOMSanitizer`) and integration level (`AssetExtractor`).

---

## 3. Caveats

1. **Read-Only Explorer Scope**: In accordance with the Explorer archetype rules, no changes have been applied to `js/parser/asset-extractor.js` or `.agents/teamwork/m2_worker_1/verify_m2.js`. All proposed changes are provided as standalone artifacts and patches in `.agents/teamwork/m2_r2_explorer_3/`.
2. **Case Sensitivity in XML**: In EPUB XHTML mode (`application/xhtml+xml`), tag names match strictly. In standard EPUB content, all HTML elements are lowercase. In `text/html` fallback mode, tag matching is ASCII-case-insensitive. The selector `iframe, frame, frameset` handles standard HTML/XHTML tags.

---

## 4. Conclusion & Actionable Blueprint

### 4.1 Artifacts Created in Explorer Directory
The following validated files have been created in `.agents/teamwork/m2_r2_explorer_3/`:
1. `proposed_asset-extractor.js`: Full replacement for `js/parser/asset-extractor.js`.
2. `asset-extractor.patch`: Unified diff patch against `js/parser/asset-extractor.js`.
3. `proposed_verify_m2.js`: Full replacement for `.agents/teamwork/m2_worker_1/verify_m2.js`.
4. `verify_m2.patch`: Unified diff patch against `.agents/teamwork/m2_worker_1/verify_m2.js`.

### 4.2 Exact Code Modifications for Workers

#### Modification 1: `js/parser/asset-extractor.js`
Replace lines 95–107 with:
```javascript
    // 2. Remove dangerous elements (meta refresh, object, embed, applet, base, iframe, frame, frameset)
    const dangerousTags = root.querySelectorAll('meta[http-equiv="refresh" i], object, embed, applet, base, iframe, frame, frameset');
    for (let i = 0; i < dangerousTags.length; i++) {
      dangerousTags[i].remove();
    }

    // 3. Neutralize <form> elements and form submission controls
    const forms = root.querySelectorAll('form');
    for (let i = 0; i < forms.length; i++) {
      forms[i].removeAttribute('action');
      forms[i].removeAttribute('method');
      forms[i].removeAttribute('target');
    }
    const formControls = root.querySelectorAll('button[formaction], input[formaction]');
    for (let i = 0; i < formControls.length; i++) {
      formControls[i].removeAttribute('formaction');
      formControls[i].removeAttribute('formmethod');
      formControls[i].removeAttribute('formtarget');
    }
```

#### Modification 2: `.agents/teamwork/m2_worker_1/verify_m2.js`
Replace SUITE D (lines 245–279) with the comprehensive test:
```javascript
      // -------------------------------------------------------------
      // SUITE D: AssetExtractor & DOM Sanitizer
      // -------------------------------------------------------------
      try {
        // Comprehensive Security Sanitization test (HTML and XHTML)
        const dirtyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="5;url=http://evil.com">
  <base href="http://evil.com/">
  <script>window.pwned = true;</script>
</head>
<body onload="alert(1)">
  <img src="pic.jpg" onerror="alert(2)">
  <a href="javascript:alert(3)">Dangerous Link</a>
  <a href="data:text/html,<script>alert(4)</script>">Dangerous Data Link</a>
  <a href="vbscript:msgbox(5)">Dangerous VBScript Link</a>
  <a href="data:application/xhtml+xml,<script>alert(6)</script>">Dangerous XHTML Data Link</a>
  <iframe src="http://evil.com/frame.html"></iframe>
  <frameset><frame src="http://evil.com/frame2.html"></frameset>
  <object data="malware.swf"></object>
  <embed src="exploit.swf"></embed>
  <applet code="Malware.class"></applet>
  <form action="http://evil.com/phish" method="POST" target="_blank" onsubmit="alert('form')">
    <input type="text" name="data"/>
    <button type="submit" formaction="http://evil.com/override">Submit</button>
  </form>
  <div onclick="alert('click')" onmouseover="alert('hover')">Clean Text Content</div>
</body>
</html>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(dirtyHtml, 'text/html');
        DOMSanitizer.sanitize(doc);

        // Assert dangerous elements completely stripped
        assert(doc.querySelectorAll('script').length === 0, 'script not removed');
        assert(doc.querySelectorAll('meta[http-equiv="refresh"]').length === 0, 'meta refresh not removed');
        assert(doc.querySelectorAll('base').length === 0, 'base not removed');
        assert(doc.querySelectorAll('object').length === 0, 'object not removed');
        assert(doc.querySelectorAll('embed').length === 0, 'embed not removed');
        assert(doc.querySelectorAll('applet').length === 0, 'applet not removed');
        assert(doc.querySelectorAll('iframe').length === 0, 'iframe was not stripped');
        assert(doc.querySelectorAll('frame').length === 0, 'frame was not stripped');
        assert(doc.querySelectorAll('frameset').length === 0, 'frameset was not stripped');

        // Assert 100% inline on* event handlers stripped
        const elementsWithOn = Array.from(doc.querySelectorAll('*')).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.toLowerCase().startsWith('on'));
        });
        assert(elementsWithOn.length === 0, `Expected 0 inline on* handlers, found ${elementsWithOn.length}`);

        // Assert dangerous URI schemes neutralized
        const dangerousHrefs = Array.from(doc.querySelectorAll('a')).filter(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          return href.startsWith('javascript:') || href.startsWith('vbscript:') || href.startsWith('data:text/html') || href.startsWith('data:application/xhtml');
        });
        assert(dangerousHrefs.length === 0, `Dangerous hrefs not removed: ${dangerousHrefs.length}`);

        // Assert form neutralization
        const form = doc.querySelector('form');
        assert(form !== null, 'form element should be preserved for styling');
        assert(!form.hasAttribute('action'), 'form action was not removed');
        assert(!form.hasAttribute('method'), 'form method was not removed');
        assert(!form.hasAttribute('target'), 'form target was not removed');
        assert(!form.hasAttribute('onsubmit'), 'form onsubmit was not stripped');

        const button = doc.querySelector('button');
        assert(button !== null, 'button element should be preserved');
        assert(!button.hasAttribute('formaction'), 'button formaction was not removed');

        // Also test AssetExtractor chapter preparation with hostile iframe in XHTML archive
        const testZip = new JSZip();
        testZip.file('OEBPS/text/test-sec.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Sec Test</title></head>
<body>
  <iframe src="http://evil.com/embedded.html"></iframe>
  <div onmouseover="alert('div')">Safe Chapter Text</div>
</body>
</html>`);
        const extractor = new AssetExtractor(testZip);
        const chapterDoc = await extractor.getChapterDocument('OEBPS/text/test-sec.xhtml');
        assert(chapterDoc.querySelectorAll('iframe').length === 0, 'AssetExtractor.getChapterDocument failed to strip iframe');
        const chapterOnAttrs = Array.from(chapterDoc.querySelectorAll('*')).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.toLowerCase().startsWith('on'));
        });
        assert(chapterOnAttrs.length === 0, 'AssetExtractor.getChapterDocument failed to strip on* handler');
        extractor.cleanup();

        results.push({ suite: 'AssetExtractor', name: 'Security Sanitization & Defense Layer 1 (iframe, frame, form & on* handlers)', passed: true });
      } catch (err) {
        results.push({ suite: 'AssetExtractor', name: 'Security Sanitization & Defense Layer 1 (iframe, frame, form & on* handlers)', passed: false, detail: err.message });
      }
```

---

## 5. Verification Method

Once workers apply the modifications, the following verification commands must be executed:

1. **Challenger 2 Adversarial Stress Suite**:
   ```bash
   node .agents/teamwork/m2_challenger_2/challenge_toc_assets.js
   ```
   - **Passing Result**: 8 / 8 tests pass, prints `CHALLENGE PASSED: All adversarial scenarios verified.`, exit code 0.
   - Specifically confirms `[Security Sanitization] Hostile XHTML Sanitization` passes with 0 iframe tags.

2. **Remediated Worker Verification Suite**:
   ```bash
   node .agents/teamwork/m2_worker_1/verify_m2.js
   ```
   - **Passing Result**: 8 / 8 suites pass, prints `SUCCESS: All Milestone 2 tests PASSED flawlessly!`, exit code 0.
   - Specifically confirms SUITE D asserts 0 iframes, 0 frames, 0 framesets, 0 on* attributes, and form neutralization.

3. **Reviewer 2 Adversarial Stress Suite**:
   ```bash
   node .agents/teamwork/m2_reviewer_2/adversarial_test.js
   ```
   - **Passing Result**: 16 / 16 tests pass, exit code 0.

4. **Project Test Infrastructure**:
   ```bash
   node test/e2e.test.js --verify-infra
   ```
   - **Passing Result**: 4 / 4 Tier 0 tests pass, exit code 0.

5. **Empirical Invalidation Conditions**:
   - Any `<iframe>`, `<frame>`, or `<frameset>` tag remains in `preparedDoc` or `chapterDoc`.
   - Any attribute starting with `on*` exists in the sanitized DOM.
   - Any test in `challenge_toc_assets.js` fails.
