/**
 * js/reader/reader-engine.js
 * Master Reading Engine Controller for WebReader.
 * Manages sandboxed iframe creation/adoption, PaginatedView, ScrollView & PdfVisualView orchestration,
 * cross-chapter navigation, theme/typography CSS custom property injection,
 * deterministic resource cleanup, and EventBus synchronization.
 */

import { EventBus, EVENTS } from '../event-bus.js';
import { PaginatedView } from './paginated-view.js';
import { ScrollView } from './scroll-view.js';
import { PdfVisualView } from './pdf-visual-view.js';
import { PositionTracker } from './position-tracker.js';
import { SettingsManager } from '../storage/settings-store.js';

export const FONT_FAMILIES = Object.freeze({
  serif: "'Merriweather', 'Georgia', 'Iowan Old Style', 'Palatino Linotype', serif",
  sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', 'Trebuchet MS', 'Verdana', monospace"
});

export const THEME_PALETTES = Object.freeze({
  'warm-paper': {
    '--bg-primary': '#f8f1e3',
    '--text-primary': '#2c2523',
    '--color-bg': '#f8f1e3',
    '--color-surface': '#efe5d0',
    '--color-text': '#2c2523',
    '--color-text-secondary': '#5c504a',
    '--color-accent': '#8b5a2b',
    '--color-accent-hover': '#724820',
    '--color-border': '#dfd3bd',
    '--color-highlight': '#fcedbe'
  },
  'soft-dark': {
    '--bg-primary': '#1a1c1e',
    '--text-primary': '#e2e2e0',
    '--color-bg': '#1a1c1e',
    '--color-surface': '#24282c',
    '--color-text': '#e2e2e0',
    '--color-text-secondary': '#9e9e9a',
    '--color-accent': '#e5a869',
    '--color-accent-hover': '#f3be86',
    '--color-border': '#33383e',
    '--color-highlight': '#453c28'
  },
  'daylight': {
    '--bg-primary': '#fcfbf9',
    '--text-primary': '#1e2022',
    '--color-bg': '#fcfbf9',
    '--color-surface': '#f3f2ee',
    '--color-text': '#1e2022',
    '--color-text-secondary': '#555b62',
    '--color-accent': '#2364a0',
    '--color-accent-hover': '#1b4f80',
    '--color-border': '#e0dfd9',
    '--color-highlight': '#e1ecf8'
  },
  'sage': {
    '--bg-primary': '#eef3ed',
    '--text-primary': '#1c2820',
    '--color-bg': '#eef3ed',
    '--color-surface': '#e1eae0',
    '--color-text': '#1c2820',
    '--color-text-secondary': '#4a5d50',
    '--color-accent': '#2d7348',
    '--color-accent-hover': '#225636',
    '--color-border': '#cfdcd0',
    '--color-highlight': '#d7eedc'
  },
  'solarized-light': {
    '--bg-primary': '#fdf6e3',
    '--text-primary': '#073642',
    '--color-bg': '#fdf6e3',
    '--color-surface': '#eee8d5',
    '--color-text': '#073642',
    '--color-text-secondary': '#586e75',
    '--color-accent': '#268bd2',
    '--color-accent-hover': '#1a6091',
    '--color-border': '#d3cbb7',
    '--color-highlight': '#cfe5eb'
  },
  'solarized-dark': {
    '--bg-primary': '#002b36',
    '--text-primary': '#eee8d5',
    '--color-bg': '#002b36',
    '--color-surface': '#073642',
    '--color-text': '#eee8d5',
    '--color-text-secondary': '#93a1a1',
    '--color-accent': '#2aa198',
    '--color-accent-hover': '#36b8af',
    '--color-border': '#154855',
    '--color-highlight': '#0e4757'
  },
  'nord': {
    '--bg-primary': '#2e3440',
    '--text-primary': '#eceff4',
    '--color-bg': '#2e3440',
    '--color-surface': '#3b4252',
    '--color-text': '#eceff4',
    '--color-text-secondary': '#d8dee9',
    '--color-accent': '#88c0d0',
    '--color-accent-hover': '#81a1c1',
    '--color-border': '#4c566a',
    '--color-highlight': '#434c5e'
  },
  'oled-black': {
    '--bg-primary': '#000000',
    '--text-primary': '#c8c8c8',
    '--color-bg': '#000000',
    '--color-surface': '#121212',
    '--color-text': '#c8c8c8',
    '--color-text-secondary': '#8e8e8e',
    '--color-accent': '#e0a96d',
    '--color-accent-hover': '#f0bc84',
    '--color-border': '#282828',
    '--color-highlight': '#2a2a2a'
  },
  'rose-pine': {
    '--bg-primary': '#191724',
    '--text-primary': '#e0def4',
    '--color-bg': '#191724',
    '--color-surface': '#1f1d2e',
    '--color-text': '#e0def4',
    '--color-text-secondary': '#908caa',
    '--color-accent': '#ebbcba',
    '--color-accent-hover': '#f3d0ce',
    '--color-border': '#393552',
    '--color-highlight': '#312c49'
  },
  'e-ink': {
    '--bg-primary': '#f0f0eb',
    '--text-primary': '#1a1a1a',
    '--color-bg': '#f0f0eb',
    '--color-surface': '#e2e2dc',
    '--color-text': '#1a1a1a',
    '--color-text-secondary': '#444444',
    '--color-accent': '#2b2b2b',
    '--color-accent-hover': '#000000',
    '--color-border': '#cccccc',
    '--color-highlight': '#d0d0c8'
  }
});

export class ReaderEngine {
  /**
   * @param {object} options
   * @param {HTMLElement} options.stage - Container element (#reader-stage)
   */
  constructor(options = {}) {
    this.stage = options.stage;
    this.iframe = null;
    this.parsedEpub = null;
    this.bookId = null;

    this.spineIndex = 0;
    this.chapterTitle = '';
    this.mode = SettingsManager.getReadingMode() || 'paginated';
    this.themeId = SettingsManager.getTheme() || 'warm-paper';
    this.typography = SettingsManager.getTypography();

    this.paginatedView = null;
    this.scrollView = null;
    this.pdfVisualView = null;
    this._isLoadingChapter = false;

    this._initIframe();
  }

  /**
   * Creates or binds the sandboxed reading iframe and sub-views inside #reader-stage.
   * @private
   */
  _initIframe() {
    if (!this.stage) return;

    let existing = this.stage.querySelector('iframe#reader-frame');
    if (!existing) {
      existing = document.createElement('iframe');
      existing.id = 'reader-frame';
      existing.className = 'reader-frame';
      existing.setAttribute('sandbox', 'allow-same-origin');
      existing.setAttribute('title', 'Book Chapter Content');
      this.stage.insertBefore(existing, this.stage.firstChild);
    }
    this.iframe = existing;

    this.paginatedView = new PaginatedView({
      iframe: this.iframe,
      stage: this.stage,
      onPageChange: () => this._emitPositionUpdate(),
      onChapterBoundary: (dir) => this._handleBoundary(dir)
    });

    this.scrollView = new ScrollView({
      iframe: this.iframe,
      stage: this.stage,
      onScrollChange: () => this._emitPositionUpdate(),
      onChapterBoundary: (dir) => this._handleBoundary(dir)
    });

    this.pdfVisualView = new PdfVisualView({
      stage: this.stage,
      onPageChange: (newPageIdx) => {
        this.spineIndex = newPageIdx;
        const spineItem = this.parsedEpub?.spine?.[newPageIdx];
        if (spineItem?.title) {
          this.chapterTitle = spineItem.title;
        }
        this._emitPositionUpdate();
      },
      onSwitchToReflow: () => {
        this.setMode('paginated');
      }
    });
  }

  /**
   * Loads a parsed book (EPUB, PDF, MOBI, TXT, MD) and navigates to the saved reading position.
   *
   * @param {object} parsedBook - ParsedBook from BookParser.parse()
   * @param {object|null} [initialProgress] - Saved progress record from StorageManager
   * @param {string} [bookId] - Book ID
   * @returns {Promise<void>}
   */
  async loadBook(parsedBook, initialProgress = null, bookId = null) {
    if (!parsedBook || !Array.isArray(parsedBook.spine) || parsedBook.spine.length === 0) {
      throw new Error('Cannot load book: Document has no readable chapters.');
    }

    // Ensure iframe exists if previously unloaded
    if (!this.iframe || !this.stage?.contains(this.iframe)) {
      this._initIframe();
    }

    this.parsedEpub = parsedBook;
    this.bookId = bookId || initialProgress?.bookId || null;

    // Always initialize in Paginated View (Reflowable Text Mode) by default when opening a book
    this.pdfVisualView?.deactivate();
    if (this.iframe) {
      this.iframe.style.display = '';
    }
    this.mode = 'paginated';
    SettingsManager.setReadingMode(this.mode);

    // Find first content chapter if no initialProgress (skip cover-only if spine has > 1 chapter and index 0 is cover)
    let startSpine = 0;
    if (initialProgress && typeof initialProgress.spineIndex === 'number') {
      startSpine = Math.max(0, Math.min(parsedBook.spine.length - 1, initialProgress.spineIndex));
    } else if (parsedBook.spine.length > 1 && parsedBook.spine[0].id === 'cover-page') {
      startSpine = 1;
    }

    const locationSpec = initialProgress
      ? {
          pageIndex: initialProgress.pageIndex || 0,
          scrollRatio: initialProgress.scrollRatio || 0,
          anchorId: initialProgress.anchorId || null
        }
      : { pageIndex: 0, scrollRatio: 0 };

    await this._renderChapter(startSpine, locationSpec);
  }

  /**
   * Renders a specific spine chapter into the sandboxed iframe.
   *
   * @param {number} spineIndex
   * @param {object|number|string} [targetLocation]
   * @returns {Promise<void>}
   * @private
   */
  async _renderChapter(spineIndex, targetLocation = {}) {
    if (!this.parsedEpub || !this.iframe) return;

    const spine = this.parsedEpub.spine;
    const clampedIndex = Math.max(0, Math.min(spine.length - 1, spineIndex));
    const spineItem = spine[clampedIndex];

    this._isLoadingChapter = true;
    this.iframe.classList.add('is-loading');

    try {
      const chapterDoc = await this.parsedEpub.getChapterDocument(spineItem.fullPath);
      this.spineIndex = clampedIndex;
      this.chapterTitle = PositionTracker.resolveChapterTitle(
        this.parsedEpub.toc,
        spineItem,
        clampedIndex,
        chapterDoc
      );

      // Write chapter document into same-origin sandboxed iframe
      const iframeDoc = this.iframe.contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
        iframeDoc.close();

        // Adopt head styles from chapterDoc
        if (chapterDoc.head) {
          const headNodes = Array.from(chapterDoc.head.childNodes);
          for (const node of headNodes) {
            if (node.nodeName.toLowerCase() !== 'script') {
              iframeDoc.head.appendChild(iframeDoc.importNode(node, true));
            }
          }
        }

        // Adopt body content from chapterDoc
        if (chapterDoc.body) {
          const bodyNodes = Array.from(chapterDoc.body.childNodes);
          for (const node of bodyNodes) {
            if (node.nodeName.toLowerCase() !== 'script') {
              iframeDoc.body.appendChild(iframeDoc.importNode(node, true));
            }
          }
        }

        // Intercept internal chapter links inside iframe
        this._bindInternalLinks(iframeDoc);

        // Forward keyboard shortcuts when focus is inside the iframe
        iframeDoc.addEventListener('keydown', (e) => {
          const forwarded = new KeyboardEvent('keydown', {
            key: e.key,
            code: e.code,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(forwarded);
        });
      }

      // Inject current theme & typography variables into both host and iframe
      this.applyTheme(this.themeId);
      this.applyTypography(this.typography);

      // Activate current reading mode
      if (this.mode === 'pdf-visual' && this.parsedEpub.format === 'pdf') {
        this.paginatedView.deactivate();
        this.scrollView.deactivate();
        this.iframe.style.display = 'none';
        this.pdfVisualView.activate(
          this.parsedEpub,
          this.spineIndex,
          this.themeId,
          THEME_PALETTES[this.themeId]
        );
      } else if (this.mode === 'scroll') {
        this.pdfVisualView?.deactivate();
        this.iframe.style.display = '';
        this.paginatedView.deactivate();
        this.scrollView.isActive = true;
        if (this.stage) {
          this.stage.classList.add('scroll-mode');
          this.stage.setAttribute('data-reading-mode', 'scroll');
        }
        document.body.classList.add('scroll-mode');
        this.scrollView.onChapterLoaded(targetLocation);
      } else {
        this.pdfVisualView?.deactivate();
        this.iframe.style.display = '';
        this.scrollView.deactivate();
        this.paginatedView.isActive = true;
        if (this.stage) {
          this.stage.classList.remove('scroll-mode');
          this.stage.setAttribute('data-reading-mode', 'paginated');
        }
        document.body.classList.remove('scroll-mode');
        this.paginatedView.onChapterLoaded(targetLocation);
      }

      const progress = this.getProgress();
      EventBus.emit(EVENTS.CHAPTER_CHANGED, {
        spineIndex: this.spineIndex,
        chapterTitle: this.chapterTitle,
        totalPages: progress.totalPages,
        isFirst: this.spineIndex === 0,
        isLast: this.spineIndex === spine.length - 1
      });
      this._emitPositionUpdate();
    } finally {
      this._isLoadingChapter = false;
      this.iframe.classList.remove('is-loading');
    }
  }

  /**
   * Intercepts clicks on `<a>` links inside the chapter so internal links navigate within the book.
   * @private
   */
  _bindInternalLinks(iframeDoc) {
    iframeDoc.addEventListener('click', (e) => {
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (href.startsWith('#')) {
        const hash = href.slice(1);
        if (this.mode === 'scroll') {
          this.scrollView.goToAnchor(hash);
        } else {
          this.paginatedView.goToAnchor(hash, true);
        }
        return;
      }

      // Cross-chapter link
      const [filePart, hashPart] = href.split('#');
      if (this.parsedEpub && filePart) {
        const targetIdx = this.parsedEpub.spine.findIndex(
          s => s.href.endsWith(filePart) || s.fullPath.endsWith(filePart)
        );
        if (targetIdx !== -1) {
          this.goToChapter(targetIdx, hashPart || undefined);
        }
      }
    });
  }

  /**
   * Switches between 'paginated', 'scroll', and 'pdf-visual' reading modes while preserving relative position.
   * @param {'paginated'|'scroll'|'pdf-visual'} mode
   */
  setMode(mode) {
    let targetMode = 'paginated';
    if (mode === 'pdf-visual' && this.parsedEpub?.format === 'pdf') {
      targetMode = 'pdf-visual';
    } else if (mode === 'scroll') {
      targetMode = 'scroll';
    }
    if (this.mode === targetMode) return;

    const currentProgress = this.getProgress();
    const currentRatio = currentProgress.chapterRatio || 0;

    this.mode = targetMode;
    if (targetMode !== 'pdf-visual') {
      SettingsManager.setReadingMode(targetMode);
    }

    if (targetMode === 'pdf-visual') {
      this.paginatedView.deactivate();
      this.scrollView.deactivate();
      if (this.iframe) {
        this.iframe.style.display = 'none';
      }
      if (this.stage) {
        this.stage.classList.remove('scroll-mode');
        this.stage.setAttribute('data-reading-mode', 'pdf-visual');
      }
      document.body.classList.remove('scroll-mode');
      this.pdfVisualView.activate(
        this.parsedEpub,
        this.spineIndex,
        this.themeId,
        THEME_PALETTES[this.themeId]
      );
    } else if (targetMode === 'scroll') {
      this.pdfVisualView?.deactivate();
      if (this.iframe) {
        this.iframe.style.display = '';
      }
      this.paginatedView.deactivate();
      this.scrollView.activate(currentRatio);
    } else {
      this.pdfVisualView?.deactivate();
      if (this.iframe) {
        this.iframe.style.display = '';
      }
      this.scrollView.deactivate();
      this.paginatedView.activate();
      this.paginatedView.syncFromScrollRatio(currentRatio);
    }

    EventBus.emit(EVENTS.MODE_CHANGED, { mode: this.mode });
    this._emitPositionUpdate();
  }

  /**
   * Toggles reading mode.
   * For PDF documents, toggles between Reflowable Text ('paginated') and Visual Page ('pdf-visual').
   * For EPUB/MOBI/TXT/MD documents, toggles between 'paginated' and 'scroll'.
   * @returns {'paginated'|'scroll'|'pdf-visual'} New mode
   */
  toggleMode() {
    if (this.parsedEpub?.format === 'pdf') {
      const next = this.mode === 'pdf-visual' ? 'paginated' : 'pdf-visual';
      this.setMode(next);
      return next;
    }
    const next = this.mode === 'paginated' ? 'scroll' : 'paginated';
    this.setMode(next);
    return next;
  }

  /**
   * Advances one page (or scrolls down) and crosses chapter boundary if at the end.
   */
  nextPage() {
    if (this._isLoadingChapter) return;
    if (this.mode === 'pdf-visual') {
      this.pdfVisualView.nextPage();
    } else if (this.mode === 'scroll') {
      this.scrollView.nextPage();
    } else {
      this.paginatedView.nextPage();
    }
  }

  /**
   * Rewinds one page (or scrolls up) and crosses chapter boundary if at the start.
   */
  prevPage() {
    if (this._isLoadingChapter) return;
    if (this.mode === 'pdf-visual') {
      this.pdfVisualView.prevPage();
    } else if (this.mode === 'scroll') {
      this.scrollView.prevPage();
    } else {
      this.paginatedView.prevPage();
    }
  }

  /**
   * Handles crossing to next or previous chapter at page boundaries.
   * @param {'next'|'prev'} direction
   * @private
   */
  async _handleBoundary(direction) {
    if (!this.parsedEpub || this._isLoadingChapter) return;
    const totalChapters = this.parsedEpub.spine.length;

    if (direction === 'next') {
      if (this.spineIndex < totalChapters - 1) {
        await this._renderChapter(this.spineIndex + 1, { pageIndex: 0, scrollRatio: 0 });
      }
    } else if (direction === 'prev') {
      if (this.spineIndex > 0) {
        await this._renderChapter(this.spineIndex - 1, { landAtEnd: true });
      }
    }
  }

  /**
   * Navigates to a specific chapter index and optional section anchor.
   *
   * @param {number} spineIndex
   * @param {string} [anchorId]
   * @returns {Promise<void>}
   */
  async goToChapter(spineIndex, anchorId) {
    if (!this.parsedEpub) return;
    const targetIdx = Math.max(0, Math.min(this.parsedEpub.spine.length - 1, spineIndex));

    if (this.mode === 'pdf-visual') {
      this.spineIndex = targetIdx;
      this.pdfVisualView.goToPage(targetIdx);
      return;
    }

    if (targetIdx === this.spineIndex && anchorId) {
      if (this.mode === 'scroll') {
        this.scrollView.goToAnchor(anchorId);
      } else {
        this.paginatedView.goToAnchor(anchorId, true);
      }
      this._emitPositionUpdate();
      return;
    }

    await this._renderChapter(targetIdx, anchorId ? { anchorId } : { pageIndex: 0, scrollRatio: 0 });
  }

  /**
   * Navigates to an exact spineIndex and pageIndex/scrollRatio (e.g., from a bookmark).
   *
   * @param {number} spineIndex
   * @param {number|object} pageIndexOrLocation
   * @returns {Promise<void>}
   */
  async goToLocation(spineIndex, pageIndexOrLocation = 0) {
    if (!this.parsedEpub) return;
    const targetIdx = Math.max(0, Math.min(this.parsedEpub.spine.length - 1, spineIndex));

    if (this.mode === 'pdf-visual') {
      this.spineIndex = targetIdx;
      this.pdfVisualView.goToPage(targetIdx);
      return;
    }

    let loc = {};
    if (typeof pageIndexOrLocation === 'number') {
      if (this.mode === 'scroll' && pageIndexOrLocation <= 1 && pageIndexOrLocation > 0 && !Number.isInteger(pageIndexOrLocation)) {
        loc = { scrollRatio: pageIndexOrLocation };
      } else {
        loc = { pageIndex: Math.floor(pageIndexOrLocation), scrollRatio: 0 };
      }
    } else if (pageIndexOrLocation && typeof pageIndexOrLocation === 'object') {
      loc = pageIndexOrLocation;
    }

    await this._renderChapter(targetIdx, loc);
  }

  /**
   * Applies one of the 10 eye-comfort themes to host DOM, sandboxed iframe, and PDF visual canvas.
   * @param {string} themeId
   */
  applyTheme(themeId) {
    const validTheme = THEME_PALETTES[themeId] ? themeId : 'warm-paper';
    this.themeId = validTheme;
    SettingsManager.setTheme(validTheme);

    document.documentElement.dataset.theme = validTheme;
    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
      document.body.dataset.theme = validTheme;
      document.body.setAttribute('data-theme', validTheme);
    }
    if (this.stage) {
      this.stage.dataset.theme = validTheme;
      this.stage.setAttribute('data-theme', validTheme);
    }

    const palette = THEME_PALETTES[validTheme];
    const iframeDoc = this.iframe?.contentDocument;
    if (iframeDoc && iframeDoc.documentElement) {
      iframeDoc.documentElement.dataset.theme = validTheme;
      iframeDoc.documentElement.setAttribute('data-theme', validTheme);
      for (const [prop, val] of Object.entries(palette)) {
        iframeDoc.documentElement.style.setProperty(prop, val);
      }
      if (iframeDoc.body) {
        iframeDoc.body.className = `theme-${validTheme}`;
        iframeDoc.body.dataset.theme = validTheme;
        iframeDoc.body.setAttribute('data-theme', validTheme);
        iframeDoc.body.style.backgroundColor = palette['--color-bg'];
        iframeDoc.body.style.color = palette['--color-text'];
      }

      this._injectIframeThemeStylesheet(iframeDoc, validTheme, palette);
    }

    if (this.pdfVisualView) {
      this.pdfVisualView.applyTheme(validTheme, palette);
    }

    EventBus.emit(EVENTS.THEME_CHANGED, { themeId: validTheme });
  }

  /**
   * Injects or updates high-specificity theme override rules inside the iframe.
   * @param {Document} iframeDoc
   * @param {string} themeId
   * @param {object} palette
   * @private
   */
  _injectIframeThemeStylesheet(iframeDoc, themeId, palette) {
    if (!iframeDoc || !iframeDoc.head) return;

    let styleEl = iframeDoc.getElementById('webreader-theme-style');
    if (!styleEl) {
      styleEl = iframeDoc.createElement('style');
      styleEl.id = 'webreader-theme-style';
      iframeDoc.head.appendChild(styleEl);
    }

    const isDark = ['soft-dark', 'solarized-dark', 'nord', 'oled-black', 'rose-pine'].includes(themeId);

    styleEl.textContent = `
      :root, [data-theme="${themeId}"], .theme-${themeId}, body.theme-${themeId} {
        color-scheme: ${isDark ? 'dark' : 'light'};
        --color-bg: ${palette['--color-bg']} !important;
        --color-surface: ${palette['--color-surface']} !important;
        --color-text: ${palette['--color-text']} !important;
        --color-text-secondary: ${palette['--color-text-secondary']} !important;
        --color-accent: ${palette['--color-accent']} !important;
        --color-accent-hover: ${palette['--color-accent-hover']} !important;
        --color-border: ${palette['--color-border']} !important;
        --color-highlight: ${palette['--color-highlight']} !important;
        --bg-primary: ${palette['--color-bg']} !important;
        --text-primary: ${palette['--color-text']} !important;
      }
      html, body {
        background-color: var(--color-bg) !important;
        color: var(--color-text) !important;
      }
      body, p, div, span, li, dd, dt {
        color: var(--color-text) !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: var(--color-text) !important;
      }
      a, a:link, a:visited {
        color: var(--color-accent) !important;
        text-decoration: underline;
        text-decoration-color: var(--color-accent);
      }
      a:hover, a:active {
        color: var(--color-accent-hover) !important;
      }
      blockquote {
        border-left: 3px solid var(--color-accent) !important;
        color: var(--color-text-secondary) !important;
        background: transparent !important;
      }
      code, pre, kbd, samp {
        background-color: var(--color-surface) !important;
        color: var(--color-text) !important;
        border: 1px solid var(--color-border) !important;
      }
      hr {
        border: none !important;
        border-top: 1px solid var(--color-border) !important;
      }
      table, th, td {
        border-color: var(--color-border) !important;
      }
      th {
        background-color: var(--color-surface) !important;
        color: var(--color-text) !important;
      }
      ::selection {
        background-color: var(--color-highlight) !important;
        color: inherit !important;
      }
    `;
  }

  /**
   * Applies typography settings (fontFamily, fontSize, lineHeight, maxWidth) to host and iframe.
   * @param {object} partialTypography
   */
  applyTypography(partialTypography = {}) {
    this.typography = {
      ...this.typography,
      ...partialTypography
    };
    SettingsManager.setTypography(this.typography);

    const fontStack = FONT_FAMILIES[this.typography.fontFamily] || FONT_FAMILIES.serif;
    const fontSizePx = `${Number(this.typography.fontSize) || 18}px`;
    const lineHeightVal = String(Number(this.typography.lineHeight) || 1.75);
    const maxWidthPx = `${Number(this.typography.maxWidth) || 720}px`;

    const targets = [document.documentElement];
    if (this.stage) targets.push(this.stage);

    for (const el of targets) {
      el.style.setProperty('--reader-font-family', fontStack);
      el.style.setProperty('--reader-font-size', fontSizePx);
      el.style.setProperty('--reader-line-height', lineHeightVal);
      el.style.setProperty('--reader-max-width', maxWidthPx);
    }
    if (this.stage) {
      this.stage.style.fontSize = fontSizePx;
    }

    const iframeDoc = this.iframe?.contentDocument;
    if (iframeDoc && iframeDoc.documentElement) {
      const iRoot = iframeDoc.documentElement;
      iRoot.style.setProperty('--reader-font-family', fontStack);
      iRoot.style.setProperty('--reader-font-size', fontSizePx);
      iRoot.style.setProperty('--reader-line-height', lineHeightVal);
      iRoot.style.setProperty('--reader-max-width', maxWidthPx);

      const viewW = this.iframe.clientWidth || 1000;
      const targetW = Number(this.typography.maxWidth) || 720;
      const horizPad = Math.max(28, Math.round((viewW - Math.min(viewW - 56, targetW)) / 2));
      iRoot.style.setProperty('--page-padding-h', `${horizPad}px`);

      if (this.mode === 'scroll') {
        this.scrollView._syncIframeHeight();
      } else if (this.mode === 'paginated') {
        const oldRatio = this.paginatedView.getProgress().progressRatio;
        this.paginatedView.calculatePagination();
        this.paginatedView.syncFromScrollRatio(oldRatio);
      }
    }

    EventBus.emit(EVENTS.TYPOGRAPHY_CHANGED, { ...this.typography });
  }

  /**
   * Returns complete current reading position report.
   * @returns {object}
   */
  getProgress() {
    if (this.mode === 'pdf-visual' && this.pdfVisualView) {
      const vp = this.pdfVisualView.getProgress();
      return {
        bookId: this.bookId,
        spineIndex: vp.pageIndex,
        chapterTitle: this.chapterTitle || `Page ${vp.pageIndex + 1}`,
        pageIndex: vp.pageIndex,
        totalPages: vp.totalPages,
        scrollRatio: vp.progressRatio,
        chapterRatio: vp.progressRatio,
        progressPercent: vp.progressPercent,
        globalPercent: vp.progressPercent,
        mode: this.mode,
        snippet: this.chapterTitle || `PDF Page ${vp.pageIndex + 1}`
      };
    }

    const spineLength = this.parsedEpub?.spine?.length || 1;
    const pag = this.paginatedView ? this.paginatedView.getProgress() : { pageIndex: 0, totalPages: 1, progressRatio: 0 };
    const scr = this.scrollView ? this.scrollView.getProgress() : { scrollRatio: 0, progressPercent: 0 };

    const computed = PositionTracker.computeProgress({
      spineIndex: this.spineIndex,
      spineLength,
      pageIndex: pag.pageIndex,
      totalPages: pag.totalPages,
      scrollRatio: this.mode === 'scroll' ? scr.scrollRatio : pag.progressRatio,
      mode: this.mode
    });

    const iframeDoc = this.iframe?.contentDocument;
    const snippet = PositionTracker.extractSnippet(iframeDoc, computed.chapterRatio);

    return {
      bookId: this.bookId,
      spineIndex: computed.spineIndex,
      chapterTitle: this.chapterTitle || `Chapter ${computed.spineIndex + 1}`,
      pageIndex: computed.pageIndex,
      totalPages: computed.totalPages,
      scrollRatio: computed.scrollRatio,
      chapterRatio: computed.chapterRatio,
      progressPercent: computed.progressPercent,
      globalPercent: computed.globalPercent,
      mode: this.mode,
      snippet
    };
  }

  _emitPositionUpdate() {
    const report = this.getProgress();
    EventBus.emit(EVENTS.PAGE_CHANGED, report);
  }

  /**
   * Deterministic book unload when returning to Library View:
   * - Deactivates PaginatedView, ScrollView, and PdfVisualView (zeroing canvas bitmap)
   * - Empties iframe DOM tree to release chapter nodes & decoded images
   * - Calls parsedEpub.cleanup() to revoke 100% of Blob URLs
   */
  unloadBook() {
    if (this.paginatedView) this.paginatedView.deactivate();
    if (this.scrollView) this.scrollView.deactivate();
    if (this.pdfVisualView) this.pdfVisualView.deactivate();

    if (this.iframe) {
      this.iframe.style.display = '';
      const iframeDoc = this.iframe.contentDocument;
      if (iframeDoc) {
        if (iframeDoc.body) iframeDoc.body.innerHTML = '';
        if (iframeDoc.head) iframeDoc.head.innerHTML = '';
      }
    }

    if (this.parsedEpub && typeof this.parsedEpub.cleanup === 'function') {
      this.parsedEpub.cleanup();
    }
    this.parsedEpub = null;
    this.bookId = null;
  }

  destroy() {
    this.unloadBook();
    if (this.paginatedView) this.paginatedView.destroy();
    if (this.scrollView) this.scrollView.destroy();
    if (this.pdfVisualView) this.pdfVisualView.destroy();
  }
}

export default ReaderEngine;
