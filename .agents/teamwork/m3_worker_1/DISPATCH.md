## 2026-10-17T04:29:55Z
From: bf9f892e-9f7c-4a5f-80d2-882b9b27b238 (parent)
Priority: MESSAGE_PRIORITY_HIGH

You are the Implementation Worker for Milestone 3: Paginated & Scrollable Reading Engine.
Your working directory is: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_worker_1/

MANDATORY: Read the original user request first:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md

And read the project specification:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Read the 3 Explorer handoff reports providing complete architectural blueprints, algorithms, and drop-in code templates:
1. Master Reader Engine & Sandboxed Iframe:
   /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_1/handoff.md
2. CSS Multi-Column Pagination & Reader CSS:
   /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_2/handoff.md
3. Continuous Scroll View, Position Tracker & Anchor Resolver:
   /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive Write Ownership:
You own exclusively:
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/css/reader.css
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/reader/reader-engine.js
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/reader/paginated-view.js
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/reader/scroll-view.js
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/reader/position-tracker.js
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/index.html (if reader container markup or css link is needed)
- Your working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_worker_1/

Do NOT touch test/ directory or files owned by other milestones.

Objective:
Implement Milestone 3 according to the Explorer blueprints:

1. `css/reader.css`:
   - Reader stage container, reader viewport, reading frame (`#reader-frame`).
   - 3-zone tap overlay (25% left prev, 50% center chrome toggle, 25% right next).
   - In-iframe injected reader stylesheet:
     * Equal-margin CSS multi-column book layout (`#content-wrapper` with `column-width: 100vw`, `column-gap: calc(2 * var(--page-padding-h))`, `column-fill: auto`, `box-sizing: border-box`, `padding: var(--page-padding-v) var(--page-padding-h)`).
     * GPU transform horizontal translation container.
     * Natural vertical scroll layout for scroll mode.
     * Content slicing defenses (`break-inside: avoid` on `img`, `svg`, `blockquote`, `pre`, `tr`; `break-after: avoid` on `h1`-`h6`; image max-height).
     * Theme CSS custom properties mapping and typography variables.

2. `js/reader/reader-engine.js`:
   - Conforms to `PROJECT.md:101-111` Reader Engine interface contract.
   - Creates/mounts `<iframe id="reader-frame" sandbox="allow-same-origin">` (NO `allow-scripts`).
   - Direct node adoption (`importNode`/`adoptNode`) into `iframe.contentDocument` from `parsedEpub.getChapterDocument(fullPath)` for zero-flicker chapter transitions.
   - Dual-mode coordination (`paginated` default vs `scroll`).
   - Live theme injection: updating CSS variables on `:root` inside iframe without page reload.
   - Live typography injection: updating font-family, font-size, line-height, max-width and triggering layout recalculation.
   - Navigation: `nextPage()`, `prevPage()`, `goToChapter(spineIndex, anchorId)`, `goToLocation(spineIndex, pageIndexOrScrollRatio)`.
   - Cross-chapter boundary transitions: auto-advance to next chapter on last page/bottom; auto-load previous chapter on first page/top.
   - Intercepts link clicks inside iframe: intra-chapter `#anchor` jumps, cross-chapter links via `data-epub-href`, external links opened safely in `_blank`.
   - EventBus emissions: `chapter:changed`, `page:changed`, `mode:changed`, `theme:changed`, `typography:changed`.

3. `js/reader/paginated-view.js`:
   - Multi-column pagination controller.
   - GPU translation page flip: `transform: translateX(-pageIndex * pageWidth)`.
   - Subpixel-safe page count: `totalPages = Math.max(1, Math.round(scrollWidth / pageWidth))`.
   - Boundary detection signaling reader engine.
   - `ResizeObserver` re-anchoring reading position on window or font-size resize.
   - Anchor positioning: calculates element's column offset and flips to that page.

4. `js/reader/scroll-view.js`:
   - Continuous vertical scroll controller.
   - rAF-throttled scroll listener calculating scroll ratio `scrollTop / (scrollHeight - clientHeight)`.
   - Directional hysteresis boundary detection: advance next chapter at scrollRatio >= 0.99, prev chapter at scrollTop <= 0.
   - Programmatic smooth scrolling to anchors.

5. `js/reader/position-tracker.js`:
   - Tracks current reading position (`spineIndex`, `pageIndex`, `totalPages`, `scrollRatio`, `anchorId`, `chapterProgress`, `globalProgress`).
   - Global book progress calculation (chapter-weighted).
   - 500ms debounced persistence to IndexedDB via `StorageManager.saveProgress()`.
   - Unload flush: saves immediately on `beforeunload` / `pagehide`.

6. Verification (`verify_m3.js`):
   - Create a comprehensive verification suite in your working directory (`verify_m3.js`) running in Node and headless Google Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`):
     * Test full book loading in `ReaderEngine`.
     * Test Paginated Mode: multi-column rendering, page navigation next/prev, totalPages formula, boundary advance to next/prev chapter.
     * Test Scroll Mode: vertical flow, scroll ratio tracking, bottom boundary advance.
     * Test Mode Switching: seamless switch between Paginated and Scroll preserving relative reading position.
     * Test Live Theme & Typography Injection: font size, font family, line height, theme switching without chapter reload.
     * Test Position Tracker: 500ms debounced persistence in IndexedDB, global progress %, reload restoration.
     * Test Anchor Jumping: jumping to `#anchorId` in both paginated and scroll modes.
   - Run `node test/e2e.test.js --verify-infra` to verify infrastructure remains clean.
   - Write your completion report to:
     /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_worker_1/handoff.md
   - Include test commands, actual outputs, and send completion message when done.
