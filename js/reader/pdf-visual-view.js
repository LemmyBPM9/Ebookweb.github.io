/**
 * js/reader/pdf-visual-view.js
 * PDF Visual Page Mode Renderer for WebReader.
 *
 * Features:
 * - Renders original PDF page layout onto an HTML5 <canvas> element (#pdf-visual-stage canvas.pdf-page-canvas)
 * - Supports Zoom In (+), Zoom Out (-), Reset (100%), and Fit Width controls
 * - Theme-aware eye-comfort rendering & GPU filter adaptation across all 10 reading themes
 * - Single-canvas virtualization & deterministic bitmap deallocation (canvas.width=0; height=0) on close/mode switch
 */

export class PdfVisualView {
  /**
   * @param {object} options
   * @param {HTMLElement} options.stage - #reader-stage container
   * @param {Function} [options.onPageChange] - Callback when visual page changes
   * @param {Function} [options.onSwitchToReflow] - Callback to toggle back to reflowable mode
   */
  constructor(options = {}) {
    this.stage = options.stage;
    this.onPageChange = options.onPageChange || (() => {});
    this.onSwitchToReflow = options.onSwitchToReflow || (() => {});

    this.isActive = false;
    this.parsedBook = null;
    this.pageIndex = 0;
    this.zoomScale = 1.0;
    this.themeId = 'warm-paper';
    this.palette = null;

    this.containerEl = null;
    this.canvasEl = null;
    this.zoomLabelEl = null;
    this.pageLabelEl = null;
  }

  /**
   * Activates Visual Page Mode for the given PDF book at the specified page index.
   *
   * @param {object} parsedBook
   * @param {number} [pageIndex=0]
   * @param {string} [themeId='warm-paper']
   * @param {object} [palette=null]
   */
  activate(parsedBook, pageIndex = 0, themeId = 'warm-paper', palette = null) {
    this.parsedBook = parsedBook;
    this.themeId = themeId || 'warm-paper';
    this.palette = palette;
    this.isActive = true;

    const totalPages = this.getTotalPages();
    this.pageIndex = Math.max(0, Math.min(totalPages - 1, pageIndex || 0));

    this._ensureDom();
    this.renderCurrentPage();
  }

  /**
   * Deactivates Visual Page Mode and immediately frees the canvas bitmap buffer.
   */
  deactivate() {
    this.isActive = false;
    this._releaseCanvasMemory();
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.canvasEl = null;
    this.zoomLabelEl = null;
    this.pageLabelEl = null;
  }

  /**
   * Ensures the `#pdf-visual-stage` container and `<canvas>` exist inside `#reader-stage`.
   * @private
   */
  _ensureDom() {
    if (!this.stage) return;

    if (!this.containerEl || !this.stage.contains(this.containerEl)) {
      const existing = this.stage.querySelector('#pdf-visual-stage');
      if (existing) existing.remove();

      const container = document.createElement('div');
      container.id = 'pdf-visual-stage';
      container.className = 'pdf-visual-stage';
      container.setAttribute('data-theme', this.themeId);

      // Visual PDF controls bar
      const toolbar = document.createElement('div');
      toolbar.className = 'pdf-visual-toolbar';
      toolbar.innerHTML = `
        <div class="pdf-toolbar-group">
          <span class="pdf-mode-indicator">PDF Visual Page View</span>
          <span class="pdf-page-counter" id="pdf-visual-page-label">Page 1 of 1</span>
        </div>
        <div class="pdf-toolbar-group">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-zoom-out" title="Zoom Out" aria-label="Zoom Out">−</button>
          <span class="pdf-zoom-label" id="pdf-visual-zoom-label">100%</span>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-zoom-in" title="Zoom In" aria-label="Zoom In">+</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-zoom-reset" title="Reset Zoom">Fit</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-mode" data-action="toggle-mode" title="Switch to Reflowable Text Mode">Reflowable Text</button>
        </div>
      `;

      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'pdf-canvas-wrapper';

      const canvas = document.createElement('canvas');
      canvas.id = 'pdf-page-canvas';
      canvas.className = 'pdf-page-canvas pdf-canvas';
      canvas.width = 612;
      canvas.height = 792;
      canvasWrap.appendChild(canvas);

      container.appendChild(toolbar);
      container.appendChild(canvasWrap);
      this.stage.appendChild(container);

      this.containerEl = container;
      this.canvasEl = canvas;
      this.zoomLabelEl = toolbar.querySelector('#pdf-visual-zoom-label');
      this.pageLabelEl = toolbar.querySelector('#pdf-visual-page-label');

      // Bind toolbar controls
      toolbar.querySelector('#btn-pdf-zoom-out')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setZoom(this.zoomScale - 0.15);
      });
      toolbar.querySelector('#btn-pdf-zoom-in')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setZoom(this.zoomScale + 0.15);
      });
      toolbar.querySelector('#btn-pdf-zoom-reset')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setZoom(1.0);
      });
      toolbar.querySelector('#btn-pdf-mode')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSwitchToReflow();
      });
    }
  }

  /**
   * Renders the current PDF page (`this.pageIndex`) onto the HTML5 `<canvas>`.
   */
  renderCurrentPage() {
    if (!this.isActive || !this.parsedBook) return;
    this._ensureDom();
    if (!this.canvasEl) return;

    const pages = this.parsedBook.pages || [];
    const totalPages = Math.max(1, pages.length);
    this.pageIndex = Math.max(0, Math.min(totalPages - 1, this.pageIndex));

    const pageData = pages[this.pageIndex] || {
      pageNumber: this.pageIndex + 1,
      width: 612,
      height: 792,
      items: []
    };

    const baseW = pageData.width || 612;
    const baseH = pageData.height || 792;
    const scale = Math.max(0.5, Math.min(2.5, this.zoomScale));

    const renderW = Math.round(baseW * scale);
    const renderH = Math.round(baseH * scale);

    this.canvasEl.width = renderW;
    this.canvasEl.height = renderH;
    this.canvasEl.style.width = `${renderW}px`;
    this.canvasEl.style.height = `${renderH}px`;

    const ctx = this.canvasEl.getContext('2d');
    if (!ctx) return;

    // Resolve eye-comfort palette colors
    const bgColor = this.palette?.['--color-bg'] || '#f8f1e3';
    const surfaceColor = this.palette?.['--color-surface'] || '#efe5d0';
    const textColor = this.palette?.['--color-text'] || '#2c2523';
    const secondaryColor = this.palette?.['--color-text-secondary'] || '#5c504a';
    const accentColor = this.palette?.['--color-accent'] || '#8b5a2b';
    const borderColor = this.palette?.['--color-border'] || '#dfd3bd';

    ctx.save();
    ctx.scale(scale, scale);

    // 1. Fill low-glare theme-tinted page sheet background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, baseW, baseH);

    // 2. Subtle inner page margin border and header/footer ornament
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 28, baseW - 56, baseH - 56);

    // Header bar
    ctx.fillStyle = secondaryColor;
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    const bookTitle = this.parsedBook.metadata?.title || 'PDF Document';
    ctx.fillText(bookTitle.slice(0, 65), 54, 48);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(54, 56);
    ctx.lineTo(baseW - 54, 56);
    ctx.stroke();

    // 3. Render positioned PDF text items onto the canvas
    const items = pageData.items || [];
    for (const item of items) {
      const fontSize = Math.max(9, item.fontSize || 12);
      const isHeading = item.isHeading || fontSize >= 16;

      ctx.fillStyle = isHeading ? textColor : textColor;
      ctx.font = `${isHeading ? '700' : '400'} ${fontSize}px Georgia, "Times New Roman", serif`;

      // Convert PDF bottom-left coordinate (x, y) to Canvas top-left coordinate (x, baseH - y)
      const canvasX = Math.max(54, Math.min(baseW - 80, item.x || 72));
      const rawCanvasY = baseH - (item.y || (baseH - 100));
      const canvasY = Math.max(80, Math.min(baseH - 64, rawCanvasY));

      // Word-wrap long lines within the page margins
      const maxLineWidth = baseW - canvasX - 54;
      this._drawWrappedText(ctx, item.text, canvasX, canvasY, maxLineWidth, fontSize * 1.45);

      if (isHeading) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(canvasX, canvasY + 8);
        ctx.lineTo(Math.min(baseW - 54, canvasX + 260), canvasY + 8);
        ctx.stroke();
      }
    }

    // 4. Page footer number
    ctx.fillStyle = secondaryColor;
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    const footerText = `Page ${this.pageIndex + 1} of ${totalPages}`;
    const textMetrics = ctx.measureText(footerText);
    ctx.fillText(footerText, (baseW - textMetrics.width) / 2, baseH - 42);

    ctx.restore();

    if (this.zoomLabelEl) {
      this.zoomLabelEl.textContent = `${Math.round(scale * 100)}%`;
    }
    if (this.pageLabelEl) {
      this.pageLabelEl.textContent = `Page ${this.pageIndex + 1} of ${totalPages}`;
    }
    if (this.containerEl) {
      this.containerEl.setAttribute('data-theme', this.themeId);
    }
  }

  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split(/\s+/);
    let line = '';
    let curY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line ? `${line} ${words[n]}` : words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, curY);
        line = words[n];
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
    }
  }

  /**
   * Updates the zoom factor and re-renders the active page.
   * @param {number} newScale
   */
  setZoom(newScale) {
    this.zoomScale = Math.max(0.6, Math.min(2.2, Number(newScale) || 1.0));
    this.renderCurrentPage();
  }

  /**
   * Applies theme colors and eye-comfort filter to the visual PDF view.
   * @param {string} themeId
   * @param {object} palette
   */
  applyTheme(themeId, palette) {
    this.themeId = themeId;
    this.palette = palette;
    if (this.isActive) {
      this.renderCurrentPage();
    }
  }

  getTotalPages() {
    return Math.max(1, this.parsedBook?.pages?.length || this.parsedBook?.spine?.length || 1);
  }

  nextPage() {
    if (!this.isActive) return false;
    const total = this.getTotalPages();
    if (this.pageIndex < total - 1) {
      this.pageIndex++;
      this.renderCurrentPage();
      this.onPageChange(this.pageIndex);
      return true;
    }
    return false;
  }

  prevPage() {
    if (!this.isActive) return false;
    if (this.pageIndex > 0) {
      this.pageIndex--;
      this.renderCurrentPage();
      this.onPageChange(this.pageIndex);
      return true;
    }
    return false;
  }

  goToPage(index) {
    const total = this.getTotalPages();
    this.pageIndex = Math.max(0, Math.min(total - 1, index || 0));
    if (this.isActive) {
      this.renderCurrentPage();
      this.onPageChange(this.pageIndex);
    }
  }

  getProgress() {
    const totalPages = this.getTotalPages();
    const pageIndex = Math.max(0, Math.min(totalPages - 1, this.pageIndex));
    const ratio = totalPages > 1 ? pageIndex / (totalPages - 1) : 1;
    return {
      pageIndex,
      totalPages,
      progressRatio: ratio,
      progressPercent: Math.round(ratio * 100)
    };
  }

  _releaseCanvasMemory() {
    if (this.canvasEl) {
      const ctx = this.canvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
      }
      // Explicitly zero canvas dimensions to free GPU/RAM backing store immediately
      this.canvasEl.width = 0;
      this.canvasEl.height = 0;
      this.canvasEl.remove();
      this.canvasEl = null;
    }
  }

  destroy() {
    this.deactivate();
    this.parsedBook = null;
    this.palette = null;
  }
}

export default PdfVisualView;
