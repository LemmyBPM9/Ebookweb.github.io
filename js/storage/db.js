/**
 * js/storage/db.js
 * Persistent IndexedDB Database Manager for WebReader (WebReaderDB)
 */

export class WebReaderDB {
  static DB_NAME = 'WebReaderDB';
  static DB_VERSION = 2;
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
        const oldVersion = event.oldVersion;
        const tx = event.target.transaction;

        // 1. Books Store (Lightweight Metadata Tier)
        let bookStore;
        if (!db.objectStoreNames.contains('books')) {
          bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by_lastRead', 'lastRead', { unique: false });
          bookStore.createIndex('by_dateAdded', 'dateAdded', { unique: false });
          bookStore.createIndex('by_title', 'title', { unique: false });
          bookStore.createIndex('by_format', 'format', { unique: false });
        } else {
          bookStore = tx.objectStore('books');
          if (!bookStore.indexNames.contains('by_format')) {
            bookStore.createIndex('by_format', 'format', { unique: false });
          }
        }

        // 2. Book Files Store (Binary Payload Tier)
        let fileStore;
        if (!db.objectStoreNames.contains('book_files')) {
          fileStore = db.createObjectStore('book_files', { keyPath: 'id' });
        } else {
          fileStore = tx.objectStore('book_files');
        }

        // 3. Reading Progress Store (1-to-1 with bookId)
        if (!db.objectStoreNames.contains('reading_progress')) {
          db.createObjectStore('reading_progress', { keyPath: 'bookId' });
        }

        // 4. Bookmarks Store
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bmStore.createIndex('by_bookId', 'bookId', { unique: false });
          bmStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        }

        // 5. Data Migration: V1 -> V2
        // When upgrading from an existing V1 database, separate fileBlob into book_files
        if (oldVersion >= 1 && oldVersion < 2) {
          const cursorReq = bookStore.openCursor();
          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const book = cursor.value;
              let modified = false;

              if (book.fileBlob) {
                fileStore.put({
                  id: book.id,
                  fileBlob: book.fileBlob
                });
                delete book.fileBlob;
                modified = true;
              }

              if (!book.format) {
                book.format = 'epub';
                modified = true;
              }

              if (modified) {
                cursor.update(book);
              }

              cursor.continue();
            }
          };
          cursorReq.onerror = (e) => {
            console.error('[WebReaderDB] V1 -> V2 migration cursor error:', e);
          };
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

      request.onerror = () => {
        this._openingPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('[WebReaderDB] Database open blocked. Close other tabs running older versions.');
      };
    });

    return this._openingPromise;
  }

  // --- Format Inference Helper ---

  static _inferFormat(record) {
    if (record.format && ['epub', 'pdf', 'mobi', 'txt', 'md'].includes(record.format.toLowerCase())) {
      return record.format.toLowerCase();
    }
    const name = (record.filename || record.name || record.title || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.mobi') || name.endsWith('.azw') || name.endsWith('.azw3')) return 'mobi';
    if (name.endsWith('.txt')) return 'txt';
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
    if (name.endsWith('.epub')) return 'epub';

    if (record.fileBlob && record.fileBlob.type) {
      const type = record.fileBlob.type.toLowerCase();
      if (type.includes('pdf')) return 'pdf';
      if (type.includes('mobi') || type.includes('amazon')) return 'mobi';
      if (type.includes('markdown')) return 'md';
      if (type.includes('plain')) return 'txt';
      if (type.includes('epub')) return 'epub';
    }

    return 'epub';
  }

  // --- Books CRUD Operations ---

  /**
   * Retrieves all books from the library (metadata only), ordered by lastRead descending.
   * NEVER loads raw fileBlob payloads into memory.
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
        // Ensure zero binary payload is present in metadata
        const cleanList = books.map(b => {
          const { fileBlob, ...meta } = b;
          if (!meta.format) meta.format = 'epub';
          return meta;
        });
        resolve(cleanList);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves a single book by ID, atomically combining metadata from 'books'
   * and binary payload from 'book_files'.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getBook(id) {
    if (!id) return null;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books', 'book_files'], 'readonly');
      const bookStore = tx.objectStore('books');
      const fileStore = tx.objectStore('book_files');

      let metaRecord = null;
      let fileRecord = null;

      const metaReq = bookStore.get(id);
      metaReq.onsuccess = () => {
        metaRecord = metaReq.result || null;
      };

      const fileReq = fileStore.get(id);
      fileReq.onsuccess = () => {
        fileRecord = fileReq.result || null;
      };

      tx.oncomplete = () => {
        if (!metaRecord) {
          resolve(null);
          return;
        }
        const { fileBlob: _discard, ...meta } = metaRecord;
        resolve({
          ...meta,
          format: meta.format || 'epub',
          fileBlob: (fileRecord && fileRecord.fileBlob) || metaRecord.fileBlob || null
        });
      };

      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Retrieves book metadata only without touching book_files.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getBookMetadata(id) {
    if (!id) return null;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const request = store.get(id);

      request.onsuccess = () => {
        const rec = request.result || null;
        if (!rec) {
          resolve(null);
          return;
        }
        const { fileBlob, ...meta } = rec;
        resolve({
          ...meta,
          format: meta.format || 'epub'
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves raw book binary payload from book_files.
   * @param {string} id
   * @returns {Promise<Blob|null>}
   */
  static async getBookFile(id) {
    if (!id) return null;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('book_files', 'readonly');
      const store = tx.objectStore('book_files');
      const request = store.get(id);

      request.onsuccess = () => {
        const rec = request.result || null;
        resolve(rec ? rec.fileBlob : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves books filtered by format using the by_format index.
   * @param {string} format
   * @returns {Promise<Array<Object>>}
   */
  static async getBooksByFormat(format) {
    if (!format || format === 'all') return this.getAllBooks();
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const index = store.index('by_format');
      const request = index.getAll(IDBKeyRange.only(format.toLowerCase()));

      request.onsuccess = () => {
        const books = request.result || [];
        books.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
        resolve(books.map(({ fileBlob, ...m }) => ({
          ...m,
          format: m.format || format.toLowerCase()
        })));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Saves or updates a book record.
   * Atomically writes metadata to 'books' and binary payload to 'book_files'.
   * If fileBlob is omitted on update, existing binary in book_files is preserved.
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
    const dateAdded = bookRecord.dateAdded || bookRecord.addedAt || now;
    const lastRead = bookRecord.lastRead || bookRecord.lastReadAt || now;

    // Separate binary from metadata
    const { fileBlob, ...metaOnly } = bookRecord;
    const metadata = {
      ...metaOnly,
      dateAdded,
      addedAt: dateAdded,
      lastRead,
      lastReadAt: lastRead
    };

    if (!metadata.format) {
      metadata.format = this._inferFormat(bookRecord);
    } else {
      metadata.format = metadata.format.toLowerCase();
    }

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        const hasFile = fileBlob !== undefined && fileBlob !== null;
        const stores = hasFile ? ['books', 'book_files'] : ['books'];
        const tx = db.transaction(stores, 'readwrite');
        const bookStore = tx.objectStore('books');

        tx.oncomplete = () => resolve(metadata.id);
        tx.onerror = () => {
          if (tx.error && tx.error.name === 'QuotaExceededError') {
            reject(new Error('Storage quota exceeded. Please delete some books from your library.'));
          } else {
            reject(tx.error || new Error('Failed to save book'));
          }
        };
        tx.onabort = () => {
          if (tx.error && tx.error.name === 'QuotaExceededError') {
            reject(new Error('Storage quota exceeded. Please delete some books from your library.'));
          } else {
            reject(tx.error || new Error('Transaction aborted while saving book'));
          }
        };

        if (hasFile) {
          const fileStore = tx.objectStore('book_files');
          fileStore.put({ id: metadata.id, fileBlob });
        }

        bookStore.put(metadata);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Atomically deletes a book, its binary file, reading progress, and all associated bookmarks.
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteBook(id) {
    if (!id) return;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['books', 'book_files', 'reading_progress', 'bookmarks'], 'readwrite');

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to delete book ${id}`));
      tx.onabort = () => reject(tx.error || new Error(`Deletion transaction aborted for book ${id}`));

      // 1. Delete from books store
      tx.objectStore('books').delete(id);

      // 2. Delete from book_files store
      tx.objectStore('book_files').delete(id);

      // 3. Delete from reading_progress store
      tx.objectStore('reading_progress').delete(id);

      // 4. Delete all bookmarks for this bookId via index cursor
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
          book.lastReadAt = progressRecord.updatedAt;
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
