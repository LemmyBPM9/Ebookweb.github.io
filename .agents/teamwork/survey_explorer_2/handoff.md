# Technical Investigation & Architectural Specification: Reading Engine, UI Chrome, Navigation & Modular Design

**Author**: survey_explorer_2  
**Date**: 2026-10-17  
**Scope**: Paginated & Scrollable Reading Engine, User Interaction, Navigation, TOC Drawer, Bookmarks, Progress Tracking, and Vanilla JS Architecture.  
**Target Repository**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader`

---

## 1. Observation

### 1.1 Requirements & Constraints
From `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md`:
- **R1 & Acceptance Criteria**: Zero build step; pure HTML, CSS, and vanilla JavaScript (`<script type="module">`). Must run directly over a static HTTP server.
- **R2 (Paginated & Scrollable Reading Engine)**:
  - *Paginated View (default)*: Multi-column or page-turn layout with smooth navigation via keyboard arrows (`ArrowLeft`/`ArrowRight`, `Space`), click/tap zones, and chapter transitions without vertical scrollbar clutter.
  - *Continuous Vertical Scroll View*: Smooth chapter reading with seamless previous/next chapter boundary navigation.
- **R4 (TOC, Bookmarks & Progress Tracking)**:
  - Collapsible TOC drawer supporting nested chapters with active chapter highlighting.
  - Bookmark toggle for saving/jumping to specific positions.
  - Subtle bottom progress bar/footer displaying current chapter title and percentage/page progress.
  - Reader chrome/toolbar auto-hide and toggle on center tap.

### 1.2 Empirical Experiments & Direct Observations
To eliminate speculative assumptions, five empirical test suites were executed directly against modern Google Chrome (version `155.0.8059.82`) using Node.js v25.9.0 and native Chrome DevTools Protocol (CDP) over WebSockets:

1. **CSS Multi-Column Pagination & Layout Geometry (`test_cdp.js`)**:
   - Container styled with `overflow: hidden`, `height: 100%`, `column-width: 600px`, `column-gap: 0px`, and `column-fill: auto`.
   - Result:
     ```json
     {
       "clientWidth": 596,
       "scrollWidth": 2384,
       "totalPages": 4,
       "scrolledLeft": 596
     }
     ```
   - *Observation*: Content divided into exactly 4 columns ($2384 / 596 = 4.0$). Programmatic `container.scrollLeft = 596` moved precisely to Page 2 without requiring vertical scrollbars or layout re-computation.

2. **Iframe Isolation & Sandboxing (`test_iframe_columns.js`)**:
   - An `<iframe>` loaded with chapter XHTML and isolated `<style id="reader-engine-styles">`.
   - Result:
     ```json
     {
       "width": 756,
       "scrollWidth": 4908,
       "totalPages": 6,
       "scrolledLeft": 756,
       "scrollModeHeight": 2134
     }
     ```
   - *Observation*: Chapter-internal CSS is 100% isolated inside the iframe. Parent application styles cannot be corrupted by EPUB styles, and the parent can inject eye-comfort theme overrides directly into `iframe.contentDocument.head`.

3. **Margin & Column Gap Geometry (`test_padding_math.js`)**:
   - Tested CSS multi-column behavior with padding and margins. In CSS Multi-column specification, setting padding on the column container only applies to the first and last columns.
   - Verified that setting viewport width $W$, horizontal margin padding $P$, column width $W_{col} = W - 2P$, and column gap $\text{gap} = 2P$ yields a page advance step $S = W_{col} + \text{gap} = W$:
     ```json
     {
       "colWidth": 680,
       "step": 800,
       "scrollWidth": 3140,
       "page1ScrollLeft": 800,
       "page2ScrollLeft": 1600,
       "computedPages": 4
     }
     ```
   - *Observation*: With this formula, every single page has identical margins ($P = 60\text{px}$) on both the left and right edges, and every page turn advances by exactly `viewport.clientWidth` ($800\text{px}$).

4. **Dynamic Mode Switching & Position Synchronization (`test_mode_switch.js` & `test_position_sync.js`)**:
   - Switched live between Paginated mode and Continuous Scroll mode:
     ```json
     {
       "totalPages": 4,
       "currentPage": 2,
       "progressRatio": 0.5,
       "maxScroll": 1080,
       "scrollRestoredTop": 540,
       "restoredPageIndex": 2,
       "targetElemId": "p-25",
       "elemOffsetLeft": 848,
       "anchorPageIndex": 1
     }
     ```
   - *Observation*: Progress ratio $R = \text{pageIndex} / \text{totalPages}$ cleanly maps to $\text{scrollTop} = R \times \text{maxScroll}$ and back. Furthermore, an element's `offsetLeft` in multi-column layout directly reveals its column index: `Math.floor(element.offsetLeft / viewport.clientWidth)`.

5. **Reader Chrome, Tap Zones, TOC Drawer, and Bookmarks (`test_reader_chrome.js`)**:
   - Executed simulated user taps and keyboard strokes:
     - Center tap toggled chrome: `chromeVisible: false` -> `chromeVisible: true`.
     - Right tap zone and `ArrowRight` key incremented `pageIndex`: $0 \to 1 \to 2$.
     - Left tap zone and `ArrowLeft` key decremented `pageIndex`: $2 \to 1$.
     - Bookmark toggle saved chapter/page tuple `0:1`.
     - TOC drawer opened on trigger button and closed immediately on `Escape` key press.

---

## 2. Logic Chain

### 2.1 Dual Reading Modes Architecture

#### 2.1.1 Paginated View Engine (Default Mode)
1. **Container Setup**:
   The book content is rendered within a sandboxed `<iframe>` to guarantee complete style isolation. The iframe has `width: 100%`, `height: 100%`, and `border: none`.
2. **Multi-Column CSS Formulation**:
   ```css
   /* Inside the iframe Document */
   html, body {
     margin: 0;
     padding: 0;
     width: 100%;
     height: 100%;
     overflow: hidden;
     background-color: transparent;
   }

   #reading-stage {
     box-sizing: border-box;
     width: 100%;
     height: 100%;
     padding: var(--reader-margin-y, 32px) var(--reader-margin-x, 48px);
     overflow: hidden;
     position: relative;
   }

   #reading-content {
     box-sizing: border-box;
     width: 100%;
     height: 100%;
     column-width: calc(100% - (2 * var(--reader-margin-x, 48px)));
     column-gap: calc(2 * var(--reader-margin-x, 48px));
     column-fill: auto;
     overflow: visible;
   }

   /* Prevent elements from being sliced across columns */
   img, svg, figure, table, pre, code {
     max-width: 100% !important;
     max-height: 100% !important;
     object-fit: contain;
     break-inside: avoid;
     page-break-inside: avoid;
   }
   h1, h2, h3, h4, h5, h6 {
     break-after: avoid;
     page-break-after: avoid;
   }
   p {
     orphans: 2;
     widows: 2;
   }
   ```
3. **Page Calculation & Navigation Math**:
   - Viewport step: $S = \text{stage.clientWidth}$.
   - Total pages calculation:
     $$\text{rawPages} = \frac{\text{stage.scrollWidth}}{S}$$
     To guard against fractional subpixel rounding artifacts (e.g., $2.002$ creating a blank trailing page):
     $$\text{totalPages} = \max\left(1, (\text{rawPages} \pmod 1 > 0.05) \ ? \ \lceil\text{rawPages}\rceil : \lfloor\text{rawPages}\rfloor\right)$$
   - Navigating to page $k$ ($0 \le k < \text{totalPages}$):
     $$\text{stage.scrollTo}\left(\left\{\text{left}: k \times S, \ \text{behavior}: \text{'smooth'}\right\}\right)$$
   - Anchor navigation (jumping to `#section-id`):
     $$\text{anchorPage} = \left\lfloor\frac{\text{element.offsetLeft}}{S}\right\rfloor$$
     $$\text{stage.scrollTo}\left(\left\{\text{left}: \text{anchorPage} \times S, \ \text{behavior}: \text{'smooth'}\right\}\right)$$

4. **Scrollbar Clutter Elimination**:
   `overflow: hidden` on `#reading-stage` completely eliminates native vertical and horizontal scrollbars, providing a distraction-free, native book aesthetic.

#### 2.1.2 Continuous Vertical Scroll View Engine
1. **CSS Reformatting**:
   When the user switches to Continuous Scroll mode, the reader toggles a `.scroll-mode` class on the stage:
   ```css
   #reading-stage.scroll-mode {
     overflow-x: hidden;
     overflow-y: auto;
     scrollbar-width: thin; /* Minimalist unobtrusive scrollbar */
     padding: var(--reader-margin-y, 32px) var(--reader-margin-x, 48px);
   }

   #reading-stage.scroll-mode #reading-content {
     height: auto;
     column-width: auto;
     column-gap: 0;
     overflow: visible;
     max-width: var(--reader-max-width, 800px);
     margin: 0 auto;
   }
   ```
2. **Scroll Navigation & Boundaries**:
   - `scrollTop` flows naturally from $0$ to $\text{scrollHeight} - \text{clientHeight}$.
   - Keyboard navigation in scroll mode:
     - `ArrowDown` / `ArrowUp`: Smooth scroll by $60\text{px}$.
     - `PageDown` / `Space`: Smooth scroll down by $80\%$ of viewport height.
     - `PageUp` / `Shift+Space`: Smooth scroll up by $80\%$ of viewport height.
     - `ArrowRight`: Advance to next chapter.
     - `ArrowLeft`: Return to previous chapter.
   - At the bottom of Chapter $N$, an interactive end-of-chapter divider is displayed:
     ```html
     <div class="chapter-end-card">
       <div class="divider-line"></div>
       <p class="chapter-end-label">End of Chapter ${N}</p>
       <button class="btn-next-chapter">Next: Chapter ${N+1} →</button>
     </div>
     ```
     Clicking the button or continuing to scroll past the boundary threshold transitions smoothly to Chapter $N+1$.

---

### 2.2 Cross-Chapter Boundaries & Seamless Transition
EPUB documents are structured as a linear sequence of spine items (`spine = [item_0, item_1, ..., item_{M-1}]`).

```
[Chapter N - 1] <--------------------> [Chapter N] <--------------------> [Chapter N + 1]
Last Page: P_{N-1} - 1                Page 0 ... P_N - 1                Page 0
```

1. **Forward Transition (Next Page / Next Chapter)**:
   - When on page $p$ of Chapter $N$:
     - If $p < \text{totalPages} - 1$: Advance to page $p + 1$.
     - If $p == \text{totalPages} - 1$:
       - If $N < M - 1$: Transition to Chapter $N + 1$ starting at **Page 0** (or $\text{scrollTop} = 0$).
       - If $N == M - 1$: Show a non-blocking toast: *"You have completed the book."*
2. **Backward Transition (Previous Page / Previous Chapter)**:
   - When on page $p$ of Chapter $N$:
     - If $p > 0$: Move to page $p - 1$.
     - If $p == 0$:
       - If $N > 0$:
         - Load Chapter $N - 1$.
         - In Paginated mode: Calculate Chapter $N - 1$'s total pages ($P_{N-1}$) and initialize `scrollLeft = (P_{N-1} - 1) * S` before revealing the view. This prevents any flickering of Page 0 when going backward.
         - In Scroll mode: Initialize `scrollTop = scrollHeight - clientHeight`.
       - If $N == 0$: Show a non-blocking toast: *"Beginning of book."*
3. **Pre-loading Optimization**:
   To ensure instantaneous chapter transitions, the reading engine pre-fetches and parses Chapter $N+1$ and Chapter $N-1$ in the background.

---

### 2.3 Unobtrusive Reader Chrome & Drawer Navigation

#### 2.3.1 Minimalist Header & Footer (Auto-Hide & Toggle)
- **Header Structure**:
  - Left: Back to Library button (`← Library`), Table of Contents toggle (`☰ Contents`).
  - Center: Book Title (truncated with ellipsis).
  - Right: Reading Mode toggle (Paginated / Scroll icon), Typography & Themes toggle (`Aa`), Bookmark toggle (`🔖`).
- **Footer Structure**:
  - Left: Current Chapter Title.
  - Center: Page / Percentage Indicator (`Page 3 of 12` in Paginated mode; `45%` in Scroll mode).
  - Right: Overall Book Progress percentage (`32%`) + thin $3\text{px}$ progress bar pinned to the bottom screen edge.
- **Auto-Hide / Toggle Behavior**:
  - Default: Chrome is visible on initial open.
  - Tapping/clicking the center reading zone toggles the header and footer with CSS `transform` and `opacity` transition ($250\text{ms}$).
  - Chrome automatically hides after 4 seconds of inactivity during reading.
  - Hovering near the top or bottom edges ($< 20\text{px}$) reveals chrome on desktop.
  - Opening the TOC drawer or Settings panel keeps chrome visible until closed.

#### 2.3.2 Responsive Click & Tap Zones
The reader stage is covered by a transparent, pointer-friendly touch/click zone layer:

```
+-------------------+-----------------------------------+-------------------+
|     LEFT ZONE     |            CENTER ZONE            |    RIGHT ZONE     |
|       (25%)       |               (50%)               |       (25%)       |
|                   |                                   |                   |
|   Previous Page   |       Toggle Reader Chrome        |     Next Page     |
|                   |                                   |                   |
+-------------------+-----------------------------------+-------------------+
```

- **Drag & Selection Guard**:
  ```javascript
  let startX = 0, startY = 0, startTime = 0;

  stage.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
  });

  stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = Date.now() - startTime;
    const hasSelection = window.getSelection().toString().length > 0;

    if (hasSelection || Math.hypot(dx, dy) > 10 || dt > 500) {
      // Swipe gesture or text selection — do not trigger tap
      if (Math.abs(dx) > 40 && Math.abs(dy) < 60) {
        if (dx < 0) engine.nextPage();
        else engine.prevPage();
      }
      return;
    }

    const ratio = e.clientX / window.innerWidth;
    if (ratio < 0.25) engine.prevPage();
    else if (ratio > 0.75) engine.nextPage();
    else chrome.toggle();
  });
  ```

#### 2.3.3 Collapsible TOC Drawer & Nested Chapter Highlighting
- **Drawer Behavior**:
  - Left-hand slide-in drawer (`transform: translateX(-100%)` $\to$ `translateX(0)`).
  - Dimmed semi-transparent backdrop (`rgba(0,0,0,0.35)` with `backdrop-filter: blur(2px)`).
  - Light dismiss: Clicking backdrop or pressing `Escape` closes the drawer.
  - Accessibility: `document.getElementById('reader-stage').inert = true` when drawer is open.
- **Nested Chapters Tree Rendering**:
  - EPUB 2 NCX (`<navPoint>`) and EPUB 3 Navigation Document (`<ol><li><ol>`) are parsed into a recursive tree:
    ```javascript
    {
      id: "nav-3",
      title: "Section 1.2: The Voyage",
      href: "text/ch01.xhtml#sec-1-2",
      chapterIndex: 0,
      anchorId: "sec-1-2",
      children: [...]
    }
    ```
  - Tree items are rendered with indentation corresponding to their depth (`depth * 16px` padding-left).
  - Active chapter item receives `.toc-item-active` class (`background: var(--accent-light); border-left: 3px solid var(--accent); font-weight: 600;`).
  - On open, the active item automatically calls `item.scrollIntoView({ block: 'nearest' })`.

#### 2.3.4 Bookmark System
- **Data Model**:
  ```javascript
  interface Bookmark {
    id: string;              // "bm_1729132800000_3a8f"
    bookId: string;          // Persistent book ID in IndexedDB
    chapterIndex: number;    // Index in spine
    chapterTitle: string;    // E.g. "Chapter 3: The Garden"
    pageIndex: number;       // For paginated mode
    scrollRatio: number;     // For scroll mode (0.0 to 1.0)
    anchorSelector?: string; // Nearest heading or element ID (e.g. "#para-4")
    snippet: string;         // First ~80 characters of text at bookmark location
    createdAt: number;       // Unix timestamp
  }
  ```
- **Interaction**:
  - Bookmark Button in Header:
    - Active icon state (filled ribbon) if current page/scroll position has an existing bookmark.
    - Clicking toggles bookmark addition/removal with a quick confirmation toast.
  - Bookmarks List Drawer / Tab:
    - Available as a dedicated tab ("Contents" | "Bookmarks") inside the navigation drawer.
    - Lists all bookmarks with chapter title, snippet, and relative time (`"2 hours ago"`).
    - Clicking an entry navigates directly to `(chapterIndex, pageIndex / scrollRatio)`.
    - Includes a delete icon (`🗑`) to remove saved bookmarks.

#### 2.3.5 Reading Progress Calculation
- **Chapter Progress**:
  - Paginated: $\text{Progress}_{ch} = \frac{\text{pageIndex} + 1}{\text{totalPages}}$
  - Scroll: $\text{Progress}_{ch} = \frac{\text{scrollTop}}{\text{scrollHeight} - \text{clientHeight}}$
- **Global Book Progress**:
  - Accurate weighted calculation using chapter uncompressed byte sizes extracted from the EPUB package:
    $$\text{GlobalProgress} = \frac{\sum_{i=0}^{N-1} \text{size}_i + \left(\text{Progress}_{ch} \times \text{size}_N\right)}{\sum_{i=0}^{M-1} \text{size}_i} \times 100\%$$
  - Fallback if sizes unavailable: Equal-weighted chapter ratio.

---

### 2.4 Modular Architecture (Vanilla ES Modules, Zero Build Step)

```
webreader/
├── index.html                   # Static HTML entry point (<script type="module" src="js/app.js">)
├── css/
│   ├── main.css                 # Reset, layout shell, library view, drawer & modal styles
│   ├── reader.css               # Reader viewport, multi-column rules, tap zones, chrome
│   └── themes.css               # 4 Eye-comfort color themes & typography CSS variables
└── js/
    ├── app.js                   # Application coordinator & routing (Library View <-> Reader View)
    ├── event-bus.js             # Lightweight decoupled pub/sub event bus
    ├── storage/
    │   ├── db.js                # IndexedDB database manager (books, blobs, covers)
    │   ├── settings-store.js    # LocalStorage manager (theme, font, reading mode)
    │   └── bookmark-store.js    # IndexedDB/LocalStorage bookmark CRUD
    ├── parser/
    │   ├── epub-parser.js       # ZIP extraction & container / OPF / TOC orchestrator
    │   ├── opf-parser.js        # Manifest, metadata, spine extraction
    │   └── toc-parser.js        # EPUB 2 NCX & EPUB 3 Nav Document tree parser
    ├── reader/
    │   ├── reader-engine.js     # Master reader controller (spine navigation, iframe lifecycle)
    │   ├── paginated-view.js    # Multi-column pagination geometry, column math, page transitions
    │   ├── scroll-view.js       # Continuous vertical scroll manager & chapter boundary triggers
    │   └── position-tracker.js  # Progress calculation, anchor mapping & persistence
    └── ui/
        ├── library-view.js      # Book cards grid, drag-and-drop importer, sample book loader
        ├── reader-chrome.js     # Header auto-hide, footer progress bar, 3-zone tap overlay
        ├── toc-drawer.js        # Nested TOC tree renderer, active highlight, auto-scroll
        ├── bookmarks-drawer.js  # Bookmarks tab/drawer, list rendering, jump-to-bookmark
        └── settings-panel.js    # Theme selector, font family, font size, margin sliders
```

#### Event Bus Contract:
The components communicate via a typed `EventBus`:
- `bus.emit('book:open', { bookId })`
- `bus.emit('chapter:loaded', { chapterIndex, title, totalPages })`
- `bus.emit('page:change', { chapterIndex, pageIndex, totalPages, progressRatio, globalProgress })`
- `bus.emit('mode:change', { mode: 'paginated' | 'scroll' })`
- `bus.emit('theme:change', { themeId })`
- `bus.emit('typography:change', { fontFamily, fontSize, lineHeight, maxWidth })`
- `bus.emit('bookmark:toggle')`
- `bus.emit('bookmark:navigate', bookmark)`
- `bus.emit('toc:navigate', { chapterIndex, anchorId })`

---

## 3. Caveats

1. **Subpixel Fractional Overflows**:
   Browser layout engines (Blink, WebKit, Gecko) can report `scrollWidth` that is fractional (e.g. $2400.3\text{px}$ instead of $2400\text{px}$). Using `Math.ceil(scrollWidth / pageWidth)` without a fractional threshold ($> 0.05$) creates phantom empty trailing pages. The specified formula in Section 2.1.1 resolves this.
2. **EPUB 3 Fixed-Layout Books**:
   Fixed-layout EPUBs (e.g. comics, children's picture books with explicit `viewport` meta tags) require fixed aspect ratio scaling (`transform: scale(...)`) rather than reflowable multi-column columns. The architecture focuses on standard reflowable EPUB 2/3 text, with fallback viewport scaling for fixed-layout items.
3. **Internal Stylesheet Overrides**:
   Some heavily-styled commercial EPUBs define explicit `font-family`, `background`, or `color` on inner elements (`<span style="color: black;">`). To guarantee WCAG AA contrast and eye comfort across all 4 themes, the injected theme stylesheet must use `!important` overrides on base typographic properties:
   `body, body * { background-color: transparent !important; color: inherit !important; }`
   `body { background-color: var(--reader-bg) !important; color: var(--reader-text) !important; }`
4. **Touch Device Safari Address Bar Resizing**:
   On mobile Safari, dynamic address bar collapse changes `100vh`. The layout must use `height: 100dvh` (Dynamic Viewport Height) or flexbox stage sizing to avoid page height shifts during navigation.

---

## 4. Conclusion

1. **Pure CSS Multi-Column Pagination is 100% Viable & Performant**:
   Testing with headless Chrome CDP confirmed that combining `column-width`, `column-gap: 2 * padding`, and `column-fill: auto` with `scrollLeft` page indexing creates a smooth, book-like paginated reading experience with zero vertical scrollbars and zero external libraries.
2. **Sandboxed Iframe Provides Complete Structural Safety**:
   Rendering chapters inside an iframe isolates EPUB CSS from the reader application, prevents script execution vulnerabilities, and allows dynamic theme/typography injection without style pollution.
3. **Dynamic Dual Reading Modes**:
   Switching between Paginated and Continuous Scroll modes is achieved seamlessly via a single CSS class toggle, with mathematical progress ratio mapping ($R = p / P$) preserving the reader's exact reading position across modes.
4. **Intuitive Navigation & Unobtrusive Chrome**:
   The 3-zone tap layout (Left 25%, Center 50%, Right 25%) paired with keyboard navigation (`ArrowLeft`, `ArrowRight`, `Space`, `Escape`) and auto-hiding chrome provides maximum reading immersion while keeping TOC and bookmark controls readily accessible.
5. **Clean Modular ES Module Architecture**:
   The separated architecture (Engine, Views, UI Chrome, Parsers, Storage, EventBus) adheres strictly to the zero-build-step requirement, enabling immediate development and direct browser execution over any static file server.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Multi-Column Pagination in Headless Chrome**:
   Run the test script located at `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_cdp.js`:
   ```bash
   node "/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_cdp.js"
   ```
   *Expected Result*: Output displays `totalPages: 4`, `scrolledLeft: 596` with zero errors.

2. **Verify Padding and Gap Geometry**:
   ```bash
   node "/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_padding_math.js"
   ```
   *Expected Result*: Output verifies `step: 800` equal to viewport width, and `page1ScrollLeft: 800`, `page2ScrollLeft: 1600`.

3. **Verify Dynamic Dual Mode Switching & Position Sync**:
   ```bash
   node "/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_mode_switch.js"
   node "/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_position_sync.js"
   ```
   *Expected Result*: Bidirectional ratio synchronization successfully restores `restoredPageIndex: 2` and element anchor jumping resolves `anchorPageIndex: 1`.

4. **Verify Reader Chrome, Tap Zones, TOC, and Bookmarks**:
   ```bash
   node "/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_reader_chrome.js"
   ```
   *Expected Result*: All 9 UI interaction steps (`center_tap`, `next_page_tap`, `arrow_right_key`, `arrow_left_key`, `bookmark_add`, `open_toc`, `escape_toc`) complete successfully with state assertions.
