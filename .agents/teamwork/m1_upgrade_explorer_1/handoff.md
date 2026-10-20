# Handoff Report: StorageManager & IndexedDB Schema V2 Architecture

## 1. Observation
1. **Existing DB Schema (`js/storage/db.js:7-55`)**:
   - `WebReaderDB.DB_VERSION = 1`
   - Three object stores: `books` (keyPath `'id'`, indexes `by_lastRead`, `by_dateAdded`, `by_title`), `reading_progress` (keyPath `'bookId'`), and `bookmarks` (keyPath `'id'`, indexes `by_bookId`, `by_createdAt`).
   - Line 143-150: `saveBook(bookRecord)` writes `bookRecord` directly to `books`.
   - Line 91-107: `getAllBooks()` runs `index.getAll()` on `books`, returning raw stored objects including `fileBlob`.
2. **Existing StorageManager Facade (`js/storage/storage-manager.js:1-79`)**:
   - Delegates directly to `WebReaderDB` (`openDB`, `getAllBooks`, `getBook`, `saveBook`, `deleteBook`, `getProgress`, `saveProgress`, `getBookmarks`, `addBookmark`, `deleteBookmark`).
   - Does not yet expose format-aware querying or split metadata/file query helpers (`getAllBooksMetadata`, `getBookMetadata`, `getBookFile`, `getBooksByFormat`).
3. **Application & UI Dependencies (`js/app.js`, `js/ui/library-view.js`, `js/sample-book.js`)**:
   - `js/ui/library-view.js:177`: `const books = await StorageManager.getAllBooks();` iterates book cards and reads `book.title`, `book.author`, `book.coverBlob`.
   - `js/app.js:179`: `let bookRecord = await StorageManager.getBook(bookId);` expects `bookRecord.fileBlob` when opening a book.
   - `js/sample-book.js:645`: `await storageManager.saveBook(bookRecord);` supplies `bookRecord` containing `fileBlob`.
4. **Empirical Challenger Test Suite Baseline (`test/challenger_storage.test.js`)**:
   - Ran `node test/challenger_storage.test.js`: 22/22 tests passed (including 100 concurrent saves, 120 mixed ops, contention stress, binary Blob EPUB storage with PK magic-byte validation, and atomic cascade delete).
   - Test 2.1 checks descending sort on `lastRead`.
   - Test 2.4 asserts `retrieved.fileBlob` size and PK magic bytes after `saveBook` and `getBook`.
   - Test 3.1 & 3.2 assert raw record counts across stores after cascade deletes.
5. **Project Requirements (`ORIGINAL_REQUEST.md:43-116`, `PROJECT.md:1-209`)**:
   - Milestone 1 / Feature 43: Two-tier IndexedDB schema (`books` metadata only, `book_files` binary payload on-demand). `getAllBooks()` must load 0 binary bytes.
   - Format badges (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) and header format filters require a dedicated `format` property on `books` metadata and a `by_format` index.
   - Auto-migration in `onupgradeneeded` without data loss or orphan records.

## 2. Logic Chain
1. **Observation 1 & 5** demonstrate that in V1, every `getAllBooks()` call deserializes full `fileBlob` binaries into memory. By bumping `DB_VERSION` from 1 to 2, introducing the `book_files` store (keyPath `'id'`), and storing exclusively binary payloads `{ id, fileBlob }` in `book_files`, we guarantee that queries on `books` deserialize only metadata records, cutting initial library memory consumption to near zero.
2. **Observation 3** shows that `library-view.js` requires `coverBlob` for displaying covers without opening books. Keeping `coverBlob` in the `books` metadata store satisfies this requirement while maintaining a small memory footprint (thumbnails are 5–50 KB, whereas book files can be 10–100 MB).
3. **Observation 1, 3, & 4** show that existing callers of `saveBook(bookRecord)` supply a unified record with `fileBlob`. By having `saveBook` internally split `bookRecord` into `metadata` (persisted to `books`) and `fileBlob` (persisted to `book_files`) within a single `readwrite` transaction `['books', 'book_files']`, callers maintain full backward compatibility while achieving atomic two-tier persistence.
4. **Observation 3 & 4** show that callers of `getBook(id)` expect a unified `BookRecord` with `fileBlob`. By having `getBook(id)` query `books` and `book_files` concurrently in a single `readonly` transaction `['books', 'book_files']` and reassemble `{ ...metadata, fileBlob }`, callers can open books seamlessly.
5. **Observation 4** shows that `deleteBook(id)` currently cascades across `books`, `reading_progress`, and `bookmarks`. Adding `book_files` to this transaction ensures complete orphan eradication across all 4 stores atomically.
6. **Observation 1 & 5** establish the auto-migration requirement: In `onupgradeneeded`, when `oldVersion >= 1 && oldVersion < 2`, iterating `books` with `openCursor()` within `event.target.transaction`, copying `fileBlob` to `book_files`, assigning `format: 'epub'`, and stripping `fileBlob` from `books` migrates legacy V1 databases cleanly before `onsuccess` fires.

## 3. Caveats
1. **In-Flight Migrations on Huge Libraries**:
   If an existing user has a massive library (>100 books), the cursor in `onupgradeneeded` will run sequentially during the versionchange transaction. Because IndexedDB transactions stay alive during queued cursor iterations, this will complete safely, but the `openDB()` promise will await all cursor `put`/`update` calls before resolving.
2. **Read-Only Investigation Scope**:
   This explorer task is strictly read-only analysis and architecture blueprinting. No production source files (`js/storage/db.js`, `js/storage/storage-manager.js`) have been modified in this step. Implementation will proceed in the builder phase.
3. **Format Detection Fallbacks**:
   When legacy books lack format metadata, they are tagged as `'epub'`. For new multi-format imports, format will be inferred from MIME type, file extension, or explicit `format` argument.

## 4. Conclusion
The two-tier IndexedDB V2 architecture (`WebReaderDB` Version 2) is thoroughly designed, backward-compatible, and fully specified in `analysis.md`:
- `books` store holds only lightweight metadata with index `by_format`.
- `book_files` store holds binary `{ id, fileBlob }`.
- `getAllBooks()` returns lightweight metadata with 0 binary bytes loaded.
- `getBook(id)` reassembles metadata and binary payload on demand.
- `saveBook(bookRecord)` writes atomically across `books` and `book_files`.
- `deleteBook(id)` atomically cascades across all 4 stores.
- Automatic migration in `onupgradeneeded` cleanly upgrades V1 databases without loss.
- Ready for implementation in Milestone 1.

## 5. Verification Method
1. **Existing Storage Regression Suite**:
   ```bash
   node test/challenger_storage.test.js
   ```
   *Expected outcome*: 22/22 passing tests.
2. **Parser Adversarial Suite**:
   ```bash
   node test/challenger_m2_r2_adversarial.js
   ```
   *Expected outcome*: All adversarial scenarios pass.
3. **V2 Invariant Verification Inspection**:
   - Inspect `WebReaderDB.DB_VERSION === 2`.
   - Inspect that `WebReaderDB.openDB()` creates `book_files` store and `by_format` index on `books`.
   - Assert in Chrome console: `const books = await StorageManager.getAllBooks(); books.every(b => b.fileBlob === undefined)` is `true`.
   - Assert that `await StorageManager.getBook(id)` returns an object where `book.fileBlob instanceof Blob` is `true`.
   - Verify cascade delete leaves 0 records in `book_files` for the deleted ID.
