/**
 * js/ui/library-view.js
 * Library View Controller: Book Shelf Grid, Drag-and-Drop & File Picker Multi-Format Import,
 * Format Badges, Format Filter Tabs, Cover Rendering, Progress Badges, Atomic Book Deletion & Sample Book Restoration.
 */

import { EventBus, EVENTS } from '../event-bus.js';
import { StorageManager } from '../storage/storage-manager.js';
import { BookParser } from '../parser/book-parser.js';
import { generateCoverSvg, restoreSampleBook } from '../sample-book.js';
import { ToastManager } from './toast.js';

export const FORMAT_MIMES = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  mobi: 'application/x-mobipocket-ebook',
  txt: 'text/plain',
  md: 'text/markdown'
};

/**
 * Extracts and normalizes format from filename.
 * @param {string} filename
 * @returns {'epub'|'pdf'|'mobi'|'txt'|'md'|null}
 */
export function detectFormatFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) return null;
  const ext = filename.slice(lastDot + 1).toLowerCase().trim();

  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'mobi' || ext === 'azw' || ext === 'azw3') return 'mobi';
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return null;
}

/**
 * Validates binary magic bytes and file integrity for incoming files.
 * Throws a descriptive Error if the file is invalid or corrupted.
 *
 * @param {File|Blob} file
 * @param {'epub'|'pdf'|'mobi'|'txt'|'md'} format
 * @returns {Promise<void>}
 */
export async function validateFileFormat(file, format) {
  if (!file || file.size === 0) {
    throw new Error('File is empty (0 bytes).');
  }

  // Read header slice for magic byte inspection (max 4096 bytes)
  const headerSlice = await file.slice(0, Math.min(4096, file.size)).arrayBuffer();
  const bytes = new Uint8Array(headerSlice);

  switch (format) {
    case 'epub': {
      // Standard ZIP local file header: 0x50 0x4B 0x03 0x04 ('PK\x03\x04')
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
        throw new Error('Not a valid EPUB: Missing ZIP archive signature (PK).');
      }
      if (bytes[2] !== 0x03 || bytes[3] !== 0x04) {
        if (bytes[2] !== 0x05 && bytes[2] !== 0x07) {
          throw new Error('Not a valid EPUB: Corrupted ZIP header.');
        }
      }
      break;
    }

    case 'pdf': {
      // Standard PDF magic bytes: '%PDF-' (0x25, 0x50, 0x44, 0x46)
      // Allow up to 1024 leading bytes per PDF specification
      let hasPdfSignature = false;
      const searchLimit = Math.min(bytes.length - 4, 1024);
      for (let i = 0; i <= searchLimit; i++) {
        if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46) {
          hasPdfSignature = true;
          break;
        }
      }
      if (!hasPdfSignature) {
        throw new Error('Not a valid PDF: Missing %PDF document signature.');
      }
      break;
    }

    case 'mobi': {
      // Palm Database format used by MOBI and AZW:
      // Offset 60..67 contains Type (4 bytes) and Creator (4 bytes): 'BOOKMOBI' or 'TEXtREAd'
      let hasMobiSignature = false;

      if (bytes.length >= 68) {
        const typeCreator = String.fromCharCode(...bytes.slice(60, 68));
        if (typeCreator === 'BOOKMOBI' || typeCreator === 'TEXtREAd') {
          hasMobiSignature = true;
        }
      }

      if (!hasMobiSignature) {
        const headerStr = String.fromCharCode(...bytes);
        if (headerStr.includes('BOOKMOBI') || headerStr.includes('TEXtREAd')) {
          hasMobiSignature = true;
        }
      }

      if (!hasMobiSignature) {
        throw new Error('Not a valid MOBI/AZW e-book: Missing BOOKMOBI or PalmDOC header signature.');
      }
      break;
    }

    case 'txt':
    case 'md': {
      // Text files must be decodable as UTF-8 without excessive binary null bytes (0x00)
      let nullCount = 0;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x00) {
          nullCount++;
          if (nullCount > 2) {
            throw new Error(`Not a valid ${format.toUpperCase()} file: File contains binary data (null bytes).`);
          }
        }
      }

      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(bytes);
      } catch (_) {
        throw new Error(`Not a valid ${format.toUpperCase()} file: Invalid character encoding (expected UTF-8 text).`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported format "${format}".`);
  }
}

export class LibraryView {
  /**
   * @param {HTMLElement} container - #library-view element
   */
  constructor(container) {
    this.container = container;
    this.coverBlobUrls = new Set();
    this.activeFilter = 'all'; // 'all' | 'epub' | 'pdf' | 'mobi' | 'txt' | 'md'
    this._bindEvents();
  }

  _bindEvents() {
    if (!this.container) return;

    const fileInput = this.container.querySelector('#file-input');
    const importBtn = this.container.querySelector('#btn-import-epub');
    const restoreBtn = this.container.querySelector('#btn-restore-sample');
    const dropZone = this.container.querySelector('#drop-zone');

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
          await this.importFiles(files);
          fileInput.value = '';
        }
      });
    }

    if (restoreBtn) {
      restoreBtn.addEventListener('click', async () => {
        try {
          await restoreSampleBook(StorageManager);
          await this.renderBooks();
          ToastManager.show('Sample book restored to library.', 'success');
        } catch (err) {
          ToastManager.show(`Could not restore sample book: ${err.message}`, 'error');
        }
      });
    }

    // Format Filter Bar Event Delegation
    const filterBar = this.container.querySelector('#format-filter-bar');
    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.format-filter-btn[data-filter]');
        if (!btn) return;
        const filter = btn.getAttribute('data-filter') || 'all';
        this.setFilter(filter);
      });
    }

    // Subscribe to EventBus library:filter event (PROJECT.md contract)
    EventBus.on('library:filter', ({ format }) => {
      if (format) this.setFilter(format);
    });

    // Event delegation on #library-grid so clicking pre-rendered or dynamically updated cards always works
    const grid = this.container.querySelector('#library-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.book-delete-btn');
        if (delBtn) return;
        const card = e.target.closest('.book-card[data-book-id]');
        if (card) {
          const bookId = card.getAttribute('data-book-id');
          if (bookId) {
            EventBus.emit(EVENTS.BOOK_OPEN, { bookId });
          }
        }
      });
    }

    // Drag and Drop support on dropZone and entire library view
    const dragTargets = [dropZone, this.container].filter(Boolean);
    for (const target of dragTargets) {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.add('is-dragover');
      });

      target.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone && !dropZone.contains(e.relatedTarget)) {
          dropZone.classList.remove('is-dragover');
        }
      });

      target.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.remove('is-dragover');
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) {
          await this.importFiles(files);
        }
      });
    }
  }

  /**
   * Sets the active format filter and updates card visibility in-place.
   * @param {string} filter - 'all' | 'epub' | 'pdf' | 'mobi' | 'txt' | 'md'
   */
  setFilter(filter) {
    this.activeFilter = (filter || 'all').toLowerCase();

    const filterBtns = this.container.querySelectorAll('.format-filter-btn[data-filter]');
    filterBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-filter') === this.activeFilter;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    this._applyFilter();
    EventBus.emit('library:filter:applied', { filter: this.activeFilter });
  }

  /**
   * Applies the active format filter to currently rendered book cards.
   */
  _applyFilter() {
    const grid = this.container?.querySelector('#library-grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.book-card[data-book-id]'));
    if (cards.length === 0) return;

    let visibleCount = 0;
    for (const card of cards) {
      const cardFormat = (card.getAttribute('data-format') || 'epub').toLowerCase();
      const matches = (this.activeFilter === 'all') || (cardFormat === this.activeFilter);
      card.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    }

    let emptyFilterState = grid.querySelector('.library-empty-filter-state');
    if (visibleCount === 0 && this.activeFilter !== 'all') {
      if (!emptyFilterState) {
        emptyFilterState = document.createElement('div');
        emptyFilterState.className = 'library-empty-filter-state';
        grid.appendChild(emptyFilterState);
      }
      emptyFilterState.innerHTML = `
        <p class="empty-title">No ${this.activeFilter.toUpperCase()} books found</p>
        <p class="empty-subtitle">Import a <code>.${this.activeFilter}</code> file or switch to another filter tab above.</p>
      `;
    } else if (emptyFilterState) {
      emptyFilterState.remove();
    }
  }

  /**
   * Yields to the main thread using scheduler.yield() (with setTimeout fallback)
   * to keep Interaction to Next Paint (INP) responsive during multi-file imports.
   * @private
   */
  async _yieldToMain() {
    if (typeof window !== 'undefined' && 'scheduler' in window && typeof window.scheduler?.yield === 'function') {
      return window.scheduler.yield();
    }
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Imports one or more files (.epub, .pdf, .mobi, .azw, .txt, .md) into IndexedDB.
   * @param {Array<File>} files
   */
  async importFiles(files) {
    let lastImportedId = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (i > 0) {
        await this._yieldToMain();
      }
      try {
        const format = detectFormatFromFilename(file.name);
        if (!format) {
          throw new Error('Unsupported format. Please import .epub, .pdf, .mobi, .azw, .txt, or .md files.');
        }

        // 1. Validate magic bytes / file signature
        await validateFileFormat(file, format);

        const now = Date.now();
        const baseFilename = (file.name || 'Untitled')
          .replace(/\.(epub|pdf|mobi|azw|azw3|txt|md|markdown)$/i, '')
          .trim() || 'Untitled Book';

        let cleanTitle = baseFilename;
        let cleanAuthor = 'Unknown Author';
        let coverBlob = null;
        let spineCount = 1;
        let description = '';
        let language = 'en';

        // 2. Parse document structure & extract metadata via polymorphic BookParser
        const parsed = await BookParser.parse(file, file.name || format);
        try {
          if (parsed.metadata?.title?.trim() && parsed.metadata.title.trim() !== 'undefined') {
            cleanTitle = parsed.metadata.title.trim();
          }
          if (parsed.metadata?.author?.trim() && parsed.metadata.author.trim() !== 'undefined') {
            cleanAuthor = parsed.metadata.author.trim();
          }
          description = parsed.metadata?.description || '';
          language = parsed.metadata?.language || 'en';
          spineCount = parsed.spine?.length || 1;

          if (parsed.coverBlobUrl) {
            try {
              const res = await fetch(parsed.coverBlobUrl);
              coverBlob = await res.blob();
            } catch (_) {
              coverBlob = null;
            }
          }
        } finally {
          parsed.cleanup();
        }

        const mimeType = FORMAT_MIMES[format] || file.type || 'application/octet-stream';
        const fileBlob = new Blob([await file.arrayBuffer()], { type: mimeType });

        // 3. Construct unified book record
        const bookRecord = {
          id: `book_${now}_${Math.random().toString(36).slice(2, 8)}`,
          title: cleanTitle,
          author: cleanAuthor,
          format,
          description,
          language,
          fileBlob,
          fileSize: file.size || 0,
          coverBlob,
          spineCount,
          dateAdded: now,
          lastRead: now
        };

        lastImportedId = await StorageManager.saveBook(bookRecord);
        ToastManager.show(`Imported [${format.toUpperCase()}] "${cleanTitle}"`, 'success');
      } catch (err) {
        ToastManager.show(
          `Failed to import "${file?.name || 'file'}": ${err.message || 'Corrupted or invalid file.'}`,
          'error',
          6000
        );
      }
    }

    await this.renderBooks();
    return lastImportedId;
  }

  /**
   * Fetches all saved books and reading progress from IndexedDB and reconciles the library shelf in-place.
   */
  async renderBooks() {
    if (!this.container) return;
    const grid = this.container.querySelector('#library-grid');
    if (!grid) return;

    const books = await StorageManager.getAllBooks();

    if (books.length === 0) {
      this._cleanupCoverUrls();
      grid.innerHTML = '';
      const emptyEl = document.createElement('div');
      emptyEl.className = 'library-empty-state';
      emptyEl.innerHTML = `
        <p class="empty-title">Your library is empty</p>
        <p class="empty-subtitle">Drop an e-book or document (<code>.epub</code>, <code>.pdf</code>, <code>.mobi</code>, <code>.txt</code>, <code>.md</code>) above or click "Import Book" to start reading.</p>
      `;
      grid.appendChild(emptyEl);
      return;
    }

    const emptyState = grid.querySelector('.library-empty-state');
    if (emptyState) emptyState.remove();

    const validIds = new Set(books.map(b => b.id));
    for (const existingCard of Array.from(grid.querySelectorAll('.book-card[data-book-id]'))) {
      const id = existingCard.getAttribute('data-book-id');
      if (!validIds.has(id)) {
        existingCard.remove();
      }
    }

    const progresses = await Promise.all(
      books.map(book => StorageManager.getProgress(book.id).catch(() => null))
    );

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const progress = progresses[i];
      const existingCard = grid.querySelector(`.book-card[data-book-id="${CSS.escape(book.id)}"]`);
      if (existingCard) {
        const badge = existingCard.querySelector('.book-progress-badge');
        const percent = progress && typeof progress.globalPercent === 'number' ? progress.globalPercent : 0;
        if (badge) {
          badge.textContent = percent > 0 ? `${percent}% read` : 'New';
        }
      } else {
        const card = this._createBookCard(book, progress);
        fragment.appendChild(card);
      }
    }
    if (fragment.childNodes.length > 0) {
      grid.appendChild(fragment);
    }

    this._applyFilter();
  }

  _createBookCard(book, progress) {
    const safeTitle = (book.title && String(book.title).trim() && book.title !== 'undefined')
      ? String(book.title).trim()
      : 'Untitled Book';
    const safeAuthor = (book.author && String(book.author).trim() && book.author !== 'undefined')
      ? String(book.author).trim()
      : 'Unknown Author';

    const rawFormat = (book.format || (book.isSample ? 'epub' : 'epub')).toLowerCase();
    const format = ['epub', 'pdf', 'mobi', 'txt', 'md'].includes(rawFormat) ? rawFormat : 'epub';

    const card = document.createElement('article');
    card.className = 'card book-card';
    card.setAttribute('data-book-id', book.id);
    card.setAttribute('data-format', format);
    card.dataset.format = format;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open ${safeTitle} by ${safeAuthor} (${format.toUpperCase()})`);

    // Cover area
    const coverWrap = document.createElement('div');
    coverWrap.className = 'book-cover-wrapper';

    // Format badge (top-left)
    const formatBadge = document.createElement('span');
    formatBadge.className = `book-format-badge format-${format} format-badge-${format}`;
    formatBadge.textContent = format.toUpperCase();
    coverWrap.appendChild(formatBadge);

    if (book.isSample) {
      coverWrap.insertAdjacentHTML('beforeend', generateCoverSvg());
      const svgEl = coverWrap.querySelector('svg');
      if (svgEl) svgEl.classList.add('book-cover');
    } else if (book.coverBlob instanceof Blob && book.coverBlob.size > 0) {
      const url = URL.createObjectURL(book.coverBlob);
      this.coverBlobUrls.add(url);
      const img = document.createElement('img');
      img.className = 'book-cover';
      img.alt = `${safeTitle} cover`;
      img.decoding = 'async';
      const revokeOnceLoaded = () => {
        URL.revokeObjectURL(url);
        this.coverBlobUrls.delete(url);
      };
      img.addEventListener('load', revokeOnceLoaded, { once: true });
      img.addEventListener('error', revokeOnceLoaded, { once: true });
      img.src = url;
      coverWrap.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'book-cover cover-placeholder';
      placeholder.innerHTML = `
        <svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" class="placeholder-svg">
          <rect width="240" height="360" fill="var(--color-surface-hover)"/>
          <rect x="18" y="18" width="204" height="324" fill="none" stroke="var(--color-accent)" stroke-width="2" rx="4"/>
          <text x="120" y="80" text-anchor="middle" fill="var(--color-text-muted)" font-family="system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="0.1em">${format.toUpperCase()}</text>
          <text x="120" y="165" text-anchor="middle" fill="var(--color-text)" font-family="Georgia, serif" font-size="16" font-weight="bold">${this._escapeHtml(safeTitle.slice(0, 22))}</text>
          <text x="120" y="200" text-anchor="middle" fill="var(--color-text-secondary)" font-family="sans-serif" font-size="12">${this._escapeHtml(safeAuthor.slice(0, 26))}</text>
        </svg>
      `;
      coverWrap.appendChild(placeholder);
    }

    // Progress badge if available
    const percent = progress && typeof progress.globalPercent === 'number'
      ? progress.globalPercent
      : 0;
    const badge = document.createElement('span');
    badge.className = 'book-progress-badge';
    badge.textContent = percent > 0 ? `${percent}% read` : 'New';
    coverWrap.appendChild(badge);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-icon book-delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete ${safeTitle}`);
    deleteBtn.setAttribute('title', 'Delete book from library');
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    `;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await StorageManager.deleteBook(book.id);
      EventBus.emit(EVENTS.BOOK_DELETED, { bookId: book.id });
      await this.renderBooks();
      ToastManager.show(`Removed "${safeTitle}"`, 'info');
    });
    coverWrap.appendChild(deleteBtn);

    // Info area
    const body = document.createElement('div');
    body.className = 'book-card-body';

    const titleEl = document.createElement('h3');
    titleEl.className = 'book-title title';
    titleEl.textContent = safeTitle;

    const authorEl = document.createElement('p');
    authorEl.className = 'book-author author';
    authorEl.textContent = safeAuthor;

    body.appendChild(titleEl);
    body.appendChild(authorEl);

    card.appendChild(coverWrap);
    card.appendChild(body);

    const openBook = () => {
      EventBus.emit(EVENTS.BOOK_OPEN, { bookId: book.id });
    };

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBook();
      }
    });

    return card;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _cleanupCoverUrls() {
    for (const url of this.coverBlobUrls) {
      URL.revokeObjectURL(url);
    }
    this.coverBlobUrls.clear();
  }

  show() {
    if (this.container) {
      this.container.style.display = 'block';
      this.container.removeAttribute('aria-hidden');
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.container.setAttribute('aria-hidden', 'true');
    }
  }
}

export default LibraryView;
