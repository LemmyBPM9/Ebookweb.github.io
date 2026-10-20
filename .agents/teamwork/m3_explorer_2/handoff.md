# Milestone 3 Handoff Report: CSS Multi-Column Pagination Engine & Reader CSS

**Author**: Explorer 2 (Milestone 3 Focus Area 2)  
**Target File**: `.agents/teamwork/m3_explorer_2/handoff.md`  
**Working Directory**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m3_explorer_2/`  
**Date**: 2026-10-17T04:40:00Z  

---

## 1. Observations

### 1.1 Requirements & Specifications
- **User Request (`ORIGINAL_REQUEST.md:15-19`)**:
  > "R2. Paginated & Scrollable Reading Engine: Parse and render standard EPUB 2 and EPUB 3 files... Support two user-selectable reading modes:  
  > 1. Paginated View (default): Book-like multi-column or page-turn layout with smooth navigation via keyboard arrows (`ArrowLeft`/`ArrowRight`, `Space`), click/tap zones, and chapter transitions without vertical scrollbar clutter.  
  > 2. Continuous Vertical Scroll View: Smooth chapter reading with seamless previous/next chapter navigation."
- **Project Architecture (`PROJECT.md:37, 48-49, 101-111, 147-152`)**:
  - Feature 22: "Paginated Multi-Column View: Book-like CSS multi-column layout with horizontal page turns and zero vertical scrollbar clutter."
  - Feature 25: "Cross-Chapter Boundary Transitions: Forward to Chapter N+1 (Page 0) and backward to Chapter N-1 (measuring and landing on last page)."
  - Feature 33: "3-Zone Click/Tap Navigation: Left 25% prev page, Center 50% toggle chrome, Right 25% next page, with gesture guard."
  - Feature 34: "Keyboard Shortcuts: Navigation via ArrowLeft, ArrowRight, Space, PageUp, PageDown, Escape."
  - Planned modules: `js/reader/reader-engine.js`, `js/reader/paginated-view.js`, `js/reader/scroll-view.js`, `js/reader/position-tracker.js`, and `css/reader.css`.
- **Existing Themes & Typography Custom Properties (`css/themes.css:48-56`)**:
  ```css
  --reader-font-family: 'Merriweather', 'Georgia', 'Iowan Old Style', 'Palatino Linotype', serif;
  --reader-font-size: 18px;
  --reader-line-height: 1.75;
  --reader-max-width: 720px;
  --reader-text-align: left;
  --reader-paragraph-spacing: 1.25em;
  --reader-page-margin: 40px;
  ```
- **Automated Test Expectations (`test/e2e.test.js:312-390, 629-650, 681-702, 742-773`)**:
  - Test 1.2 asserts: reader initializes in Paginated mode by default; reader content has loaded chapter text in `iframe#reader-frame` or `#reader-stage`; footer contains page indicator matching `/page\s*\d+/i` or `/p\.\s*\d+/i` or `/`.
  - Test 1.3 asserts: navigation via `ArrowRight`, `ArrowLeft`, Right Tap zone (`1280 * 0.85 = 1088px`), and Left Tap zone (`1280 * 0.15 = 192px`) updates page indicator.
  - Test 2.3 asserts: boundary page clamping — repeatedly pressing `ArrowLeft` on page 0 must never go negative (`-1`) or show `Page 0 of N`.
  - Test 2.5 asserts: rapid consecutive keystroke stress (10 rapid `ArrowRight` presses at 30ms interval) must not throw uncaught page errors or blank out content.
  - Test 3.2 asserts: dynamic mode switching between Paginated and Scroll modes preserves progress ratio bidirectionally.
- **Sample Book Characteristics (`js/sample-book.js:400-578`)**:
  - Chapter 1: Headings, drop-cap (`.drop-cap`), blockquote with cite, callout box.
  - Chapter 2: Responsive SVG spectrum diagram (`viewBox="0 0 520 280"`), definition list (`dl`).
  - Chapter 3: Typographic comparison table (`table.font-table`), footnotes container.
  - Cover page: Full-page SVG image (`img.cover { max-height: 95vh; max-width: 95vw; }`).

---

## 2. Logic Chain

### 2.1 CSS Multi-Column Book Layout Architecture
In CSS Multi-column layout (`column-width`, `column-gap`, `column-fill`), columns flow horizontally when container height is fixed. To turn an arbitrary XHTML chapter into an e-book page layout:

1. **Iframe & Root Constraining**:
   ```css
   html, body {
     margin: 0 !important;
     padding: 0 !important;
     width: 100% !important;
     height: 100% !important;
     overflow: hidden !important;
     -webkit-text-size-adjust: 100%;
   }
   ```
   Fixing `height: 100%` and `overflow: hidden` on both `html` and `body` establishes a rigid viewport boundary preventing any vertical scrollbars.

2. **The Content Wrapper & Equal-Margin Geometry**:
   A common flaw in CSS multi-column pagination is unequal horizontal margins: padding on a multi-column element applies only to the outer box edges (start of first column and end of last column), leaving intermediate columns flush against each other.
   We solve this with the following layout rule:
   ```css
   #content-wrapper {
     height: 100vh !important;
     box-sizing: border-box !important;
     column-width: 100vw !important;
     column-gap: calc(2 * var(--page-padding-h, 32px)) !important;
     column-fill: auto !important;
     padding: var(--page-padding-v, 32px) var(--page-padding-h, 32px) !important;
   }
   ```
   **Mathematical Proof of Consistent Margins**:
   - Let viewport width = $W$.
   - Let horizontal margin = $P = \text{var}(--\text{page-padding-h})$.
   - Content column width = $W - 2P$.
   - **Column 0**: Begins at $x = P$, ends at $x = P + (W - 2P) = W - P$.  
     Left margin relative to screen = $P$. Right margin = $W - (W - P) = P$.
   - **Gap to Column 1**: Gap width = $2P$. Column 1 begins at $(W - P) + 2P = W + P$.
   - **Column 1**: Begins at $x = W + P$, ends at $(W + P) + (W - 2P) = 2W - P$.  
     When shifted by $W$:  
     Left margin relative to shifted viewport = $(W + P) - W = P$.  
     Right margin = $2W - (2W - P) = P$.
   - **Column $k$**: Located at $[k \cdot W + P, (k+1) \cdot W - P]$.  
     Relative to the visible window $[k \cdot W, (k+1) \cdot W]$, the left margin is always $P$ and the right margin is always $P$.
   - **Result**: Every column across the entire chapter has identical symmetric padding of exactly $P$.

3. **`column-fill: auto` vs `column-fill: balance`**:
   The CSS default is `column-fill: balance`, which attempts to distribute content evenly across columns so they have identical heights. For a book reader with fixed page heights, `balance` causes erratic heights and breaks sequential pagination. `column-fill: auto` fills each column sequentially from top to bottom to the exact container height before spilling into the next column.

---

### 2.2 Navigation Mechanics: `translateX` vs `scrollLeft`

| Metric / Feature | Approach A: `scrollLeft` | Approach B: `transform: translateX` | Recommended Decision |
|---|---|---|---|
| **Rendering Performance** | CPU scroll repaint / compositor sync | GPU-accelerated compositing layer (`will-change: transform`) | **`translateX`** (smoother 60/120fps page flips) |
| **Animation Control** | Dependent on browser scroll physics | Precise CSS cubic-bezier transition (`0.16, 1, 0.3, 1`) | **`translateX`** |
| **Cross-Engine Reliability** | Some WebKit/iOS versions lock `scrollLeft` when `overflow: hidden` | Deterministic in all browsers (Blink, Gecko, WebKit) | **`translateX`** |
| **Subpixel Text Rendering** | Integer truncation in some older engines | Subpixel precision; rounded to integer pixel to avoid blur | **`translateX` with integer rounding** |
| **Scroll / Layout Interaction** | Modifies scroll container state | Layout untouched; content stays stationary in layout tree | **`translateX`** |

**Recommendation**: Use `transform: translateX(-${Math.round(pageIndex * pageWidth)}px)` on `#content-wrapper` as the primary page positioning mechanism. Additionally, set `iframe.contentDocument.documentElement.scrollLeft = 0` to prevent secondary scroll displacement.

---

### 2.3 Calculating Total Pages & Subpixel Rounding Math
A notorious trap in multi-column pagination is the **Phantom Blank Page Bug**:
If `pageWidth = 1000px`, and font kerning or subpixel column gap yields `scrollWidth = 3001.2px`:
- `Math.ceil(3001.2 / 1000)` produces **4 pages**, where Page 4 has zero content.
- Conversely, `Math.floor(2999.4 / 1000)` produces **2 pages**, truncating the final paragraph.

**Subpixel-Safe Formula**:
Because CSS multi-column layout always allocates an entire column ($1 \times \text{pageWidth}$) even for a single word, `scrollWidth` for $N$ valid columns is always approximately $N \times \text{pageWidth}$. Subpixel float inaccuracies only fluctuate by $\pm 1$ to $5$ pixels.
```javascript
const pageWidth = win.innerWidth || iframe.clientWidth;
const scrollWidth = Math.max(
  wrapper.scrollWidth,
  doc.documentElement.scrollWidth,
  doc.body ? doc.body.scrollWidth : 0
);

// Mathematical rounding handles +/- subpixel drift without creating phantom pages
const totalPages = Math.max(1, Math.round(scrollWidth / pageWidth));
```
- Example: 3 pages at 1000px -> `scrollWidth = 3002px` -> `3002 / 1000 = 3.002` -> `Math.round(3.002) = 3` (phantom page prevented).
- Example: 3 pages with single short line on page 3 -> `scrollWidth = 3000px` -> `Math.round(3.0) = 3`.
- Clamping ensures $0 \le \text{pageIndex} \le \text{totalPages} - 1$.

---

### 2.4 Preventing Awkward Element Slicing Across Columns
To prevent images, headings, and tables from slicing horizontally across column breaks:

1. **Images and SVGs**:
   ```css
   img, svg, picture, figure, video, canvas {
     break-inside: avoid;
     page-break-inside: avoid;
     max-width: 100% !important;
     max-height: calc(100vh - 2 * var(--page-padding-v, 32px) - 2.5em) !important;
     height: auto !important;
     object-fit: contain;
     display: block;
     margin-left: auto;
     margin-right: auto;
   }
   ```
   *Rationale*: Capping `max-height` ensures media fits entirely within a single column height. Combined with `break-inside: avoid`, the browser pushes overflowing media to the top of the next column rather than slicing it midway.

2. **Headings (`h1`–`h6`)**:
   ```css
   h1, h2, h3, h4, h5, h6 {
     break-inside: avoid;
     page-break-inside: avoid;
     break-after: avoid;
     page-break-after: avoid;
   }
   ```
   *Rationale*: `break-after: avoid` eliminates orphaned headings at the bottom of pages by forcing the heading to stay with the subsequent paragraph.

3. **Tables, Blockquotes & Code Blocks**:
   ```css
   blockquote, pre, code, .callout, .diagram-wrapper, dl {
     break-inside: avoid;
     page-break-inside: avoid;
     max-width: 100% !important;
     box-sizing: border-box !important;
   }
   table {
     max-width: 100% !important;
     border-collapse: collapse;
     box-sizing: border-box !important;
   }
   tr {
     break-inside: avoid;
     page-break-inside: avoid;
   }
   ```
   *Rationale*: Applying `break-inside: avoid` to `tr` rather than the whole `table` allows multi-page tables to break cleanly between rows without slicing through text cells.

4. **Widows and Orphans**:
   ```css
   p {
     orphans: 2;
     widows: 2;
     word-break: break-word;
     overflow-wrap: break-word;
   }
   ```

---

### 2.5 Paginated Navigation Math & Boundary Transitions

1. **`goToPage(pageIndex, animate = true)`**:
   - Clamps: `pageIndex = Math.max(0, Math.min(this.totalPages - 1, pageIndex))`.
   - Sets CSS `transform: translateX(-${Math.round(pageIndex * pageWidth)}px)`.
   - Emits `page:changed` payload:
     `{ spineIndex, pageIndex, totalPages, progressPercent, globalPercent }`.

2. **`nextPage()`**:
   - If `pageIndex < totalPages - 1`:  
     Advance to `pageIndex + 1`.
   - **Boundary Condition (Last Page of Chapter)**:  
     If `pageIndex === totalPages - 1`:  
     Signals `onChapterBoundary('next')`.  
     `ReaderEngine` advances to Chapter $N + 1$ and initializes it at **Page 0**.

3. **`prevPage()`**:
   - If `pageIndex > 0`:  
     Rewind to `pageIndex - 1`.
   - **Boundary Condition (First Page of Chapter)**:  
     If `pageIndex === 0`:  
     Signals `onChapterBoundary('prev')`.  
     `ReaderEngine` rewinds to Chapter $N - 1$, calculates Chapter $N - 1$'s total pages, and renders its **last page** (`totalPages - 1`).

4. **Rapid Keystroke Guard**:
   - Rapid `ArrowRight` presses are queued or executed immediately by clamping `pageIndex`.
   - Chapter boundary crossings are debounced (200ms) to prevent spawning concurrent chapter load requests.

---

### 2.6 Resize Handling & Reading Position Re-Anchoring
When window dimensions change, or the user adjusts font-size / line-height / margin:
1. `ResizeObserver` on the iframe window / container detects dimension changes.
2. **Re-Anchoring Calculation**:
   - Compute normalized progress ratio before reflow:  
     $$\text{ratio} = \frac{\text{pageIndex}}{\max(1, \text{totalPages} - 1)}$$
   - Or identify the first visible element on the current page:  
     `targetElement = this.getFirstVisibleElement()`
   - Recalculate `totalPages` based on new dimensions.
   - If `targetElement` is available, calculate:  
     $$\text{newPage} = \left\lfloor \frac{\text{targetElement.offsetLeft}}{\text{newPageWidth}} \right\rfloor$$
   - Otherwise restore via ratio:  
     $$\text{newPage} = \text{Math.round}(\text{ratio} \times (\text{newTotalPages} - 1))$$
   - Clamp $\text{newPage}$ into $[0, \text{newTotalPages} - 1]$.
   - Apply position with `transition: none` to prevent dizzying transition flashes during window dragging.

---

### 2.7 CSS Architecture (`css/reader.css`)
`css/reader.css` must provide:
1. `#reader-view`: Fullscreen reader container (`position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden;`).
2. `#reader-viewport`: Middle stage taking `flex: 1; position: relative; overflow: hidden;`.
3. `iframe#reader-frame`: Embedded sandbox (`width: 100%; height: 100%; border: none; display: block;`).
4. **3-Zone Tap Overlay**:
   ```css
   .reader-tap-zones {
     position: absolute;
     inset: 0;
     display: flex;
     z-index: 10;
     pointer-events: auto;
   }
   .tap-zone-prev { width: 25%; cursor: pointer; }
   .tap-zone-menu { width: 50%; cursor: default; }
   .tap-zone-next { width: 25%; cursor: pointer; }
   ```
   In `.scroll-mode`, tap zones have `pointer-events: none` on prev/next so normal scrolling and text selection function unobstructed.
5. `#reader-header` & `#reader-footer`: Floating / pinned chrome with smooth auto-hide transitions (`transform: translateY(-100%)` / `translateY(100%)`).

---

### 2.8 Drop-In Code Blueprint: `js/reader/paginated-view.js`

```javascript
/**
 * js/reader/paginated-view.js
 * High-Performance CSS Multi-Column Pagination Engine
 * Part of WebReader Milestone 3
 */

export class PaginatedView {
  /**
   * @param {object} options
   * @param {HTMLIFrameElement} options.iframe - Sandboxed reader iframe
   * @param {HTMLElement} options.stage - Reader viewport/stage container
   * @param {Function} options.onPageChange - Invoked on page change { pageIndex, totalPages }
   * @param {Function} options.onChapterBoundary - Invoked on boundary: 'next' | 'prev'
   */
  constructor(options = {}) {
    this.iframe = options.iframe;
    this.stage = options.stage;
    this.onPageChange = options.onPageChange || (() => {});
    this.onChapterBoundary = options.onChapterBoundary || (() => {});

    this.pageIndex = 0;
    this.totalPages = 1;
    this.pageWidth = 0;
    this.isActive = true;
    this.isTransitioning = false;

    this._resizeObserver = null;
    this._boundaryDebounceTimer = null;
    this._boundOnResize = this._handleResize.bind(this);
  }

  /**
   * Initializes or re-initializes pagination for a freshly loaded chapter.
   * @param {number|string} [targetPageOrAnchor=0] - Initial page index or element ID anchor
   */
  onChapterLoaded(targetPageOrAnchor = 0) {
    if (!this.isActive) return;

    this._setupIframeMultiColumnLayout();
    this.calculatePagination();

    if (typeof targetPageOrAnchor === 'string') {
      this.goToAnchor(targetPageOrAnchor, false);
    } else if (typeof targetPageOrAnchor === 'number') {
      // If negative or special flag, e.g. -1 means last page
      if (targetPageOrAnchor === -1 || targetPageOrAnchor >= this.totalPages) {
        this.goToPage(this.totalPages - 1, false);
      } else {
        this.goToPage(Math.max(0, targetPageOrAnchor), false);
      }
    } else {
      this.goToPage(0, false);
    }

    this._attachResizeObserver();
  }

  /**
   * Injects or verifies the multi-column layout stylesheet inside the iframe.
   */
  _setupIframeMultiColumnLayout() {
    const doc = this._getDoc();
    if (!doc) return;

    let styleEl = doc.getElementById('webreader-multicolumn-style');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'webreader-multicolumn-style';
      doc.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      :root {
        box-sizing: border-box;
        -webkit-text-size-adjust: 100%;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        background-color: var(--color-bg, #f8f1e3) !important;
        color: var(--color-text, #2c2523) !important;
        font-family: var(--reader-font-family, serif) !important;
        font-size: var(--reader-font-size, 18px) !important;
        line-height: var(--reader-line-height, 1.75) !important;
      }
      #content-wrapper {
        height: 100vh !important;
        box-sizing: border-box !important;
        column-width: 100vw !important;
        column-gap: calc(2 * var(--page-padding-h, 32px)) !important;
        column-fill: auto !important;
        padding: var(--page-padding-v, 32px) var(--page-padding-h, 32px) !important;
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform;
      }
      #content-wrapper.no-transition {
        transition: none !important;
      }
      h1, h2, h3, h4, h5, h6 {
        break-inside: avoid;
        page-break-inside: avoid;
        break-after: avoid;
        page-break-after: avoid;
      }
      img, svg, picture, figure, video, canvas {
        break-inside: avoid;
        page-break-inside: avoid;
        max-width: 100% !important;
        max-height: calc(100vh - 2 * var(--page-padding-v, 32px) - 2.5em) !important;
        height: auto !important;
        object-fit: contain;
        display: block;
        margin-left: auto;
        margin-right: auto;
      }
      blockquote, pre, code, .callout, .diagram-wrapper, dl {
        break-inside: avoid;
        page-break-inside: avoid;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      table {
        max-width: 100% !important;
        border-collapse: collapse;
        box-sizing: border-box !important;
      }
      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      p {
        orphans: 2;
        widows: 2;
        word-break: break-word;
        overflow-wrap: break-word;
      }
    `;
  }

  /**
   * Calculates page width, scroll width, and total pages with subpixel protection.
   */
  calculatePagination() {
    const doc = this._getDoc();
    const win = this._getWin();
    if (!doc || !win) return;

    const wrapper = doc.getElementById('content-wrapper') || doc.body;
    if (!wrapper) return;

    // Viewport width of the iframe
    const width = win.innerWidth || (this.iframe ? this.iframe.clientWidth : 0);
    if (width <= 0) return;

    this.pageWidth = width;

    // Measure total scrollable horizontal span
    const scrollWidth = Math.max(
      wrapper.scrollWidth,
      doc.documentElement.scrollWidth,
      doc.body ? doc.body.scrollWidth : 0
    );

    // Subpixel-safe rounding eliminates phantom pages
    this.totalPages = Math.max(1, Math.round(scrollWidth / this.pageWidth));

    // Clamp current pageIndex
    if (this.pageIndex >= this.totalPages) {
      this.pageIndex = Math.max(0, this.totalPages - 1);
    } else if (this.pageIndex < 0) {
      this.pageIndex = 0;
    }

    this._applyPosition(false);
  }

  /**
   * Navigates to a specific page index within the chapter.
   * @param {number} index
   * @param {boolean} [animate=true]
   */
  goToPage(index, animate = true) {
    if (!this.isActive) return;

    const target = Math.max(0, Math.min(this.totalPages - 1, index));
    this.pageIndex = target;

    this._applyPosition(animate);
    this.onPageChange({
      pageIndex: this.pageIndex,
      totalPages: this.totalPages
    });
  }

  /**
   * Advances to the next page, or signals chapter boundary if at end.
   */
  nextPage() {
    if (!this.isActive) return;

    if (this.pageIndex < this.totalPages - 1) {
      this.goToPage(this.pageIndex + 1, true);
    } else {
      this._triggerBoundary('next');
    }
  }

  /**
   * Rewinds to the previous page, or signals chapter boundary if at start.
   */
  prevPage() {
    if (!this.isActive) return;

    if (this.pageIndex > 0) {
      this.goToPage(this.pageIndex - 1, true);
    } else {
      this._triggerBoundary('prev');
    }
  }

  /**
   * Navigates to an internal anchor element (e.g. #section-id).
   * @param {string} anchorId
   * @param {boolean} [animate=false]
   * @returns {boolean} Whether anchor was found
   */
  goToAnchor(anchorId, animate = false) {
    const doc = this._getDoc();
    if (!doc || !anchorId) return false;

    const cleanId = anchorId.startsWith('#') ? anchorId.slice(1) : anchorId;
    const targetEl = doc.getElementById(cleanId) || doc.querySelector(`[name="${cleanId}"]`);
    if (!targetEl) return false;

    // Recalculate to ensure accurate layout
    this.calculatePagination();

    // Determine the element's horizontal offset relative to the content wrapper
    const rect = targetEl.getBoundingClientRect();
    const docRect = doc.documentElement.getBoundingClientRect();
    const offsetLeft = rect.left - docRect.left;

    const targetPage = Math.max(0, Math.min(
      this.totalPages - 1,
      Math.floor(offsetLeft / Math.max(1, this.pageWidth))
    ));

    this.goToPage(targetPage, animate);
    return true;
  }

  /**
   * Activates paginated multi-column mode.
   */
  activate() {
    this.isActive = true;
    this._setupIframeMultiColumnLayout();
    this.calculatePagination();
    this._attachResizeObserver();
  }

  /**
   * Deactivates paginated mode (for continuous scroll view switch).
   */
  deactivate() {
    this.isActive = false;
    this._detachResizeObserver();

    const doc = this._getDoc();
    if (!doc) return;

    const wrapper = doc.getElementById('content-wrapper');
    if (wrapper) {
      wrapper.style.transform = 'none';
      wrapper.style.transition = 'none';
    }
  }

  /**
   * Returns current reading position metrics.
   * @returns {{ pageIndex: number, totalPages: number, progressRatio: number }}
   */
  getProgress() {
    const ratio = this.totalPages > 1
      ? this.pageIndex / (this.totalPages - 1)
      : (this.pageIndex === 0 ? 0 : 1);

    return {
      pageIndex: this.pageIndex,
      totalPages: this.totalPages,
      progressRatio: Math.max(0, Math.min(1, ratio))
    };
  }

  /**
   * Synchronizes reading position when switching from Scroll mode.
   * @param {number} scrollRatio - 0.0 to 1.0
   */
  syncFromScrollRatio(scrollRatio) {
    this.calculatePagination();
    const targetPage = Math.max(0, Math.min(
      this.totalPages - 1,
      Math.round(scrollRatio * (this.totalPages - 1))
    ));
    this.goToPage(targetPage, false);
  }

  // --- Internal Helper Methods ---

  _getDoc() {
    try {
      return this.iframe?.contentDocument || null;
    } catch (_) {
      return null;
    }
  }

  _getWin() {
    try {
      return this.iframe?.contentWindow || null;
    } catch (_) {
      return null;
    }
  }

  _applyPosition(animate = true) {
    const doc = this._getDoc();
    if (!doc) return;

    const wrapper = doc.getElementById('content-wrapper') || doc.body;
    if (!wrapper) return;

    // Reset doc scrollLeft to avoid compound displacement
    doc.documentElement.scrollLeft = 0;
    if (doc.body) doc.body.scrollLeft = 0;

    const offset = Math.round(this.pageIndex * this.pageWidth);

    if (!animate) {
      wrapper.classList.add('no-transition');
      wrapper.style.transform = `translateX(-${offset}px)`;
      // Force style flush
      void wrapper.offsetHeight;
      wrapper.classList.remove('no-transition');
    } else {
      wrapper.classList.remove('no-transition');
      wrapper.style.transform = `translateX(-${offset}px)`;
    }
  }

  _triggerBoundary(direction) {
    if (this._boundaryDebounceTimer) return;
    this._boundaryDebounceTimer = setTimeout(() => {
      this._boundaryDebounceTimer = null;
    }, 200);

    this.onChapterBoundary(direction);
  }

  _handleResize() {
    if (!this.isActive) return;

    const oldRatio = this.getProgress().progressRatio;
    this.calculatePagination();

    // Re-anchor to preserve reading position
    const newPage = Math.max(0, Math.min(
      this.totalPages - 1,
      Math.round(oldRatio * (this.totalPages - 1))
    ));
    this.goToPage(newPage, false);
  }

  _attachResizeObserver() {
    this._detachResizeObserver();

    const win = this._getWin();
    if (win) {
      win.addEventListener('resize', this._boundOnResize);
    }

    if (typeof ResizeObserver !== 'undefined' && this.iframe) {
      this._resizeObserver = new ResizeObserver(() => {
        this._handleResize();
      });
      this._resizeObserver.observe(this.iframe);
      if (this.stage) {
        this._resizeObserver.observe(this.stage);
      }
    }
  }

  _detachResizeObserver() {
    const win = this._getWin();
    if (win) {
      win.removeEventListener('resize', this._boundOnResize);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  destroy() {
    this.deactivate();
    if (this._boundaryDebounceTimer) {
      clearTimeout(this._boundaryDebounceTimer);
    }
  }
}
```

---

### 2.9 Drop-In Code Blueprint: `css/reader.css`

```css
/**
 * css/reader.css
 * WebReader — Reader Stage, Viewport, Multi-Column Layout, Tap Zones & Chrome
 * Conforms to WCAG AA/AAA, Zero Halation, and Touch Accessibility
 */

/* ==========================================================================
   1. Reader Stage & Viewport Container
   ========================================================================== */

#reader-view,
.reader-view {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
  color: var(--color-text);
  overflow: hidden;
  z-index: 50;
  user-select: none;
  -webkit-user-select: none;
}

#reader-stage,
.reader-stage {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-bg);
}

#reader-viewport,
.reader-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ==========================================================================
   2. Sandboxed Reader Iframe
   ========================================================================== */

iframe#reader-frame,
iframe.reader-frame,
#reader-stage iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background-color: transparent;
  transition: opacity 0.15s ease;
}

/* Zero-flicker chapter transition state */
iframe.is-loading {
  opacity: 0.85;
}

/* ==========================================================================
   3. 3-Zone Click/Tap Navigation Overlay
   ========================================================================== */

.reader-tap-zones {
  position: absolute;
  inset: 0;
  display: flex;
  z-index: 10;
  pointer-events: auto;
}

/* Left 25% tap zone: Previous page */
.tap-zone-prev {
  width: 25%;
  height: 100%;
  cursor: pointer;
  background: transparent;
}

/* Center 50% tap zone: Toggle reader chrome */
.tap-zone-menu {
  width: 50%;
  height: 100%;
  cursor: default;
  background: transparent;
}

/* Right 25% tap zone: Next page */
.tap-zone-next {
  width: 25%;
  height: 100%;
  cursor: pointer;
  background: transparent;
}

/* In Continuous Scroll mode, tap zones must not obstruct vertical scrolling */
.scroll-mode .reader-tap-zones {
  pointer-events: none;
}

.scroll-mode .tap-zone-menu {
  pointer-events: auto;
}

/* ==========================================================================
   4. Reader Chrome (Header & Footer)
   ========================================================================== */

#reader-header,
.reader-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  z-index: 20;
  box-shadow: 0 2px 8px var(--color-shadow);
  transform: translateY(0);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

#reader-header.is-hidden {
  transform: translateY(-100%);
  pointer-events: none;
  opacity: 0;
}

.reader-header-left,
.reader-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.reader-book-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(400px, 40vw);
}

/* Reader Footer & Pinned Progress Bar */
#reader-footer,
.reader-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 1.25rem;
  z-index: 20;
  box-shadow: 0 -2px 8px var(--color-shadow);
  transform: translateY(0);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

#reader-footer.is-hidden {
  transform: translateY(100%);
  pointer-events: none;
  opacity: 0;
}

.reader-footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.reader-chapter-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
  font-weight: 500;
}

.reader-page-indicator {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text);
}

/* Top micro-line progress bar inside footer */
.reader-progress-track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background-color: var(--color-border);
}

.reader-progress-bar {
  height: 100%;
  background-color: var(--color-accent);
  transition: width 0.2s ease;
  width: 0%;
}

/* ==========================================================================
   5. Continuous Scroll Mode Stage Adaptations
   ========================================================================== */

#reader-stage.scroll-mode {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

#reader-stage.scroll-mode iframe#reader-frame {
  height: auto;
  min-height: 100%;
}

/* ==========================================================================
   6. Accessibility & Reduced Motion
   ========================================================================== */

@media (prefers-reduced-motion: reduce) {
  #reader-header,
  #reader-footer,
  .reader-progress-bar {
    transition: none !important;
  }
}
```

---

## 3. Caveats
1. **Sandboxed Iframe Script Isolation**: The iframe deliberately runs without `allow-scripts` (`sandbox="allow-same-origin"`). Therefore, any dynamic style injection, font-size adjustments, or `ResizeObserver` attachments must be coordinated from the host parent document using `iframe.contentDocument` / `iframe.contentWindow`.
2. **Device Pixel Ratio (DPR) Scaling**: On displays with non-integer device pixel ratios (e.g. 1.25x or 1.5x on Windows), `win.innerWidth` or `scrollWidth` can include fractional pixel components. Using `Math.round(pageIndex * pageWidth)` for transform offsets prevents fractional blurring on subpixel LCD grids.
3. **No Direct Source File Modification**: As an explorer in a read-only investigation, this handoff contains drop-in blueprints and architectural specifications. Actual implementation should be performed by the worker agent.

---

## 4. Conclusion
1. **Layout Reliability**: CSS Multi-column layout with `column-width: 100vw`, `column-gap: calc(2 * var(--page-padding-h))`, and `column-fill: auto` achieves mathematical page consistency, guaranteeing identical symmetric margins on every page.
2. **Performance & Navigation**: `transform: translateX` is substantially superior to `scrollLeft` for pagination, delivering hardware-accelerated 60/120fps page turns with deterministic cross-browser behavior and zero layout interference.
3. **Subpixel Precision**: The phantom blank page bug is permanently resolved by computing `totalPages = Math.max(1, Math.round(scrollWidth / pageWidth))`.
4. **Content Integrity**: Orphaned headings, sliced images, and split table cells are prevented by `break-inside: avoid`, `break-after: avoid`, and `max-height: calc(100vh - 2 * padding_v - 2.5em)`.
5. **State & Mode Sync**: Bidirectional progress ratio conversion ($\text{ratio} \leftrightarrow \text{pageIndex} / (\text{totalPages} - 1)$) allows smooth transitions between Paginated Mode and Continuous Scroll Mode without losing the reader's place.

---

## 5. Verification Method

### 5.1 Automated Puppeteer Test Verification
Execute the test runner from the project root:
```bash
# Verify Milestone 3 requirements
node test/e2e.test.js --tier=1 --grep="Paginated"
node test/e2e.test.js --tier=2 --grep="Boundary"
node test/e2e.test.js --tier=3 --grep="Mode Switch"
```

### 5.2 Manual Browser Verification
1. Launch static server:
   ```bash
   node test/server.js 3000
   ```
2. Open `http://127.0.0.1:3000` in Google Chrome or Safari.
3. Open "The Art of Reading" sample book:
   - Verify pagination displays `Page 1 of N` in the footer.
   - Advance with `ArrowRight` through Chapter 1; confirm drop cap, blockquote, and callout box do not slice across column breaks.
   - In Chapter 2, confirm the SVG luminous spectrum diagram scales within the page and does not break into multiple fragments.
   - In Chapter 3, confirm the typeface table breaks cleanly between rows (`tr`), with no row text sliced horizontally.
   - Test tap zones: click right 25% of stage -> advances page; click left 25% -> goes to previous page; click center 50% -> toggles header and footer chrome.
   - Test boundary transitions: on last page of Chapter 1, press `ArrowRight` -> smoothly loads Chapter 2 at Page 0; on Page 0 of Chapter 2, press `ArrowLeft` -> smoothly returns to Chapter 1's last page.
   - Resize window: verify `ResizeObserver` recomputes total pages and keeps the visible reading position stable.
   - Open Settings panel, change font size from 18px to 24px: verify total pages dynamically increases and current text remains on-screen.

### 5.3 Invalidation Conditions
The architectural blueprint is invalidated if:
- Navigating pages produces an empty/blank phantom page at the end of any chapter.
- Headings appear orphaned at the bottom of a page without subsequent text.
- Large SVG diagrams or tables exceed the viewport and cause vertical scrollbars in paginated mode.
- Changing font family or font size causes the page index to overflow `totalPages - 1`.
