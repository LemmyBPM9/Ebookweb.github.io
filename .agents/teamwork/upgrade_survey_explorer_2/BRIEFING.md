# BRIEFING — 2026-10-17T18:44:00Z

## Mission
Investigate and architect R2: Dual-Mode PDF Reading (Reflowable Text Mode & Visual Page Mode) for webreader without bundler/npm dependencies.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, preview, synthesis
- Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_explorer_2/
- Original parent: b4abc7fb-a287-4f27-bbe9-a16e40f60012
- Milestone: upgrade_survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Client-side execution without build steps: pure browser ES modules or vendor scripts without bundlers/npm
- Architecture must seamlessly integrate with existing ReaderEngine, UI controls, navigation, and progress tracking

## Current Parent
- Conversation ID: b4abc7fb-a287-4f27-bbe9-a16e40f60012
- Updated: 2026-10-17T18:44:00Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (specifically requirements ## 2026-10-17T18:34:26Z, R2 Dual-Mode PDF, R5 Memory/Performance)
  - `PROJECT.md` (architecture, interface contracts, code layout)
  - `index.html`, `js/app.js`, `js/reader/reader-engine.js`, `js/reader/paginated-view.js`, `js/reader/scroll-view.js`, `js/reader/position-tracker.js`
  - `js/parser/epub-parser.js`, `js/storage/db.js`, `js/ui/library-view.js`, `js/ui/reader-chrome.js`
  - `css/themes.css`, `css/reader.css`, `test/server.js`, `test/challenger_storage.test.js`
  - Mozilla PDF.js distribution architecture, vendor packaging (`pdf.min.js`, `pdf.worker.min.js`), text extraction heuristics, canvas GPU memory virtualization
- **Key findings**:
  - Standalone PDF.js builds (`build/pdf.min.js` ~320KB, `build/pdf.worker.min.js` ~1.08MB) run in browser standard scripts without bundlers, configuring `workerSrc = 'vendor/pdf.worker.min.js'`.
  - Reflowable mode can parse PDF text via `page.getTextContent()`, reconstruct words using horizontal spacing thresholds, detect columns via gutter analysis, classify headings by font-size multipliers, and feed semantic HTML into existing `PaginatedView` and `ScrollView`.
  - Visual page mode on HTML5 `<canvas>` provides 100% layout fidelity. Combining CSS `mix-blend-mode: multiply` on light themes with CSS/SVG color inversion filters on dark themes transforms bright white PDF pages to match all 10 themes in 0 ms GPU compositing without CPU re-renders.
  - To fulfill R5 (ultra-low memory), visual mode must enforce canvas virtualization (retaining only visible pages $\pm 1$ buffer page, zeroing out off-screen canvas dimensions to purge GPU backing textures).
  - Bidirectional position sync links page index across Reflowable Text and Visual Page modes.
- **Unexplored areas**: Implementation of Mobi / AZW, TXT, and Markdown parsers (covered by peer survey explorers).

## Key Decisions Made
- Architecture defined: `PdfParser` in `js/parser/pdf-parser.js` conforming to `ParsedDocument` interface, returning `getChapterDocument(pageRef)` for Reflowable Mode and exposing `pdfDocument` for Visual Page Mode.
- Visual Mode implemented as `PdfVisualView` in `js/reader/pdf-visual-view.js` with canvas rendering, zoom/fit math, and virtualized windowing.
- Filter specifications calculated for all 10 themes using CSS custom properties (`--pdf-canvas-filter`, `--pdf-canvas-blend-mode`, `--pdf-canvas-bg`).
- Authored comprehensive investigation report in `survey_report.md`.

## Artifact Index
- `DISPATCH.md` — incoming instructions from orchestrator
- `BRIEFING.md` — persistent situational awareness and working memory
- `progress.md` — liveness heartbeat and subtask tracking
- `survey_report.md` — comprehensive technical investigation report (deliverable)
- `handoff.md` — 5-component handoff report
