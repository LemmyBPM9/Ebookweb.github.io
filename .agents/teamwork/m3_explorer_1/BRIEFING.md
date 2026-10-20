# BRIEFING — 2026-10-17T04:27:00Z

## Mission
Investigate and design Focus Area 1 for Milestone 3: Master Reader Engine (`js/reader/reader-engine.js`), Sandboxed Iframe, Theme & Typography Injection, and Mode Switching Coordination, delivering architectural blueprint, drop-in code templates, edge cases, and verification test strategy.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, architect, synthesizer
- Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_1/
- Original parent: bf9f892e-9f7c-4a5f-80d2-882b9b27b238
- Milestone: Milestone 3 - Paginated & Scrollable Reading Engine

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source files.
- Communicate with parent via `send_message`.
- Keep BRIEFING.md under ~100 lines (preserve 🔒 sections).
- Output comprehensive handoff report to `.agents/teamwork/m3_explorer_1/handoff.md`.
- Maintain heartbeat in `progress.md`.

## Current Parent
- Conversation ID: bf9f892e-9f7c-4a5f-80d2-882b9b27b238
- Updated: not yet

## Investigation State
- **Explored paths**: `PROJECT.md`, `ORIGINAL_REQUEST.md`, `js/event-bus.js`, `js/storage/storage-manager.js`, `js/storage/settings-store.js`, `js/storage/db.js`, `js/parser/epub-parser.js`, `js/parser/asset-extractor.js`, `css/themes.css`, `css/main.css`, `index.html`, `test/e2e.test.js`, `js/sample-book.js`.
- **Key findings**:
  1. Sandboxed iframe with `sandbox="allow-same-origin"` (without `allow-scripts`) allows parent window DOM access while blocking script execution, popups, and external navigations.
  2. Direct DOM adoption (`importNode`/`adoptNode`) into `iframe.contentDocument` outperforms `srcdoc` serialization by eliminating white-flash iframe reload cycles.
  3. Dynamic theme & typography injection via `:root` CSS variables in `iframe.contentDocument` enables instant live reflow without chapter reloading.
  4. ReaderEngine controller fully integrates dual view adapters (`PaginatedView` and `ScrollView`) with bidirectional progress synchronization (`ratio = pageIndex / (totalPages - 1) <=> scrollTop / maxScroll`).
  5. Cross-chapter backward transitions measure Chapter N-1 and land accurately on `pageIndex = totalPages - 1`.
- **Unexplored areas**: None for Focus Area 1.

## Key Decisions Made
- Use single persistent `<iframe id="reader-frame" class="reader-frame" sandbox="allow-same-origin">` mounted inside `#reader-stage`.
- Adopt DOM nodes from `parsedEpub.getChapterDocument(fullPath)` directly into `iframe.contentDocument`.
- Intercept iframe link clicks and keyboard events in parent window context to support 3-zone tap navigation, chapter jumping, and anchor scrolling without iframe scripts.

## Artifact Index
- `DISPATCH.md` — Inbound instruction log
- `BRIEFING.md` — Situational awareness working memory
- `progress.md` — Liveness heartbeat & task progress
- `handoff.md` — Final 5-component report
