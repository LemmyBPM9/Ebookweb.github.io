/**
 * js/reader/scroll-view.js
 * Continuous Vertical Scroll View Engine for WebReader.
 * Manages fluid vertical reading, scroll position tracking, anchor jumping,
 * and dynamic height synchronization inside the sandboxed reader iframe or stage.
 */

export class ScrollView {
  /**
   * @param {object} options
   * @param {HTMLIFrameElement} options.iframe - Sandboxed reader iframe
   * @param {HTMLElement} options.stage - Reader stage / scroll container (#reader-stage)
   * @param {Function} [options.onScrollChange] - Invoked on scroll { scrollRatio, progressPercent }
   * @param {Function} [options.onChapterBoundary] - Invoked on chapter navigation: 'next' | 'prev'
   */
  constructor(options = {}) {
    this.iframe = options.iframe;
    this.stage = options.stage;
    this.onScrollChange = options.onScrollChange || (() => {});
    this.onChapterBoundary = options.onChapterBoundary || (() => {});

    this.scrollRatio = 0;
    this.isActive = false;
    this._resizeObserver = null;
    this._boundOnScroll = this._handleScroll.bind(this);
  }

  /**
   * Initializes scroll view for a newly loaded chapter.
   * @param {number|string|object} [targetRatioOrAnchor=0]
   */
  onChapterLoaded(targetRatioOrAnchor = 0) {
    if (!this.isActive) return;

    this._setupIframeScrollLayout();
    this._syncIframeHeight();
    this._attachListeners();

    if (typeof targetRatioOrAnchor === 'string') {
      const found = this.goToAnchor(targetRatioOrAnchor);
      if (!found) this.scrollToRatio(0);
    } else if (typeof targetRatioOrAnchor === 'number') {
      if (targetRatioOrAnchor === -1) {
        this.scrollToRatio(1);
      } else {
        this.scrollToRatio(Math.max(0, Math.min(1, targetRatioOrAnchor)));
      }
    } else if (targetRatioOrAnchor && typeof targetRatioOrAnchor === 'object') {
      if (targetRatioOrAnchor.anchorId) {
        const found = this.goToAnchor(targetRatioOrAnchor.anchorId);
        if (!found) this.scrollToRatio(0);
      } else if (targetRatioOrAnchor.landAtEnd) {
        this.scrollToRatio(1);
      } else if (typeof targetRatioOrAnchor.scrollRatio === 'number') {
        this.scrollToRatio(targetRatioOrAnchor.scrollRatio);
      } else {
        this.scrollToRatio(0);
      }
    } else {
      this.scrollToRatio(0);
    }
  }

  /**
   * Injects clean continuous vertical scroll layout rules into the iframe.
   * @private
   */
  _setupIframeScrollLayout() {
    const doc = this._getDoc();
    if (!doc || !doc.head) return;

    // Remove multi-column stylesheet if present
    const multiColStyle = doc.getElementById('webreader-multicolumn-style');
    if (multiColStyle) {
      multiColStyle.remove();
    }

    let styleEl = doc.getElementById('webreader-scroll-style');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'webreader-scroll-style';
      doc.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        min-height: 100% !important;
        height: auto !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
        background-color: var(--color-bg, #f8f1e3) !important;
        color: var(--color-text, #2c2523) !important;
        font-family: var(--reader-font-family, serif) !important;
        font-size: var(--reader-font-size, 18px) !important;
        line-height: var(--reader-line-height, 1.75) !important;
      }
      #content-wrapper, body > * {
        max-width: var(--reader-max-width, 720px) !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      #content-wrapper {
        width: 100% !important;
        height: auto !important;
        column-width: auto !important;
        column-count: auto !important;
        padding: 72px 32px 96px 32px !important;
        box-sizing: border-box !important;
        transform: none !important;
      }
      img, svg, picture, figure, video, canvas {
        max-width: 100% !important;
        height: auto !important;
        display: block;
        margin: 1.25em auto;
      }
    `;
  }

  /**
   * Synchronizes iframe height with its inner document height so the outer #reader-stage scrolls smoothly.
   */
  _syncIframeHeight() {
    const doc = this._getDoc();
    if (!doc || !this.iframe) return;

    const wrapper = doc.getElementById('content-wrapper') || doc.body;
    const contentHeight = Math.max(
      wrapper ? wrapper.scrollHeight : 0,
      doc.documentElement ? doc.documentElement.scrollHeight : 0,
      doc.body ? doc.body.scrollHeight : 0,
      this.stage ? this.stage.clientHeight : 600
    );

    this.iframe.style.height = `${contentHeight + 40}px`;
  }

  /**
   * Scrolls the stage container to a normalized ratio [0..1].
   * @param {number} ratio
   */
  scrollToRatio(ratio) {
    if (!this.stage) return;
    this._syncIframeHeight();

    const clamped = Math.max(0, Math.min(1, ratio || 0));
    const maxScroll = Math.max(0, this.stage.scrollHeight - this.stage.clientHeight);
    const targetTop = Math.round(clamped * maxScroll);

    this.stage.scrollTop = targetTop;
    this.scrollRatio = clamped;

    this.onScrollChange({
      scrollRatio: this.scrollRatio,
      progressPercent: Math.round(this.scrollRatio * 100)
    });
  }

  /**
   * Scrolls down one viewport step or advances to next chapter if at bottom.
   */
  nextPage() {
    if (!this.isActive || !this.stage) return;
    this._syncIframeHeight();

    const maxScroll = Math.max(0, this.stage.scrollHeight - this.stage.clientHeight);
    if (this.stage.scrollTop >= maxScroll - 8) {
      this.onChapterBoundary('next');
    } else {
      const step = Math.round(this.stage.clientHeight * 0.85);
      this.stage.scrollTo({
        top: Math.min(maxScroll, this.stage.scrollTop + step),
        behavior: 'smooth'
      });
    }
  }

  /**
   * Scrolls up one viewport step or rewinds to previous chapter if at top.
   */
  prevPage() {
    if (!this.isActive || !this.stage) return;
    this._syncIframeHeight();

    if (this.stage.scrollTop <= 8) {
      this.onChapterBoundary('prev');
    } else {
      const step = Math.round(this.stage.clientHeight * 0.85);
      this.stage.scrollTo({
        top: Math.max(0, this.stage.scrollTop - step),
        behavior: 'smooth'
      });
    }
  }

  /**
   * Jumps to a specific anchor ID inside the chapter.
   * @param {string} anchorId
   * @returns {boolean}
   */
  goToAnchor(anchorId) {
    const doc = this._getDoc();
    if (!doc || !anchorId || !this.stage) return false;

    const cleanId = anchorId.startsWith('#') ? anchorId.slice(1) : anchorId;
    if (!cleanId) return false;

    let decoded = cleanId;
    try {
      decoded = decodeURIComponent(cleanId);
    } catch (_) {}

    let targetEl = doc.getElementById(decoded);
    if (!targetEl) {
      try {
        const escaped = CSS.escape(decoded);
        targetEl = doc.querySelector(`[id="${escaped}"], [name="${escaped}"]`);
      } catch (_) {}
    }

    if (!targetEl) return false;

    this._syncIframeHeight();
    const rect = targetEl.getBoundingClientRect();
    const targetTop = Math.max(0, rect.top + this.stage.scrollTop - 68);
    this.stage.scrollTop = targetTop;
    this._handleScroll();
    return true;
  }

  /**
   * Activates continuous scroll mode.
   * @param {number} [initialRatio=0]
   */
  activate(initialRatio = 0) {
    this.isActive = true;
    if (this.stage) {
      this.stage.classList.add('scroll-mode');
      this.stage.setAttribute('data-reading-mode', 'scroll');
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('scroll-mode');
    }

    this._setupIframeScrollLayout();
    this._syncIframeHeight();
    this._attachListeners();
    this.scrollToRatio(initialRatio);
  }

  /**
   * Deactivates continuous scroll mode.
   */
  deactivate() {
    this.isActive = false;
    this._detachListeners();

    if (this.stage) {
      this.stage.classList.remove('scroll-mode');
      this.stage.setAttribute('data-reading-mode', 'paginated');
      this.stage.scrollTop = 0;
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('scroll-mode');
    }
    if (this.iframe) {
      this.iframe.style.height = '100%';
    }

    const doc = this._getDoc();
    if (doc) {
      const scrollStyle = doc.getElementById('webreader-scroll-style');
      if (scrollStyle) scrollStyle.remove();
    }
  }

  /**
   * Returns current scroll progress metrics.
   * @returns {{ scrollRatio: number, progressPercent: number }}
   */
  getProgress() {
    if (this.stage && this.isActive) {
      const maxScroll = Math.max(0, this.stage.scrollHeight - this.stage.clientHeight);
      this.scrollRatio = maxScroll > 0
        ? Math.max(0, Math.min(1, this.stage.scrollTop / maxScroll))
        : 0;
    }
    return {
      scrollRatio: this.scrollRatio,
      progressPercent: Math.round(this.scrollRatio * 100)
    };
  }

  _handleScroll() {
    if (!this.isActive || !this.stage) return;
    const maxScroll = Math.max(0, this.stage.scrollHeight - this.stage.clientHeight);
    this.scrollRatio = maxScroll > 0
      ? Math.max(0, Math.min(1, this.stage.scrollTop / maxScroll))
      : 0;

    this.onScrollChange({
      scrollRatio: this.scrollRatio,
      progressPercent: Math.round(this.scrollRatio * 100)
    });
  }

  _attachListeners() {
    this._detachListeners();
    if (this.stage) {
      this.stage.addEventListener('scroll', this._boundOnScroll, { passive: true });
    }
    const doc = this._getDoc();
    if (typeof ResizeObserver !== 'undefined' && doc && doc.body) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.isActive) {
          this._syncIframeHeight();
        }
      });
      this._resizeObserver.observe(doc.body);
    }
  }

  _detachListeners() {
    if (this.stage) {
      this.stage.removeEventListener('scroll', this._boundOnScroll);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _getDoc() {
    try {
      return this.iframe?.contentDocument || null;
    } catch (_) {
      return null;
    }
  }

  destroy() {
    this.deactivate();
  }
}

export default ScrollView;
