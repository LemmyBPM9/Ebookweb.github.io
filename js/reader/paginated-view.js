/**
 * js/reader/paginated-view.js
 * High-Performance CSS Multi-Column Pagination Engine.
 * Manages equal-margin multi-column book layout, GPU transform page navigation,
 * subpixel-safe page calculations, ResizeObserver re-anchoring, and boundary events.
 * Part of WebReader Milestone 3.
 */

export class PaginatedView {
  /**
   * @param {object} options
   * @param {HTMLIFrameElement} options.iframe - Sandboxed reader iframe
   * @param {HTMLElement} options.stage - Reader stage / viewport container
   * @param {Function} [options.onPageChange] - Invoked on page change { pageIndex, totalPages }
   * @param {Function} [options.onChapterBoundary] - Invoked on boundary: 'next' | 'prev'
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
    this._resizeRafId = null;
    this._boundaryDebounceTimer = null;
    this._boundOnResize = this._scheduleResize.bind(this);
  }

  /**
   * Initializes or re-initializes pagination for a freshly loaded chapter.
   * @param {number|string|object} [targetPageOrAnchor=0] - Initial page index, anchor ID, or options
   */
  onChapterLoaded(targetPageOrAnchor = 0) {
    if (!this.isActive) return;

    this._setupContentWrapper();
    this._setupIframeMultiColumnLayout();
    this.calculatePagination();

    if (typeof targetPageOrAnchor === 'string') {
      const found = this.goToAnchor(targetPageOrAnchor, false);
      if (!found) this.goToPage(0, false);
    } else if (typeof targetPageOrAnchor === 'number') {
      if (targetPageOrAnchor === -1 || targetPageOrAnchor >= this.totalPages) {
        this.goToPage(Math.max(0, this.totalPages - 1), false);
      } else {
        this.goToPage(Math.max(0, targetPageOrAnchor), false);
      }
    } else if (targetPageOrAnchor && typeof targetPageOrAnchor === 'object') {
      if (targetPageOrAnchor.anchorId) {
        const found = this.goToAnchor(targetPageOrAnchor.anchorId, false);
        if (!found) this.goToPage(0, false);
      } else if (targetPageOrAnchor.landAtEnd) {
        this.goToPage(Math.max(0, this.totalPages - 1), false);
      } else if (typeof targetPageOrAnchor.pageIndex === 'number') {
        this.goToPage(Math.max(0, Math.min(this.totalPages - 1, targetPageOrAnchor.pageIndex)), false);
      } else {
        this.goToPage(0, false);
      }
    } else {
      this.goToPage(0, false);
    }

    this._attachResizeObserver();
  }

  /**
   * Guarantees that body children are wrapped in a single #content-wrapper container.
   * This provides a clean hardware-accelerated transform layer without altering body layout.
   * @private
   */
  _setupContentWrapper() {
    const doc = this._getDoc();
    if (!doc || !doc.body) return;

    let wrapper = doc.getElementById('content-wrapper');
    if (!wrapper) {
      wrapper = doc.createElement('div');
      wrapper.id = 'content-wrapper';
      while (doc.body.firstChild) {
        wrapper.appendChild(doc.body.firstChild);
      }
      doc.body.appendChild(wrapper);
    }
  }

  /**
   * Injects or updates the CSS multi-column book layout stylesheet inside the iframe.
   * @private
   */
  _setupIframeMultiColumnLayout() {
    const doc = this._getDoc();
    if (!doc || !doc.head) return;

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
        --page-padding-h: 36px;
        --page-padding-v: 32px;
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
        font-size-adjust: from-font;
        font-weight: var(--reader-font-weight, 400) !important;
        line-height: var(--reader-line-height, 1.75) !important;
        letter-spacing: var(--reader-letter-spacing, 0em) !important;
        word-spacing: var(--reader-word-spacing, 0em) !important;
      }
      #content-wrapper {
        height: 100vh !important;
        width: 100vw !important;
        box-sizing: border-box !important;
        column-width: 100vw !important;
        column-gap: calc(2 * var(--page-padding-h, 36px)) !important;
        column-fill: auto !important;
        padding: var(--page-padding-v, 32px) var(--page-padding-h, 36px) !important;
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #content-wrapper.no-transition {
        transition: none !important;
      }
      h1, h2, h3, h4, h5, h6 {
        break-inside: avoid;
        page-break-inside: avoid;
        break-after: avoid;
        page-break-after: avoid;
        line-height: 1.3 !important;
        text-wrap: balance;
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
      p, blockquote, li {
        font-family: var(--reader-font-family, serif) !important;
        font-weight: var(--reader-font-weight, 400) !important;
        line-height: var(--reader-line-height, 1.75) !important;
        letter-spacing: var(--reader-letter-spacing, 0em) !important;
        word-spacing: var(--reader-word-spacing, 0em) !important;
        text-align: var(--reader-text-align, left) !important;
        -webkit-hyphens: var(--reader-hyphens, manual) !important;
        hyphens: var(--reader-hyphens, manual) !important;
      }
      p {
        orphans: 2;
        widows: 2;
        word-break: break-word;
        overflow-wrap: break-word;
        margin-bottom: var(--reader-paragraph-spacing, 1.25em) !important;
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

    // Measure viewport width
    const width = win.innerWidth || (this.iframe ? this.iframe.clientWidth : 0) || (this.stage ? this.stage.clientWidth : 0);
    if (width <= 0) return;

    this.pageWidth = width;

    // Total horizontal span: wrapper.scrollWidth
    const scrollWidth = Math.max(
      wrapper.scrollWidth,
      doc.documentElement.scrollWidth,
      doc.body ? doc.body.scrollWidth : 0
    );

    // Subpixel-safe rounding eliminates phantom blank pages
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
   * Advances to the next page, or signals chapter boundary if at the end.
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
   * Rewinds to the previous page, or signals chapter boundary if at the start.
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
    if (!cleanId) return false;

    const targetEl = this._findAnchorElement(doc, cleanId);
    if (!targetEl) return false;

    // Recalculate to ensure accurate layout
    this.calculatePagination();

    const wrapper = doc.getElementById('content-wrapper') || doc.body;
    const rect = targetEl.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    // Calculate horizontal offset
    const offsetLeft = (rect.left - wrapperRect.left) + wrapper.scrollLeft;
    const targetPage = Math.max(0, Math.min(
      this.totalPages - 1,
      Math.floor(offsetLeft / Math.max(1, this.pageWidth))
    ));

    this.goToPage(targetPage, animate);
    return true;
  }

  /**
   * Finds target anchor element inside the chapter DOM.
   * @private
   */
  _findAnchorElement(doc, rawId) {
    let decoded = rawId;
    try {
      decoded = decodeURIComponent(rawId);
    } catch (_) {}

    // 1. Direct getElementById
    let el = doc.getElementById(decoded);
    if (el) return el;

    // 2. CSS-escaped querySelector
    try {
      const escaped = CSS.escape(decoded);
      el = doc.querySelector(`[id="${escaped}"], [name="${escaped}"]`);
      if (el) return el;
    } catch (_) {}

    // 3. Fallback attribute query
    return doc.querySelector(`[id="${decoded}"], [name="${decoded}"]`);
  }

  /**
   * Activates paginated multi-column mode.
   */
  activate() {
    this.isActive = true;
    this._setupContentWrapper();
    this._setupIframeMultiColumnLayout();
    this.calculatePagination();
    this._attachResizeObserver();
  }

  /**
   * Deactivates paginated mode (when switching to continuous scroll view).
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

  // --- Internal Helpers ---

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
    } else {
      if (wrapper.classList.contains('no-transition')) {
        void wrapper.offsetHeight;
        wrapper.classList.remove('no-transition');
      }
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

  _scheduleResize() {
    if (!this.isActive || this._resizeRafId) return;
    if (typeof requestAnimationFrame === 'function') {
      this._resizeRafId = requestAnimationFrame(() => {
        this._resizeRafId = null;
        this._handleResize();
      });
    } else {
      this._handleResize();
    }
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
      win.addEventListener('resize', this._boundOnResize, { passive: true });
    }

    if (typeof ResizeObserver !== 'undefined' && this.iframe) {
      this._resizeObserver = new ResizeObserver(() => {
        this._scheduleResize();
      });
      this._resizeObserver.observe(this.iframe);
      if (this.stage) {
        this._resizeObserver.observe(this.stage);
      }
    }
  }

  _detachResizeObserver() {
    if (this._resizeRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = null;
    }
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
      this._boundaryDebounceTimer = null;
    }
  }
}

export default PaginatedView;
