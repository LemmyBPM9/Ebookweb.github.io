/**
 * js/app.js
 * Main Application Coordinator & Router (Library View <-> Reader View).
 * Coordinates StorageManager, BookParser (EPUB, PDF, MOBI/AZW, TXT, MD), ReaderEngine,
 * UI Drawers, Auto-Seeding of Sample Book, and Automatic State Restoration across Reloads.
 */

import { EventBus, EVENTS } from './event-bus.js';
import { StorageManager, SettingsManager } from './storage/storage-manager.js';
import { seedSampleBookIfEmpty } from './sample-book.js';
import { BookParser } from './parser/book-parser.js';
import { ReaderEngine } from './reader/reader-engine.js';
import { LibraryView } from './ui/library-view.js';
import { TocDrawer } from './ui/toc-drawer.js';
import { BookmarksDrawer } from './ui/bookmarks-drawer.js';
import { SettingsPanel } from './ui/settings-panel.js';
import { ReaderChrome } from './ui/reader-chrome.js';
import { ToastManager } from './ui/toast.js';

export class WebReaderApp {
  constructor() {
    this.libraryViewEl = document.getElementById('library-view');
    this.readerViewEl = document.getElementById('reader-view');
    this.readerStageEl = document.getElementById('reader-stage');
    this.backdropEl = document.getElementById('drawer-backdrop');

    this.libraryView = null;
    this.readerEngine = null;
    this.tocDrawer = null;
    this.bookmarksDrawer = null;
    this.settingsPanel = null;
    this.readerChrome = null;

    this.activeBookId = null;
    this.activeParsedEpub = null;
    this._saveProgressTimer = null;
  }

  /**
   * Initializes the application, seeds the sample book on first run,
   * and restores either the active book session or the library shelf.
   */
  async init() {
    ToastManager.init();

    // Initialize UI & Engine sub-components
    this.libraryView = new LibraryView(this.libraryViewEl);
    this.readerEngine = new ReaderEngine({ stage: this.readerStageEl });

    this.tocDrawer = new TocDrawer({
      drawer: document.getElementById('toc-drawer'),
      backdrop: this.backdropEl
    });

    this.bookmarksDrawer = new BookmarksDrawer({
      panel: document.getElementById('bookmarks-panel'),
      bookmarkBtn: document.getElementById('btn-bookmark')
    });

    this.settingsPanel = new SettingsPanel({
      drawer: document.getElementById('settings-drawer'),
      backdrop: this.backdropEl
    });

    this.readerChrome = new ReaderChrome({
      readerView: this.readerViewEl,
      engine: this.readerEngine,
      tocDrawer: this.tocDrawer,
      bookmarksDrawer: this.bookmarksDrawer,
      settingsPanel: this.settingsPanel
    });

    // Apply initial theme & typography from localStorage
    const savedSettings = SettingsManager.getSettings();
    this.readerEngine.applyTheme(savedSettings.theme);
    this.readerEngine.applyTypography(savedSettings.typography);

    this._bindGlobalEvents();

    // Ensure IndexedDB is open and auto-seed sample book if library is empty
    await StorageManager.openDB();
    await seedSampleBookIfEmpty(StorageManager);
    await this.libraryView.renderBooks();

    // Restore active book session automatically on page reload (e.g. location.reload() / F5),
    // while starting at the Library View on fresh navigation to '/'
    let isPageReload = false;
    try {
      const navEntries = performance.getEntriesByType && performance.getEntriesByType('navigation');
      if (navEntries && navEntries.length > 0) {
        isPageReload = navEntries[0].type === 'reload';
      } else if (performance.navigation) {
        isPageReload = performance.navigation.type === 1;
      }
    } catch (_) {}

    if (isPageReload && savedSettings.lastBookId) {
      const bookExists = await StorageManager.getBook(savedSettings.lastBookId);
      if (bookExists) {
        await this.openBook(savedSettings.lastBookId);
        return;
      } else {
        SettingsManager.setLastBookId(null);
      }
    }

    this.showLibrary();
  }

  _bindGlobalEvents() {
    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => {
        this.tocDrawer?.close();
        this.settingsPanel?.close();
      });
    }

    // Library -> Open Book
    EventBus.on(EVENTS.BOOK_OPEN, async ({ bookId }) => {
      await this.openBook(bookId);
    });

    // Reader -> Back to Library
    EventBus.on('ui:back-to-library', async () => {
      await this.closeBookToLibrary();
    });

    // TOC Chapter Navigation
    EventBus.on(EVENTS.TOC_NAVIGATE, async ({ spineIndex, anchorId }) => {
      await this.readerEngine.goToChapter(spineIndex, anchorId);
      this._persistCurrentProgress();
    });

    // Bookmark Jump Navigation
    EventBus.on(EVENTS.BOOKMARK_NAVIGATE, async ({ bookmark }) => {
      if (!bookmark) return;
      this.tocDrawer?.close();
      await this.readerEngine.goToLocation(bookmark.spineIndex || 0, {
        pageIndex: bookmark.pageIndex || 0,
        scrollRatio: bookmark.scrollRatio || 0
      });
      this._persistCurrentProgress();
    });

    // Theme & Typography Updates from SettingsPanel or Library Theme Switcher
    EventBus.on('ui:set-theme', ({ themeId }) => {
      this.readerEngine.applyTheme(themeId);
    });

    EventBus.on('ui:set-typography', (partialTypo) => {
      this.readerEngine.applyTypography(partialTypo);
    });

    // Persist reading progress whenever page/scroll changes
    EventBus.on(EVENTS.PAGE_CHANGED, () => {
      this._debouncedSaveProgress();
    });

    // Handle deletion of currently active book
    EventBus.on(EVENTS.BOOK_DELETED, ({ bookId }) => {
      if (this.activeBookId === bookId) {
        SettingsManager.setLastBookId(null);
        this.activeBookId = null;
      }
    });
  }

  /**
   * Opens a book by ID from IndexedDB, parses its binary via BookParser, and transitions to Reader View.
   * @param {string} bookId
   */
  async openBook(bookId) {
    if (!bookId) return;

    this.showReader();

    try {
      let bookRecord = await StorageManager.getBook(bookId);
      if (!bookRecord && bookId === 'sample-book-001') {
        bookRecord = await seedSampleBookIfEmpty(StorageManager);
      }
      if (!bookRecord || !bookRecord.fileBlob) {
        ToastManager.show('Book file could not be found in local storage.', 'error');
        SettingsManager.setLastBookId(null);
        this.showLibrary();
        return;
      }

      // Deterministically unload any previously open book (revokes all Blob URLs & frees DOM/canvas buffers)
      this.readerEngine.unloadBook();
      if (this.activeParsedEpub) {
        this.activeParsedEpub.cleanup();
        this.activeParsedEpub = null;
      }

      const formatHint = bookRecord.format || 'epub';
      const parsedBook = await BookParser.parse(bookRecord.fileBlob, formatHint);
      this.activeBookId = bookId;
      this.activeParsedEpub = parsedBook;

      // Save active book ID so reloads restore directly into this book
      SettingsManager.setLastBookId(bookId);

      const savedProgress = await StorageManager.getProgress(bookId);
      const displayTitle = (bookRecord.title && bookRecord.title !== 'undefined')
        ? bookRecord.title
        : (parsedBook.metadata?.title || 'Untitled Book');

      this.readerChrome.setBookTitle(displayTitle);
      this.tocDrawer.render(parsedBook.toc, parsedBook.spine, savedProgress?.spineIndex || 0);

      await this.readerEngine.loadBook(parsedBook, savedProgress, bookId);
      this.readerChrome.updateModeButton(this.readerEngine.mode);

      const initialReport = this.readerEngine.getProgress();
      await this.bookmarksDrawer.loadForBook(bookId, initialReport);

      EventBus.emit(EVENTS.BOOK_LOADED, { bookRecord, parsedEpub: parsedBook, parsedBook });
    } catch (err) {
      console.error('Failed to open book:', err);
      ToastManager.show(`Could not open book: ${err.message}`, 'error');
      SettingsManager.setLastBookId(null);
      this.showLibrary();
    }
  }

  /**
   * Closes the active book, releases all memory/Blob URLs/canvases, and returns to the Library View.
   */
  async closeBookToLibrary() {
    if (this._saveProgressTimer) {
      clearTimeout(this._saveProgressTimer);
      this._saveProgressTimer = null;
    }
    await this._persistCurrentProgress();
    SettingsManager.setLastBookId(null);

    this.tocDrawer?.close();
    this.settingsPanel?.close();

    this.readerEngine.unloadBook();
    if (this.activeParsedEpub) {
      this.activeParsedEpub.cleanup();
      this.activeParsedEpub = null;
    }
    this.activeBookId = null;

    await this.libraryView.renderBooks();
    this.showLibrary();
  }

  showLibrary() {
    if (this.readerViewEl) {
      this.readerViewEl.style.display = 'none';
      this.readerViewEl.setAttribute('aria-hidden', 'true');
    }
    this.libraryView.show();
  }

  showReader() {
    this.libraryView.hide();
    if (this.readerViewEl) {
      this.readerViewEl.style.display = 'flex';
      this.readerViewEl.removeAttribute('aria-hidden');
    }
  }

  _debouncedSaveProgress() {
    if (this._saveProgressTimer) {
      clearTimeout(this._saveProgressTimer);
    }
    this._saveProgressTimer = setTimeout(() => {
      this._persistCurrentProgress();
    }, 120);
  }

  async _persistCurrentProgress() {
    if (!this.activeBookId || !this.readerEngine) return;
    try {
      const report = this.readerEngine.getProgress();
      await StorageManager.saveProgress({
        bookId: this.activeBookId,
        spineIndex: report.spineIndex,
        pageIndex: report.pageIndex,
        totalPages: report.totalPages,
        scrollRatio: report.scrollRatio,
        progressPercent: report.progressPercent,
        globalPercent: report.globalPercent,
        chapterTitle: report.chapterTitle,
        mode: report.mode
      });
    } catch (err) {
      console.warn('Could not persist reading progress:', err);
    }
  }
}

// Bootstrap on DOMContentLoaded
const app = new WebReaderApp();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.__webreaderInitPromise = app.init();
  });
} else {
  window.__webreaderInitPromise = app.init();
}

export default app;
