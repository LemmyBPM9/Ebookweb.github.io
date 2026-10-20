## 2026-10-17T04:23:47Z
You are Explorer 3 for Milestone 3: Paginated & Scrollable Reading Engine.
Your working directory is: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_3/

MANDATORY: Read the original user request first:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md

And read the project specification:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Also inspect existing storage contracts:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/storage/storage-manager.js
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/storage/db.js
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/event-bus.js

Scope: Milestone 3 Reading Engine
Focus Area 3: Continuous Scroll View (`js/reader/scroll-view.js`) and Position Tracker (`js/reader/position-tracker.js`):
1. Continuous Vertical Scroll Architecture:
   - Setting iframe body to natural vertical flow (`overflow-y: auto`, `height: auto`).
   - Throttled/debounced scroll listener on iframe window:
     * Calculating scroll ratio: `scrollTop / (scrollHeight - clientHeight)`.
     * Boundary detection: reaching bottom threshold -> auto-advance to next chapter; reaching top threshold -> auto-load previous chapter.
   - Smooth programmatic scrolling (`window.scrollTo({ top, behavior: 'smooth' })`).
2. Position Tracker & Progress Calculation:
   - Tracking current reading position:
     ```typescript
     interface ReadingPosition {
       bookId: string;
       spineIndex: number;
       pageIndex?: number;
       totalPages?: number;
       scrollRatio?: number;
       anchorId?: string;
       chapterProgress: number; // 0 to 100
       globalProgress: number;  // 0 to 100 across entire book
       updatedAt: number;
     }
     ```
   - Global progress calculation: weighting chapters by word count / character count or spine ratio, providing an accurate 0–100% progress for the bottom footer bar.
   - Debounced persistence: saving progress to IndexedDB via `StorageManager.saveProgress(record)` debounced by ~500ms to avoid excessive IDB writes during fast page turns or scrolling.
3. Anchor / Element Jumping & Restoration:
   - Navigating to TOC anchor `#section2`: finding element with `id="section2"` or `name="section2"` inside chapter DOM.
   - In Scroll View: `element.scrollIntoView()`.
   - In Paginated View: finding element's column offset `offsetLeft` or bounding box, calculating corresponding `pageIndex = Math.floor(element.offsetLeft / pageWidth)`, and flipping to that page.
   - Restoring saved position on book reload: restoring exact page in Paginated mode or exact scroll ratio in Scroll mode.
4. Deliver comprehensive architectural blueprint, drop-in code templates, edge cases (zero scroll height, empty anchors, resize repositioning), and verification test strategy.
DO NOT edit source files directly. Write your report to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_3/handoff.md
Update progress.md and send a completion message when done.
