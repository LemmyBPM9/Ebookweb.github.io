# Explorer 1 Remediation Blueprint: PathResolver `findZipEntry` Asymmetry & HTML5 Prefix Stripping

**Milestone**: Milestone 2: EPUB 2/3 Parser, Asset Extractor & Security Sandbox (Iteration 2: Remediation)  
**Agent**: Explorer 1 (`m2_r2_explorer_1`)  
**Timestamp**: 2026-10-17T04:06:30Z  
**Target Artifacts**:
- `proposed_path-resolver.js`: Drop-in candidate for `js/parser/path-resolver.js`
- `proposed_path-resolver.patch`: Unified diff for `js/parser/path-resolver.js`
- `proposed_opf-parser.patch`: Unified diff for `js/parser/opf-parser.js` (Challenger Finding 2)
- `test_proposed_fix.js`: Node test verifying all 6 edge-case permutations

---

## 1. Observation

Direct observations and audit findings from examining `js/parser/path-resolver.js`, `js/parser/opf-parser.js`, `js/parser/asset-extractor.js`, and the Challenger 1 report (`.agents/teamwork/m2_challenger_1/handoff.md`):

### A. Gate Failure Reproduction in `PathResolver.findZipEntry` (`js/parser/path-resolver.js:230-243`)
In `js/parser/path-resolver.js`, lines 230–243:
```javascript
  // 5. Case-insensitive lookup
  const lowerNorm = norm.toLowerCase();
  const lowerDecoded = decoded.toLowerCase();
  const fileKeys = Object.keys(zip.files || {});

  for (let i = 0; i < fileKeys.length; i++) {
    const key = fileKeys[i];
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerNorm || lowerKey === lowerDecoded) {
      return zip.files[key];
    }
  }

  return null;
```

When an EPUB contains a ZIP catalog entry named with literal percent encoding (e.g. `OEBPS/Images/Cover Photo%20(1).JPG`):
1. An HTML chapter references the asset via standard URI href: `../Images/Cover%20Photo%20(1).JPG`.
2. `PathResolver.resolvePath('OEBPS/text/ch01.xhtml', '../Images/Cover%20Photo%20(1).JPG')` produces the URL-decoded path: `OEBPS/Images/Cover Photo (1).JPG`.
3. `AssetExtractor.extractAsset('OEBPS/Images/Cover Photo (1).JPG')` calls `findZipEntry(this.zip, 'OEBPS/Images/Cover Photo (1).JPG')`.
4. In `findZipEntry`:
   - Step 1 (`zip.file(targetPath)`): Direct lookup fails (`zip.files['OEBPS/Images/Cover Photo (1).JPG']` is `undefined`).
   - Step 2 (`zip.file(norm)`): `norm = 'OEBPS/Images/Cover Photo (1).JPG'`. Lookup fails.
   - Step 3 (`zip.file(decoded)`): `decoded = 'OEBPS/Images/Cover Photo (1).JPG'`. Lookup fails.
   - Step 4 (`zip.file(encoded)`): `encodeURI('OEBPS/Images/Cover Photo (1).JPG')` converts ALL spaces to `%20` (`'OEBPS/Images/Cover%20Photo%20(1).JPG'`), which does NOT match `Cover Photo%20(1).JPG` (literal space between `Cover` and `Photo`).
   - Step 5 (`Case-insensitive lookup`):
     - `lowerNorm` = `'oebps/images/cover photo (1).jpg'`
     - `lowerDecoded` = `'oebps/images/cover photo (1).jpg'`
     - `key` = `'OEBPS/Images/Cover Photo%20(1).JPG'`
     - `lowerKey` = `'oebps/images/cover photo%20(1).jpg'`
     - Comparison: `'oebps/images/cover photo%20(1).jpg' === 'oebps/images/cover photo (1).jpg'` is `false`.
5. `findZipEntry` returns `null`. `AssetExtractor` logs `[AssetExtractor] Asset not found in ZIP: OEBPS/Images/Cover Photo (1).JPG` and the asset fails to render.

### B. Audit of System-Wide `findZipEntry` Interaction Call Sites
A ripgrep search revealed 8 active call sites interacting with `findZipEntry`:
1. `js/parser/path-resolver.js:204`: Function definition.
2. `js/parser/opf-parser.js:120`: `PathResolver.findZipEntry(zip, 'META-INF/container.xml')`
3. `js/parser/opf-parser.js:140, 150`: `PathResolver.findZipEntry(zip, norm)` (validating rootfile candidate full-paths)
4. `js/parser/epub-parser.js:89`: `PathResolver.findZipEntry(zip, opfPath)`
5. `js/parser/asset-extractor.js:217`: `this.findZipEntry(cleanPath)` in `extractAsset`
6. `js/parser/asset-extractor.js:327`: `this.findZipEntry(cleanPath)` in `processStylesheet`
7. `js/parser/asset-extractor.js:388`: `this.findZipEntry(resolvedImportPath)` in CSS `@import` rewriting
8. `js/parser/toc-parser.js:130, 169, 171, 177, 544`: Nav Document and NCX file resolution

In all call sites, the caller supplies a path that has passed through `normalizePath` or `resolvePath`. Because `resolvePath` decodes percent sequences (RFC 3986 requirement), any asymmetry where the ZIP archive retains encoded characters in its internal key catalog causes `findZipEntry` to fail unless archive keys are decoded during comparison.

### C. Audit of Challenger Finding 2 (`js/parser/opf-parser.js:55, 92`)
In `js/parser/opf-parser.js`, lines 55 and 92:
```javascript
const nodeLocal = (node.localName || node.nodeName.split(':').pop() || '').toLowerCase();
```
When an OPF file omits `xmlns:dc` while using `<dc:title>`, XML parsing throws a namespace syntax error, triggering the `text/html` DOMParser fallback. In HTML5 DOM mode, Chrome constructs element nodes where `node.localName === 'dc:title'` and `node.nodeName === 'DC:TITLE'`. Because `node.localName` is truthy, the expression short-circuits before splitting the colon. `nodeLocal` becomes `'dc:title'`, failing `'dc:title' === 'title'`, and metadata falls back to `"Untitled Book"`.

---

## 2. Logic Chain

1. **Root Cause of Key Mismatch**:
   - `resolvePath` decodes URI components (`safeDecodeURIComponent(rawPath)`), producing canonical unencoded filesystem paths (e.g., `'Cover Photo (1).JPG'`).
   - Standard zip packagers and legacy EPUB tools sometimes store entry names verbatim with URL-encoded byte sequences (e.g. `'Cover Photo%20(1).JPG'` or `'Cover%20Photo%20(1).JPG'`).
   - JSZip's internal index (`zip.files`) maps raw string keys exactly as written in the central directory record.
   - When querying `zip.file(targetPath)`, JSZip uses strict hash-map key equivalence.
   - Therefore, `findZipEntry` must bridge the representation gap in its fallback stages.

2. **Why Steps 1–4 are Insufficient**:
   - Step 1 (`zip.file(targetPath)`): requires identical string representation.
   - Step 2 (`zip.file(norm)`): only handles forward/backward slash and dot segment differences.
   - Step 3 (`zip.file(decoded)`): only helps if the query was encoded and the archive key was unencoded (the inverse of our failure case).
   - Step 4 (`zip.file(encoded)`): uses `encodeURI()`, which converts all spaces to `%20` and leaves sub-delims (`()`) unencoded. If the archive key has mixed encoding (e.g., one space literal, one `%20`), `encodeURI()` will not match. Furthermore, JSZip direct lookup is case-sensitive, so case variations fail.

3. **Remediation Design for Step 5**:
   - Archive keys must be decoded via `safeDecodeURIComponent(key)` and converted to lowercase:
     ```javascript
     const lowerDecodedKey = safeDecodeURIComponent(key).toLowerCase();
     ```
   - In Step 5, we evaluate four cross-permutations:
     ```javascript
     if (
       lowerKey === lowerNorm ||
       lowerKey === lowerDecoded ||
       lowerDecodedKey === lowerNorm ||
       lowerDecodedKey === lowerDecoded
     ) {
       return zip.files[key];
     }
     ```
   - This guarantees symmetric matching across all combinations:
     - Target Decoded + Key Decoded (`lowerKey === lowerNorm`)
     - Target Encoded + Key Decoded (`lowerKey === lowerDecoded`)
     - Target Decoded + Key Encoded (`lowerDecodedKey === lowerNorm`)
     - Target Encoded + Key Encoded (`lowerDecodedKey === lowerDecoded`)
   - Returning `zip.files[key]` ensures that JSZip retrieves the exact object using the original, unmutated archive key.

4. **Additional Robustness for Hostile/Malformed ZIP Archive Keys**:
   - Certain non-compliant zip creators store keys with Windows backslashes (`\`) or leading slashes (`/`).
   - If a key fails the direct match and contains `\` or starts with `/` or `./`, we normalize the key (`normalizePath(key)`) and test:
     ```javascript
     if (key.includes('\\') || key.startsWith('/') || key.startsWith('./')) {
       const normKey = normalizePath(key);
       const lowerNormKey = normKey.toLowerCase();
       const lowerDecodedNormKey = safeDecodeURIComponent(normKey).toLowerCase();
       if (
         lowerNormKey === lowerNorm ||
         lowerNormKey === lowerDecoded ||
         lowerDecodedNormKey === lowerNorm ||
         lowerDecodedNormKey === lowerDecoded
       ) {
         return zip.files[key];
       }
     }
     ```
   - This handles edge-case archive keys without degrading performance for standard compliant archives.

5. **Validation of Invariants**:
   - Zip-Slip defense: `normalizePath` continues to enforce boundary checks at root (`stack.length > 0`).
   - Safe decoding: `safeDecodeURIComponent` wraps `decodeURIComponent` in `try...catch` so invalid escape sequences (e.g., `%80`) do not throw.
   - Performance: Steps 1–4 provide $O(1)$ fast paths for normal files; Step 5 runs a linear scan only on missing or misaligned keys.

---

## 3. Caveats

1. **Duplicate Archive Keys with Different Encodings**: If a corrupted ZIP archive contains two separate files whose names differ only by percent encoding (e.g. `foo.jpg` and `foo%20.jpg`), `findZipEntry` returns the first match encountered in `Object.keys(zip.files)`. This is standard, deterministic behavior for ambiguous archives.
2. **Read-Only Explorer Constraint**: In accordance with Explorer role instructions, no direct changes were committed to `js/parser/path-resolver.js` or `js/parser/opf-parser.js`. All deliverables are provided as proposed drop-in files and unified `.patch` files in this agent folder.

---

## 4. Conclusion & Actionable Blueprint

### Action Plan for Remediation Worker (`m2_worker_1`)

#### Patch 1: Apply to `js/parser/path-resolver.js`
Replace lines 227–242 in `findZipEntry` with:
```javascript
  // 5. Case-insensitive and percent-decoded lookup across archive keys
  const lowerNorm = norm.toLowerCase();
  const lowerDecoded = decoded.toLowerCase();
  const fileKeys = Object.keys(zip.files || {});

  for (let i = 0; i < fileKeys.length; i++) {
    const key = fileKeys[i];
    const lowerKey = key.toLowerCase();
    const lowerDecodedKey = safeDecodeURIComponent(key).toLowerCase();

    if (
      lowerKey === lowerNorm ||
      lowerKey === lowerDecoded ||
      lowerDecodedKey === lowerNorm ||
      lowerDecodedKey === lowerDecoded
    ) {
      return zip.files[key];
    }

    // Also support keys with Windows backslashes or leading slashes
    if (key.includes('\\') || key.startsWith('/') || key.startsWith('./')) {
      const normKey = normalizePath(key);
      const lowerNormKey = normKey.toLowerCase();
      const lowerDecodedNormKey = safeDecodeURIComponent(normKey).toLowerCase();
      if (
        lowerNormKey === lowerNorm ||
        lowerNormKey === lowerDecoded ||
        lowerDecodedNormKey === lowerNorm ||
        lowerDecodedNormKey === lowerDecoded
      ) {
        return zip.files[key];
      }
    }
  }

  return null;
```
*(Reference: `.agents/teamwork/m2_r2_explorer_1/proposed_path-resolver.js` or `proposed_path-resolver.patch`)*

#### Patch 2: Apply to `js/parser/opf-parser.js`
In `getMetaText` (line 55) and `getAllMetaText` (line 92), replace:
```javascript
// Before:
const nodeLocal = (node.localName || node.nodeName.split(':').pop() || '').toLowerCase();

// After:
const rawName = node.localName || node.nodeName || '';
const nodeLocal = (rawName.split(':').pop() || '').toLowerCase();
```
*(Reference: `.agents/teamwork/m2_r2_explorer_1/proposed_opf-parser.patch`)*

---

## 5. Verification Method

To independently verify this remediation:

1. **Execute Explorer 1 Independent Verification Script**:
   ```bash
   node .agents/teamwork/m2_r2_explorer_1/test_proposed_fix.js
   ```
   *Expected Output*:
   - PASS: Decoded path resolves to literal mixed percent ZIP entry
   - PASS: All 6 case & encoding variations matched successfully
   - PASS: Fully percent-encoded ZIP entry found via decoded path
   - PASS: Normal space entry found via decoded path
   - PASS: Windows backslash entry found and normalized
   - PASS: Leading slash entry found and normalized
   - PASS: HTML5 fallback prefix stripping correctly isolates "title"
   - Exit code: 0

2. **Execute Challenger Adversarial Stress Harness**:
   ```bash
   node .agents/teamwork/m2_challenger_1/challenge_parser.js
   ```
   *Expected Output*:
   - 5 / 5 suites pass
   - Zero findings recorded after applying Patch 1 and Patch 2. Exit code: 0.

3. **Execute Worker Verification Suite**:
   ```bash
   node .agents/teamwork/m2_worker_1/verify_m2.js
   ```
   *Expected Output*: 8 / 8 suites pass. Exit code: 0.

4. **Execute Project Test Infrastructure**:
   ```bash
   node test/e2e.test.js --verify-infra
   ```
   *Expected Output*: 4 / 4 Tier 0 tests pass. Exit code: 0.

5. **Invalidation Conditions**:
   - `findZipEntry` returns `null` when querying `'OEBPS/Images/Cover Photo%20(1).JPG'` via decoded path `'OEBPS/Images/Cover Photo (1).JPG'`.
   - `findZipEntry` returns `null` when querying case-differing encoded paths.
   - `normalizePath` permits `..` or root traversal escapes.
