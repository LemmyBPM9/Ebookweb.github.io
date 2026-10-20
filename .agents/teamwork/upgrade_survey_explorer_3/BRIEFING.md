# BRIEFING — 2026-10-17T18:44:20Z

## Mission
Comprehensive technical investigation of R3 (MOBI/AZW, Plain Text & Markdown Reading Support) and R5 (Ultra-Low Memory Footprint & CPU Performance Optimization) for WebReader upgrade.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_explorer_3/
- Original parent: b4abc7fb-a287-4f27-bbe9-a16e40f60012
- Milestone: upgrade_survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Produce survey_report.md and handoff.md in working directory
- Focus on R3 (MOBI/AZW, TXT, MD) and R5 (Storage memory separation, on-demand/recycled buffers, deterministic cleanup, zero idle CPU)

## Current Parent
- Conversation ID: b4abc7fb-a287-4f27-bbe9-a16e40f60012
- Updated: 2026-10-17T18:44:20Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (headers `## 2026-10-17T02:29:10Z` and `## 2026-10-17T18:34:26Z`)
  - `PROJECT.md` (interfaces, architectural layers, contracts)
  - `js/parser/` (`epub-parser.js`, `asset-extractor.js`, `opf-parser.js`, `toc-parser.js`)
  - `js/storage/` (`db.js`, `storage-manager.js`, `settings-store.js`)
  - `js/reader/` (`reader-engine.js`, `paginated-view.js`, `scroll-view.js`, `position-tracker.js`)
  - `js/ui/` (`library-view.js`, `reader-chrome.js`, `toc-drawer.js`, `bookmarks-drawer.js`, `settings-panel.js`)
  - `js/app.js` (application router, lifecycle gaps in `closeBookToLibrary`)
  - `test/` (`challenger_storage.test.js`, `challenger_m2_r2_adversarial.js`, `e2e.test.js`)
- **Key findings**:
  - `StorageManager.getAllBooks()` in `db.js:91-107` retrieves full `fileBlob` for all books in the library; separated store schema (`books` metadata vs `book_files` binary) in IndexedDB v2 resolves this without breaking existing contracts.
  - `ReaderEngine.destroy()` in `reader-engine.js:560-566` does not tear down `this.iframe`, does not revoke non-asset Blob URLs, does not null out references, and `app.js:229-245` (`closeBookToLibrary`) never calls `ReaderEngine.destroy()`.
  - PalmDOC decompression (LZ77 variant) requires parsing PDB headers, Record 0 MOBI/PalmDOC headers, stripping trailing data entries (`extraFlags`), and handling CP1252/UTF-8 decoding.
  - Plain Text (.txt) and Markdown (.md) can be parsed into semantic HTML documents conforming to the unified `ParsedBook` contract with zero external dependencies.
- **Unexplored areas**: Implementation details of PDF visual page rendering (covered by peer explorer `upgrade_survey_explorer_2`).

## Key Decisions Made
- Unified polymorphic `ParsedBook` contract allows `ReaderEngine` to remain format-agnostic.
- Two-store IndexedDB architecture (`books` + `book_files`) cleanly separates metadata from binary payloads with seamless migration.

## Artifact Index
- `DISPATCH.md` — Received task dispatches
- `BRIEFING.md` — Persistent context & identity
- `progress.md` — Liveness & task progress tracking
- `survey_report.md` — Comprehensive technical investigation report for R3 & R5
- `handoff.md` — 5-component handoff report
