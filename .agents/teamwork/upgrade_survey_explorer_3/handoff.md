# Handoff Report — upgrade_survey_explorer_3

**Instance**: `upgrade_survey_explorer_3`  
**Milestone**: `upgrade_survey`  
**Type**: Hard (Task Complete)  
**Deliverable**: Comprehensive Technical Report on R3 (MOBI/AZW, TXT, MD) & R5 (Ultra-Low Memory Footprint & CPU Optimization) at `.agents/teamwork/upgrade_survey_explorer_3/survey_report.md`

---

## 1. Observation

1. **Storage Manager Binary Loading (`js/storage/db.js:91-107`)**:
   ```javascript
   static async getAllBooks() {
     const db = await this.openDB();
     return new Promise((resolve, reject) => {
       const tx = db.transaction('books', 'readonly');
       const store = tx.objectStore('books');
       const index = store.index('by_lastRead');
       const request = index.getAll();
       request.onsuccess = () => {
         const books = request.result || [];
         books.reverse();
         resolve(books);
       };
       request.onerror = () => reject(request.error);
     });
   }
   ```
   Every book record in `books` store contains `fileBlob: new Blob(...)` (`js/ui/library-view.js:143`). Calling `getAllBooks()` deserializes the complete binary payload for all books in the library into RAM, directly violating the R5 requirement ("Listing books in the Library View must NEVER load full file binaries into memory").

2. **ReaderEngine Incomplete Destruction (`js/reader/reader-engine.js:560-566`)**:
   ```javascript
   destroy() {
     if (this.paginatedView) this.paginatedView.destroy();
     if (this.scrollView) this.scrollView.destroy();
     if (this.parsedEpub && typeof this.parsedEpub.cleanup === 'function') {
       this.parsedEpub.cleanup();
     }
   }
   ```
   `ReaderEngine.destroy()` fails to:
   - Reset or remove `this.iframe` (`src = 'about:blank'`, DOM detachment).
   - Clear canvas elements or reset `canvas.width = 0; canvas.height = 0;`.
   - Disconnect active `ResizeObserver` or `IntersectionObserver` instances.
   - Cancel animation frames or pending timers (`this._saveProgressTimer`).
   - Null out references to `this.parsedEpub` or `this.activeBookId`.

3. **Missing Engine Destruction on Book Close (`js/app.js:229-245`)**:
   ```javascript
   async closeBookToLibrary() {
     await this._persistCurrentProgress();
     SettingsManager.setLastBookId(null);
     this.tocDrawer?.close();
     this.settingsPanel?.close();
     if (this.activeParsedEpub) {
       this.activeParsedEpub.cleanup();
       this.activeParsedEpub = null;
     }
     this.activeBookId = null;
     await this.libraryView.renderBooks();
     this.showLibrary();
   }
   ```
   When navigating back to the library (`ui:back-to-library`), `this.readerEngine.destroy()` is NEVER called. The reading iframe, its DOM document, and its listeners remain resident in the page.

4. **Existing Parser Interface Contract (`PROJECT.md:88-99`)**:
   `EpubParser.parse()` returns `{ metadata, coverBlobUrl, spine, toc, getChapterDocument, assetMap, cleanup }`. `ReaderEngine.loadBook` consumes only `spine`, `toc`, `getChapterDocument`, and `cleanup`.

5. **MOBI / AZW PalmDOC Decompression & Trailing Entries**:
   PalmDOC compression is a specialized LZ77 byte stream with 5 command ranges (`0x00`, `0x01-0x08` literal copy, `0x09-0x7F` single ASCII, `0x80-0xBF` distance-length pair, `0xC0-0xFF` space + char). MOBI headers contain an `extraFlags` field (`offset 0xF2`) dictating variable-length trailing entries (multibyte character overlap and indexing trailers) at the end of each compressed text record that MUST be stripped backwards via base-128 varint decoding before decompression.

---

## 2. Logic Chain

1. **Storage Separation (Obs 1 $\to$ Conclusion 1)**:
   Because IndexedDB `getAll()` deserializes all properties of stored records, storing `fileBlob` in the `books` store inherently loads all binary data into memory. Therefore, splitting storage into two stores—`books` (lightweight metadata) and `book_files` (binary payloads)—in `WebReaderDB` Version 2 allows `getAllBooks()` to return metadata only (< 500KB total for 50 books), while `getBook(id)` loads binary on demand when opening a book.
2. **Deterministic Cleanup (Obs 2 & 3 $\to$ Conclusion 2)**:
   Because `closeBookToLibrary()` does not call `ReaderEngine.destroy()`, and `destroy()` does not tear down the iframe, canvas, or observers, consecutive book opening/closing causes memory and detached DOM leaks. Introducing a complete teardown sequence (100% Blob URL revocation, iframe `about:blank` detachment, canvas `width=0` clearing, observer disconnection) and calling `this.readerEngine.destroy()` inside `closeBookToLibrary()` ensures zero memory leakage across repeated open/close cycles.
3. **Polymorphic Format Engine (Obs 4 & 5 $\to$ Conclusion 3)**:
   Because `ReaderEngine` interacts strictly with `spine`, `toc`, `getChapterDocument(fullPath) -> Document`, and `cleanup()`, implementing `MobiParser`, `TxtParser`, and `MarkdownParser` to conform to this exact contract allows MOBI, TXT, and MD files to use all existing reading features (multi-column pagination, vertical scroll, 10 eye-comfort themes, typography sliders, and bookmarks) with zero changes to `ReaderEngine`'s core rendering pipeline.

---

## 3. Caveats

- **HUFF/CDIC MOBI**: Amazon KF8 files compressed with HUFF/CDIC (compression type `17480` / `0x4448`) require Huffman codebook dictionaries rather than PalmDOC LZ77. Standard MOBI and AZW ebooks using PalmDOC (compression type 2) or uncompressed (type 1) are fully supported.
- **PDF Visual Rendering**: PDF visual canvas rendering and text extraction details are being surveyed in parallel by `upgrade_survey_explorer_2`. Our findings on canvas recycling (`width=0`, windowed 3-canvas pool) directly inform their visual rendering design.

---

## 4. Conclusion

1. **R3 (MOBI/AZW, TXT, MD)**:
   - MOBI/AZW: Implement PDB header unpack, Record 0 header parsing, backward trailing data stripping (`getSizeOfTrailingDataEntries`), PalmDOC LZ77 decompression, EXTH metadata/cover extraction, `<mbp:pagebreak>` chapter splitting, and synthetic TOC generation.
   - Plain Text (.txt): Implement BOM/encoding detection, `\n{2,}` paragraph parsing, regex-based chapter heading detection (`Chapter \d+`, `Book \d+`, `# `), HTML entity escaping, and synthetic spine chunking.
   - Markdown (.md): Implement a client-side zero-dependency streaming lexer/parser supporting GFM syntax (headings `#`..`######`, emphasis, blockquotes, code blocks, lists, links, tables), slugified anchor generation, and nested TOC tree extraction.
   - Master Coordinator: `BookParser.parse(fileOrBuffer, filename)` routes by magic bytes/extension to return a unified `ParsedBook` object.
2. **R5 (Ultra-Low Memory & CPU Optimization)**:
   - Storage Separation: Upgrade `WebReaderDB` to Version 2 with `books` (metadata only) and `book_files` (binary payloads). `getAllBooks()` returns metadata only; `getBook(id)` loads binary on demand.
   - Off-screen Recycling: Apply CSS `content-visibility: auto; contain-intrinsic-size: 800px;` in scroll mode. Implement a 3-page windowed canvas pool in visual mode with `canvas.width = 0; canvas.height = 0;` cleanup.
   - Deterministic Destruction: Expand `ReaderEngine.destroy()` and hook it into `app.js closeBookToLibrary()` to guarantee 100% Blob URL revocation, iframe detachment, canvas bitmap clearing, and observer disconnection.
   - Zero Idle CPU: Enforce `{ passive: true }` on all scroll/touch listeners and debounce reading progress persistence to 500ms.

---

## 5. Verification Method

1. **Documentation Inspection**:
   Inspect `.agents/teamwork/upgrade_survey_explorer_3/survey_report.md` for exhaustive feature IDs (`F-R3-01` through `F-R3-10`, `F-R5-01` through `F-R5-06`), algorithms, interface contracts, and benchmark definitions.
2. **Test Baseline Execution**:
   Run the existing verification suites to confirm baseline integrity:
   - `node test/e2e.test.js --verify-infra`
   - `node test/challenger_storage.test.js`
   - `node test/challenger_m2_r2_adversarial.js`
3. **Invalidation Conditions**:
   - If `StorageManager.getAllBooks()` returns records containing `fileBlob` buffers in memory, R5 is violated.
   - If closing a book leaves active Blob URLs in `URL` or leaves detached iframes in the DOM, R5 is violated.
   - If MOBI PalmDOC decompressor fails to strip trailing entries when `extraFlags > 0`, MOBI decompression will produce corrupted characters or throw.
