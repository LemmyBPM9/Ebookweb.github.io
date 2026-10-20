# Original User Request

## 2026-10-17T02:29:10Z

Build a minimal, modern, eye-friendly client-side EPUB reader website using plain HTML, CSS, and JavaScript that allows users to import `.epub` files into a persistent local library and read comfortably without eye strain.

Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader
Integrity mode: development

## Requirements

### R1. EPUB Import & Persistent Local Library
Provide a clean library view where users can import `.epub` files via drag-and-drop or file picker (plus a built-in sample EPUB book so the reader can be tested and experienced immediately). Store imported EPUB binaries, extracted metadata (title, author, cover image), reading positions, bookmarks, and user preferences persistently in the browser using IndexedDB/localStorage so books remain available across page reloads without re-uploading, with the ability to resume or delete books.

### R2. Paginated & Scrollable Reading Engine
Parse and render standard EPUB 2 and EPUB 3 files (extracting OPF package metadata, spine reading order, NCX/Navigation Document Table of Contents, HTML/XHTML chapters, embedded images, and internal stylesheets). Support two user-selectable reading modes:
1. **Paginated View (default)**: Book-like multi-column or page-turn layout with smooth navigation via keyboard arrows (`ArrowLeft`/`ArrowRight`, `Space`), click/tap zones, and chapter transitions without vertical scrollbar clutter.
2. **Continuous Vertical Scroll View**: Smooth chapter reading with seamless previous/next chapter navigation.

### R3. Eye-Comfort Themes & Typography Customization
Design a distraction-free, minimal, modern reading interface engineered to prevent eye fatigue during long sessions:
- **Eye-Comfort Themes**: Provide 4 curated low-glare color palettes with balanced contrast ratios:
  1. *Warm Paper / Sepia* (default — warm cream background, soft charcoal ink)
  2. *Soft Dark / Night* (low-blue-light dark slate/charcoal background, muted warm grey text — avoiding harsh `#000000` on `#FFFFFF` halation)
  3. *Daylight / Clean Light* (soft off-white background with crisp dark ink)
  4. *Sage / Forest Calm* (gentle muted green-tinted background for reduced ocular fatigue)
- **Typography Controls**: Allow real-time adjustment of font family (curated readable serif, sans-serif, and dyslexia/mono options), font size, line height, and reading column width/margins, immediately persisted and applied to the book content.

### R4. Table of Contents (TOC), Bookmarks & Progress Tracking
Include a collapsible Table of Contents (TOC) drawer supporting nested chapters with active chapter highlighting, a bookmark toggle for saving/jumping to specific positions in a book, and a subtle bottom progress bar/footer displaying current chapter title and percentage/page progress through the book. The chrome/toolbar should stay unobtrusive while reading.

## Acceptance Criteria

### Functional & Programmatic Verification
- [ ] **Pure HTML/CSS/JS Execution**: The website runs directly in a modern browser over a static HTTP server (or static files) using pure HTML, CSS, and vanilla JavaScript with zero build step required (`index.html`, modular `.css` and `.js` files).
- [ ] **EPUB Parsing & Sample Book**: Automatically generates or bundles a valid multi-chapter sample `.epub` file and successfully imports arbitrary standard `.epub` files, extracting title, author, cover/placeholder, spine chapters, embedded images, and nested TOC entries without console or runtime errors.
- [ ] **Persistence Across Reloads**: Importing an EPUB file, changing page/scroll position, adding a bookmark, and customizing theme/typography settings persist in `IndexedDB` / `localStorage` and restore accurately after a full page reload (`location.reload()`).
- [ ] **Dual Reading Modes**: Switching between Paginated mode and Continuous Scroll mode dynamically reformats the active chapter, and Next/Previous navigation buttons and keyboard shortcuts (`ArrowRight`, `ArrowLeft`) advance pages and cross chapter boundaries accurately.
- [ ] **Eye-Comfort & Typography Verification**: Switching between all 4 themes (Warm Paper, Soft Dark, Daylight, Sage) updates CSS variables and reader content styling with WCAG AA compliant contrast (>= 4.5:1) and zero harsh pure-black-on-pure-white glare; changing font family, font size, line height, and page width measurably updates the rendered chapter typography.
- [ ] **Automated Browser Verification**: Passes an end-to-end headless browser verification script (or Playwright/Puppeteer test suite) that loads the site, imports an `.epub`, verifies library rendering, opens the book, navigates pages and chapters via TOC, toggles bookmarks, tests all 4 themes and typography sliders, reloads the page, and asserts state restoration with zero uncaught page errors.


## 2026-10-17T18:34:26Z

Upgrade the existing client-side WebReader application (pure HTML, CSS, and vanilla JavaScript) to support importing and reading multiple document and ebook formats (`.epub`, `.pdf`, `.mobi`/`.azw`, `.txt`, and `.md`) with both visual and reflowable PDF reading modes, an expanded collection of 10 eye-comfort reading color themes, and strict memory/performance optimizations for minimal RAM and CPU usage.

Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader
Integrity mode: development

## Verification Resources

The repository already contains a working EPUB reader implementation and Playwright-based verification suites:
- `test/e2e.test.js`: Full-browser E2E test suite (Tiers 0–4) testing library persistence, paginated/scroll reading modes, themes, typography, and TOC/bookmarks.
- `test/challenger_storage.test.js`: IndexedDB and localStorage adversarial storage test suite.
- `test/challenger_m2_r2_adversarial.js`: Security and parser adversarial test suite.
- `PROJECT.md`, `README.md`, `FINAL_AUDIT_REPORT.md`: Project documentation and audit reports that must be updated once all new features and performance benchmarks are verified.

## Requirements

### R1. Multi-Format Import, Parsing & Unified Library Persistence
- Support importing, storing in `IndexedDB` (`WebReaderDB`), and reading `.epub`, `.pdf`, `.mobi` (including `.azw` PalmDOC/Mobipocket), `.txt` (plain text with automatic paragraph/chapter detection), and `.md` (Markdown rendered to semantic HTML with headings mapped to the Table of Contents) via both file picker and drag-and-drop.
- Display a clear format badge (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) on each library card in the Library View, and support optional format filtering in the library header.
- Preserve all existing security guarantees (XSS sanitization of untrusted markup, sandboxed content rendering) and full offline persistence of files, reading positions, and bookmarks across page reloads for all supported formats.

### R2. Dual-Mode PDF Reading (Visual Page View & Reflowable Text View)
- When reading a `.pdf` document, support two user-toggleable PDF presentation modes:
  1. **Reflowable Text Mode**: Extracts structured text and chapters/pages from the PDF so the user can read seamlessly using WebReader's paginated or continuous scroll modes, custom typography (font family, font size, line height, reading width), and eye-comfort color themes.
  2. **Visual Page Mode**: Renders the original PDF page layout (via canvas/SVG or local bundled PDF renderer) with zoom/fit controls and theme-aware eye-comfort tinting/filtering so bright white PDF pages do not cause eye strain in dark or warm themes.

### R3. MOBI / AZW, Plain Text & Markdown Reading Support
- Parse `.mobi` / `.azw` files client-side (supporting PalmDOC decompression and UTF-8/CP1252 text extraction, metadata extraction, and TOC/chapter splitting) so they render seamlessly in Paginated and Scroll modes with full typography and theme controls.
- Parse `.txt` files (converting blank-line-separated blocks into paragraphs and detecting `Chapter ...` or Markdown-style headings as TOC entries) and `.md` files (rendering headings, emphasis, lists, blockquotes, code blocks, and links into clean semantic HTML with auto-generated TOC hierarchy).

### R4. Expanded Eye-Comfort Reading Themes
- Expand the reading theme palette beyond the existing 4 themes (`warm-paper`, `soft-dark`, `daylight`, `sage`) by adding 6 new low-fatigue, eye-friendly themes (10 themes total):
  - `solarized-light`: Classic warm cream background (`#FDF6E3`) with muted slate-teal body text (`#586E75` / `#073642`).
  - `solarized-dark`: Classic deep petrol-blue background (`#002B36`) with soft stone text (`#93A1A1` / `#EEE8D5`).
  - `nord`: Cool arctic slate-grey night palette (`#2E3440` background, `#D8DEE9` text).
  - `oled-black`: True pitch-black background (`#000000`) with warm dimmed silver text (`#C8C8C8`) for zero-bloom night reading.
  - `rose-pine`: Soft muted dusk palette (`#FAF4ED` or `#191724` / `#232136` with warm rose-cream text).
  - `e-ink`: Crisp matte high-contrast grayscale paper (`#F0F0EB` background, `#1A1A1A` ink, zero color saturation).
- All 10 themes must meet at least WCAG AA/AAA readability standards (contrast ratio >= 7.0:1 for body text), apply instantaneously without page reload or FOUC, style both the host UI and reader content, and persist in `localStorage`.

### R5. Ultra-Low Memory Footprint & CPU Performance Optimization
- **Metadata vs. Binary Separation in Library View**: Listing books in the Library View (`getAllBooksMetadata`) must NEVER load full file binaries (`ArrayBuffer` / `Blob`) into memory; binary payloads must only be fetched from `IndexedDB` on-demand when a user opens a specific book, and released upon returning to the library.
- **On-Demand Chapter & Page Lazy Rendering**: Do not keep all decompressed chapters or rendered PDF page canvases in memory simultaneously. In Paginated Mode, keep only the active chapter in the DOM. In Continuous Scroll Mode and PDF Visual Mode, use lazy/windowed rendering or CSS `content-visibility: auto` and recycle off-screen PDF `<canvas>` buffers so memory stays flat even on long books.
- **Deterministic Resource & Blob URL Cleanup**: Revoke all `blob:` object URLs (`URL.revokeObjectURL`), clear detached DOM trees, cancel pending `requestAnimationFrame` / `ResizeObserver` / `IntersectionObserver` instances, and null out large binary buffers when switching chapters, switching modes, or closing a book (`ReaderEngine.destroy()`).
- **Zero Idle CPU & Throttled Event Listeners**: Use passive scroll/touch listeners (`{ passive: true }`), debounce resize and storage position-save operations, and avoid any background polling or continuous timers when the reader is idle.

### R6. End-to-End Verification & Updated Markdown Reports
- All existing test suites (`test/challenger_storage.test.js`, `test/challenger_m2_r2_adversarial.js`, `test/e2e.test.js`) must continue to pass without regressions.
- Add automated verification tests covering `.pdf`, `.mobi`, `.txt`, and `.md` file imports, TOC generation, reading navigation, PDF Visual vs. Reflowable mode switching, all 10 color themes, and memory/resource leak checks (verifying Blob URL revocation, canvas/DOM cleanup on book close, and bounded JS heap growth across repeated book open/close cycles).
- Update `README.md`, `PROJECT.md`, and `FINAL_AUDIT_REPORT.md` to document all new formats, themes, memory/performance optimizations, and final test metrics.

## Acceptance Criteria

### Multi-Format Import & Reading
- [ ] File input `accept` attribute and drag-and-drop handler accept `.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, and `.md` files.
- [ ] Importing a valid `.pdf`, `.mobi`, `.txt`, or `.md` file adds it to the library grid with an accurate format badge (`PDF`, `MOBI`, `TXT`, `MD`), title, and author, and persists in `IndexedDB` across page reloads.
- [ ] Opening an imported `.mobi`, `.txt`, or `.md` file renders its readable chapters in the reader viewport with working TOC navigation, pagination/scroll toggle, typography sliders, and bookmarking.
- [ ] Opening an imported `.pdf` file allows reading in Reflowable Text Mode (with full font/theme customization) AND toggling to Visual Page Mode (rendering visual PDF pages with theme-aware eye-comfort filter/tint).

### Expanded Reading Themes
- [ ] The Settings Drawer displays all 10 reading themes (`warm-paper`, `soft-dark`, `daylight`, `sage`, `solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`).
- [ ] Selecting each of the 10 themes updates `document.documentElement.dataset.theme` and the reader content colors immediately, achieves a computed foreground/background contrast ratio of at least `7.0:1` (WCAG AAA), and persists across `page.reload()` without FOUC.

### Performance & Memory Efficiency
- [ ] Library View metadata queries (`StorageManager.getAllBooks()`) return lightweight metadata objects without loading raw book binary `ArrayBuffer` payloads into memory.
- [ ] Closing a book (`ReaderEngine.destroy()` / returning to Library View) revokes 100% of active `blob:` URLs, removes reader iframe/canvas DOM nodes, and disconnects observers.
- [ ] Automated memory stress test: opening and closing books 10 times in a row in Chromium does not leak detached iframes, unrevoked Blob URLs, or unbounded JS heap memory.

### Quality, Security & Documentation
- [ ] Untrusted content in `.md`, `.mobi`, `.txt`, `.pdf`, and `.epub` files is sanitized against XSS (`<script>`, inline `on*` handlers, `javascript:` URIs stripped) — `window.__xssTriggered` remains falsy.
- [ ] Zero console errors, zero uncaught page errors, and 100% pass rate across all existing and new automated E2E and adversarial tests.
- [ ] `README.md`, `PROJECT.md`, and `FINAL_AUDIT_REPORT.md` are updated with complete verification and memory/performance metrics.
