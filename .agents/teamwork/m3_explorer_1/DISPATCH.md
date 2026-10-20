## 2026-10-17T04:23:47Z
You are Explorer 1 for Milestone 3: Paginated & Scrollable Reading Engine.
Your working directory is: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_1/

MANDATORY: Read the original user request first:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md

And read the project specification:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Also inspect existing completed modules:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/event-bus.js
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/storage/storage-manager.js
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/storage/settings-store.js
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/parser/epub-parser.js
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/css/themes.css
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/css/main.css

Scope: Milestone 3 Reading Engine
Focus Area 1: Master Reader Engine (`js/reader/reader-engine.js`), Sandboxed Iframe, Theme & Typography Injection, and Mode Switching Coordination:
1. Sandboxed Iframe Architecture:
   - Creating/mounting `<iframe id="reader-frame" sandbox="allow-same-origin" ...>` inside the reader stage container.
   - Why `sandbox="allow-same-origin"` without `allow-scripts`? Verified Defense Layer 2 preventing any rogue EPUB scripts, popups, or external requests.
   - Injecting chapter document into iframe: using `srcdoc` or `iframe.contentDocument` / `contentWindow` with adopted/imported nodes from `parsedEpub.getChapterDocument(fullPath)`.
   - Handling iframe load lifecycle, cross-browser compatibility, and zero-flicker chapter transitions.
2. Theme & Typography Injection:
   - Dynamic stylesheet injection into iframe: injecting reader base CSS, current theme CSS variables (`data-theme` or computed CSS vars), and user typography:
     * `font-family`: Serif (Merriweather/Charter/Georgia), Sans (Inter/system-ui), Dyslexic/Atkinson.
     * `font-size`: e.g. 14px to 26px (default 18px).
     * `line-height`: e.g. 1.3 to 2.2 (default 1.6).
     * `max-width` / margin width: reader column width.
   - Live dynamic updates: changing theme or typography without reloading the chapter if possible, updating pagination math immediately.
3. Master Reader Controller Interface (`PROJECT.md:101-111`):
   - `loadBook(parsedEpub, initialProgress)`
   - `setMode(mode: 'paginated' | 'scroll')`
   - `nextPage()` / `prevPage()`
   - `goToChapter(spineIndex: number, anchorId?: string)`
   - `goToLocation(spineIndex: number, pageIndexOrScrollRatio: number)`
   - `applyTheme(themeId: string)`
   - `applyTypography(typographySettings: object)`
   - `getProgress()`
   - EventBus event emissions (`chapter:changed`, `page:changed`, `mode:changed`, etc.).
4. Deliver comprehensive architectural blueprint, drop-in code templates, edge cases, and verification test strategy.
DO NOT edit source files directly. Write your report to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_1/handoff.md
Update progress.md and send a completion message when done.
