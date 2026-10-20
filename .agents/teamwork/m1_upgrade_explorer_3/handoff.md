# Handoff Report: Milestone 1 Synthesis & Worker Implementation Blueprint

**Agent**: `teamwork_preview_explorer` (`m1_upgrade_explorer_3`)  
**Parent Task ID**: `b4abc7fb-a287-4f27-bbe9-a16e40f60012`  
**Working Directory**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_3/`  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **Baseline Test Suite Execution**:
   - Command: `node test/e2e.test.js`
     - Result: `All executed tests completed successfully!` (21/21 passed across Tiers 0-4).
   - Command: `node test/challenger_storage.test.js`
     - Result: `HARNESS COMPLETE: 22/22 PASSED (0 FAILED)`. Verified 100 concurrent saves, 120 mixed ops, 50-writer contention, binary EPUB blobs, atomic cascade delete across multiple books, EventBus stress isolation.
   - Command: `node test/challenger_m2_r2_adversarial.js`
     - Result: `CHALLENGE PASSED: All adversarial scenarios verified.` (4/4 passed: hostile XHTML sanitization, form neutralization, 10-level deep TOC with unescaped ampersands, 65-asset Blob URL cleanup).

2. **DOMSanitizer Implementation (`js/parser/asset-extractor.js:79-153`)**:
   - `DOMSanitizer` is exported at line 79: `export class DOMSanitizer`.
   - In `DOMSanitizer.sanitize(root)`:
     Line 117: `const allElements = root.querySelectorAll('*');`
     Observation: If `root` is an `Element` (e.g. `<div onclick="evil()">` or `<a href="javascript:alert(1)">`), `querySelectorAll('*')` only finds descendants; attributes on `root` itself are never examined. Furthermore, if `root` itself is a `<script>` or `<iframe src="...">` element, it is not stripped.
   - Observation: Parsers parsing Markdown (`.md`) or plain text (`.txt`) produce HTML strings. There is currently no `DOMSanitizer.sanitizeHtml(htmlString)` helper.

3. **Storage Schema & Segregation (`js/storage/db.js:6-200`)**:
   - Line 8: `static DB_VERSION = 1;`
   - Line 36-41: Only three stores exist: `books`, `reading_progress`, `bookmarks`.
   - Line 149-151: `saveBook(bookRecord)` writes `bookRecord` (including `fileBlob`) directly into the `books` store.
   - Line 91-106: `getAllBooks()` reads from `books` store using index `by_lastRead`, returning full records including `fileBlob`, violating Requirement R5 (metadata vs. binary separation).
   - Line 175-199: `deleteBook(id)` opens transaction on `['books', 'reading_progress', 'bookmarks']`. Needs to include `book_files`.

4. **Multi-Format UI Touchpoints**:
   - `index.html:77`: `<input type="file" id="file-input" accept=".epub,application/epub+zip" multiple class="sr-only" aria-label="Import EPUB file">`
   - `index.html:108-124`: `#library-grid` sample card has no format badge.
   - `css/main.css:500-587`: Has styles for `.book-progress-badge` and `.book-delete-btn`, but no format badge classes (`.book-format-badge`, `.format-badge-epub`, `.format-badge-pdf`, etc.) or filter bar classes (`.format-filter-bar`, `.format-filter-btn`).
   - `js/ui/library-view.js:106-167`: `importFiles()` only delegates to `EpubParser.parse(file)`. Attempting to import `.pdf` or `.txt` fails in `EpubParser` with corrupted EPUB toast.

---

## 2. Logic Chain

1. From Observation 1, the baseline test suites test exact IndexedDB store operations (`books`, `reading_progress`, `bookmarks`), cascade deletion, and `DOMSanitizer`. Upgrading to Storage V2 must not break any existing tests or change method signatures of `StorageManager`.
2. From Observation 3, to fulfill Requirement R5 and Feature 43 without breaking backwards compatibility:
   - `DB_VERSION` must be bumped from 1 to 2.
   - In `onupgradeneeded`, `book_files` store is created with keyPath `id`. If upgrading from V1 (`oldVersion < 2`), a cursor migrates existing `fileBlob` from `books` into `book_files`, removes `fileBlob` from `books`, and defaults missing `format` to `'epub'`.
   - In `getAllBooks()`, only metadata is queried from `books`, ensuring zero binary bytes are loaded during library shelf listing.
   - In `getBook(id)`, a single transaction reads `books` and `book_files`, reconstructing the complete `BookRecord` on demand.
   - In `saveBook(bookRecord)`, `metaRecord` (omitting `fileBlob`) goes to `books`, while `fileBlob` (if provided) goes to `book_files`. If `fileBlob` is omitted during a metadata-only update (as in `challenger_storage.test.js:338-345`), the existing binary in `book_files` is preserved.
   - In `deleteBook(id)`, the transaction includes `book_files` alongside `books`, `reading_progress`, and `bookmarks`, preventing orphan binary files.
3. From Observation 2, `DOMSanitizer` must be hardened so that when an `Element` is passed directly as `root`, `root` and its attributes are checked alongside its descendants. Adding `DOMSanitizer.sanitizeHtml(htmlString)` provides a streamlined utility for upcoming text and markdown parsers.
4. From Observation 4, multi-format import can be enabled in Milestone 1 by updating `accept` on `#file-input`, updating drop zone copy, adding `#format-filter-bar` in `index.html`, adding format badge styles in `css/main.css`, and updating `js/ui/library-view.js` to accept `.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, `.md`, storing metadata and raw files in Storage V2, and enabling instant filter tabs.

---

## 3. Caveats

- **Full Format Parsers for Non-EPUB**: Detailed internal parsing and rendering of `.pdf` (Visual & Reflowable), `.mobi` (PalmDOC decompression), `.txt`, and `.md` are designated for Milestones 3 and 4 in `PROJECT.md`. In Milestone 1, non-EPUB files are ingested, stored in Storage V2, badged, filtered, and managed on the bookshelf.
- **Worker Execution Order**: The Worker must implement Step 1 (`DOMSanitizer`) and Step 2 (`Storage V2`) before updating UI files to allow incremental regression verification.

---

## 4. Conclusion

The blueprint for Milestone 1 is completely synthesized in `analysis.md`. The Worker has a deterministic, step-by-step roadmap with exact code changes across all 6 target files (`index.html`, `css/main.css`, `js/storage/db.js`, `js/storage/storage-manager.js`, `js/ui/library-view.js`, `js/parser/asset-extractor.js`), ensuring zero regressions across all 3 existing test suites while establishing the multi-format and Storage V2 foundation.

---

## 5. Verification Method

To verify Milestone 1 implementation:

1. **Security & Sanitizer Verification**:
   ```bash
   node test/challenger_m2_r2_adversarial.js
   ```
   *Expected*: All 4 suites pass.

2. **Storage V2 & Concurrency Verification**:
   ```bash
   node test/challenger_storage.test.js
   ```
   *Expected*: All 22 tests pass.

3. **Full End-to-End Test Suite**:
   ```bash
   node test/e2e.test.js
   ```
   *Expected*: All 21 tests pass across Tiers 0-4.

4. **DOMSanitizer Root Element Test**:
   ```javascript
   const el = document.createElement('a');
   el.setAttribute('href', 'javascript:alert(1)');
   el.setAttribute('onclick', 'alert(1)');
   DOMSanitizer.sanitize(el);
   // Assert: !el.hasAttribute('href') && !el.hasAttribute('onclick')
   ```

5. **Storage V2 Binary Segregation Assertion**:
   ```javascript
   const books = await StorageManager.getAllBooks();
   // Assert for all b in books: b.fileBlob === undefined
   ```
