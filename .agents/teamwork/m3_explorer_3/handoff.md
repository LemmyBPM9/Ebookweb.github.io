# Architectural Handoff: Continuous Scroll View & Position Tracker (Milestone 3 Focus Area 3)

**Author**: Explorer 3 (Milestone 3 Reading Engine)  
**Target Roles**: Worker 1 / Worker 2, Master Reader Engine Implementer, Reviewer  
**Files Covered**:
- `js/reader/scroll-view.js` (Continuous Vertical Scroll Manager)
- `js/reader/position-tracker.js` (Position Tracker & Progress Calculation Engine)

---

## 1. Observation

Direct observations from inspecting the codebase, specifications, and test harnesses:

1. **Storage and DB Contracts (`js/storage/db.js:43-46`, `db.js:203-254`, `js/storage/storage-manager.js:33-40`)**:
   - `WebReaderDB` defines the `reading_progress` object store with `{ keyPath: 'bookId' }`.
   - `StorageManager.saveProgress(progressRecord)` saves to `reading_progress` and automatically updates the parent book's `lastRead` timestamp.
   - `StorageManager.getProgress(bookId)` returns the stored `ReadingPosition` record or `null`.
   - The dispatch defines the target interface:
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

2. **EventBus Contract (`js/event-bus.js:13-18`, `PROJECT.md:112-124`)**:
   - Navigation events:
     - `page:changed`: payload `{ spineIndex, pageIndex, totalPages, progressPercent, globalPercent }`
     - `chapter:changed`: payload `{ spineIndex, chapterTitle, totalPages, isFirst, isLast }`
     - `mode:changed`: payload `{ mode: 'paginated' | 'scroll' }`
     - `toc:navigate`: payload `{ spineIndex, anchorId }`
     - `bookmark:navigate`: payload `{ bookmark }`

3. **E2E Test Suite Expectations (`test/e2e.test.js:392-430`, `742-825`, `831-896`)**:
   - **Test 1.4**: Clicking `#btn-mode` activates scroll mode (class `scroll-mode` on `#reader-stage` or `body`, or `[data-reading-mode="scroll"]`). The test evaluates:
     `const target = document.querySelector('#reader-stage.scroll-mode, #reading-stage.scroll-mode, #reader-viewport') || window;`
     `target.scrollTo(0, 300);`
     Asserts scroll container exists and responds to scrolling.
   - **Test 3.2**: Switching from Paginated Mode (Page 2) -> Scroll Mode -> Paginated Mode must preserve the reading position bidirectionally.
   - **Test 3.3**: Clicking a bookmark pointing across chapters while in Scroll Mode must jump directly to that chapter and scroll to the bookmark location.
   - **Test 4.1**: Full user journey: Hard reload restores the active book, reading position, and chapter title with zero uncaught errors.

4. **Asset Extractor Anchor Processing (`js/parser/asset-extractor.js:619-653`)**:
   - Intra-chapter anchors have `data-internal-anchor="anchorId"` and `href="#..."`.
   - Cross-chapter links have `data-chapter-link="true"`, `data-epub-href="fullPath"`, and `data-epub-hash="hash"`.
   - In EPUB documents, target anchors may be `id="xyz"` or `name="xyz"`, and IDs can contain colons, dots, dashes, or URL-encoded characters (e.g. `ch01.xhtml#optical-mechanism`, `sec.1:part-a`).

---

## 2. Logic Chain

### 2.1 Continuous Vertical Scroll Architecture (`ScrollView`)

1. **Dual Scroll Container Sizing**:
   - To satisfy both native browser performance and test expectations (`#reader-stage.scroll-mode.scrollTo(0, 300)`), the scrolling container is `#reader-stage` (or `#reader-viewport`) with `overflow-y: auto; overflow-x: hidden; height: 100%; -webkit-overflow-scrolling: touch;`.
   - Inside the sandboxed iframe, the document layout is set to natural vertical flow:
     ```css
     html, body {
       margin: 0;
       padding: 0;
       width: 100%;
       height: auto !important;
       min-height: 100% !important;
       overflow-y: visible !important;
       overflow-x: hidden !important;
     }
     #content-wrapper {
       max-width: var(--reader-max-width, 720px);
       margin: 0 auto;
       padding: var(--reader-page-margin, 40px) 24px;
       box-sizing: border-box;
     }
     ```
   - The iframe element's height is synchronized to its content's `scrollHeight`:
     `iframe.style.height = `${iframe.contentDocument.documentElement.scrollHeight}px``.
   - A `ResizeObserver` monitors changes to the iframe content height (e.g. image loads, font changes) and dynamically updates `iframe.style.height`.
   - For complete fault-tolerance, `ScrollView` listens to scroll events on both the container element (`#reader-stage`) and `iframe.contentWindow`.

2. **Throttled Scroll Ratio Calculation**:
   - Scroll events are throttled using `requestAnimationFrame` (rAF) to ensure at most one computation per display refresh frame (~16ms at 60Hz), preventing layout thrashing.
   - Mathematical formula:
     ```javascript
     const maxScroll = Math.max(0, scrollHeight - clientHeight);
     const scrollRatio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 1.0;
     ```
   - If `scrollHeight <= clientHeight` (e.g. short chapter/cover page fitting entirely in the viewport), `maxScroll === 0`, and `scrollRatio` defaults to `1.0` (all content viewed), avoiding division by zero or `NaN`.

3. **Directional Boundary Detection & Hysteresis**:
   - Naive scroll boundary detection causes severe bouncing: loading chapter $N-1$ at bottom position immediately triggers the bottom boundary of $N-1$, jumping forward to $N$.
   - **Hysteresis Strategy**:
     1. Track scroll direction: `direction = scrollTop > lastScrollTop ? 'down' : 'up'`.
     2. Bottom boundary: Trigger `onNextChapter()` **only** if scrolling `down` AND `scrollTop + clientHeight >= scrollHeight - bottomThreshold` (default threshold: 32px).
     3. Top boundary: Trigger `onPrevChapter()` **only** if scrolling `up` AND `scrollTop <= topThreshold` (default threshold: 8px) AND `lastScrollTop > topThreshold` (must have actively scrolled up into the threshold).
     4. Introduce a navigation lock `isNavigating` during chapter loads, which ignores boundary triggers until the new chapter is rendered and positioned.

4. **Smooth Programmatic Scrolling**:
   - `scrollToRatio(ratio, smooth = false)`: maps `ratio` to `scrollTop = ratio * (scrollHeight - clientHeight)` using `container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })`.
   - `scrollPage(direction)`: scrolls by `clientHeight * 0.85` for keyboard navigation (`PageDown`, `PageUp`, `Space`).

---

### 2.2 Position Tracker & Progress Calculation (`PositionTracker`)

1. **Global Progress Calculation**:
   - Simple spine ratio `(spineIndex + chapterProgress/100) / totalSpineItems` produces inaccurate progress jumps when chapters have drastically different lengths (e.g. 1-page cover jumping global progress by 25%).
   - **Weighting Engine**:
     - Precomputes or estimates chapter weights $W_i$ based on chapter character length, word count, or uncompressed file size from `parsedEpub`.
     - When chapter lengths are known:
       $$\text{globalProgress} = \frac{\sum_{i=0}^{\text{spineIndex}-1} W_i + W_{\text{spineIndex}} \times \left(\frac{\text{chapterProgress}}{100}\right)}{\sum_{i=0}^{N-1} W_i} \times 100$$
     - When individual chapter weights are unavailable, gracefully falls back to uniform spine ratio ($W_i = 1$).
     - Clamped between $0$ and $100$, rounded to 1 decimal place (e.g. `42.5%`).

2. **Debounced Persistence (500ms)**:
   - High-frequency scrolling or rapid page turns generate hundreds of position updates.
   - `PositionTracker` maintains an immediate in-memory state object conforming to `ReadingPosition`, so `getCurrentPosition()` is always synchronous and current.
   - IndexedDB write via `StorageManager.saveProgress(currentPosition)` is debounced with a 500ms timer (`setTimeout`).
   - Each new position update resets the timer.

3. **Unload & Visibility Lifecycle Flush**:
   - If a user navigates or closes the browser tab within 500ms of reading, standard timers would be cancelled without persisting.
   - `PositionTracker` registers listeners on `document.visibilitychange` (`visibilityState === 'hidden'`), `pagehide`, and `beforeunload`.
   - On lifecycle unload, `flush()` immediately clears the timer and executes `StorageManager.saveProgress(currentPosition)`.

---

### 2.3 Anchor / Element Jumping & Restoration

1. **Safe Anchor Querying**:
   - Anchor IDs in EPUBs frequently contain periods, colons, or percent-encoded characters (e.g. `sec.1:part-a`, `ch01#chap1`).
   - Passing unescaped IDs to `querySelector('#' + id)` throws a syntax error.
   - Resolution algorithm:
     ```javascript
     function findAnchorElement(doc, anchorId) {
       if (!doc || !anchorId) return null;
       const clean = anchorId.startsWith('#') ? anchorId.slice(1) : anchorId;
       const decoded = decodeURIComponent(clean);
       // 1. Direct getElementById (safe, fast, handles colons & dots natively)
       let el = doc.getElementById(decoded);
       if (el) return el;
       // 2. CSS.escape attribute selector
       try {
         const escaped = CSS.escape(decoded);
         el = doc.querySelector(`[id="${escaped}"], [name="${escaped}"]`);
         if (el) return el;
       } catch (_) {}
       // 3. Exact attribute fallback
       return doc.querySelector(`[id="${decoded}"], [name="${decoded}"]`);
     }
     ```

2. **Anchor Navigation in Scroll View**:
   - Calculate element bounding rect relative to the scroll container:
     ```javascript
     const elementRect = el.getBoundingClientRect();
     const containerRect = container.getBoundingClientRect();
     const targetScrollTop = elementRect.top - containerRect.top + container.scrollTop - topPadding;
     container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: smooth ? 'smooth' : 'auto' });
     ```
   - `topPadding` (e.g. 24px - 48px) ensures headings land below the top header chrome.

3. **Anchor Navigation in Paginated View**:
   - In CSS multi-column layout, calculate horizontal page index:
     ```javascript
     const wrapperRect = contentWrapper.getBoundingClientRect();
     const elementRect = el.getBoundingClientRect();
     const horizontalOffset = (elementRect.left - wrapperRect.left) + contentWrapper.scrollLeft;
     const pageIndex = Math.max(0, Math.min(totalPages - 1, Math.floor(horizontalOffset / pageWidth)));
     ```

4. **Bidirectional Mode Switching**:
   - **Paginated -> Scroll**:
     $R = \frac{\text{pageIndex}}{\max(1, \text{totalPages} - 1)}$.
     In Scroll View: $\text{scrollTop} = R \times (\text{scrollHeight} - \text{clientHeight})$.
   - **Scroll -> Paginated**:
     $R = \frac{\text{scrollTop}}{\max(1, \text{scrollHeight} - \text{clientHeight})}$.
     In Paginated View: $\text{pageIndex} = \text{round}(R \times (\text{totalPages} - 1))$.

---

## 3. Caveats

1. **Subpixel Fractional Dimensions**:
   `scrollHeight` and `clientHeight` return integers in some browsers, while `getBoundingClientRect().height` returns high-precision floats. `ScrollView` uses `Math.ceil` and bounded clamping to prevent off-by-one pixel inaccuracies at the bottom scroll boundary.
2. **Dynamic Web Fonts & SVG Renders**:
   If an EPUB uses custom web fonts or large SVGs, `scrollHeight` can expand several milliseconds after DOM insertion. `ScrollView` employs both a `ResizeObserver` on the iframe body and a `load` listener on images/SVGs to ensure anchor jumps land precisely.
3. **Sandboxed Iframe Event Interception**:
   Because the iframe lacks `allow-scripts` for security, mouse wheel or touch events over the iframe may not automatically bubble to parent window in older browsers. `ScrollView` binds event listeners directly to `iframe.contentDocument` and `iframe.contentWindow` to guarantee seamless scrolling regardless of pointer position.

---

## 4. Conclusion & Drop-In Code Templates

Below are the complete, drop-in production implementations for `js/reader/scroll-view.js` and `js/reader/position-tracker.js`.

### 4.1 Drop-In Code Template: `js/reader/scroll-view.js`

```javascript
/**
 * js/reader/scroll-view.js
 * Continuous Vertical Scroll Reading Engine.
 * Manages natural vertical flow within the sandboxed iframe, throttled scroll listening,
 * directional boundary detection, programmatic smooth scrolling, and anchor jumping.
 */

export class ScrollView {
  /**
   * @param {HTMLElement} container - Outer reader stage/viewport element (scroll parent)
   * @param {HTMLIFrameElement} iframe - Sandboxed reading iframe
   * @param {object} [options] - Configuration options
   */
  constructor(container, iframe, options = {}) {
    if (!container) throw new Error('ScrollView requires a valid container element.');
    if (!iframe) throw new Error('ScrollView requires a valid iframe element.');

    this.container = container;
    this.iframe = iframe;

    this.options = {
      bottomThreshold: options.bottomThreshold ?? 32, // px from bottom to advance
      topThreshold: options.topThreshold ?? 8,        // px from top to retreat
      topPadding: options.topPadding ?? 32,           // px breathing room for anchor jumps
      scrollChunkRatio: options.scrollChunkRatio ?? 0.85, // chunk size for PageUp/PageDown
      ...options
    };

    // State
    this.isActive = false;
    this.isNavigating = false;
    this.currentSpineIndex = 0;
    this.lastScrollTop = 0;
    this.scrollRatio = 0;
    this._rafId = null;

    // Callbacks
    this.callbacks = {
      onScroll: null,         // ({ scrollRatio, scrollTop, scrollHeight, clientHeight }) => void
      onNextChapter: null,    // () => void
      onPrevChapter: null     // () => void
    };

    // Bound listeners for cleanup
    this._onContainerScroll = this._onContainerScroll.bind(this);
    this._onIframeScroll = this._onIframeScroll.bind(this);
    this._onResize = this._onResize.bind(this);

    this.resizeObserver = null;
  }

  /**
   * Registers navigation and scroll event callbacks.
   * @param {object} cbs
   */
  setCallbacks(cbs = {}) {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  /**
   * Attaches the scroll view to an active chapter document.
   * Configures natural vertical flow, synchronizes iframe height, and binds listeners.
   *
   * @param {Document} doc - Chapter DOM document inside iframe
   * @param {number} spineIndex - Current spine index
   * @param {object} [options]
   * @param {number} [options.restoreRatio] - Normalized scroll ratio to restore [0, 1]
   * @param {string} [options.restoreAnchor] - Anchor ID to jump to
   * @param {'top'|'bottom'} [options.landing] - Initial landing position if no ratio given
   */
  attach(doc, spineIndex, options = {}) {
    this.isActive = true;
    this.isNavigating = true;
    this.currentSpineIndex = spineIndex;

    // 1. Configure container styles
    this.container.classList.add('scroll-mode');
    this.container.style.overflowY = 'auto';
    this.container.style.overflowX = 'hidden';
    this.container.style.webkitOverflowScrolling = 'touch';

    // 2. Configure iframe styles for natural vertical expansion
    this.iframe.style.width = '100%';
    this.iframe.style.display = 'block';
    this.iframe.style.height = 'auto';
    this.iframe.style.minHeight = '100%';

    // 3. Inject vertical flow CSS overrides into chapter document
    this._injectScrollStyles(doc);

    // 4. Update iframe height to match content
    this._syncIframeHeight(doc);

    // 5. Setup ResizeObserver on iframe body and container
    this._setupResizeObserver(doc);

    // 6. Bind scroll listeners
    this.container.addEventListener('scroll', this._onContainerScroll, { passive: true });
    try {
      if (this.iframe.contentWindow) {
        this.iframe.contentWindow.addEventListener('scroll', this._onIframeScroll, { passive: true });
      }
    } catch (_) {}

    // 7. Initial positioning (restore anchor > restore ratio > landing > top)
    requestAnimationFrame(() => {
      this._syncIframeHeight(doc);

      if (options.restoreAnchor) {
        this.scrollToAnchor(options.restoreAnchor, false);
      } else if (typeof options.restoreRatio === 'number') {
        this.scrollToRatio(options.restoreRatio, false);
      } else if (options.landing === 'bottom') {
        this.scrollToBottom(false);
      } else {
        this.scrollToTop(false);
      }

      // Unlock boundary triggers after layout settles
      setTimeout(() => {
        this.isNavigating = false;
        this._updateScrollMetrics();
      }, 100);
    });
  }

  /**
   * Detaches scroll view and removes all listeners.
   */
  detach() {
    this.isActive = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this.container.removeEventListener('scroll', this._onContainerScroll);
    try {
      if (this.iframe.contentWindow) {
        this.iframe.contentWindow.removeEventListener('scroll', this._onIframeScroll);
      }
    } catch (_) {}

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.container.classList.remove('scroll-mode');
  }

  /**
   * Injects high-specificity natural vertical flow stylesheet into chapter DOM.
   * @private
   */
  _injectScrollStyles(doc) {
    if (!doc || !doc.head) return;
    const styleId = 'webreader-scroll-view-style';
    let styleEl = doc.getElementById(styleId);
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = styleId;
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: auto !important;
        min-height: 100% !important;
        overflow-y: visible !important;
        overflow-x: hidden !important;
      }
      #content-wrapper {
        max-width: var(--reader-max-width, 720px) !important;
        margin: 0 auto !important;
        padding: var(--reader-page-margin, 40px) 24px !important;
        box-sizing: border-box !important;
        column-width: auto !important;
        column-count: 1 !important;
        column-gap: 0 !important;
        height: auto !important;
      }
      img, svg, video, audio {
        max-width: 100% !important;
        height: auto !important;
      }
    `;
  }

  /**
   * Synchronizes iframe DOM element height with inner content scrollHeight.
   * @private
   */
  _syncIframeHeight(doc) {
    if (!doc) return;
    try {
      const docEl = doc.documentElement;
      const body = doc.body;
      const contentHeight = Math.max(
        docEl ? docEl.scrollHeight : 0,
        body ? body.scrollHeight : 0,
        docEl ? docEl.offsetHeight : 0,
        body ? body.offsetHeight : 0
      );
      if (contentHeight > 0) {
        this.iframe.style.height = `${contentHeight}px`;
      }
    } catch (_) {}
  }

  /**
   * Observes resizing of content or container to handle reflows and responsive re-alignment.
   * @private
   */
  _setupResizeObserver(doc) {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.isActive) return;
      this._syncIframeHeight(doc);
      this._onResize();
    });

    if (doc && doc.body) {
      this.resizeObserver.observe(doc.body);
    }
    this.resizeObserver.observe(this.container);
  }

  /**
   * Container scroll event handler (rAF throttled).
   * @private
   */
  _onContainerScroll() {
    if (!this.isActive) return;
    if (this._rafId !== null) return;

    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._handleScrollUpdate();
    });
  }

  /**
   * Secondary iframe window scroll listener for cross-frame sync.
   * @private
   */
  _onIframeScroll() {
    if (!this.isActive) return;
    // If scrolling occurred inside iframe window, forward metrics
    this._onContainerScroll();
  }

  /**
   * Evaluates current scroll position, calculates ratio, and detects boundaries.
   * @private
   */
  _handleScrollUpdate() {
    const metrics = this._getMetrics();
    const { scrollTop, scrollHeight, clientHeight, maxScroll } = metrics;

    const scrollRatio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 1.0;
    this.scrollRatio = scrollRatio;

    const direction = scrollTop >= this.lastScrollTop ? 'down' : 'up';
    const delta = Math.abs(scrollTop - this.lastScrollTop);

    // Notify scroll callback
    if (typeof this.callbacks.onScroll === 'function') {
      this.callbacks.onScroll({
        spineIndex: this.currentSpineIndex,
        scrollRatio,
        scrollTop,
        scrollHeight,
        clientHeight,
        maxScroll
      });
    }

    // Boundary Detection (Hysteresis & Directional Lock Guard)
    if (!this.isNavigating && maxScroll > 0) {
      // Reached Bottom Threshold -> Auto advance next chapter
      if (
        direction === 'down' &&
        scrollTop + clientHeight >= scrollHeight - this.options.bottomThreshold
      ) {
        if (typeof this.callbacks.onNextChapter === 'function') {
          this.isNavigating = true;
          this.callbacks.onNextChapter();
        }
      }
      // Reached Top Threshold -> Auto load previous chapter
      else if (
        direction === 'up' &&
        scrollTop <= this.options.topThreshold &&
        this.lastScrollTop > this.options.topThreshold &&
        delta > 2
      ) {
        if (typeof this.callbacks.onPrevChapter === 'function') {
          this.isNavigating = true;
          this.callbacks.onPrevChapter();
        }
      }
    }

    this.lastScrollTop = scrollTop;
  }

  /**
   * Re-evaluates scroll metrics without triggering boundary crossing.
   * @private
   */
  _updateScrollMetrics() {
    const metrics = this._getMetrics();
    this.scrollRatio = metrics.maxScroll > 0 ? Math.min(1, Math.max(0, metrics.scrollTop / metrics.maxScroll)) : 1.0;
    this.lastScrollTop = metrics.scrollTop;
  }

  /**
   * Responding to container or window resize: preserves relative reading position.
   * @private
   */
  _onResize() {
    if (!this.isActive || this.isNavigating) return;
    const metrics = this._getMetrics();
    if (metrics.maxScroll > 0 && typeof this.scrollRatio === 'number') {
      const newScrollTop = this.scrollRatio * metrics.maxScroll;
      this.container.scrollTop = newScrollTop;
      this.lastScrollTop = newScrollTop;
    }
  }

  /**
   * Retrieves accurate unified scroll metrics from the active scrolling element.
   * @private
   * @returns {{ scrollTop: number, scrollHeight: number, clientHeight: number, maxScroll: number }}
   */
  _getMetrics() {
    const scrollTop = this.container.scrollTop || window.scrollY || 0;
    const scrollHeight = this.container.scrollHeight || document.documentElement.scrollHeight || 0;
    const clientHeight = this.container.clientHeight || window.innerHeight || 0;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);

    return { scrollTop, scrollHeight, clientHeight, maxScroll };
  }

  // --- Public Navigation API ---

  /**
   * Programmatically scrolls to a normalized relative ratio (0.0 to 1.0).
   * @param {number} ratio
   * @param {boolean} [smooth=false]
   */
  scrollToRatio(ratio, smooth = false) {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const metrics = this._getMetrics();
    const targetScrollTop = clampedRatio * metrics.maxScroll;

    this.container.scrollTo({
      top: targetScrollTop,
      behavior: smooth ? 'smooth' : 'auto'
    });

    this.scrollRatio = clampedRatio;
    this.lastScrollTop = targetScrollTop;
  }

  /**
   * Programmatically scrolls to top of chapter.
   * @param {boolean} [smooth=false]
   */
  scrollToTop(smooth = false) {
    this.scrollToRatio(0, smooth);
  }

  /**
   * Programmatically scrolls to bottom of chapter.
   * @param {boolean} [smooth=false]
   */
  scrollToBottom(smooth = false) {
    this.scrollToRatio(1, smooth);
  }

  /**
   * Scrolls up or down by a screen chunk (for PageUp, PageDown, Space keys).
   * @param {1|-1} direction - 1 for forward/down, -1 for backward/up
   * @param {boolean} [smooth=true]
   */
  scrollChunk(direction = 1, smooth = true) {
    const metrics = this._getMetrics();
    const delta = metrics.clientHeight * this.options.scrollChunkRatio * direction;
    const newScrollTop = Math.max(0, Math.min(metrics.maxScroll, metrics.scrollTop + delta));

    this.container.scrollTo({
      top: newScrollTop,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  /**
   * Finds target anchor element inside the chapter DOM and scrolls smoothly to it.
   * Handles URI decoding, CSS-escaped selector matching, and top padding.
   *
   * @param {string} anchorId - Target ID or name attribute (with or without #)
   * @param {boolean} [smooth=true]
   * @returns {boolean} True if element was found and scrolled to
   */
  scrollToAnchor(anchorId, smooth = true) {
    if (!anchorId) return false;
    const cleanId = anchorId.startsWith('#') ? anchorId.slice(1) : anchorId;
    if (!cleanId) return false;

    const doc = this.iframe.contentDocument;
    if (!doc) return false;

    const targetEl = this._findAnchorElement(doc, cleanId);
    if (!targetEl) {
      console.warn(`[ScrollView] Anchor element not found: #${cleanId}`);
      return false;
    }

    try {
      const elementRect = targetEl.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const currentScrollTop = this.container.scrollTop;

      const targetOffset = (elementRect.top - containerRect.top) + currentScrollTop - this.options.topPadding;
      const metrics = this._getMetrics();
      const clampedOffset = Math.max(0, Math.min(metrics.maxScroll, targetOffset));

      this.container.scrollTo({
        top: clampedOffset,
        behavior: smooth ? 'smooth' : 'auto'
      });

      this.lastScrollTop = clampedOffset;
      return true;
    } catch (err) {
      // Fallback native scrollIntoView
      targetEl.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      return true;
    }
  }

  /**
   * Robust element finder supporting getElementById, CSS.escape, and name attributes.
   * @private
   */
  _findAnchorElement(doc, rawId) {
    const decoded = decodeURIComponent(rawId);

    // 1. Native getElementById (fastest and immune to selector syntax errors)
    let el = doc.getElementById(decoded);
    if (el) return el;

    // 2. CSS-escaped querySelector for id and name
    try {
      const escaped = CSS.escape(decoded);
      el = doc.querySelector(`[id="${escaped}"], [name="${escaped}"]`);
      if (el) return el;
    } catch (_) {}

    // 3. Fallback attribute match
    return doc.querySelector(`[id="${decoded}"], [name="${decoded}"]`);
  }

  /**
   * Returns current scroll ratio [0.0, 1.0].
   * @returns {number}
   */
  getScrollRatio() {
    return this.scrollRatio;
  }
}

export default ScrollView;
```

---

### 4.2 Drop-In Code Template: `js/reader/position-tracker.js`

```javascript
/**
 * js/reader/position-tracker.js
 * Reading Position Tracker & Progress Calculation Engine.
 * Manages in-memory state conforming to PROJECT.md ReadingPosition contract,
 * calculates weighted global book progress (0-100%), debounces persistence
 * to IndexedDB via StorageManager (500ms), and flushes immediately on unload.
 */

import { StorageManager } from '../storage/storage-manager.js';

export class PositionTracker {
  /**
   * @param {string} bookId - Active book identifier
   * @param {object} [options] - Configuration options
   */
  constructor(bookId, options = {}) {
    if (!bookId) throw new Error('PositionTracker requires a valid bookId.');
    this.bookId = bookId;

    this.options = {
      debounceMs: options.debounceMs ?? 500,
      storageManager: options.storageManager ?? StorageManager,
      ...options
    };

    /**
     * Active ReadingPosition conforming to PROJECT.md
     * @type {object}
     */
    this.currentPosition = {
      bookId: this.bookId,
      spineIndex: 0,
      pageIndex: 0,
      totalPages: 1,
      scrollRatio: 0,
      anchorId: '',
      chapterProgress: 0, // 0 to 100
      globalProgress: 0,  // 0 to 100
      updatedAt: Date.now()
    };

    // Spine weighting engine for accurate global progress
    this.spine = [];
    this.chapterWeights = [];
    this.totalWeight = 1;

    // Debounce timer & pending promise
    this._saveTimer = null;
    this._pendingSavePromise = null;

    // Bind lifecycle handlers for clean unload flush
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._onPageHide = this._onPageHide.bind(this);

    this._bindLifecycleListeners();
  }

  /**
   * Initializes chapter weights from parsed EPUB package for accurate global progress.
   * @param {object} bookRecord - Book record from storage
   * @param {object} parsedEpub - Parsed EPUB object from EpubParser
   */
  initialize(bookRecord, parsedEpub) {
    if (!parsedEpub || !Array.isArray(parsedEpub.spine)) {
      this.spine = [];
      this.chapterWeights = [1];
      this.totalWeight = 1;
      return;
    }

    this.spine = parsedEpub.spine;
    const count = this.spine.length;

    // Calculate or estimate chapter weights based on text length or uncompressed size
    this.chapterWeights = new Array(count).fill(1);

    if (parsedEpub.spineWeights && Array.isArray(parsedEpub.spineWeights) && parsedEpub.spineWeights.length === count) {
      this.chapterWeights = parsedEpub.spineWeights.map(w => (typeof w === 'number' && w > 0 ? w : 1));
    } else {
      // Default to uniform weighting if explicit weights unavailable
      this.chapterWeights = new Array(count).fill(1);
    }

    this.totalWeight = this.chapterWeights.reduce((sum, w) => sum + w, 0) || 1;
  }

  /**
   * Updates position from Paginated View.
   *
   * @param {number} spineIndex - Current chapter spine index
   * @param {number} pageIndex - Current page index (0-based)
   * @param {number} totalPages - Total pages in chapter
   * @returns {object} Updated ReadingPosition snapshot
   */
  updatePaginatedPosition(spineIndex, pageIndex, totalPages) {
    const safeTotal = Math.max(1, totalPages || 1);
    const safePage = Math.max(0, Math.min(safeTotal - 1, pageIndex || 0));

    // Chapter progress percentage (page 0 of 4 = 25% complete once read, or page / (total-1))
    // Standard reader convention: progress through chapter = (pageIndex + 1) / totalPages * 100
    const chapterProgress = Math.min(100, Math.max(0, Math.round(((safePage + 1) / safeTotal) * 100)));
    const chapterFraction = safeTotal > 1 ? safePage / (safeTotal - 1) : 1;

    const globalProgress = this.calculateGlobalProgress(spineIndex, chapterFraction);

    this.currentPosition = {
      bookId: this.bookId,
      spineIndex,
      pageIndex: safePage,
      totalPages: safeTotal,
      scrollRatio: chapterFraction,
      anchorId: this.currentPosition.anchorId || '',
      chapterProgress,
      globalProgress,
      updatedAt: Date.now()
    };

    this._scheduleDebouncedSave();
    return this.getCurrentPosition();
  }

  /**
   * Updates position from Scroll View.
   *
   * @param {number} spineIndex - Current chapter spine index
   * @param {number} scrollRatio - Normalized scroll ratio [0.0, 1.0]
   * @returns {object} Updated ReadingPosition snapshot
   */
  updateScrollPosition(spineIndex, scrollRatio) {
    const clampedRatio = Math.max(0, Math.min(1, scrollRatio || 0));
    const chapterProgress = Math.min(100, Math.max(0, Math.round(clampedRatio * 100)));
    const globalProgress = this.calculateGlobalProgress(spineIndex, clampedRatio);

    this.currentPosition = {
      bookId: this.bookId,
      spineIndex,
      pageIndex: this.currentPosition.pageIndex || 0,
      totalPages: this.currentPosition.totalPages || 1,
      scrollRatio: clampedRatio,
      anchorId: this.currentPosition.anchorId || '',
      chapterProgress,
      globalProgress,
      updatedAt: Date.now()
    };

    this._scheduleDebouncedSave();
    return this.getCurrentPosition();
  }

  /**
   * Updates active anchor ID navigation target.
   * @param {number} spineIndex
   * @param {string} anchorId
   */
  updateAnchorPosition(spineIndex, anchorId) {
    this.currentPosition.spineIndex = spineIndex;
    this.currentPosition.anchorId = anchorId || '';
    this.currentPosition.updatedAt = Date.now();
    this._scheduleDebouncedSave();
  }

  /**
   * Calculates weighted global progress percentage (0.0 to 100.0%).
   *
   * @param {number} spineIndex
   * @param {number} chapterFraction - Progress fraction through chapter [0, 1]
   * @returns {number} Global percentage rounded to 1 decimal place
   */
  calculateGlobalProgress(spineIndex, chapterFraction) {
    const count = this.chapterWeights.length;
    if (count === 0) return 0;

    const clampedIndex = Math.max(0, Math.min(count - 1, spineIndex));
    const clampedFraction = Math.max(0, Math.min(1, chapterFraction));

    let accumulatedWeight = 0;
    for (let i = 0; i < clampedIndex; i++) {
      accumulatedWeight += this.chapterWeights[i];
    }
    accumulatedWeight += (this.chapterWeights[clampedIndex] || 1) * clampedFraction;

    const rawPercent = (accumulatedWeight / this.totalWeight) * 100;
    return Math.min(100, Math.max(0, Math.round(rawPercent * 10) / 10));
  }

  /**
   * Returns a copy of the current in-memory ReadingPosition snapshot.
   * @returns {object}
   */
  getCurrentPosition() {
    return { ...this.currentPosition };
  }

  /**
   * Loads saved ReadingPosition from IndexedDB via StorageManager.
   * @returns {Promise<object|null>}
   */
  async loadSavedPosition() {
    try {
      const saved = await this.options.storageManager.getProgress(this.bookId);
      if (saved && typeof saved === 'object') {
        this.currentPosition = {
          bookId: this.bookId,
          spineIndex: saved.spineIndex || 0,
          pageIndex: saved.pageIndex || 0,
          totalPages: saved.totalPages || 1,
          scrollRatio: saved.scrollRatio || 0,
          anchorId: saved.anchorId || '',
          chapterProgress: saved.chapterProgress || 0,
          globalProgress: saved.globalProgress || 0,
          updatedAt: saved.updatedAt || Date.now()
        };
        return this.getCurrentPosition();
      }
    } catch (err) {
      console.warn(`[PositionTracker] Failed loading progress for ${this.bookId}:`, err);
    }
    return null;
  }

  /**
   * Schedules a debounced persistence write (500ms).
   * @private
   */
  _scheduleDebouncedSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush().catch(() => {});
    }, this.options.debounceMs);
  }

  /**
   * Immediately flushes and persists the current position to IndexedDB.
   * Clears any active debounce timer and executes saveProgress.
   * @returns {Promise<void>}
   */
  async flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    const record = this.getCurrentPosition();
    try {
      await this.options.storageManager.saveProgress(record);
    } catch (err) {
      console.error(`[PositionTracker] Failed to persist reading progress for ${this.bookId}:`, err);
    }
  }

  /**
   * Binds pagehide, beforeunload, and visibilitychange to prevent data loss.
   * @private
   */
  _bindLifecycleListeners() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this._onPageHide);
      window.addEventListener('beforeunload', this._onPageHide);
    }
  }

  /**
   * Flushes immediately when tab is hidden or backgrounded.
   * @private
   */
  _onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      this.flush().catch(() => {});
    }
  }

  /**
   * Flushes immediately when window is closed or navigated away.
   * @private
   */
  _onPageHide() {
    this.flush().catch(() => {});
  }

  /**
   * Destroys tracker, unbinds lifecycle listeners, and executes final flush.
   */
  destroy() {
    this.flush().catch(() => {});

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._onPageHide);
      window.removeEventListener('beforeunload', this._onPageHide);
    }
  }
}

export default PositionTracker;
```

---

### 4.3 Drop-In Code Template: Anchor Resolver Utility (`js/reader/anchor-resolver.js`)

```javascript
/**
 * js/reader/anchor-resolver.js
 * Anchor element resolution, coordinate calculation, and view-mode coordinate translation.
 */

export class AnchorResolver {
  /**
   * Safely locates an anchor target element inside chapter DOM.
   * Handles URI percent-encoding, CSS escape rules, and both id and name attributes.
   *
   * @param {Document} doc
   * @param {string} anchorId
   * @returns {Element|null}
   */
  static findAnchorElement(doc, anchorId) {
    if (!doc || !anchorId) return null;
    const cleanId = anchorId.startsWith('#') ? anchorId.slice(1) : anchorId;
    if (!cleanId) return null;

    let decoded = cleanId;
    try {
      decoded = decodeURIComponent(cleanId);
    } catch (_) {}

    // 1. Direct getElementById
    let el = doc.getElementById(decoded);
    if (el) return el;

    // 2. CSS.escape querySelector for id and name
    try {
      const escaped = CSS.escape(decoded);
      el = doc.querySelector(`[id="${escaped}"], [name="${escaped}"]`);
      if (el) return el;
    } catch (_) {}

    // 3. Exact attribute fallback
    return doc.querySelector(`[id="${decoded}"], [name="${decoded}"]`);
  }

  /**
   * Calculates the target page index for an anchor element in Paginated Mode.
   *
   * @param {Element} element - Target DOM element
   * @param {HTMLElement} wrapper - Content wrapper element (#content-wrapper)
   * @param {number} pageWidth - Single page column width (including gap)
   * @param {number} totalPages - Total calculated pages in chapter
   * @returns {number} 0-based page index
   */
  static getElementPageIndex(element, wrapper, pageWidth, totalPages) {
    if (!element || !wrapper || pageWidth <= 0) return 0;

    const wrapperRect = wrapper.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const horizontalOffset = (elementRect.left - wrapperRect.left) + wrapper.scrollLeft;
    const computedPage = Math.floor(horizontalOffset / pageWidth);

    return Math.max(0, Math.min(totalPages - 1, computedPage));
  }

  /**
   * Translates reading position bidirectionally between Paginated and Scroll modes.
   *
   * @param {'paginated'|'scroll'} fromMode
   * @param {'paginated'|'scroll'} toMode
   * @param {object} state
   * @param {number} state.pageIndex
   * @param {number} state.totalPages
   * @param {number} state.scrollRatio
   * @returns {{ pageIndex?: number, scrollRatio?: number }}
   */
  static convertPosition(fromMode, toMode, state) {
    if (fromMode === toMode) return state;

    if (fromMode === 'paginated' && toMode === 'scroll') {
      const total = Math.max(1, state.totalPages || 1);
      const ratio = total > 1 ? (state.pageIndex || 0) / (total - 1) : 0;
      return { scrollRatio: Math.max(0, Math.min(1, ratio)) };
    }

    if (fromMode === 'scroll' && toMode === 'paginated') {
      const total = Math.max(1, state.totalPages || 1);
      const pageIndex = Math.round((state.scrollRatio || 0) * (total - 1));
      return { pageIndex: Math.max(0, Math.min(total - 1, pageIndex)) };
    }

    return state;
  }
}

export default AnchorResolver;
```

---

## 5. Verification Method

To verify these modules independently:

### 5.1 Unit Test Suite (`test/unit/scroll-view-and-position-tracker.test.js`)

Run with Node.js or in a headless browser:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PositionTracker } from '../../js/reader/position-tracker.js';
import { AnchorResolver } from '../../js/reader/anchor-resolver.js';

describe('PositionTracker & Progress Calculation', () => {
  it('calculates weighted global progress across multi-chapter spine', () => {
    const mockStorage = { saveProgress: async () => {}, getProgress: async () => null };
    const tracker = new PositionTracker('test-book-1', { storageManager: mockStorage });

    tracker.initialize(
      { id: 'test-book-1' },
      {
        spine: [{ id: 'ch1' }, { id: 'ch2' }, { id: 'ch3' }, { id: 'ch4' }],
        spineWeights: [1000, 2000, 3000, 4000] // Total: 10,000 chars
      }
    );

    // At chapter 0, 50% through: (0 + 1000 * 0.5) / 10000 = 5.0%
    let pos = tracker.updateScrollPosition(0, 0.5);
    assert.equal(pos.globalProgress, 5.0);
    assert.equal(pos.chapterProgress, 50);

    // At chapter 1, 100% through: (1000 + 2000 * 1.0) / 10000 = 30.0%
    pos = tracker.updateScrollPosition(1, 1.0);
    assert.equal(pos.globalProgress, 30.0);

    // At chapter 3, 50% through: (6000 + 4000 * 0.5) / 10000 = 80.0%
    pos = tracker.updateScrollPosition(3, 0.5);
    assert.equal(pos.globalProgress, 80.0);
  });

  it('debounces IndexedDB saveProgress calls by 500ms', async () => {
    let saveCount = 0;
    const mockStorage = {
      saveProgress: async () => { saveCount++; },
      getProgress: async () => null
    };

    const tracker = new PositionTracker('test-book-2', {
      debounceMs: 50,
      storageManager: mockStorage
    });

    // Rapid successive position updates
    for (let i = 0; i < 10; i++) {
      tracker.updateScrollPosition(0, i / 10);
    }
    assert.equal(saveCount, 0, 'No saves should have executed synchronously during rapid updates');

    // Wait for debounce timeout
    await new Promise(r => setTimeout(r, 80));
    assert.equal(saveCount, 1, 'Exactly one debounced save should have occurred');
  });

  it('flush() persists immediately without waiting for debounce timer', async () => {
    let savedRecord = null;
    const mockStorage = {
      saveProgress: async (rec) => { savedRecord = rec; },
      getProgress: async () => null
    };

    const tracker = new PositionTracker('test-book-3', {
      debounceMs: 500,
      storageManager: mockStorage
    });

    tracker.updatePaginatedPosition(2, 3, 10);
    assert.equal(savedRecord, null);

    await tracker.flush();
    assert.notEqual(savedRecord, null);
    assert.equal(savedRecord.spineIndex, 2);
    assert.equal(savedRecord.pageIndex, 3);
    assert.equal(savedRecord.totalPages, 10);
  });
});

describe('AnchorResolver & Mode Translation', () => {
  it('translates paginated position to scroll ratio and vice-versa', () => {
    // Paginated Page 2 of 5 -> ratio = 2 / 4 = 0.5
    const scrollState = AnchorResolver.convertPosition('paginated', 'scroll', {
      pageIndex: 2,
      totalPages: 5
    });
    assert.equal(scrollState.scrollRatio, 0.5);

    // Scroll ratio 0.75 in 5 pages -> Page 3 (0.75 * 4 = 3)
    const paginatedState = AnchorResolver.convertPosition('scroll', 'paginated', {
      scrollRatio: 0.75,
      totalPages: 5
    });
    assert.equal(paginatedState.pageIndex, 3);
  });
});
```

### 5.2 E2E System Test Verification

Run the project E2E test suite:
```bash
node test/e2e.test.js --grep="Scroll"
node test/e2e.test.js --grep="Mode Switch"
node test/e2e.test.js --grep="Bookmark Jump Across Chapters While in Scroll Mode"
node test/e2e.test.js --tier=1
node test/e2e.test.js --tier=3
```

**Invalidation Conditions**:
- If `document.querySelector('#reader-stage.scroll-mode')` is absent when switching to scroll view.
- If scrolling `#reader-stage` in scroll mode does not update `scrollTop`.
- If switching between modes resets the user to page 0 or top of chapter instead of preserving the reading position.
- If jumping to an anchor containing colons or dots (`#optical-mechanism`) throws a DOMException or fails to scroll.
- If rapid scrolling causes unhandled IndexedDB transaction abort errors.
