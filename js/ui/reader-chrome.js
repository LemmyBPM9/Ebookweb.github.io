/**
 * js/ui/reader-chrome.js
 * Reader Chrome Controller: Top Header Toolbar, Subtle Bottom Progress Footer,
 * 3-Zone Tap Navigation Overlay, and Keyboard Shortcuts Manager.
 */

import { EventBus, EVENTS } from '../event-bus.js';

export class ReaderChrome {
  /**
   * @param {object} options
   * @param {HTMLElement} options.readerView - #reader-view container
   * @param {import('../reader/reader-engine.js').ReaderEngine} options.engine - ReaderEngine instance
   * @param {import('./toc-drawer.js').TocDrawer} options.tocDrawer
   * @param {import('./bookmarks-drawer.js').BookmarksDrawer} options.bookmarksDrawer
   * @param {import('./settings-panel.js').SettingsPanel} options.settingsPanel
   */
  constructor(options = {}) {
    this.readerView = options.readerView;
    this.engine = options.engine;
    this.tocDrawer = options.tocDrawer;
    this.bookmarksDrawer = options.bookmarksDrawer;
    this.settingsPanel = options.settingsPanel;

    this.headerEl = this.readerView?.querySelector('#reader-header');
    this.footerEl = this.readerView?.querySelector('#reader-footer');
    this.bookTitleEl = this.readerView?.querySelector('#reader-book-title');
    this.chapterTitleEl = this.readerView?.querySelector('#chapter-title');
    this.pageInfoEl = this.readerView?.querySelector('#page-info');
    this.progressBarEl = this.readerView?.querySelector('#reader-progress-bar');
    this.modeBtn = this.readerView?.querySelector('#btn-mode');

    this.chromeVisible = true;
    this._bindButtons();
    this._bindTapZones();
    this._bindKeyboard();
    this._bindEngineEvents();
  }

  _bindButtons() {
    if (!this.readerView) return;

    const backBtn = this.readerView.querySelector('#btn-back-library');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        EventBus.emit('ui:back-to-library');
      });
    }

    const tocBtn = this.readerView.querySelector('#btn-toc');
    if (tocBtn) {
      tocBtn.addEventListener('click', () => {
        if (this.settingsPanel?.isOpen()) this.settingsPanel.close();
        if (this.tocDrawer?.isOpen()) {
          this.tocDrawer.close();
        } else {
          this.tocDrawer?.open('toc');
        }
      });
    }

    const bookmarksListBtn = this.readerView.querySelector('#btn-bookmarks');
    if (bookmarksListBtn) {
      bookmarksListBtn.addEventListener('click', () => {
        if (this.settingsPanel?.isOpen()) this.settingsPanel.close();
        this.tocDrawer?.open('bookmarks');
      });
    }

    const bookmarkToggleBtn = this.readerView.querySelector('#btn-bookmark');
    if (bookmarkToggleBtn) {
      bookmarkToggleBtn.addEventListener('click', async () => {
        const report = this.engine?.getProgress();
        await this.bookmarksDrawer?.toggleCurrentPosition(report);
      });
    }

    if (this.modeBtn) {
      this.modeBtn.addEventListener('click', () => {
        if (!this.engine) return;
        const newMode = this.engine.toggleMode();
        this.updateModeButton(newMode);
      });
    }

    const settingsBtn = this.readerView.querySelector('#btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if (this.tocDrawer?.isOpen()) this.tocDrawer.close();
        if (this.settingsPanel?.isOpen()) {
          this.settingsPanel.close();
        } else {
          this.settingsPanel?.open();
        }
      });
    }

    const prevBtn = this.readerView.querySelector('#btn-prev-page');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.engine?.prevPage());
    }

    const nextBtn = this.readerView.querySelector('#btn-next-page');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.engine?.nextPage());
    }
  }

  _bindTapZones() {
    if (!this.readerView) return;

    const leftZone = this.readerView.querySelector('.tap-zone-left');
    const centerZone = this.readerView.querySelector('.tap-zone-center');
    const rightZone = this.readerView.querySelector('.tap-zone-right');

    if (leftZone) {
      leftZone.addEventListener('click', () => {
        if (this.engine?.mode === 'paginated' || this.engine?.mode === 'pdf-visual') {
          this.engine.prevPage();
        }
      });
    }

    if (rightZone) {
      rightZone.addEventListener('click', () => {
        if (this.engine?.mode === 'paginated' || this.engine?.mode === 'pdf-visual') {
          this.engine.nextPage();
        }
      });
    }

    if (centerZone) {
      centerZone.addEventListener('click', () => {
        this.toggleChrome();
      });
    }
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Only handle keyboard shortcuts when Reader View is active
      if (!this.readerView || this.readerView.style.display === 'none') return;

      // Ignore if typing inside an input/textarea
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') {
        if (this.tocDrawer?.isOpen()) {
          this.tocDrawer.close();
          return;
        }
        if (this.settingsPanel?.isOpen()) {
          this.settingsPanel.close();
          return;
        }
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.engine?.nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.engine?.prevPage();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (e.shiftKey) {
          this.engine?.prevPage();
        } else {
          this.engine?.nextPage();
        }
      }
    });
  }

  _bindEngineEvents() {
    EventBus.on(EVENTS.PAGE_CHANGED, (report) => {
      this.updateFooter(report);
      this.bookmarksDrawer?.updateHeaderButtonState(report);
    });

    EventBus.on(EVENTS.MODE_CHANGED, ({ mode }) => {
      this.updateModeButton(mode);
    });
  }

  /**
   * Updates the header book title.
   * @param {string} title
   */
  setBookTitle(title) {
    if (this.bookTitleEl) {
      this.bookTitleEl.textContent = title || 'Untitled Book';
    }
  }

  /**
   * Updates the reading mode toggle button text and aria attributes.
   * @param {'paginated'|'scroll'|'pdf-visual'} mode
   */
  updateModeButton(mode) {
    if (!this.modeBtn) return;
    const isPdf = this.engine?.parsedEpub?.format === 'pdf';
    const labelSpan = this.modeBtn.querySelector('.mode-label');

    let labelText = 'Paginated';
    let titleText = 'Switch to Continuous Scroll View';

    if (mode === 'pdf-visual') {
      labelText = 'Visual PDF';
      titleText = 'Switch to Reflowable Text View';
    } else if (mode === 'scroll') {
      labelText = 'Scroll';
      titleText = 'Switch to Paginated View';
    } else if (isPdf) {
      labelText = 'Reflowable';
      titleText = 'Switch to Visual PDF Page View';
    }

    if (labelSpan) {
      labelSpan.textContent = labelText;
    } else {
      this.modeBtn.textContent = labelText;
    }
    this.modeBtn.setAttribute('data-current-mode', mode);
    this.modeBtn.setAttribute('title', titleText);
  }

  /**
   * Updates the footer chapter title, page counter, and progress bar.
   * @param {object} report
   */
  updateFooter(report) {
    if (!report) return;

    if (this.chapterTitleEl) {
      this.chapterTitleEl.textContent = report.chapterTitle || `Chapter ${report.spineIndex + 1}`;
    }

    if (this.pageInfoEl) {
      const pageNum = Math.max(1, (report.pageIndex || 0) + 1);
      const totalPages = Math.max(1, report.totalPages || 1);
      if (report.mode === 'scroll') {
        this.pageInfoEl.textContent = `${report.progressPercent || 0}% • Book ${report.globalPercent || 0}%`;
      } else {
        this.pageInfoEl.textContent = `Page ${pageNum} of ${totalPages} • ${report.globalPercent || 0}%`;
      }
    }

    if (this.progressBarEl) {
      const pct = Math.max(0, Math.min(100, report.globalPercent || 0));
      this.progressBarEl.style.width = `${pct}%`;
    }
  }

  /**
   * Toggles visibility of the unobtrusive header/footer chrome.
   * @param {boolean} [forceState]
   */
  toggleChrome(forceState) {
    this.chromeVisible = typeof forceState === 'boolean' ? forceState : !this.chromeVisible;
    if (this.headerEl) {
      this.headerEl.classList.toggle('is-hidden', !this.chromeVisible);
    }
    if (this.footerEl) {
      this.footerEl.classList.toggle('is-hidden', !this.chromeVisible);
    }
    EventBus.emit(EVENTS.CHROME_TOGGLE, { visible: this.chromeVisible });
  }
}

export default ReaderChrome;
