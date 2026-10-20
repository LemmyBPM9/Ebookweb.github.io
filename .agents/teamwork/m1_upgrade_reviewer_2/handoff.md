# Independent Review & Adversarial Challenge Report — Milestone 1 Upgrade

**Verdict**: **APPROVE**  
**Reviewer Role**: reviewer, critic (teamwork_preview_reviewer)  
**Instance**: `m1_upgrade_reviewer_2`  
**Date**: 2026-10-17  

---

## 1. Observation

### 1.1 Direct Source Code Inspection

1. **`js/storage/db.js`**:
   - Lines 8: `static DB_VERSION = 2;`
   - Lines 37–58: In `onupgradeneeded`, creates `books` object store with indexes `by_lastRead`, `by_dateAdded`, `by_title`, and `by_format`. Creates separate `book_files` object store with `keyPath: 'id'`. If upgrading from V1, lines 74–106 migrate `fileBlob` out of `books` into `book_files`, ensuring `books` holds lightweight metadata only.
   - Lines 170–192 (`getAllBooks()`): Opens a `readonly` transaction exclusively on `'books'`, retrieves metadata via `by_lastRead` index, reverses for descending order, and runs `books.map(b => { const { fileBlob, ...meta } = b; return meta; })`, guaranteeing zero binary payload is returned.
   - Lines 200–237 (`getBook(id)`): Opens a `readonly` transaction on `['books', 'book_files']`, retrieves both `books` and `book_files` records in parallel, and reassembles them with `fileBlob: (fileRecord && fileRecord.fileBlob) || metaRecord.fileBlob || null`.
   - Lines 322–382 (`saveBook(bookRecord)`): Deconstructs `bookRecord` into metadata (`books`) and `fileBlob` (`book_files`). If updating metadata without a new `fileBlob`, only `books` is opened and updated, preserving existing binaries in `book_files`.
   - Lines 390–422 (`deleteBook(id)`): Opens an atomic `readwrite` transaction across all 4 stores (`books`, `book_files`, `reading_progress`, `bookmarks`). Deletes `id` from `books`, `book_files`, and `reading_progress`, and executes an index cursor deletion on `bookmarks` via `by_bookId` range.

2. **`js/storage/storage-manager.js`**:
   - Lines 11–68: Implements the complete `PROJECT.md` contract suite:
     - `StorageManager.openDB()`
     - `StorageManager.getAllBooks()` & `getAllBooksMetadata()` (metadata only)
     - `StorageManager.getBook(id)` (reattaches fileBlob)
     - `StorageManager.getBookMetadata(id)`
     - `StorageManager.getBookFile(id)`
     - `StorageManager.getBooksByFormat(format)`
     - `StorageManager.saveBook(bookRecord)`
     - `StorageManager.deleteBook(id)` (atomic cascade delete)
     - `StorageManager.getProgress(bookId)` & `saveProgress(progressRecord)`
     - `StorageManager.getBookmarks(bookId)`, `addBookmark(bookmarkRecord)`, `deleteBookmark(id)`
     - `SettingsManager` accessors & quota utility `getQuotaInfo()`.

3. **`js/parser/asset-extractor.js`**:
   - Lines 80–92: Implements `DOMSanitizer.sanitizeHtml(htmlString)` using `DOMParser.parseFromString(htmlString, 'text/html')`, running `DOMSanitizer.sanitize(doc.body)`, and returning `doc.body.innerHTML`.
   - Lines 100–117: Handles `root` itself when `root.nodeType === 1`. If `root` is `<script>`, `<object>`, `<embed>`, `<applet>`, `<base>`, `<iframe>`, `<frame>`, `<frameset>`, or `<meta http-equiv="refresh">`, it immediately invokes `root.remove()`.
   - Lines 160–198: Appends `root` to `allElements` (`allElements.unshift(root)`). Iterates through all attributes on both `root` and every descendant, stripping inline `on*` event handlers and dangerous protocol URIs (`javascript:`, `vbscript:`, `data:text/html`, `data:application/xhtml+xml`) after stripping control characters and whitespace.

4. **`js/ui/library-view.js`**:
   - Lines 26–38: `detectFormatFromFilename(filename)` parses extensions `.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.txt`, `.md`, `.markdown`.
   - Lines 48–140: `validateFileFormat(file, format)`:
     - Rejects empty files: `if (!file || file.size === 0) throw new Error('File is empty (0 bytes).');`
     - Validates EPUB ZIP magic bytes `PK\x03\x04` (or `PK\x05` / `PK\x07`).
     - Validates PDF `%PDF-` signature within the first 1024 bytes.
     - Validates MOBI/AZW `BOOKMOBI` or `TEXtREAd` signature at offset 60..68 or within first 4KB.
     - Validates TXT and MD by rejecting files with binary null bytes (`0x00` > 2) and requiring strict fatal UTF-8 decoding (`new TextDecoder('utf-8', { fatal: true })`).
   - Lines 252–303: `setFilter(filter)` and `_applyFilter()` toggle `.is-active` and `aria-selected` on `.format-filter-btn`, filter visible cards via `card.style.display`, and render `.library-empty-filter-state` when zero books match.
   - Lines 480–530: `_createBookCard(book, progress)` stamps `data-format` on card and appends `.book-format-badge.format-${format}`.

5. **`index.html` & `css/main.css`**:
   - `index.html` lines 78–85: Renders `#format-filter-bar` with segmented filter buttons (`data-filter="all"`, `"epub"`, `"pdf"`, `"mobi"`, `"txt"`, `"md"`).
   - `index.html` line 89: Configures `#file-input` `accept` for all 6 document types.
   - `css/main.css` lines 621–740: High-contrast theme-specific badges for `.format-epub`, `.format-pdf`, `.format-mobi`, `.format-txt`, `.format-md`.

---

### 1.2 Empirical Test Execution Verbatim Results

1. **`node test/challenger_storage.test.js`**:
   ```
   ========================================================================
      EMPIRICAL CHALLENGER: STORAGE, CASCADE & THEME TRANSITION HARNESS    
   ========================================================================
   SUITE 1: SettingsManager Theme Switching & Smooth CSS Transitions ... 9/9 PASSED
   SUITE 2: Storage Concurrency Stress Tests (WebReaderDB) ... 4/4 PASSED
   SUITE 3: Atomic Cascade Delete Across Multiple Books & Bookmarks ... 3/3 PASSED
   SUITE 4: EventBus Adversarial Stress, Error Isolation & Once Semantics ... 5/5 PASSED
   ========================================================================
   HARNESS COMPLETE: 22/22 PASSED (0 FAILED)
   ALL EMPIRICAL CHALLENGER STRESS TESTS PASSED!
   ```

2. **`node test/challenger_m2_r2_adversarial.js`**:
   ```
   ====================================================================
      Milestone 2 Remediation 2 (M2 R2) Adversarial Challenger Suite   
   ====================================================================
     ✅ PASS: [Security Sanitization] Hostile XHTML Sanitization (iframe, frame, frameset, object, embed, script, onerror, javascript: URIs)
     ✅ PASS: [Form Neutralization] Form neutralization (action, method, target, formaction, and submit controls stripped)
     ✅ PASS: [Adversarial TOC Parser] TOC parser with unescaped ampersands (&), mixed entities, and deep nesting (10 levels + recursion guard)
     ✅ PASS: [Memory Leak Audit] Blob URL revocation across 65 assets on cleanup() (100% revocation & idempotency)
   -------------------------------------------
   CHALLENGE PASSED: All adversarial scenarios verified.
   ```

3. **`node test/e2e.test.js` (Tiers 0–4)**:
   ```
   ====================================================================
                      E2E TEST EXECUTION SUMMARY                       
   ====================================================================
   Total Tests Executed: 21
   Passed Tests:         21
   Failed Tests:         0
   Skipped Tests:        0

   Tier Breakdown:
     Tier 0: 4 / 4 passed (0 failed)
     Tier 1: 8 / 8 passed (0 failed)
     Tier 2: 5 / 5 passed (0 failed)
     Tier 3: 3 / 3 passed (0 failed)
     Tier 4: 1 / 1 passed (0 failed)

   All executed tests completed successfully!
   ```

4. **`node test/e2e_upgrade.test.js --tier=0`**:
   ```
   ====================================================================
            MULTI-FORMAT UPGRADE TEST EXECUTION SUMMARY                
   ====================================================================
   Total Tests Executed: 4
   Passed Tests:         4
   Failed Tests:         0
   Skipped Tests:        16

   Tier Breakdown:
     Tier 0: 4 / 4 passed (0 failed)

   All executed tests completed successfully!
   ```

---

## 2. Logic Chain

1. **Evaluation Criterion 1: Correctness (Storage V2 Separation & Cascade Delete)**:
   - *Observation*: `getAllBooks()` in `js/storage/db.js:170-192` opens transaction exclusively on `'books'` store. Binary blobs are kept in `'book_files'`, never `'books'`. The mapping explicitly strips `fileBlob`.
   - *Observation*: `getBook(id)` in `js/storage/db.js:200-237` queries `'books'` and `'book_files'` in a single `readonly` transaction and returns `{ ...meta, fileBlob: fileRecord.fileBlob }`.
   - *Observation*: `deleteBook(id)` in `js/storage/db.js:390-422` uses a single `readwrite` transaction across `['books', 'book_files', 'reading_progress', 'bookmarks']`, deleting the book from all 4 stores.
   - *Inference*: The V2 storage separation guarantees zero binary bytes loaded during library browsing, restores full binary payloads on demand for reading, and leaves zero orphan binary blobs, bookmarks, or progress records upon deletion. Concurrency tests (100 rapid saves, 120 mixed operations, 10 concurrent cascade deletes) confirmed zero collisions and zero deadlocks.

2. **Evaluation Criterion 2: Robustness (Validation & Sanitization)**:
   - *Observation*: `validateFileFormat` in `js/ui/library-view.js:48-140` guards against empty files (`file.size === 0`), enforces magic byte matching for EPUB (`PK\x03\x04`), PDF (`%PDF-`), MOBI (`BOOKMOBI`/`TEXtREAd`), and strictly rejects binary null-byte corruption or non-UTF-8 encodings in TXT/MD files.
   - *Observation*: `DOMSanitizer` in `js/parser/asset-extractor.js:80-198` checks root nodes directly (`root.nodeType === 1`) and purges `<script>`, `<iframe>`, etc., as well as adding `root` to `allElements` for attribute sanitization (`on*`, `javascript:`, control characters).
   - *Inference*: Both boundary inputs (empty/truncated files) and malicious inputs (embedded scripts, hostile XHTML, protocol injection) are neutralized without uncaught exceptions or XSS execution.

3. **Evaluation Criterion 3: Interface Conformance (`StorageManager` vs. `PROJECT.md`)**:
   - *Observation*: Every method in `PROJECT.md` lines 101–114 is present on `StorageManager` in `js/storage/storage-manager.js` and adheres to expected parameters and return types.
   - *Inference*: Interface conformance is 100% compliant.

4. **Integrity Audit**:
   - *Observation*: Grep searches across `js/` for test-specific constants, fixture titles ("Minimalist", "Arthur"), or mock return values returned zero hits.
   - *Observation*: No facade implementations or dummy functions were found; all logic uses genuine Web APIs (`indexedDB`, `DOMParser`, `TextDecoder`, `Uint8Array`).
   - *Observation*: Independent test execution confirmed all claims made in worker handoff.
   - *Inference*: No integrity violations exist.

---

## 3. Adversarial Challenges & Findings

### Challenge Summary
- **Overall Risk Assessment**: LOW

### Challenge 1: Concurrent Headless Server Port Contention
- **Assumption Challenged**: Test runners assume port 3000 is always exclusively available.
- **Attack Scenario**: If two automated test runs execute concurrently (e.g., worker running `e2e_upgrade.test.js` while reviewer runs `e2e.test.js`), both attempt to bind port 3000. If one process terminates its test and tears down its HTTP server while the other is in the middle of a test (such as during page reload in Tier 4), the second process encounters `net::ERR_CONNECTION_REFUSED`.
- **Blast Radius**: Flaky test results during parallel agent runs. Zero impact on production application code.
- **Mitigation**: Specify distinct ports (e.g., `--port=53100`) or ensure server binds ephemeral ports (`port: 0`). Verified that running `test/e2e.test.js` with an isolated port passes 21/21 (100%).

### Challenge 2: Test Selector Robustness for Format Filters
- **Assumption Challenged**: Test selector `waitForAnySelector(page, '[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf, button:has-text("PDF")')` in `e2e_upgrade.test.js` line 450 expects `[data-filter="pdf"]` to match.
- **Attack Scenario**: If Puppeteer passes the un-split comma-separated selector string to native `document.querySelectorAll()`, the non-standard pseudo-selector `:has-text("PDF")` causes a `DOMException: SyntaxError` in Chromium, aborting evaluation before standard attributes are inspected.
- **Blast Radius**: Minor friction in future upgrade test tiers.
- **Mitigation / Suggestion for Milestone 2+**: In `index.html`, add `data-format-filter` as an alias attribute on `#format-filter-bar button` (e.g., `data-filter="pdf" data-format-filter="pdf"`), which provides multi-attribute resilience across any test selector variant.

---

## 4. Caveats

- **Format Parsing Scope**: In accordance with the Milestone 1 plan, M1 focuses on ingestion, format validation, format badges, filter tabs, and Storage V2. Full reading engines for PDF, MOBI, and Markdown are scheduled for subsequent milestones (M2–M5). Attempting to open a non-EPUB file in reader view will be handled once those specific parser modules are delivered in M3/M4.
- **Pronged Test Suites**: Only Tier 0 of `e2e_upgrade.test.js` was required for Milestone 1; higher tiers test features slated for M2 (10 themes), M3 (PDF visual/reflowable), and M4 (MOBI/MD parsers).

---

## 5. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all requirements:
1. `getAllBooks()` strictly returns lightweight metadata without `fileBlob` payloads.
2. `getBook(id)` reattaches `fileBlob` on demand via joined IDB transaction.
3. Cascade delete atomically removes records across `books`, `book_files`, `reading_progress`, and `bookmarks` leaving zero orphan binary blobs.
4. `validateFileFormat` handles edge cases (empty files, invalid magic bytes, non-UTF-8 binary data).
5. `DOMSanitizer` prevents root element and attribute injection attacks.
6. `StorageManager` fully satisfies `PROJECT.md` contracts.
7. Verification tests pass 100%:
   - `test/challenger_storage.test.js`: 22/22 PASSED
   - `test/challenger_m2_r2_adversarial.js`: 4/4 PASSED
   - `test/e2e.test.js`: 21/21 PASSED
   - `test/e2e_upgrade.test.js --tier=0`: 4/4 PASSED
8. Zero integrity violations detected.

---

## 6. Verification Method

To independently verify this review:
1. Run Storage V2 concurrency & cascade test:
   ```bash
   node test/challenger_storage.test.js
   ```
2. Run adversarial sanitization test:
   ```bash
   node test/challenger_m2_r2_adversarial.js
   ```
3. Run baseline E2E test suite:
   ```bash
   node test/e2e.test.js --port=53100
   ```
4. Run upgrade infrastructure test:
   ```bash
   node test/e2e_upgrade.test.js --tier=0
   ```
