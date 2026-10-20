# Milestone 1 Technical Blueprint & UI/CSS Implementation Guide
**Focus**: Multi-Format File Input & Drag-and-Drop, Magic Byte Validation, Format Badges, and Header Filter Controls  
**Author**: `teamwork_preview_explorer` (instance `m1_upgrade_explorer_2`)  
**Date**: 2026-10-17  
**Working Directory**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_upgrade_explorer_2/`

---

## 1. Executive Summary & Problem Boundary

In Milestone 1 of the WebReader upgrade, the application transitions from an EPUB-only reader into a unified multi-format library supporting six document/e-book formats:
1. `.epub` (EPUB 2 / EPUB 3)
2. `.pdf` (Portable Document Format)
3. `.mobi` (Mobipocket e-books)
4. `.azw` (Amazon PalmDOC / Mobipocket)
5. `.txt` (Plain text documents)
6. `.md` (Markdown documents)

This blueprint specifies the frontend architecture and implementation for:
1. **Multi-Format File Input & Drag-and-Drop Zone** (`index.html`, `js/ui/library-view.js`):
   - Broadening the native `<input type="file" id="file-input">` accept attribute to accept all 6 file extensions and standard MIME types.
   - Case-insensitive file extension normalization (`.EPUB`, `.PDF`, `.MOBI`, `.AZW`, `.TXT`, `.MD`).
   - Binary signature / magic byte validation for each format prior to ingestion, safeguarding against corrupted files, empty files, or disguised binaries.
2. **Format Badges on Library Cards** (`index.html`, `css/main.css`, `js/ui/library-view.js`):
   - Introducing `.book-format-badge` on each library card displaying `EPUB`, `PDF`, `MOBI`, `TXT`, or `MD`.
   - Distinct visual identity (colors, borders, background tints, and dark/light theme awareness) for each format.
   - Preserving accessibility and badge positioning harmony alongside `.book-progress-badge` and `.book-delete-btn`.
3. **Header Format Filter Controls & Instant Shelf Filtering** (`index.html`, `css/main.css`, `js/ui/library-view.js`):
   - Introducing a responsive format filter bar (`All`, `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) in the library header.
   - Implementing sub-millisecond client-side filtering without page reloads or redundant database queries.
   - Providing accessible tablist semantics (`role="tablist"`, `aria-selected`) and format-specific empty states when no books match the active filter.

---

## 2. Current State vs. Target State Analysis

| Component | Current State (Baseline) | Target State (Milestone 1) |
|---|---|---|
| `<input id="file-input">` | `accept=".epub,application/epub+zip"` | `accept=".epub,.pdf,.mobi,.azw,.txt,.md,application/epub+zip,application/pdf,application/x-mobipocket-ebook,application/vnd.amazon.ebook,text/plain,text/markdown,text/x-markdown"` |
| `#drop-zone` copy | "Drag & drop an .epub book here, or click Import EPUB above" | "Drag & drop .epub, .pdf, .mobi, .azw, .txt, or .md files here, or click Import Book" |
| `#btn-import-epub` label | `Import EPUB` | `Import Book` (retaining `id="btn-import-epub"` for 100% backward compatibility) |
| `LibraryView.importFiles(files)` | Only accepts EPUB, delegates directly to `EpubParser.parse(file)` | Accepts all 6 extensions (case-insensitive); performs format-specific magic byte validation; extracts metadata; sets `format: 'epub' \| 'pdf' \| 'mobi' \| 'txt' \| 'md'` |
| Corrupt / Invalid Rejection | Only checks ZIP bytes in `EpubParser` | Rejects missing/corrupt signatures for ZIP (`PK\x03\x04`), PDF (`%PDF`), MOBI/AZW (`BOOKMOBI`/PalmDOC), TXT/MD (UTF-8 binary null checks) with error toasts |
| `.book-card` badges | Only `.book-progress-badge` ("New" / "XX% read") | Both `.book-format-badge` (top-left) and `.book-progress-badge` (bottom-left) |
| Library Header Filter | None (all books displayed unconditionally) | Segmented control filter bar (`All`, `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) with instant in-DOM filtering |
| Empty Filter State | Only generic empty library state | Format-aware empty state (e.g. "No PDF books found — Import a .pdf file or switch to another filter") |

---

## 3. File Input & Drag-and-Drop Specifications

### 3.1 HTML Input Attribute Specification (`index.html`)

The `<input type="file">` must accept all extensions and standardized MIME types across desktop and mobile browsers (Chromium, Firefox, Safari/WebKit):

```html
<input 
  type="file" 
  id="file-input" 
  accept=".epub,.pdf,.mobi,.azw,.txt,.md,application/epub+zip,application/pdf,application/x-mobipocket-ebook,application/vnd.amazon.ebook,text/plain,text/markdown,text/x-markdown" 
  multiple 
  class="sr-only" 
  aria-label="Import books and documents (.epub, .pdf, .mobi, .azw, .txt, .md)">
```

### 3.2 Backward-Compatible Button & Drop-Zone Updates

To prevent breaking existing test suites (e.g. `test/e2e.test.js` selector `input[type="file"]#file-input`), the existing IDs are preserved:

```html
<div class="library-actions">
  <input type="file" id="file-input" accept=".epub,.pdf,.mobi,.azw,.txt,.md,application/epub+zip,application/pdf,application/x-mobipocket-ebook,application/vnd.amazon.ebook,text/plain,text/markdown,text/x-markdown" multiple class="sr-only" aria-label="Import books and documents (.epub, .pdf, .mobi, .azw, .txt, .md)">
  <button type="button" id="btn-restore-sample" class="btn btn-secondary" title="Restore sample book">
    Sample Book
  </button>
  <button type="button" id="btn-import-epub" class="btn btn-primary" title="Import e-books or documents">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
    </svg>
    <span>Import Book</span>
  </button>
</div>
```

Drop-zone update in `index.html`:
```html
<div id="drop-zone" class="drop-zone" role="region" aria-label="Drag and drop book files">
  <div class="drop-zone-inner">
    <svg class="drop-zone-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
    </svg>
    <p class="drop-zone-text">
      Drag &amp; drop <strong>.epub, .pdf, .mobi, .azw, .txt, .md</strong> files here, or click <strong>Import Book</strong> above
    </p>
    <p class="drop-zone-subtext">Stored privately in your browser for instant offline reading</p>
  </div>
</div>
```

---

## 4. Binary Signature & Format Validation Engine

### 4.1 Canonical Format Mapping
Files are resolved via case-insensitive extension extraction into canonical format keys:
- `.epub`, `.EPUB`, `.Epub` $\rightarrow$ `'epub'`
- `.pdf`, `.PDF`, `.Pdf` $\rightarrow$ `'pdf'`
- `.mobi`, `.MOBI`, `.azw`, `.AZW` $\rightarrow$ `'mobi'`
- `.txt`, `.TXT`, `.Txt` $\rightarrow$ `'txt'`
- `.md`, `.MD`, `.markdown` $\rightarrow$ `'md'`

```javascript
export function detectFormatFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) return null;
  const ext = filename.slice(lastDot + 1).toLowerCase().trim();
  
  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'mobi' || ext === 'azw') return 'mobi';
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return null;
}
```

### 4.2 Format Validation & Binary Magic Bytes Specifications

Prior to storing any file into IndexedDB, `importFiles()` executes `validateFileFormat(file, format)`:

```javascript
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
        // Also allow empty zip header (0x05, 0x06) if testing, but standard EPUB must have 0x03, 0x04
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
      // Offset 60..67 contains Type (4 bytes) and Creator (4 bytes).
      // Standard values: 'BOOKMOBI' or 'TEXtREAd'.
      // Alternatively, Record 0 starts with 'BOOKMOBI' at offset 16 from record start.
      let hasMobiSignature = false;
      
      if (bytes.length >= 68) {
        const typeCreator = String.fromCharCode(...bytes.slice(60, 68));
        if (typeCreator === 'BOOKMOBI' || typeCreator === 'TEXtREAd') {
          hasMobiSignature = true;
        }
      }

      if (!hasMobiSignature) {
        // Scan first 4KB for 'BOOKMOBI' string
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
      // Text files must be decodable as UTF-8 without binary null bytes (0x00)
      // (which indicate executable, zip, or binary files disguised as text).
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
      } catch (decodeErr) {
        throw new Error(`Not a valid ${format.toUpperCase()} file: Invalid character encoding (expected UTF-8 text).`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported format "${format}".`);
  }
}
```

### 4.3 Multi-Format Metadata Ingestion in `LibraryView.importFiles(files)`

In Milestone 1, `importFiles()` processes incoming files across all 6 formats:
- For `format === 'epub'`: Uses `EpubParser.parse(file)` to extract OPF title, author, cover, spine count.
- For `format === 'pdf'`: Validates `%PDF` signature; extracts clean title from filename; sets `format: 'pdf'`, `spineCount: 1`, and placeholder cover.
- For `format === 'mobi'`: Validates `BOOKMOBI`/PalmDOC; extracts Palm database title from bytes 0..31 (or filename fallback); sets `format: 'mobi'`, `spineCount: 1`.
- For `format === 'txt'`: Validates UTF-8 text; extracts title from filename (or first non-empty line); sets `format: 'txt'`, `spineCount: 1`.
- For `format === 'md'`: Validates UTF-8 text; scans first 50 lines for `# Heading` title (or filename fallback); sets `format: 'md'`, `spineCount: 1`.

```javascript
/**
 * Imports one or more files (.epub, .pdf, .mobi, .azw, .txt, .md) into IndexedDB.
 * @param {Array<File>} files
 */
async importFiles(files) {
  let lastImportedId = null;

  for (const file of files) {
    try {
      const format = detectFormatFromFilename(file.name);
      if (!format) {
        throw new Error('Unsupported format. Please import .epub, .pdf, .mobi, .azw, .txt, or .md files.');
      }

      // 1. Validate magic bytes / file signature
      await validateFileFormat(file, format);

      const now = Date.now();
      const baseFilename = (file.name || 'Untitled')
        .replace(/\.(epub|pdf|mobi|azw|txt|md|markdown)$/i, '')
        .trim() || 'Untitled Book';

      let cleanTitle = baseFilename;
      let cleanAuthor = 'Unknown Author';
      let coverBlob = null;
      let spineCount = 1;
      let description = '';
      let language = 'en';

      // 2. Format-specific metadata extraction
      if (format === 'epub') {
        const parsed = await EpubParser.parse(file);
        try {
          if (parsed.metadata?.title?.trim()) {
            cleanTitle = parsed.metadata.title.trim();
          }
          if (parsed.metadata?.author?.trim()) {
            cleanAuthor = parsed.metadata.author.trim();
          }
          description = parsed.metadata?.description || '';
          language = parsed.metadata?.language || 'en';
          spineCount = parsed.spine?.length || 1;

          if (parsed.coverBlobUrl) {
            try {
              const res = await fetch(parsed.coverBlobUrl);
              coverBlob = await res.blob();
            } catch (_) {}
          }
        } finally {
          parsed.cleanup();
        }
      } else if (format === 'mobi') {
        // Attempt to extract PDB database name from header bytes 0..31
        try {
          const headerSlice = await file.slice(0, 32).arrayBuffer();
          const bytes = new Uint8Array(headerSlice);
          let pdbName = '';
          for (let i = 0; i < 32 && bytes[i] !== 0; i++) {
            pdbName += String.fromCharCode(bytes[i]);
          }
          pdbName = pdbName.trim();
          if (pdbName.length > 0 && pdbName !== 'undefined') {
            cleanTitle = pdbName;
          }
        } catch (_) {}
      } else if (format === 'md') {
        // Scan first 2KB for top-level markdown title '# Title'
        try {
          const previewText = await file.slice(0, 2048).text();
          const titleMatch = previewText.match(/^#\s+([^\r\n]+)/m);
          if (titleMatch && titleMatch[1].trim()) {
            cleanTitle = titleMatch[1].trim();
          }
        } catch (_) {}
      }

      // 3. Construct unified book record
      const bookRecord = {
        id: `book_${now}_${Math.random().toString(36).slice(2, 8)}`,
        title: cleanTitle,
        author: cleanAuthor,
        format: format, // 'epub' | 'pdf' | 'mobi' | 'txt' | 'md'
        description,
        language,
        fileBlob: file, // Managed by StorageManager V2 (saved to book_files)
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
        `Failed to import "${file?.name || 'file'}": ${err.message}`,
        'error',
        6000
      );
    }
  }

  await this.renderBooks();
  return lastImportedId;
}
```

---

## 5. Format Badges System (`.book-format-badge`)

### 5.1 Badge Placement & Hierarchy in `.book-card`
Each library card displays two badges on the cover wrapper:
- **Top-Left**: `.book-format-badge` displaying the format (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`).
- **Bottom-Left**: `.book-progress-badge` displaying reading progress (`New` or `XX% read`).
- **Top-Right**: `.book-delete-btn` (appearing on hover/focus).

```
+----------------------------------------+
| [.book-format-badge]    [delete-btn]   |
| (EPUB / PDF / MOBI)                    |
|                                        |
|              COVER ART                 |
|                                        |
| [.book-progress-badge]                 |
| (New / 45% read)                       |
+----------------------------------------+
| Title                                  |
| Author                                 |
+----------------------------------------+
```

### 5.2 Card DOM Structure in `_createBookCard(book, progress)`

```javascript
_createBookCard(book, progress) {
  const safeTitle = (book.title && String(book.title).trim() && book.title !== 'undefined')
    ? String(book.title).trim()
    : 'Untitled Book';
  const safeAuthor = (book.author && String(book.author).trim() && book.author !== 'undefined')
    ? String(book.author).trim()
    : 'Unknown Author';

  // Backward compatibility: default to 'epub' if format not specified in DB
  const rawFormat = (book.format || (book.isSample ? 'epub' : 'epub')).toLowerCase();
  const format = ['epub', 'pdf', 'mobi', 'txt', 'md'].includes(rawFormat) ? rawFormat : 'epub';

  const card = document.createElement('article');
  card.className = 'card book-card';
  card.setAttribute('data-book-id', book.id);
  card.setAttribute('data-format', format);
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${safeTitle} by ${safeAuthor} (${format.toUpperCase()})`);

  // Cover area
  const coverWrap = document.createElement('div');
  coverWrap.className = 'book-cover-wrapper';

  // Format badge (top-left)
  const formatBadge = document.createElement('span');
  formatBadge.className = `book-format-badge format-${format}`;
  formatBadge.textContent = format.toUpperCase();
  coverWrap.appendChild(formatBadge);

  // Cover image / SVG placeholder
  if (book.coverBlob instanceof Blob && book.coverBlob.size > 0) {
    const url = URL.createObjectURL(book.coverBlob);
    this.coverBlobUrls.add(url);
    const img = document.createElement('img');
    img.className = 'book-cover';
    img.src = url;
    img.alt = `${safeTitle} cover`;
    coverWrap.appendChild(img);
  } else if (book.isSample) {
    coverWrap.insertAdjacentHTML('beforeend', generateCoverSvg());
    const svgEl = coverWrap.querySelector('svg');
    if (svgEl) svgEl.classList.add('book-cover');
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'book-cover cover-placeholder';
    placeholder.innerHTML = `
      <svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" class="placeholder-svg">
        <rect width="240" height="360" fill="var(--color-surface-hover)"/>
        <rect x="18" y="18" width="204" height="324" fill="none" stroke="var(--color-border-strong)" stroke-width="2" rx="4"/>
        <text x="120" y="80" text-anchor="middle" fill="var(--color-text-muted)" font-family="system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="0.1em">${format.toUpperCase()}</text>
        <text x="120" y="165" text-anchor="middle" fill="var(--color-text)" font-family="Georgia, serif" font-size="16" font-weight="bold">${this._escapeHtml(safeTitle.slice(0, 22))}</text>
        <text x="120" y="200" text-anchor="middle" fill="var(--color-text-secondary)" font-family="sans-serif" font-size="12">${this._escapeHtml(safeAuthor.slice(0, 26))}</text>
      </svg>
    `;
    coverWrap.appendChild(placeholder);
  }

  // Progress badge (bottom-left)
  const percent = progress && typeof progress.globalPercent === 'number'
    ? progress.globalPercent
    : 0;
  const badge = document.createElement('span');
  badge.className = 'book-progress-badge';
  badge.textContent = percent > 0 ? `${percent}% read` : 'New';
  coverWrap.appendChild(badge);

  // Delete button (top-right)
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
```

### 5.3 CSS Design for Format Badges (`css/main.css`)

The badge styling uses semantic color palettes with strong contrast and subtle translucent backgrounds:

```css
/* ==========================================================================
   Format Badges on Book Cards
   ========================================================================== */
.book-format-badge {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 2;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  line-height: 1.1;
  box-shadow: 0 1px 4px var(--color-shadow);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  user-select: none;
  pointer-events: none;
}

/* Format Color Variants */
/* EPUB: Warm Terracotta / Amber */
.book-format-badge.format-epub {
  background-color: rgba(229, 168, 105, 0.22);
  color: #c47225;
  border: 1px solid rgba(229, 168, 105, 0.55);
}
[data-theme="soft-dark"] .book-format-badge.format-epub,
[data-theme="nord"] .book-format-badge.format-epub,
[data-theme="oled-black"] .book-format-badge.format-epub,
[data-theme="solarized-dark"] .book-format-badge.format-epub {
  background-color: rgba(229, 168, 105, 0.25);
  color: #f3be8a;
  border-color: rgba(229, 168, 105, 0.6);
}

/* PDF: Adobe Crimson / Brick Red */
.book-format-badge.format-pdf {
  background-color: rgba(239, 68, 68, 0.18);
  color: #b91c1c;
  border: 1px solid rgba(239, 68, 68, 0.45);
}
[data-theme="soft-dark"] .book-format-badge.format-pdf,
[data-theme="nord"] .book-format-badge.format-pdf,
[data-theme="oled-black"] .book-format-badge.format-pdf,
[data-theme="solarized-dark"] .book-format-badge.format-pdf {
  background-color: rgba(239, 68, 68, 0.22);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.55);
}

/* MOBI: Kindle Indigo / Royal Blue */
.book-format-badge.format-mobi {
  background-color: rgba(59, 130, 246, 0.18);
  color: #1d4ed8;
  border: 1px solid rgba(59, 130, 246, 0.45);
}
[data-theme="soft-dark"] .book-format-badge.format-mobi,
[data-theme="nord"] .book-format-badge.format-mobi,
[data-theme="oled-black"] .book-format-badge.format-mobi,
[data-theme="solarized-dark"] .book-format-badge.format-mobi {
  background-color: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.55);
}

/* TXT: Clean Monospace Slate / Graphite */
.book-format-badge.format-txt {
  background-color: rgba(100, 116, 139, 0.18);
  color: #334155;
  border: 1px solid rgba(100, 116, 139, 0.45);
}
[data-theme="soft-dark"] .book-format-badge.format-txt,
[data-theme="nord"] .book-format-badge.format-txt,
[data-theme="oled-black"] .book-format-badge.format-txt,
[data-theme="solarized-dark"] .book-format-badge.format-txt {
  background-color: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
  border-color: rgba(148, 163, 184, 0.5);
}

/* MD: Markdown Emerald / Sage Green */
.book-format-badge.format-md {
  background-color: rgba(16, 185, 129, 0.18);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.45);
}
[data-theme="soft-dark"] .book-format-badge.format-md,
[data-theme="nord"] .book-format-badge.format-md,
[data-theme="oled-black"] .book-format-badge.format-md,
[data-theme="solarized-dark"] .book-format-badge.format-md {
  background-color: rgba(16, 185, 129, 0.22);
  color: #6ee7b7;
  border-color: rgba(16, 185, 129, 0.55);
}
```

---

## 6. Header Format Filter Controls & Instant Shelf Filtering

### 6.1 HTML Markup for Library Header (`index.html`)

The format filter bar is integrated into `.library-header`:

```html
      <header class="app-header library-header">
        <div class="brand-group">
          <svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 4h2v5l-1-.75L9 9V4zm9 16H6V4h1v9l3-2.25L13 13V4h5v16z"/>
          </svg>
          <div>
            <h1 class="brand-title">WebReader</h1>
            <p class="brand-subtitle">Minimal, eye-friendly library</p>
          </div>
        </div>

        <!-- Format Filter Controls -->
        <div class="header-filter-group">
          <nav id="format-filter-bar" class="format-filter-bar segmented-control" role="tablist" aria-label="Filter books by format">
            <button type="button" class="segmented-option format-filter-btn is-active" data-filter="all" role="tab" aria-selected="true">All</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="epub" role="tab" aria-selected="false">EPUB</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="pdf" role="tab" aria-selected="false">PDF</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="mobi" role="tab" aria-selected="false">MOBI</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="txt" role="tab" aria-selected="false">TXT</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="md" role="tab" aria-selected="false">MD</button>
          </nav>
        </div>

        <div class="library-actions">
          <input type="file" id="file-input" accept=".epub,.pdf,.mobi,.azw,.txt,.md,application/epub+zip,application/pdf,application/x-mobipocket-ebook,application/vnd.amazon.ebook,text/plain,text/markdown,text/x-markdown" multiple class="sr-only" aria-label="Import books and documents (.epub, .pdf, .mobi, .azw, .txt, .md)">
          <button type="button" id="btn-restore-sample" class="btn btn-secondary" title="Restore sample book">
            Sample Book
          </button>
          <button type="button" id="btn-import-epub" class="btn btn-primary" title="Import e-books or documents">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <span>Import Book</span>
          </button>
        </div>
      </header>
```

### 6.2 CSS Layout & Responsive Styling (`css/main.css`)

```css
/* ==========================================================================
   Header Format Filter Bar
   ========================================================================== */
.header-filter-group {
  display: flex;
  align-items: center;
  justify-content: center;
}

.format-filter-bar {
  display: flex;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.format-filter-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.format-filter-btn:hover {
  color: var(--color-text);
  background-color: var(--color-surface-hover);
}

.format-filter-btn.is-active {
  background-color: var(--color-bg);
  color: var(--color-accent);
  box-shadow: 0 1px 3px var(--color-shadow);
  font-weight: 600;
}

/* Filter Empty State */
.library-empty-filter-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text-secondary);
}

.library-empty-filter-state .empty-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.4rem;
}

.library-empty-filter-state .empty-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

/* Responsive wrap on small screens */
@media (max-width: 820px) {
  .library-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .brand-group {
    justify-content: space-between;
  }
  .header-filter-group {
    width: 100%;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .format-filter-bar {
    width: 100%;
    justify-content: space-between;
  }
  .format-filter-btn {
    flex: 1;
    text-align: center;
    padding: 0.4rem 0.4rem;
    font-size: 0.75rem;
  }
  .library-actions {
    justify-content: flex-end;
  }
}
```

### 6.3 Instant Shelf Filtering Logic in `js/ui/library-view.js`

The filtering operates directly in the DOM without re-querying IndexedDB or performing page reloads:

```javascript
export class LibraryView {
  constructor(container) {
    this.container = container;
    this.coverBlobUrls = new Set();
    this.activeFilter = 'all'; // 'all' | 'epub' | 'pdf' | 'mobi' | 'txt' | 'md'
    this._bindEvents();
  }

  _bindEvents() {
    if (!this.container) return;

    // ... existing event bindings (fileInput, importBtn, restoreBtn, dropZone, grid click) ...

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
  }

  /**
   * Sets the active format filter and updates card visibility in-place.
   * @param {string} filter - 'all' | 'epub' | 'pdf' | 'mobi' | 'txt' | 'md'
   */
  setFilter(filter) {
    this.activeFilter = (filter || 'all').toLowerCase();

    // 1. Update filter tab button active states & ARIA attributes
    const filterBtns = this.container.querySelectorAll('.format-filter-btn[data-filter]');
    filterBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-filter') === this.activeFilter;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // 2. Apply filtering directly to rendered book cards
    this._applyFilter();

    // 3. Emit EventBus notification
    EventBus.emit('library:filter:applied', { filter: this.activeFilter });
  }

  /**
   * Applies the active format filter to currently rendered book cards.
   */
  _applyFilter() {
    const grid = this.container?.querySelector('#library-grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.book-card[data-book-id]'));
    if (cards.length === 0) return; // Handled by empty library state in renderBooks()

    let visibleCount = 0;
    for (const card of cards) {
      const cardFormat = (card.getAttribute('data-format') || 'epub').toLowerCase();
      const matches = (this.activeFilter === 'all') || (cardFormat === this.activeFilter);
      card.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    }

    // Handle format-specific empty state
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
   * Fetches all saved books from StorageManager and updates the grid, respecting activeFilter.
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
    // Remove cards that are no longer in DB
    for (const existingCard of Array.from(grid.querySelectorAll('.book-card[data-book-id]'))) {
      const id = existingCard.getAttribute('data-book-id');
      if (!validIds.has(id)) {
        existingCard.remove();
      }
    }

    for (const book of books) {
      const progress = await StorageManager.getProgress(book.id).catch(() => null);
      const existingCard = grid.querySelector(`.book-card[data-book-id="${CSS.escape(book.id)}"]`);
      if (existingCard) {
        const badge = existingCard.querySelector('.book-progress-badge');
        const percent = progress && typeof progress.globalPercent === 'number' ? progress.globalPercent : 0;
        if (badge) {
          badge.textContent = percent > 0 ? `${percent}% read` : 'New';
        }
      } else {
        const card = this._createBookCard(book, progress);
        grid.appendChild(card);
      }
    }

    // Apply active filter to the freshly reconciled shelf
    this._applyFilter();
  }
}
```

---

## 7. Storage V2 Alignment & Backward Compatibility

### 7.1 Record Contract
When books are saved to IndexedDB:
- `books` store: stores lightweight metadata:
  ```typescript
  interface BookMetadata {
    id: string;
    title: string;
    author: string;
    format: 'epub' | 'pdf' | 'mobi' | 'txt' | 'md';
    description: string;
    language: string;
    fileSize: number;
    coverBlob: Blob | null;
    spineCount: number;
    dateAdded: number;
    lastRead: number;
    isSample?: boolean;
  }
  ```
- `book_files` store: stores binary payloads:
  ```typescript
  interface BookFileRecord {
    id: string;
    fileBlob: Blob;
  }
  ```

### 7.2 Zero-Binary Loading in `LibraryView`
`LibraryView.renderBooks()` calls `StorageManager.getAllBooks()`, which queries only the `books` store. No raw `fileBlob` buffers are loaded into memory when rendering book cards or applying filters. This satisfies Requirement R5 ("Metadata vs. Binary Separation in Library View").

### 7.3 Backward Compatibility for Pre-Existing DB Records
If a book record in IndexedDB predates Milestone 1 and lacks a `format` property:
```javascript
const rawFormat = (book.format || (book.isSample ? 'epub' : 'epub')).toLowerCase();
const format = ['epub', 'pdf', 'mobi', 'txt', 'md'].includes(rawFormat) ? rawFormat : 'epub';
```
It safely defaults to `'epub'` without errors or missing badges.

---

## 8. Step-by-Step Implementation Plan for Worker

| Step | Target File | Action | Details |
|---|---|---|---|
| **Step 1** | `index.html` | Edit `<header>` and `#drop-zone` | 1. Update `#file-input` `accept` attribute.<br>2. Add `#format-filter-bar` inside `.library-header`.<br>3. Update button text to `Import Book` (keep `#btn-import-epub`).<br>4. Update drop-zone copy to list all 6 formats. |
| **Step 2** | `css/main.css` | Add Format Badges & Filter Styles | 1. Add `.book-format-badge` and `.format-epub`, `.format-pdf`, `.format-mobi`, `.format-txt`, `.format-md`.<br>2. Add theme-specific badge overrides for dark themes.<br>3. Add `.header-filter-group`, `.format-filter-bar`, `.format-filter-btn`, `.library-empty-filter-state`.<br>4. Add responsive styling for mobile screens. |
| **Step 3** | `js/ui/library-view.js` | Export Format Helpers | Add `detectFormatFromFilename(name)` and `validateFileFormat(file, format)` helper functions. |
| **Step 4** | `js/ui/library-view.js` | Update `LibraryView` Constructor & Events | Initialize `this.activeFilter = 'all'`; bind filter button click handlers; bind `library:filter` EventBus listener. |
| **Step 5** | `js/ui/library-view.js` | Update `importFiles()` | Support all 6 formats; validate magic bytes; extract title/author metadata; save `format` in `bookRecord`. |
| **Step 6** | `js/ui/library-view.js` | Update `_createBookCard()` | Add `.book-format-badge` to card cover wrapper; set `data-format` attribute on `.book-card`. |
| **Step 7** | `js/ui/library-view.js` | Implement `setFilter()` & `_applyFilter()` | Toggle card visibility in-place without page reload; handle format-specific empty state. |

---

## 9. Verification & Acceptance Test Matrix

| # | Test Scenario | Verification Method | Expected Result |
|---|---|---|---|
| **V1** | File input accepts all 6 formats | Inspect `input[type="file"]#file-input` attribute in DOM | `accept` contains `.epub,.pdf,.mobi,.azw,.txt,.md` and respective MIME types. |
| **V2** | Case-insensitive extension import | Upload `BOOK.EPUB`, `DOC.PDF`, `STORY.MOBI`, `NOTES.TXT`, `README.MD` | All files successfully detected, validated, and imported. |
| **V3** | Corrupted EPUB / ZIP rejection | Upload file with `.epub` extension but invalid header (e.g. `test-fixtures/corrupted.epub`) | Rejected with error toast: "Not a valid EPUB: Missing ZIP archive signature". Library remains intact. |
| **V4** | Corrupted PDF rejection | Upload file with `.pdf` extension containing random binary without `%PDF` | Rejected with error toast: "Not a valid PDF: Missing %PDF document signature". |
| **V5** | Corrupted MOBI rejection | Upload file with `.mobi` extension missing `BOOKMOBI`/PalmDOC | Rejected with error toast: "Not a valid MOBI/AZW e-book". |
| **V6** | Disguised binary in `.txt` / `.md` | Upload binary executable or zip renamed to `.txt` | Rejected with error toast: "File contains binary data". |
| **V7** | Empty (0-byte) file rejection | Upload 0-byte file | Rejected with error toast: "File is empty (0 bytes)". |
| **V8** | Format badge rendering | Inspect rendered cards for each format | Card has `.book-format-badge` containing exact uppercase format text (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`). |
| **V9** | Format badge styling & contrast | Inspect computed CSS color/background/border on badges | Distinct colors for each format, meeting WCAG AA contrast against backgrounds. |
| **V10** | Instant header filter switching | Click `PDF` tab in `#format-filter-bar` | Only cards with `data-format="pdf"` are visible (`display !== 'none'`). Non-PDF cards hidden instantly without page reload. |
| **V11** | Filter reset | Click `All` tab | All cards restored to visible. |
| **V12** | Filter empty state | Click `MOBI` when 0 MOBI books exist | Displays `.library-empty-filter-state` with helpful copy. |
| **V13** | Regression safety | Run `node test/e2e.test.js`, `node test/challenger_storage.test.js`, `node test/challenger_m2_r2_adversarial.js` | 100% pass rate with zero console errors. |

---
*End of Technical Blueprint — Prepared for Milestone 1 Worker Implementation.*
