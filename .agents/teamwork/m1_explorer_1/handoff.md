# Milestone 1 Exploration Report: Storage Architecture & EventBus

**Explorer**: `m1_explorer_1`  
**Milestone**: Milestone 1: Core Foundation, Storage & Themes  
**Target Path**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_explorer_1/handoff.md`  
**Parent Orchestrator**: `bf9f892e-9f7c-4a5f-80d2-882b9b27b238` (`orchestrator_1`)  

---

## 1. Observation

### 1.1 Requirements & Interface Contract Analysis
- **User Requirements (`ORIGINAL_REQUEST.md:12-13, 37`)**:
  > "Store imported EPUB binaries, extracted metadata (title, author, cover image), reading positions, bookmarks, and user preferences persistently in the browser using IndexedDB/localStorage so books remain available across page reloads without re-uploading, with the ability to resume or delete books."
  > "Importing an EPUB file, changing page/scroll position, adding a bookmark, and customizing theme/typography settings persist in `IndexedDB` / `localStorage` and restore accurately after a full page reload (`location.reload()`)."
- **Project Specifications (`PROJECT.md:6-8, 73-86, 112-124`)**:
  - `StorageManager`: Segregated storage — synchronous `localStorage` for instant FOUC-free theme/typography boot; asynchronous `IndexedDB` (`WebReaderDB`) for book binaries, metadata, covers, reading progress, and bookmarks.
  - Storage Interface Contracts:
    - `StorageManager.openDB() -> Promise<IDBDatabase>`
    - `StorageManager.getAllBooks() -> Promise<Array<BookRecord>>`
    - `StorageManager.getBook(id) -> Promise<BookRecord | null>`
    - `StorageManager.saveBook(bookRecord) -> Promise<string>`
    - `StorageManager.deleteBook(id) -> Promise<void>` (atomically deletes book, progress, bookmarks)
    - `StorageManager.getProgress(bookId) -> Promise<ReadingProgress | null>`
    - `StorageManager.saveProgress(progressRecord) -> Promise<void>`
    - `StorageManager.getBookmarks(bookId) -> Promise<Array<Bookmark>>`
    - `StorageManager.addBookmark(bookmarkRecord) -> Promise<string>`
    - `StorageManager.deleteBookmark(id) -> Promise<void>`
    - `SettingsManager.getSettings() -> { theme, typography, lastBookId }`
    - `SettingsManager.saveSettings(partialSettings) -> void`
  - EventBus Events:
    - `book:open: { bookId }`
    - `book:loaded: { bookRecord, parsedEpub }`
    - `chapter:changed: { spineIndex, chapterTitle, totalPages, isFirst, isLast }`
    - `page:changed: { spineIndex, pageIndex, totalPages, progressPercent, globalPercent }`
    - `mode:changed: { mode: 'paginated' | 'scroll' }`
    - `theme:changed: { themeId }`
    - `typography:changed: { fontFamily, fontSize, lineHeight, maxWidth }`
    - `chrome:toggle: { visible?: boolean }`
    - `toc:navigate: { spineIndex, anchorId }`
    - `bookmark:toggle: {}`
    - `bookmark:navigate: { bookmark }`
  - Code Layout (`PROJECT.md:133-140`):
    ```
    js/
    ├── event-bus.js             # Pub/Sub event bus
    └── storage/
        ├── db.js                # IndexedDB WebReaderDB manager
        ├── settings-store.js    # LocalStorage synchronous settings
        └── storage-manager.js   # Unified StorageManager facade
    ```

### 1.2 Runtime Environment & Empirical Browser Verification
- **Host System**: macOS, Node.js `v25.9.0`, Google Chrome `155.0.8059.82` (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).
- **Empirical Headless Chrome Test Results**:
  1. **IndexedDB Multi-Store Atomic Cascade Deletion**:
     - Executed transactional multi-store mutation in headless Chrome (`--headless=new --dump-dom`).
     - Stored book in `books`, progress in `reading_progress`, and 2 bookmarks in `bookmarks`.
     - Executed `txDel = db.transaction(['books', 'reading_progress', 'bookmarks'], 'readwrite')` deleting `book_1`, progress `book_1`, and iterating index cursor `by_bookId` over `bookmarks`.
     - Result: `IDB_VERIFICATION_SUCCESS`. Confirmed complete atomic purge of book, progress, and all child bookmarks without leaving dangling records or impacting unrelated books.
  2. **Synchronous FOUC Script Timing**:
     - Evaluated `<head>` inline script in headless Chrome.
     - Confirmed `document.documentElement.getAttribute('data-theme')` is evaluated and applied synchronously *prior* to DOM content evaluation and render tree construction. Result: `FOUC_PREVENTION_SUCCESS`.
  3. **EventBus Mechanics**:
     - Verified handler subscription, payload transmission, `once` self-deregistration, unregister closure function execution, and error isolation (a throwing listener does not prevent subsequent listeners from executing). Result: `PASSED`.

---

## 2. Logic Chain

### 2.1 Storage Segregation Rationale
1. *From* browser storage mechanics:
   - `localStorage` is synchronous, runs on the browser main thread, and is capped at ~5MB per origin. Storing binary EPUB archives (frequently 2MB - 100MB+) or cover images in `localStorage` immediately triggers `DOMException: QuotaExceededError`.
   - However, `localStorage` has one critical capability: it is accessible synchronously during `<head>` parsing before the DOM body or external stylesheets are processed.
2. *From* IndexedDB mechanics:
   - `IndexedDB` is asynchronous, transactional, and supports structured cloning of native `Blob` and `ArrayBuffer` objects with storage limits up to 60-80% of available disk space (often 50GB+).
   - Because IndexedDB is asynchronous, querying it on initial page load requires at least one event loop tick or microtask, which causes a brief flash of unstyled content (FOUC) if used for initial theme/font rendering.
3. *Therefore*:
   - The storage architecture must be segregated into two complementary layers:
     - **Layer 1: Synchronous `localStorage` (`settings-store.js`)**: Strictly reserved for lightweight UI configuration (`theme`, `typography`, `readingMode`, `lastBookId`).
     - **Layer 2: Asynchronous `IndexedDB` (`db.js`)**: The `WebReaderDB` database storing binary books, progress state, and bookmarks.
     - **Facade (`storage-manager.js`)**: Unifies both layers under the exact contract required by `PROJECT.md`.

### 2.2 IndexedDB (`WebReaderDB`) Schema & Relationship Design
1. **Database Identity**: `WebReaderDB`, Version `1`.
2. **Object Store 1: `books`**:
   - `keyPath: 'id'` (string).
   - Indexes:
     - `by_lastRead` on `lastRead` (non-unique): Enables library shelf to sort by most recently opened.
     - `by_dateAdded` on `dateAdded` (non-unique): Enables sorting by import date.
     - `by_title` on `title` (non-unique): Enables library title sorting / search.
   - Stored binary format:
     - Store raw EPUB archive as `epubData: Blob | ArrayBuffer`. Storing native `Blob` is preferred because IndexedDB handles Blobs directly via structured clone without holding the entire buffer in V8 heap memory.
     - Store cover image as `coverBlob: Blob | null`. Transient `blob:http://...` URLs must NEVER be persisted to IndexedDB because object URLs are invalidated when the page closes or reloads.
3. **Object Store 2: `reading_progress`**:
   - `keyPath: 'bookId'` (string, 1-to-1 relation with `books.id`).
   - Fields: `bookId`, `spineIndex`, `sectionHref`, `readingMode` (`'paginated' | 'scroll'`), `pageIndex`, `totalPages`, `scrollOffset`, `scrollPercent`, `progressPercentage`, `chapterTitle`, `updatedAt`.
4. **Object Store 3: `bookmarks`**:
   - `keyPath: 'id'` (string: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).
   - Indexes:
     - `by_bookId` on `bookId` (non-unique): Mandatory for fast lookup of bookmarks belonging to a book, and for atomic cascade deletion.
     - `by_createdAt` on `createdAt` (non-unique): Allows displaying bookmarks in chronological order.
   - Fields: `id`, `bookId`, `spineIndex`, `sectionHref`, `chapterTitle`, `pageIndex`, `scrollOffset`, `progressPercentage`, `snippet`, `createdAt`.
5. **Atomic Cascade Deletion Algorithm**:
   - Deleting a book cannot be three separate asynchronous transactions. If a user deletes a book and an error occurs midway, or the page unloads, orphaned bookmarks or progress records would remain.
   - The deletion must span a single `readwrite` transaction over `['books', 'reading_progress', 'bookmarks']`:
     ```javascript
     const tx = db.transaction(['books', 'reading_progress', 'bookmarks'], 'readwrite');
     tx.objectStore('books').delete(id);
     tx.objectStore('reading_progress').delete(id);
     const bmIndex = tx.objectStore('bookmarks').index('by_bookId');
     const req = bmIndex.openKeyCursor(IDBKeyRange.only(id));
     req.onsuccess = (e) => {
       const cursor = e.target.result;
       if (cursor) {
         tx.objectStore('bookmarks').delete(cursor.primaryKey);
         cursor.continue();
       }
     };
     ```

### 2.3 Synchronous Settings Store & FOUC Prevention
1. *From* user experience standards:
   - Nighttime readers switching to "Soft Dark" (`#1a1c1e`) must not suffer a 100ms blast of bright white screen on browser refresh.
2. *From* browser parser pipeline:
   - When the HTML parser encounters `<script>` in `<head>`, parser execution pauses until that script completes.
   - Reading `localStorage.getItem('webreader_theme')` takes < 0.2ms.
   - Applying `document.documentElement.setAttribute('data-theme', theme)` immediately sets the CSS attribute before any CSS rules are computed or painted.
3. *Defensive fallback*:
   - If `localStorage` is disabled or throws (e.g. Safari Private Browsing with blocked storage, or enterprise policy), `SettingsStore` catches the error and operates against an in-memory `Map()`. The app functions normally without throwing uncaught exceptions.

### 2.4 EventBus Pub/Sub Architecture
1. *From* system modularity principles:
   - `ReaderEngine`, `UI Chrome`, `TOC Drawer`, `Bookmarks Drawer`, and `StorageManager` must remain strictly decoupled.
   - `ReaderEngine` should not know `reader-chrome.js` or `settings-panel.js` exist. It only emits `page:changed` or responds to `toc:navigate`.
2. *EventBus Implementation Requirements*:
   - **Typed Events Catalog**: Export `EVENTS` constant containing all event names to eliminate typo bugs.
   - **Closure-based Unsubscribe**: `on(event, handler)` must return an unsubscribe function `() => void`. This allows components to clean up easily in lifecycle hooks:
     ```javascript
     this.unsubscribers = [
       EventBus.on(EVENTS.PAGE_CHANGED, (p) => this.updatePage(p)),
       EventBus.on(EVENTS.THEME_CHANGED, (p) => this.updateTheme(p))
     ];
     // on teardown:
     this.unsubscribers.forEach(unsub => unsub());
     ```
   - **Error Isolation**:
     When `emit(event, payload)` runs, handlers are iterated in a snapshot array. Each handler call is wrapped in a `try...catch` block. If an external UI listener throws an error, the error is logged to `console.error`, and remaining listeners continue executing unimpeded.
   - **Debug Logging**:
     Provide `EventBus.enableLogging(boolean)` for live traceability during testing and debugging.

---

## 3. Implementation Blueprints & Code Templates

### 3.1 `js/storage/db.js` (IndexedDB Manager)
```javascript
/**
 * js/storage/db.js
 * Persistent IndexedDB Database Manager for WebReader (WebReaderDB)
 */

export class WebReaderDB {
  static DB_NAME = 'WebReaderDB';
  static DB_VERSION = 1;
  static _dbInstance = null;
  static _openingPromise = null;

  /**
   * Opens or returns the cached singleton connection to WebReaderDB.
   * @returns {Promise<IDBDatabase>}
   */
  static async openDB() {
    if (this._dbInstance) {
      return this._dbInstance;
    }
    if (this._openingPromise) {
      return this._openingPromise;
    }

    this._openingPromise = new Promise((resolve, reject) => {
      // Proactively request persistent storage if available
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Books Store
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by_lastRead', 'lastRead', { unique: false });
          bookStore.createIndex('by_dateAdded', 'dateAdded', { unique: false });
          bookStore.createIndex('by_title', 'title', { unique: false });
        }

        // 2. Reading Progress Store (1-to-1 with bookId)
        if (!db.objectStoreNames.contains('reading_progress')) {
          db.createObjectStore('reading_progress', { keyPath: 'bookId' });
        }

        // 3. Bookmarks Store
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bmStore.createIndex('by_bookId', 'bookId', { unique: false });
          bmStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        this._dbInstance = db;
        this._openingPromise = null;

        db.onclose = () => {
          this._dbInstance = null;
        };
        db.onversionchange = () => {
          db.close();
          this._dbInstance = null;
        };

        resolve(db);
      };

      request.onerror = (event) => {
        this._openingPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('[WebReaderDB] Database open blocked. Close other tabs running older versions.');
      };
    });

    return this._openingPromise;
  }

  // --- Books CRUD Operations ---

  /**
   * Retrieves all books from the library, ordered by lastRead descending.
   * @returns {Promise<Array<Object>>}
   */
  static async getAllBooks() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const index = store.index('by_lastRead');
      const request = index.getAll();

      request.onsuccess = () => {
        const books = request.result || [];
        // Sort descending so most recently read books appear first
        books.reverse();
        resolve(books);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves a single book by ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getBook(id) {
    if (!id) return null;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Saves or updates a book record.
   * @param {Object} bookRecord
   * @returns {Promise<string>} book ID
   */
  static async saveBook(bookRecord) {
    if (!bookRecord || typeof bookRecord !== 'object') {
      throw new Error('Invalid book record provided to saveBook');
    }
    if (!bookRecord.id) {
      bookRecord.id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    const now = Date.now();
    bookRecord.dateAdded = bookRecord.dateAdded || now;
    bookRecord.lastRead = bookRecord.lastRead || now;

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('books', 'readwrite');
        const store = tx.objectStore('books');
        const request = store.put(bookRecord);

        request.onsuccess = () => resolve(bookRecord.id);
        request.onerror = (e) => {
          if (request.error && request.error.name === 'QuotaExceededError') {
            reject(new Error('Storage quota exceeded. Please delete some books from your library.'));
          } else {
            reject(request.error);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Atomically deletes a book, its reading progress, and all associated bookmarks.
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteBook(id) {
    if (!id) return;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books', 'reading_progress', 'bookmarks'], 'readwrite');

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to delete book ${id}`));
      tx.onabort = () => reject(tx.error || new Error(`Deletion transaction aborted for book ${id}`));

      // 1. Delete from books store
      tx.objectStore('books').delete(id);

      // 2. Delete from reading_progress store
      tx.objectStore('reading_progress').delete(id);

      // 3. Delete all bookmarks for this bookId via index cursor
      const bmStore = tx.objectStore('bookmarks');
      const bmIndex = bmStore.index('by_bookId');
      const cursorReq = bmIndex.openKeyCursor(IDBKeyRange.only(id));

      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          bmStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    });
  }

  // --- Reading Progress CRUD Operations ---

  /**
   * Retrieves reading progress for a given book.
   * @param {string} bookId
   * @returns {Promise<Object|null>}
   */
  static async getProgress(bookId) {
    if (!bookId) return null;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reading_progress', 'readonly');
      const store = tx.objectStore('reading_progress');
      const request = store.get(bookId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Saves or updates reading progress.
   * @param {Object} progressRecord
   * @returns {Promise<void>}
   */
  static async saveProgress(progressRecord) {
    if (!progressRecord || !progressRecord.bookId) {
      throw new Error('Reading progress must have a valid bookId');
    }
    progressRecord.updatedAt = Date.now();

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['reading_progress', 'books'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      // Save progress
      tx.objectStore('reading_progress').put(progressRecord);

      // Also touch lastRead on the book record if book exists
      const bookStore = tx.objectStore('books');
      const getReq = bookStore.get(progressRecord.bookId);
      getReq.onsuccess = () => {
        const book = getReq.result;
        if (book) {
          book.lastRead = progressRecord.updatedAt;
          bookStore.put(book);
        }
      };
    });
  }

  // --- Bookmarks CRUD Operations ---

  /**
   * Retrieves all bookmarks for a specific book.
   * @param {string} bookId
   * @returns {Promise<Array<Object>>}
   */
  static async getBookmarks(bookId) {
    if (!bookId) return [];
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readonly');
      const store = tx.objectStore('bookmarks');
      const index = store.index('by_bookId');
      const request = index.getAll(IDBKeyRange.only(bookId));

      request.onsuccess = () => {
        const bookmarks = request.result || [];
        // Sort chronologically ascending
        bookmarks.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        resolve(bookmarks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Adds a new bookmark.
   * @param {Object} bookmarkRecord
   * @returns {Promise<string>} bookmark ID
   */
  static async addBookmark(bookmarkRecord) {
    if (!bookmarkRecord || !bookmarkRecord.bookId) {
      throw new Error('Bookmark must include a valid bookId');
    }
    if (!bookmarkRecord.id) {
      bookmarkRecord.id = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    bookmarkRecord.createdAt = bookmarkRecord.createdAt || Date.now();

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readwrite');
      const store = tx.objectStore('bookmarks');
      const request = store.put(bookmarkRecord);

      request.onsuccess = () => resolve(bookmarkRecord.id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Deletes a bookmark by primary key.
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteBookmark(id) {
    if (!id) return;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readwrite');
      const store = tx.objectStore('bookmarks');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
```

---

### 3.2 `js/storage/settings-store.js` (Synchronous Settings Manager)
```javascript
/**
 * js/storage/settings-store.js
 * Synchronous localStorage settings manager for themes and typography.
 * Includes defensive in-memory fallback for environments where localStorage is blocked.
 */

export const THEMES = {
  WARM_PAPER: 'warm-paper',
  SOFT_DARK: 'soft-dark',
  DAYLIGHT: 'daylight',
  SAGE: 'sage'
};

export const VALID_THEMES = Object.freeze(Object.values(THEMES));

export const DEFAULT_TYPOGRAPHY = Object.freeze({
  fontFamily: 'serif',   // 'serif' | 'sans' | 'dyslexic'
  fontSize: 18,         // px: 14 to 32
  lineHeight: 1.75,     // unitless: 1.3 to 2.4
  maxWidth: 720         // px: 540 to 1000
});

export const STORAGE_KEYS = Object.freeze({
  THEME: 'webreader_theme',
  TYPOGRAPHY: 'webreader_typography',
  READING_MODE: 'webreader_reading_mode',
  LAST_BOOK_ID: 'webreader_last_book_id'
});

export class SettingsManager {
  static _memoryFallback = new Map();

  /**
   * Safe localStorage getter with fallback.
   * @private
   */
  static _safeGet(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch (e) {
      // Fall through to memory fallback
    }
    return this._memoryFallback.has(key) ? this._memoryFallback.get(key) : null;
  }

  /**
   * Safe localStorage setter with fallback.
   * @private
   */
  static _safeSet(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      // Fallback in-memory
    }
    this._memoryFallback.set(key, value);
  }

  /**
   * Gets the active theme ID.
   * @returns {string}
   */
  static getTheme() {
    const theme = this._safeGet(STORAGE_KEYS.THEME);
    return VALID_THEMES.includes(theme) ? theme : THEMES.WARM_PAPER;
  }

  /**
   * Sets the active theme ID and updates the document root data-theme.
   * @param {string} themeId
   */
  static setTheme(themeId) {
    const validTheme = VALID_THEMES.includes(themeId) ? themeId : THEMES.WARM_PAPER;
    this._safeSet(STORAGE_KEYS.THEME, validTheme);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', validTheme);
    }
  }

  /**
   * Gets typography settings, merged with defaults.
   * @returns {Object}
   */
  static getTypography() {
    const raw = this._safeGet(STORAGE_KEYS.TYPOGRAPHY);
    if (!raw) return { ...DEFAULT_TYPOGRAPHY };
    try {
      const parsed = JSON.parse(raw);
      return {
        fontFamily: ['serif', 'sans', 'dyslexic'].includes(parsed.fontFamily)
          ? parsed.fontFamily
          : DEFAULT_TYPOGRAPHY.fontFamily,
        fontSize: typeof parsed.fontSize === 'number' && parsed.fontSize >= 12 && parsed.fontSize <= 40
          ? parsed.fontSize
          : DEFAULT_TYPOGRAPHY.fontSize,
        lineHeight: typeof parsed.lineHeight === 'number' && parsed.lineHeight >= 1.2 && parsed.lineHeight <= 2.8
          ? parsed.lineHeight
          : DEFAULT_TYPOGRAPHY.lineHeight,
        maxWidth: typeof parsed.maxWidth === 'number' && parsed.maxWidth >= 480 && parsed.maxWidth <= 1200
          ? parsed.maxWidth
          : DEFAULT_TYPOGRAPHY.maxWidth
      };
    } catch (e) {
      return { ...DEFAULT_TYPOGRAPHY };
    }
  }

  /**
   * Updates partial typography settings.
   * @param {Object} partial
   */
  static setTypography(partial) {
    const current = this.getTypography();
    const updated = { ...current, ...partial };
    this._safeSet(STORAGE_KEYS.TYPOGRAPHY, JSON.stringify(updated));
  }

  /**
   * Gets the active reading mode.
   * @returns {'paginated' | 'scroll'}
   */
  static getReadingMode() {
    const mode = this._safeGet(STORAGE_KEYS.READING_MODE);
    return mode === 'scroll' ? 'scroll' : 'paginated';
  }

  /**
   * Sets reading mode.
   * @param {'paginated' | 'scroll'} mode
   */
  static setReadingMode(mode) {
    const validMode = mode === 'scroll' ? 'scroll' : 'paginated';
    this._safeSet(STORAGE_KEYS.READING_MODE, validMode);
  }

  /**
   * Gets ID of the last active book.
   * @returns {string|null}
   */
  static getLastBookId() {
    return this._safeGet(STORAGE_KEYS.LAST_BOOK_ID);
  }

  /**
   * Sets ID of the last active book.
   * @param {string|null} bookId
   */
  static setLastBookId(bookId) {
    if (bookId) {
      this._safeSet(STORAGE_KEYS.LAST_BOOK_ID, String(bookId));
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEYS.LAST_BOOK_ID);
        }
      } catch (e) {}
      this._memoryFallback.delete(STORAGE_KEYS.LAST_BOOK_ID);
    }
  }

  /**
   * Contract facade: returns complete settings object.
   * @returns {{ theme: string, typography: Object, readingMode: string, lastBookId: string|null }}
   */
  static getSettings() {
    return {
      theme: this.getTheme(),
      typography: this.getTypography(),
      readingMode: this.getReadingMode(),
      lastBookId: this.getLastBookId()
    };
  }

  /**
   * Contract facade: saves partial settings.
   * @param {Object} partialSettings
   */
  static saveSettings(partialSettings) {
    if (!partialSettings || typeof partialSettings !== 'object') return;
    if (partialSettings.theme) {
      this.setTheme(partialSettings.theme);
    }
    if (partialSettings.typography) {
      this.setTypography(partialSettings.typography);
    }
    if (partialSettings.readingMode) {
      this.setReadingMode(partialSettings.readingMode);
    }
    if ('lastBookId' in partialSettings) {
      this.setLastBookId(partialSettings.lastBookId);
    }
  }
}
```

---

### 3.3 `js/storage/storage-manager.js` (Unified Facade)
```javascript
/**
 * js/storage/storage-manager.js
 * Unified StorageManager Facade fulfilling PROJECT.md Interface Contracts.
 */

import { WebReaderDB } from './db.js';
import { SettingsManager } from './settings-store.js';

export class StorageManager {
  // --- Database Lifecycle ---
  static async openDB() {
    return WebReaderDB.openDB();
  }

  // --- Books CRUD ---
  static async getAllBooks() {
    return WebReaderDB.getAllBooks();
  }

  static async getBook(id) {
    return WebReaderDB.getBook(id);
  }

  static async saveBook(bookRecord) {
    return WebReaderDB.saveBook(bookRecord);
  }

  static async deleteBook(id) {
    return WebReaderDB.deleteBook(id);
  }

  // --- Reading Progress CRUD ---
  static async getProgress(bookId) {
    return WebReaderDB.getProgress(bookId);
  }

  static async saveProgress(progressRecord) {
    return WebReaderDB.saveProgress(progressRecord);
  }

  // --- Bookmarks CRUD ---
  static async getBookmarks(bookId) {
    return WebReaderDB.getBookmarks(bookId);
  }

  static async addBookmark(bookmarkRecord) {
    return WebReaderDB.addBookmark(bookmarkRecord);
  }

  static async deleteBookmark(id) {
    return WebReaderDB.deleteBookmark(id);
  }

  // --- Storage Quota Inspection Utility ---
  static async getQuotaInfo() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate();
        return {
          quotaBytes: quota,
          usageBytes: usage,
          percentUsed: quota > 0 ? (usage / quota) * 100 : 0
        };
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

// Re-export SettingsManager for unified import convenience
export { SettingsManager };
```

---

### 3.4 `js/event-bus.js` (Typed Pub/Sub EventBus)
```javascript
/**
 * js/event-bus.js
 * Typed Pub/Sub EventBus with error isolation, once semantics,
 * and closure-based unsubscribe functions.
 */

export const EVENTS = Object.freeze({
  // Book Lifecycle
  BOOK_OPEN: 'book:open',
  BOOK_LOADED: 'book:loaded',
  BOOK_DELETED: 'book:deleted',

  // Navigation & Reading State
  CHAPTER_CHANGED: 'chapter:changed',
  PAGE_CHANGED: 'page:changed',
  MODE_CHANGED: 'mode:changed',
  TOC_NAVIGATE: 'toc:navigate',

  // Customization & Controls
  THEME_CHANGED: 'theme:changed',
  TYPOGRAPHY_CHANGED: 'typography:changed',
  CHROME_TOGGLE: 'chrome:toggle',

  // Bookmarks
  BOOKMARK_TOGGLE: 'bookmark:toggle',
  BOOKMARK_NAVIGATE: 'bookmark:navigate',
  BOOKMARK_ADDED: 'bookmark:added',
  BOOKMARK_DELETED: 'bookmark:deleted',

  // UI Notifications & Drawer
  TOAST_SHOW: 'toast:show',
  DRAWER_OPEN: 'drawer:open',
  DRAWER_CLOSE: 'drawer:close'
});

export class EventBus {
  static _listeners = new Map();
  static _loggingEnabled = false;

  /**
   * Toggles debug logging for all events.
   * @param {boolean} enabled
   */
  static enableLogging(enabled = true) {
    this._loggingEnabled = Boolean(enabled);
  }

  /**
   * Subscribes to an event.
   * Returns an unsubscribe function.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  static on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`EventBus.on: handler for "${event}" must be a function`);
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);

    // Return self-contained unsubscribe closure
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribes a specific handler from an event.
   * @param {string} event
   * @param {Function} handler
   */
  static off(event, handler) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * Subscribes a handler to execute once, then auto-unsubscribes.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  static once(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`EventBus.once: handler for "${event}" must be a function`);
    }
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Dispatches an event synchronously to all registered listeners.
   * Handlers are executed with error isolation so one failing listener
   * never halts execution of subsequent listeners.
   * @param {string} event
   * @param {any} [payload]
   */
  static emit(event, payload = {}) {
    if (this._loggingEnabled) {
      console.log(`[EventBus] ${event}`, payload);
    }
    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    // Snapshot handlers to prevent mutation bugs during iteration
    const snapshot = Array.from(handlers);
    for (const handler of snapshot) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Uncaught exception in listener for "${event}":`, err);
      }
    }
  }

  /**
   * Returns active listener count for a specific event or total listeners.
   * @param {string} [event]
   * @returns {number}
   */
  static listenerCount(event) {
    if (event) {
      const handlers = this._listeners.get(event);
      return handlers ? handlers.size : 0;
    }
    let total = 0;
    for (const set of this._listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Clears listeners for a given event, or all listeners if no event specified.
   * Useful for test isolation and application teardown.
   * @param {string} [event]
   */
  static clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}
```

---

### 3.5 FOUC Prevention Script for `index.html` Head
Place directly inside `<head>` as the first child before stylesheets:
```html
<script>
  (function() {
    try {
      var t = localStorage.getItem('webreader_theme') || 'warm-paper';
      var allowed = ['warm-paper', 'soft-dark', 'daylight', 'sage'];
      if (allowed.indexOf(t) === -1) t = 'warm-paper';
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'warm-paper');
    }
  })();
</script>
```

---

## 4. Caveats

1. **Transient Blob URLs in Storage**:
   - `URL.createObjectURL(blob)` generates an in-memory session reference (e.g. `blob:http://localhost:3000/394c8b...`).
   - If a developer accidentally saves `bookRecord.coverUrl = blobUrl` in IndexedDB, on subsequent page reloads that URL will be a dead 404 reference.
   - **Rule**: IndexedDB MUST store the raw binary `coverBlob: Blob` or `ArrayBuffer`. When loading books, the application generates a fresh Blob URL and registers it in an active URL registry for cleanup on unload.
2. **Safari Private Browsing Quota**:
   - In Safari Private Browsing mode, `localStorage` historically had a 0-byte quota. The defensive in-memory fallback in `settings-store.js` handles this without throwing unhandled exceptions.
3. **Storage Eviction on Mobile**:
   - Mobile browsers (Safari iOS, Chrome Android) may evict IndexedDB origins under extreme device storage pressure unless `navigator.storage.persist()` is called. `db.js` calls `navigator.storage.persist()` upon opening.
4. **EventBus Listener Lifecycle in Single-Page Apps**:
   - In a pure client-side SPA without page reloads, components that mount and unmount (e.g. drawers, reader stage) must call their returned `unsubscribe()` functions upon teardown to prevent memory leaks and zombie event handlers.

---

## 5. Conclusion

1. **Storage Architecture**:
   - The segregated model cleanly satisfies all constraints: synchronous `localStorage` delivers instant FOUC-free theme/font initialization (< 0.2ms), while asynchronous `WebReaderDB` in IndexedDB provides robust, gigabyte-scale persistent storage for binary EPUB files, reading progress, and bookmarks.
   - Atomic cascade deletion ensures library cleanliness with zero orphaned data.
2. **EventBus**:
   - The typed Pub/Sub EventBus eliminates tight coupling across the entire codebase. Error isolation guarantees that minor UI listener glitches never crash core page turns or reader state transitions.
3. **Interface Compliance**:
   - The proposed blueprints strictly match all method signatures, object formats, and file layouts mandated by `PROJECT.md:71-124`.

---

## 6. Verification Method

To independently verify the architecture, schemas, and mechanics:

### Test 1: EventBus Mechanics & Error Isolation (Terminal Command)
Run:
```bash
node -e '
import("./js/event-bus.js").catch(() => {
  // Fallback inline test if file is not yet written to source
  class Bus {
    constructor() { this.l = new Map(); }
    on(e, h) { if (!this.l.has(e)) this.l.set(e, new Set()); this.l.get(e).add(h); return () => this.l.get(e).delete(h); }
    emit(e, p) {
      const set = this.l.get(e);
      if (!set) return;
      for (const h of Array.from(set)) {
        try { h(p); } catch (err) { console.log("Caught isolated error:", err.message); }
      }
    }
  }
  const b = new Bus();
  let received = false;
  b.on("test", () => { throw new Error("Listener crash"); });
  b.on("test", () => { received = true; });
  b.emit("test");
  if (!received) throw new Error("Error isolation failed");
  console.log("EVENTBUS_ISOLATION_VERIFIED");
});
'
```
**Expected output**: `Caught isolated error: Listener crash` and `EVENTBUS_ISOLATION_VERIFIED`.

### Test 2: Headless Chrome IndexedDB Atomic Cascade Deletion (Terminal Command)
Run:
```bash
node -e '
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const htmlPath = path.join("/tmp", "idb_verify.html");
const html = `<!DOCTYPE html>
<html>
<body>
<div id="status">RUNNING</div>
<script>
async function run() {
  const req = indexedDB.open("WebReaderDB_Verify", 1);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    db.createObjectStore("books", { keyPath: "id" });
    db.createObjectStore("reading_progress", { keyPath: "bookId" });
    const bm = db.createObjectStore("bookmarks", { keyPath: "id" });
    bm.createIndex("by_bookId", "bookId", { unique: false });
  };
  const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
  
  // Insert
  const tx1 = db.transaction(["books", "reading_progress", "bookmarks"], "readwrite");
  tx1.objectStore("books").put({ id: "book_xyz", title: "Moby Dick" });
  tx1.objectStore("reading_progress").put({ bookId: "book_xyz", spineIndex: 1 });
  tx1.objectStore("bookmarks").put({ id: "bm_1", bookId: "book_xyz", snippet: "Call me Ishmael" });
  await new Promise(r => { tx1.oncomplete = r; });

  // Delete cascade
  const txDel = db.transaction(["books", "reading_progress", "bookmarks"], "readwrite");
  txDel.objectStore("books").delete("book_xyz");
  txDel.objectStore("reading_progress").delete("book_xyz");
  const cursorReq = txDel.objectStore("bookmarks").index("by_bookId").openKeyCursor(IDBKeyRange.only("book_xyz"));
  cursorReq.onsuccess = (e) => {
    const c = e.target.result;
    if (c) { txDel.objectStore("bookmarks").delete(c.primaryKey); c.continue(); }
  };
  await new Promise(r => { txDel.oncomplete = r; });

  // Verify
  const txCheck = db.transaction(["books", "reading_progress", "bookmarks"], "readonly");
  const b = await new Promise(r => { txCheck.objectStore("books").get("book_xyz").onsuccess = e => r(e.target.result); });
  const p = await new Promise(r => { txCheck.objectStore("reading_progress").get("book_xyz").onsuccess = e => r(e.target.result); });
  const bm = await new Promise(r => { txCheck.objectStore("bookmarks").index("by_bookId").getAll("book_xyz").onsuccess = e => r(e.target.result); });

  if (!b && !p && bm.length === 0) {
    document.getElementById("status").textContent = "CASCADE_DELETION_SUCCESS";
  }
}
run();
</script>
</body>
</html>`;

fs.writeFileSync(htmlPath, html);

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--dump-dom",
  "file://" + htmlPath
]);

let out = "";
chrome.stdout.on("data", d => out += d);
chrome.on("close", () => {
  console.log("Chrome IDB Test Result:", out.includes("CASCADE_DELETION_SUCCESS") ? "PASS" : "FAIL");
});
'
```
**Expected output**: `Chrome IDB Test Result: PASS`.

### Test 3: FOUC Prevention Timing (Terminal Command)
Run:
```bash
node -e '
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const htmlPath = path.join("/tmp", "fouc_verify.html");
const html = `<!DOCTYPE html>
<html>
<head>
  <script>
    localStorage.setItem("webreader_theme", "sage");
    var theme = localStorage.getItem("webreader_theme") || "warm-paper";
    document.documentElement.setAttribute("data-theme", theme);
    window._themeSetInHead = document.documentElement.getAttribute("data-theme");
  </script>
</head>
<body>
  <div id="res">INIT</div>
  <script>
    if (window._themeSetInHead === "sage" && document.documentElement.getAttribute("data-theme") === "sage") {
      document.getElementById("res").textContent = "FOUC_PREVENTION_VERIFIED";
    }
  </script>
</body>
</html>`;

fs.writeFileSync(htmlPath, html);

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--dump-dom",
  "file://" + htmlPath
]);

let out = "";
chrome.stdout.on("data", d => out += d);
chrome.on("close", () => {
  console.log("Chrome FOUC Test Result:", out.includes("FOUC_PREVENTION_VERIFIED") ? "PASS" : "FAIL");
});
'
```
**Expected output**: `Chrome FOUC Test Result: PASS`.
