## 2026-10-17T18:54:58Z
You are teamwork_preview_worker (instance m1_upgrade_worker_1).
Your working directory is:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_worker_1/

MANDATORY FIRST STEP: Read the user request file at:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
specifically paying attention to ## 2026-10-17T18:34:26Z.
Also read PROJECT.md at the project root:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Read the three Explorer technical blueprints:
- Storage V2 Blueprint: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_1/analysis.md
- UI & Format Badges Blueprint: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_2/analysis.md
- Synthesized Step-by-Step Blueprint: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive Write Ownership:
You exclusively own and may edit the following files:
- `js/storage/db.js`
- `js/storage/storage-manager.js`
- `js/parser/asset-extractor.js`
- `index.html`
- `css/main.css`
- `js/ui/library-view.js`
Do NOT edit any test files in `test/` (owned by the E2E testing track).

Your Tasks for Milestone 1:
1. Harden `DOMSanitizer` in `js/parser/asset-extractor.js`:
   - Inspect and sanitize attributes on the root element itself if passed an `Element`, in addition to descendants.
   - Add static `sanitizeHtml(htmlString)` helper.
2. Upgrade `WebReaderDB` to Version 2 in `js/storage/db.js`:
   - Set `DB_VERSION = 2`.
   - In `onupgradeneeded`, create `book_files` store (keyPath `id`) and add index `by_format` to `books` store.
   - Include auto-migration: if upgrading from V1, migrate `fileBlob` from `books` into `book_files`, strip `fileBlob` from `books`, and tag missing `format` as `'epub'`.
   - Update `getAllBooks()`: query `books` store only — NEVER load `fileBlob` into memory.
   - Update `getBook(id)`: atomically read `books` and `book_files`, returning joined `{ ...meta, fileBlob }`.
   - Update `saveBook(bookRecord)`: split metadata (to `books`) and binary payload (to `book_files`) in a single readwrite transaction. If `fileBlob` is omitted during a metadata-only update, preserve existing `book_files` entry.
   - Update `deleteBook(id)`: atomically delete from `books`, `book_files`, `reading_progress`, and `bookmarks`.
3. Update `StorageManager` in `js/storage/storage-manager.js` to expose methods matching the contract in `PROJECT.md`.
4. Update `index.html`:
   - Update `#file-input` `accept` attribute to accept `.epub, .pdf, .mobi, .azw, .txt, .md` and standard MIME types. Keep `id="file-input"` and `id="btn-import-epub"` intact.
   - Add `#format-filter-bar` into `.library-header` (`All`, `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`).
5. Update `css/main.css`:
   - Add styles for `.book-format-badge` (with distinct color/border accents for `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) and `#format-filter-bar`.
6. Update `js/ui/library-view.js`:
   - Add format detection from filename (`.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, `.md`).
   - Add binary magic byte / signature validation (ZIP `PK\x03\x04`, PDF `%PDF`, MOBI `BOOKMOBI`/PalmDOC, TXT/MD UTF-8).
   - In `importFiles()`, handle multi-format ingestion, storing metadata in `books` and raw files in `book_files`.
   - In `_createBookCard()`, render `.book-format-badge` and set `card.dataset.format`.
   - Implement `setFilter(format)` and `_applyFilter()` for instant in-DOM filtering.
7. Verification:
   - Run `node test/challenger_storage.test.js`
   - Run `node test/challenger_m2_r2_adversarial.js`
   - Run `node test/e2e.test.js`
   - Ensure 100% pass rate with ZERO regressions.

Deliverable:
Write a comprehensive handoff report to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_worker_1/handoff.md
Include build/test commands, verification results, and diff summary. Send completion message when done.
