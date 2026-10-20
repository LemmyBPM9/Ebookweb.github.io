# Comprehensive Specification Survey Report: R1 & R4 Upgrades
**Workspace**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader`  
**Author**: `upgrade_survey_spec_miner_1` (Specification Miner)  
**Date**: 2026-10-17  
**Scope**: 
1. **R1**: Multi-Format Import, Parsing & Unified Library Persistence (`.epub`, `.pdf`, `.mobi`/`.azw`, `.txt`, `.md`, format badges, library filtering, IndexedDB metadata vs. binary blob separation, universal XSS sanitization)
2. **R4**: Expanded Eye-Comfort Reading Themes (10 curated palettes, mathematical WCAG AA/AAA >= 7.0:1 contrast ratios, zero-FOUC head bootstrap, localStorage persistence, complete CSS variable mapping for host UI & iframe content)

---

## 1. Executive Summary

The WebReader application currently provides a verified client-side EPUB reading engine built with pure HTML5, CSS3, and vanilla ES6+ JavaScript (`<script type="module">`) with zero build step. All existing verification suites—`test/e2e.test.js` (21/21 passed), `test/challenger_storage.test.js` (22/22 passed), and `test/challenger_m2_r2_adversarial.js` (4/4 suites passed)—confirm 100% baseline stability.

This survey establishes the exact specifications, architectural boundaries, edge cases, and file touchpoints required to implement:
- **R1**: Expanding file ingestion from `.epub` only to a 5-format ecosystem (`.epub`, `.pdf`, `.mobi`/`.azw`, `.txt`, `.md`), rendering format badges on book cards, introducing library header format filters, re-architecting `WebReaderDB` in IndexedDB to isolate lightweight metadata from heavy binary blobs (preventing RAM bloat during library browsing), and enforcing ironclad universal DOM sanitization to ensure `window.__xssTriggered` remains falsy across all imported formats.
- **R4**: Expanding the 4 existing eye-comfort themes to a full collection of 10 low-fatigue reading palettes (`warm-paper`, `soft-dark`, `daylight`, `sage`, `solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`), mathematically calibrated to exceed the stringent WCAG AAA requirement (contrast ratio >= 7.0:1 for body text), backed by a synchronous zero-FOUC `<head>` bootstrap and dual host/iframe CSS variable synchronization.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| F-01 | R1 Import | Multi-Format File Picker | `<input type="file">` accepting all 5 format families | User file selection dialog | `FileList` containing `.epub, .pdf, .mobi, .azw, .txt, .md` | Rejects unsupported extensions with non-blocking error toast | `ORIGINAL_REQUEST.md:61,98`, `index.html:77` |
| F-02 | R1 Import | Multi-Format Drag & Drop | Drop zone accepting dropped files of all 5 format families | `dragover`, `drop` `DragEvent` with `dataTransfer.files` | Array of `File` objects forwarded to import pipeline | Highlights drop zone on dragover; ignores non-matching drag objects | `ORIGINAL_REQUEST.md:61,98`, `js/ui/library-view.js:73-100` |
| F-03 | R1 Library | Library Format Badges | Distinct visual pill/badge on every card cover identifying document format | `book.format` or detected file extension (`epub`, `pdf`, `mobi`, `txt`, `md`) | DOM `<span class="book-format-badge format-{fmt}">FMT</span>` | Falls back to `EPUB` if format undefined on legacy records | `ORIGINAL_REQUEST.md:62,99`, `js/ui/library-view.js:220-310` |
| F-04 | R1 Library | Header Format Filter Controls | Filter button group/tablist in library header to filter books by format | User clicks `All`, `EPUB`, `PDF`, `MOBI`, `TXT`, or `MD` | Grid updates in-place to show only matching cards | If 0 books match filter, displays empty filter banner with "Show All" action | `ORIGINAL_REQUEST.md:62`, `index.html:65-88` |
| F-05 | R1 Storage | IndexedDB Metadata / Blob Separation | Separating book metadata (`books` store) from raw binary file blobs (`book_files` store) | `saveBook(bookRecord)` with `fileBlob` | Metadata saved to `books`; binary saved to `book_files` with matching `id` | QuotaExceeded handled with user warning; rollback in atomic transaction | `ORIGINAL_REQUEST.md:61,85,108`, `js/storage/db.js:35-54` |
| F-06 | R1 Storage | Lightweight Library Listing | `getAllBooks()` queries only `books` store, returning zero heavy `fileBlob` buffers into RAM | `StorageManager.getAllBooks()` | `Array<BookMetadata>` without large `ArrayBuffer` payloads | Resolves empty array if DB empty | `ORIGINAL_REQUEST.md:85,108`, `js/storage/db.js:91-107` |
| F-07 | R1 Storage | On-Demand Binary Loading | Fetching binary `fileBlob` only when opening a specific book in Reader View | `StorageManager.getBook(id)` / `getBookBinary(id)` | Complete `BookRecord` containing `fileBlob` | Returns `null` if book ID not found | `ORIGINAL_REQUEST.md:85`, `js/storage/db.js:114-125` |
| F-08 | R1 Storage | Atomic Multi-Store Cascading Deletion | Single transaction deleting records from `books`, `book_files`, `reading_progress`, and `bookmarks` | `StorageManager.deleteBook(id)` | Complete removal across all 4 IndexedDB stores | Idempotent for missing IDs; rolls back if aborted | `PROJECT.md:78`, `js/storage/db.js:171-200` |
| F-09 | R1 Security | Universal DOM Sanitization | Strict stripping of `<script>`, dangerous tags, inline `on*` handlers, and dangerous URIs across all formats | Raw HTML/markup generated from Markdown, MOBI, TXT, or EPUB | Sanitized DOM `Document` / `Element` where `window.__xssTriggered` is guaranteed falsy | Unsafe tags/attributes silently stripped | `ORIGINAL_REQUEST.md:63,113`, `js/parser/asset-extractor.js:77-150` |
| F-10 | R4 Themes | 10 Eye-Comfort Palettes | Curated low-fatigue color themes covering light, dark, warm, muted, and grayscale modes | Selected theme ID string | Active CSS variables applied to `:root`, `body`, and reader iframe | Falls back to `warm-paper` if unknown theme ID | `ORIGINAL_REQUEST.md:75-82`, `css/themes.css:9-178` |
| F-11 | R4 Contrast | Mathematical WCAG AAA Contrast (>= 7.0:1) | Body text foreground-to-background contrast ratio calibrated >= 7.0:1 on all 10 themes | Computed sRGB color values of `--color-bg` and `--color-text` | Contrast ratio metric between 10.84:1 and 15.80:1 across all 10 palettes | Prevents photopic glare and scotopic eye strain | `ORIGINAL_REQUEST.md:82,105`, `test/e2e.test.js:129-135` |
| F-12 | R4 FOUC | Zero-FOUC Synchronous Head Bootstrap | `<head>` inline script reading `localStorage` before first layout/paint | `localStorage.getItem('webreader_theme')` | Sets `data-theme` and `.no-theme-transition` on `<html>` synchronously | Falls back to `warm-paper` on empty/corrupted storage | `ORIGINAL_REQUEST.md:82,105`, `index.html:9-48` |
| F-13 | R4 CSS Vars | Complete CSS Custom Property Mapping | Consistent design token dictionary mapped across all 10 themes | Theme selection | 22 CSS variables configured per theme (surfaces, borders, text, accents, feedback) | Fallback tokens inherited from base `:root` | `css/themes.css`, `js/reader/reader-engine.js:21-54` |
| F-14 | R4 Reader | Dual Host & Sandboxed Iframe Styling | Synchronizing theme variables between main window DOM and sandboxed reader iframe | `ReaderEngine.applyTheme(themeId)` | Sets `data-theme` on host `html` and injects variables + background/color into iframe | Graceful no-op if iframe unmounted | `PROJECT.md:108`, `js/reader/reader-engine.js:433-460` |
| F-15 | R4 UI | 10-Theme Settings Drawer Swatches | Swatch buttons with color circle and title in Reading Comfort drawer | User click on theme swatch | Emits `ui:set-theme`, updates `.is-active`, updates `aria-pressed` | Clamps selection to valid 10 theme IDs | `ORIGINAL_REQUEST.md:104`, `index.html:247-266` |

---

## 3. Edge Cases & Boundary Conditions

| # | Feature | Input / Trigger | Observed / Expected Behavior |
|---|---------|-----------------|------------------------------|
| E-01 | File Ingestion | Dragging a file with mixed-case extension (e.g. `BOOK.EPUB`, `Document.PDF`, `NOTES.MD`) | Case-insensitive extension matching ensures all mixed-case files are accepted without rejection. |
| E-02 | File Ingestion | Dragging unsupported file format (e.g. `archive.zip`, `photo.png`, `audio.mp3`) | File is rejected with non-blocking error toast: `"Unsupported format. Please import .epub, .pdf, .mobi, .azw, .txt, or .md files."` without crashing or freezing. |
| E-03 | File Ingestion | Corrupted / truncated file (0 bytes, or invalid binary payload) | File is caught by parser pre-validation; non-blocking error toast displayed; zero orphaned records created in IndexedDB; grid remains intact. |
| E-04 | Format Filtering | Filtering by format with 0 matching books (e.g., clicking `PDF` when only `EPUB` and `TXT` are in library) | Library displays clean empty state: `"No PDF documents found in your library"` with a `"Show All Books"` action button. |
| E-05 | Format Badging | Legacy book record in IndexedDB created prior to format upgrade (missing `book.format`) | Badge renderer checks extension in `title` or defaults safely to `EPUB`. Legacy records display `EPUB` badge without throwing `TypeError`. |
| E-06 | Memory Bloat | Library containing 50 large books (e.g. 20MB PDFs / 10MB EPUBs, 750MB total storage) | `StorageManager.getAllBooks()` fetches only metadata from `books` store; total JS heap memory allocated during library render remains under 10MB; binary payloads remain on disk in IndexedDB. |
| E-07 | Concurrency | Rapid deletion of a book while a binary read is in progress | IndexedDB transaction isolation ensures either the read completes before deletion or throws `NotFoundError`; database leaves 0 orphaned records in `book_files`. |
| E-08 | XSS Injection | Markdown containing raw HTML: `<script>window.__xssTriggered = true;</script>` | `DOMSanitizer` strips the `<script>` tag entirely before DOM insertion; `window.__xssTriggered` remains `undefined` / falsy. |
| E-09 | XSS Injection | Markdown link with javascript scheme: `[Click Me](javascript:window.__xssTriggered=true)` | `DOMSanitizer` strips the `href` attribute from the anchor element; link renders inert; `window.__xssTriggered` remains falsy. |
| E-10 | XSS Injection | HTML image with inline handler: `<img src="x" onerror="window.__xssTriggered = true">` | `DOMSanitizer` strips the `onerror` attribute; image fails to execute code; `window.__xssTriggered` remains falsy. |
| E-11 | XSS Injection | MOBI HTML containing `<svg><script>window.__xssTriggered=true</script></svg>` or `<math>` scripts | `DOMSanitizer` recursively purges all `<script>` tags across XML/SVG/MathML namespaces. |
| E-12 | Theme Bootstrap | User opens website with corrupted `localStorage.getItem('webreader_theme')` (e.g. `'malicious-hack'` or `'unknown'`) | Synchronous `<head>` script and `SettingsManager.getTheme()` validate against `VALID_THEMES`; falls back cleanly to `'warm-paper'`. |
| E-13 | FOUC Prevention | Cold load or hard refresh (`Cmd+Shift+R` / `location.reload()`) with dark theme (`oled-black` or `nord`) | Inline head script immediately applies `data-theme="oled-black"` and class `.no-theme-transition` to `<html>` before first paint, eliminating white screen flash (FOUC). Class `.no-theme-transition` is removed via double-rAF. |
| E-14 | Contrast Boundary | Solarized Light using standard Solarized base01 (`#586E75`) for body text | Contrast of `#586E75` on `#FDF6E3` is 4.99:1 (fails >= 7.0:1 AAA). Specification mandates using Solarized base02 (`#073642`) for body text (`--color-text`), yielding 12.05:1 (AAA), while `#586E75` is assigned to `--color-text-secondary` (AA). |
| E-15 | Contrast Boundary | Solarized Dark using standard Solarized base1 (`#93A1A1`) for body text | Contrast of `#93A1A1` on `#002B36` is 5.61:1 (fails >= 7.0:1 AAA). Specification mandates using Solarized base2 (`#EEE8D5`) for body text (`--color-text`), yielding 12.25:1 (AAA), while `#93A1A1` is assigned to `--color-text-secondary` (AA). |
| E-16 | Mode Switch & Theme | User switches theme while inside a book, then switches to Scroll Mode, then closes book to library | `EventBus` broadcasts updates; theme persists in `localStorage`; returning to library cleans up active book in-memory resources and updates shelf cards to match active theme. |

---

## 4. Deep-Dive: Requirement 1 — Multi-Format Import & Unified Library Persistence

### 4.1 Ingestion Interface & Supported Formats
The application must accept 5 format families across both file picker dialog and drag-and-drop zone:

| Format Family | File Extensions | Recognized MIME Media Types | Initial Validation Check |
|---------------|-----------------|-----------------------------|---------------------------|
| **EPUB** | `.epub` | `application/epub+zip` | ZIP signature (`PK\x03\x04` / `0x04034b50`) |
| **PDF** | `.pdf` | `application/pdf` | PDF header magic bytes (`%PDF-` / `0x25 0x50 0x44 0x46`) |
| **MOBI / AZW** | `.mobi`, `.azw` | `application/x-mobipocket-ebook`, `application/vnd.amazon.ebook`, `application/octet-stream` | Palm Database header (offset 60: `BOOKMOBI`) |
| **Plain Text** | `.txt` | `text/plain` | UTF-8 / ASCII text stream validation |
| **Markdown** | `.md` | `text/markdown`, `text/x-markdown`, `text/plain` | UTF-8 / ASCII text stream validation |

#### File Input Specification:
```html
<input 
  type="file" 
  id="file-input" 
  accept=".epub,.pdf,.mobi,.azw,.txt,.md,application/epub+zip,application/pdf,application/x-mobipocket-ebook,application/vnd.amazon.ebook,text/plain,text/markdown" 
  multiple 
  class="sr-only" 
  aria-label="Import book or document (.epub, .pdf, .mobi, .azw, .txt, .md)">
```

#### Drag & Drop Handling:
- File extension normalization: `const ext = '.' + file.name.split('.').pop().toLowerCase();`
- Allowed extensions set: `new Set(['.epub', '.pdf', '.mobi', '.azw', '.txt', '.md'])`
- Dropping multiple files processes them sequentially in a single pass, updating the library grid once after completion.

---

### 4.2 Library Card Format Badges
Every card rendered on `#library-grid` must visually display its document format badge in the top-left corner of `.book-cover-wrapper` (counterbalanced with `.book-delete-btn` at top-right and `.book-progress-badge` at bottom-left).

```html
<article class="card book-card" data-book-id="book_1729189000_abc" data-format="pdf" tabindex="0" role="button">
  <div class="book-cover-wrapper">
    <!-- Format Badge (Top-Left) -->
    <span class="book-format-badge format-pdf">PDF</span>
    
    <!-- Delete Button (Top-Right) -->
    <button type="button" class="btn btn-icon book-delete-btn" aria-label="Delete document">...</button>
    
    <!-- Cover Image / Placeholder -->
    <img class="book-cover" src="..." alt="Cover">
    
    <!-- Progress Badge (Bottom-Left) -->
    <span class="book-progress-badge">42% read</span>
  </div>
  <div class="book-card-body">
    <h3 class="book-title title">Research Paper</h3>
    <p class="book-author author">Dr. Jane Smith</p>
  </div>
</article>
```

#### Badge Styling Standards (`css/main.css`):
- `.book-format-badge`:
  - `position: absolute; top: 0.5rem; left: 0.5rem; z-index: 2;`
  - `font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;`
  - `padding: 0.15rem 0.45rem; border-radius: 4px; line-height: 1.2;`
  - `background-color: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-strong);`
  - Subtle brand accents per format:
    - `.format-epub`: border-left: 3px solid #8b5a2b; (Warm chestnut)
    - `.format-pdf`: border-left: 3px solid #ba1a1a; (Crimson)
    - `.format-mobi`: border-left: 3px solid #2364a0; (Lapis blue)
    - `.format-txt`: border-left: 3px solid #70625b; (Slate graphite)
    - `.format-md`: border-left: 3px solid #2d7348; (Pine green)

---

### 4.3 Library Header Format Filter Controls
Located in `.library-header` or `.shelf-header`, providing immediate, client-side filtering without reloading:

```html
<div class="format-filter-bar" role="tablist" aria-label="Filter library by format">
  <button type="button" class="btn btn-filter is-active" data-filter="all" role="tab" aria-selected="true">All</button>
  <button type="button" class="btn btn-filter" data-filter="epub" role="tab" aria-selected="false">EPUB</button>
  <button type="button" class="btn btn-filter" data-filter="pdf" role="tab" aria-selected="false">PDF</button>
  <button type="button" class="btn btn-filter" data-filter="mobi" role="tab" aria-selected="false">MOBI</button>
  <button type="button" class="btn btn-filter" data-filter="txt" role="tab" aria-selected="false">TXT</button>
  <button type="button" class="btn btn-filter" data-filter="md" role="tab" aria-selected="false">MD</button>
</div>
```

#### Filter Execution Semantics:
1. When user clicks a filter tab, `this.activeFilter = filterId` is updated.
2. The active button receives `.is-active` and `aria-selected="true"`.
3. In `renderBooks()`:
   ```javascript
   const filteredBooks = this.activeFilter === 'all'
     ? allBooks
     : allBooks.filter(book => (book.format || 'epub').toLowerCase() === this.activeFilter);
   ```
4. If `filteredBooks.length === 0`:
   Render empty state with a message and reset button:
   ```html
   <div class="library-empty-filter">
     <p>No ${this.activeFilter.toUpperCase()} books found.</p>
     <button class="btn btn-secondary btn-sm" id="btn-clear-filter">Show All</button>
   </div>
   ```

---

### 4.4 IndexedDB Schema: Metadata vs. Binary Separation (WebReaderDB)

#### Problem in Current Architecture:
In the current implementation (`js/storage/db.js`), `books` store puts the complete `bookRecord` (including `fileBlob: Blob` which can be 50MB+) in `books`.
When `StorageManager.getAllBooks()` is called, `store.index('by_lastRead').getAll()` loads every book's binary into JavaScript memory, causing high RAM consumption and slow library shelf rendering.

#### Upgraded Segregated Architecture:
```
+-----------------------------------------------------------------------------------------+
|                                    WebReaderDB (IndexedDB)                              |
+-----------------------------------------------------------------------------------------+
| 1. 'books' Store (Metadata Only)                                                        |
|    KeyPath: 'id'                                                                        |
|    Indexes: 'by_lastRead', 'by_dateAdded', 'by_title', 'by_format'                      |
|    Payload: { id, title, author, format, fileSize, coverBlob, dateAdded, lastRead, ... }|
|    NOTE: 'fileBlob' is EXCLUDED to guarantee flat memory usage.                         |
+-----------------------------------------------------------------------------------------+
| 2. 'book_files' Store (Binary Blobs On-Demand)                                          |
|    KeyPath: 'id'                                                                        |
|    Payload: { id: 'book_123', fileBlob: Blob | ArrayBuffer }                             |
|    Loaded ONLY when user clicks to open a specific book; released upon closing.         |
+-----------------------------------------------------------------------------------------+
| 3. 'reading_progress' Store                                                             |
|    KeyPath: 'bookId'                                                                    |
|    Payload: { bookId, spineIndex, pageIndex, scrollRatio, globalPercent, updatedAt }    |
+-----------------------------------------------------------------------------------------+
| 4. 'bookmarks' Store                                                                    |
|    KeyPath: 'id'                                                                        |
|    Indexes: 'by_bookId', 'by_createdAt'                                                 |
|    Payload: { id, bookId, spineIndex, pageIndex, scrollRatio, snippet, createdAt }       |
+-----------------------------------------------------------------------------------------+
```

#### Method Contracts:
1. `StorageManager.getAllBooks()` / `StorageManager.getAllBooksMetadata()`:
   Reads ONLY from `books` store. Returns array of metadata records. Zero binary Blobs in memory.
2. `StorageManager.getBook(id)`:
   Reads metadata from `books` AND binary from `book_files`, returning `{ ...metadata, fileBlob }`.
3. `StorageManager.saveBook(bookRecord)`:
   In a single transaction `['books', 'book_files']`:
   - Extracts `const { fileBlob, ...metadata } = bookRecord;`
   - If `fileBlob` exists, stores `{ id: bookRecord.id, fileBlob }` in `book_files`.
   - Stores `metadata` in `books`.
4. `StorageManager.deleteBook(id)`:
   Atomic transaction across `['books', 'book_files', 'reading_progress', 'bookmarks']`:
   Deletes `id` from `books`, `book_files`, and `reading_progress`, and deletes all matching bookmarks via cursor on index `by_bookId`. 0 orphans guaranteed.

---

### 4.5 Universal XSS Sanitization & Security Defenses
All document formats (Markdown, MOBI HTML, TXT converted to HTML, PDF extracted text, and EPUB XHTML) pass through `DOMSanitizer.sanitize(rootElement)`.

#### Strict Sanitization Rules:
1. **Script Stripping**: Recursively removes all `<script>` tags across standard HTML, SVG (`<svg><script>`), and MathML (`<math><script>`).
2. **Dangerous Container Neutralization**: Completely removes:
   - `<meta http-equiv="refresh">`
   - `<iframe>`, `<frame>`, `<frameset>`
   - `<object>`, `<embed>`, `<applet>`
   - `<base>`
3. **Form Submissions Neutralized**: Strips `action`, `method`, `target` from `<form>`, and `formaction`, `formmethod`, `formtarget` from buttons/inputs.
4. **Attribute Sanitization**:
   - Strips all attributes starting with `on` (`onclick`, `onerror`, `onload`, `onmouseover`, `onfocus`, etc.).
   - Inspects `href`, `src`, `xlink:href`, `data`, `poster`.
   - Strips control chars `[\u0000-\u001F\s]` and checks URI schemes. If scheme matches `javascript:`, `vbscript:`, `data:text/html`, or `data:application/xhtml+xml`, removes the attribute immediately.
5. **Sandboxed Iframe**:
   - The reader iframe retains `sandbox="allow-same-origin"` WITHOUT `allow-scripts`.
   - Result: Even if an unparsed script payload slips past, the browser blocks execution natively.
   - Acceptance guarantee: `window.__xssTriggered` remains `undefined` / falsy in all security challenge tests.

---

## 5. Deep-Dive: Requirement 4 — Expanded Eye-Comfort Reading Themes

### 5.1 The 10 Curated Eye-Comfort Palettes
The 10 themes are selected based on visual ergonomics, minimizing blue-light emission, photopic glare (harsh bright light), scotopic halation (harsh high-contrast white-on-black glow), and ocular fatigue:

1. **`warm-paper`** (Existing / Default): Classical warm cream book page with gentle charcoal ink.
2. **`soft-dark`** (Existing): Low-blue-light slate-charcoal night palette; avoids stark `#000000` on `#FFFFFF` halation.
3. **`daylight`** (Existing): Soft off-white with deep graphite ink for bright daylight reading.
4. **`sage`** (Existing): Muted calm botanical green, optimized for human photopic eye sensitivity.
5. **`solarized-light`** (New): Ethan Schoonover’s classic warm yellow-cream background (`#FDF6E3`) with rich deep Solarized base02 text (`#073642`).
6. **`solarized-dark`** (New): Deep petrol/ocean blue (`#002B36`) with soft parchment Solarized base2 text (`#EEE8D5`).
7. **`nord`** (New): Arctic night palette featuring deep slate (`#2E3440`) with crisp snow storm text (`#ECEFF4` / `#D8DEE9`) and frost cyan accents.
8. **`oled-black`** (New): Pure pitch-black (`#000000`) for zero-bloom reading on OLED/AMOLED displays, with dimmed silver text (`#C8C8C8`) to eliminate high-contrast halo effect.
9. **`rose-pine`** (New): Muted dusk sanctuary palette (`#191724`) with warm rose-cream text (`#E0DEF4`) and dusty rose accents (`#EBBCBA`).
10. **`e-ink`** (New): Pure grayscale digital paper (`#F0F0EB`) with carbon ink (`#1A1A1A`) and zero color saturation, replicating high-end e-paper displays.

---

### 5.2 Mathematical WCAG AA/AAA Contrast Audit Matrix

Contrast ratios are computed using the standard W3C WCAG 2.1 relative luminance formula:
$$L = 0.2126 \cdot R + 0.7152 \cdot G + 0.0722 \cdot B$$
$$\text{Contrast} = \frac{L_{\text{lighter}} + 0.05}{L_{\text{darker}} + 0.05}$$

Requirement: **Contrast ratio >= 7.0:1 (WCAG AAA)** for body text.

| # | Theme ID | Background (`--color-bg`) | Body Text (`--color-text`) | Computed Contrast | WCAG Level | Secondary Text (`--color-text-secondary`) | Secondary Contrast |
|---|----------|---------------------------|----------------------------|-------------------|------------|-------------------------------------------|-------------------|
| 1 | `warm-paper` | `#F8F1E3` | `#2C2523` | **13.38 : 1** | **AAA** (>= 7.0:1) | `#5C504A` | 6.92 : 1 (AA) |
| 2 | `soft-dark` | `#1A1C1E` | `#E2E2E0` | **13.17 : 1** | **AAA** (>= 7.0:1) | `#9E9E9A` | 6.36 : 1 (AA) |
| 3 | `daylight` | `#FCFBF9` | `#1E2022` | **15.80 : 1** | **AAA** (>= 7.0:1) | `#555B62` | 6.64 : 1 (AA) |
| 4 | `sage` | `#EEF3ED` | `#1C2820` | **13.60 : 1** | **AAA** (>= 7.0:1) | `#4A5D50` | 6.28 : 1 (AA) |
| 5 | `solarized-light` | `#FDF6E3` | `#073642` | **12.05 : 1** | **AAA** (>= 7.0:1) | `#586E75` | 4.99 : 1 (AA) |
| 6 | `solarized-dark` | `#002B36` | `#EEE8D5` | **12.25 : 1** | **AAA** (>= 7.0:1) | `#93A1A1` | 5.61 : 1 (AA) |
| 7 | `nord` | `#2E3440` | `#ECEFF4` | **10.84 : 1** | **AAA** (>= 7.0:1) | `#D8DEE9` | 9.25 : 1 (AAA) |
| 8 | `oled-black` | `#000000` | `#C8C8C8` | **12.55 : 1** | **AAA** (>= 7.0:1) | `#909090` | 6.58 : 1 (AA) |
| 9 | `rose-pine` | `#191724` | `#E0DEF4` | **13.39 : 1** | **AAA** (>= 7.0:1) | `#908CAA` | 5.48 : 1 (AA) |
| 10 | `e-ink` | `#F0F0EB` | `#1A1A1A` | **15.22 : 1** | **AAA** (>= 7.0:1) | `#555555` | 6.52 : 1 (AA) |

> **Key Discovery**: In Solarized Light, Solarized Base01 (`#586E75`) achieves only 4.99:1 contrast, which passes AA (>= 4.5:1) but fails the strict >= 7.0:1 AAA target. By assigning Solarized Base02 (`#073642`) to `--color-text`, we achieve **12.05:1 (AAA)** while keeping `#586E75` for secondary text. Similarly in Solarized Dark, using Solarized Base2 (`#EEE8D5`) achieves **12.25:1 (AAA)**.

---

### 5.3 Complete CSS Custom Property Mapping (Host UI & Iframe Content)

Every theme must implement the complete 22-variable token contract in `css/themes.css`:

```css
/* Token Signature */
[data-theme="solarized-light"] {
  color-scheme: light;
  --color-bg: #fdf6e3;
  --color-surface: #f4ecda;
  --color-surface-hover: #eae1cd;
  --color-surface-active: #dfd6c0;
  --color-border: #e6ddc8;
  --color-border-strong: #93a1a1;
  --color-text: #073642;
  --color-text-secondary: #586e75;
  --color-text-muted: #657b83;
  --color-accent: #2075b0;
  --color-accent-hover: #19659a;
  --color-accent-light: rgba(32, 117, 176, 0.12);
  --color-accent-text: #ffffff;
  --color-focus-ring: #2075b0;
  --color-highlight: #eedc94;
  --color-scrollbar: #e0d7c2;
  --color-scrollbar-hover: #cfc5af;
  --color-shadow: rgba(7, 54, 66, 0.08);
  --color-overlay: rgba(7, 54, 66, 0.35);
  --color-error: #dc322f;
  --color-error-bg: #fdf0ee;
  --color-success: #859900;
  --color-success-bg: #f3f7e6;
}

[data-theme="solarized-dark"] {
  color-scheme: dark;
  --color-bg: #002b36;
  --color-surface: #073642;
  --color-surface-hover: #0e4350;
  --color-surface-active: #15505e;
  --color-border: #0d424f;
  --color-border-strong: #586e75;
  --color-text: #eee8d5;
  --color-text-secondary: #93a1a1;
  --color-text-muted: #839496;
  --color-accent: #2aa198;
  --color-accent-hover: #35b6ac;
  --color-accent-light: rgba(42, 161, 152, 0.18);
  --color-accent-text: #002b36;
  --color-focus-ring: #2aa198;
  --color-highlight: #0b4957;
  --color-scrollbar: #0a404d;
  --color-scrollbar-hover: #125564;
  --color-shadow: rgba(0, 0, 0, 0.55);
  --color-overlay: rgba(0, 0, 0, 0.70);
  --color-error: #dc322f;
  --color-error-bg: #351314;
  --color-success: #859900;
  --color-success-bg: #1f2e0f;
}

[data-theme="nord"] {
  color-scheme: dark;
  --color-bg: #2e3440;
  --color-surface: #3b4252;
  --color-surface-hover: #434c5e;
  --color-surface-active: #4c566a;
  --color-border: #434c5e;
  --color-border-strong: #616e85;
  --color-text: #eceff4;
  --color-text-secondary: #d8dee9;
  --color-text-muted: #9aa5b8;
  --color-accent: #88c0d0;
  --color-accent-hover: #8fbcbb;
  --color-accent-light: rgba(136, 192, 208, 0.18);
  --color-accent-text: #2e3440;
  --color-focus-ring: #88c0d0;
  --color-highlight: #3b4f63;
  --color-scrollbar: #434c5e;
  --color-scrollbar-hover: #4c566a;
  --color-shadow: rgba(0, 0, 0, 0.45);
  --color-overlay: rgba(0, 0, 0, 0.65);
  --color-error: #bf616a;
  --color-error-bg: #3c2427;
  --color-success: #a3be8c;
  --color-success-bg: #283624;
}

[data-theme="oled-black"] {
  color-scheme: dark;
  --color-bg: #000000;
  --color-surface: #121212;
  --color-surface-hover: #1e1e1e;
  --color-surface-active: #282828;
  --color-border: #222222;
  --color-border-strong: #555555;
  --color-text: #c8c8c8;
  --color-text-secondary: #909090;
  --color-text-muted: #707070;
  --color-accent: #d4af37;
  --color-accent-hover: #e5c158;
  --color-accent-light: rgba(212, 175, 55, 0.16);
  --color-accent-text: #000000;
  --color-focus-ring: #d4af37;
  --color-highlight: #282414;
  --color-scrollbar: #242424;
  --color-scrollbar-hover: #383838;
  --color-shadow: rgba(0, 0, 0, 0.90);
  --color-overlay: rgba(0, 0, 0, 0.85);
  --color-error: #cf6679;
  --color-error-bg: #2d1419;
  --color-success: #81c784;
  --color-success-bg: #142817;
}

[data-theme="rose-pine"] {
  color-scheme: dark;
  --color-bg: #191724;
  --color-surface: #1f1d2e;
  --color-surface-hover: #26233a;
  --color-surface-active: #312d47;
  --color-border: #28253b;
  --color-border-strong: #524f67;
  --color-text: #e0def4;
  --color-text-secondary: #908caa;
  --color-text-muted: #6e6a86;
  --color-accent: #ebbcba;
  --color-accent-hover: #f1cac8;
  --color-accent-light: rgba(235, 188, 186, 0.16);
  --color-accent-text: #191724;
  --color-focus-ring: #ebbcba;
  --color-highlight: #342e47;
  --color-scrollbar: #2e2a42;
  --color-scrollbar-hover: #3d3857;
  --color-shadow: rgba(0, 0, 0, 0.55);
  --color-overlay: rgba(0, 0, 0, 0.70);
  --color-error: #eb6f92;
  --color-error-bg: #351a24;
  --color-success: #9ccfd8;
  --color-success-bg: #1a2a2e;
}

[data-theme="e-ink"] {
  color-scheme: light;
  --color-bg: #f0f0eb;
  --color-surface: #e5e5df;
  --color-surface-hover: #dadad4;
  --color-surface-active: #cfcfc8;
  --color-border: #d2d2cc;
  --color-border-strong: #787874;
  --color-text: #1a1a1a;
  --color-text-secondary: #555555;
  --color-text-muted: #686868;
  --color-accent: #333333;
  --color-accent-hover: #111111;
  --color-accent-light: rgba(0, 0, 0, 0.08);
  --color-accent-text: #f0f0eb;
  --color-focus-ring: #333333;
  --color-highlight: #dcdcd6;
  --color-scrollbar: #cececa;
  --color-scrollbar-hover: #b5b5b0;
  --color-shadow: rgba(0, 0, 0, 0.08);
  --color-overlay: rgba(0, 0, 0, 0.35);
  --color-error: #444444;
  --color-error-bg: #dedede;
  --color-success: #333333;
  --color-success-bg: #e2e2de;
}
```

---

### 5.4 Zero-FOUC Synchronous Boot Sequence & Storage
In `index.html`, the inline head script must be updated:

```html
<script>
  (function() {
    try {
      var theme = localStorage.getItem('webreader_theme') || 'warm-paper';
      var allowed = [
        'warm-paper', 'soft-dark', 'daylight', 'sage',
        'solarized-light', 'solarized-dark', 'nord',
        'oled-black', 'rose-pine', 'e-ink'
      ];
      if (allowed.indexOf(theme) === -1) theme = 'warm-paper';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.add('no-theme-transition');

      var rawTypo = localStorage.getItem('webreader_typography');
      if (rawTypo) {
        var typo = JSON.parse(rawTypo);
        if (typo && typo.fontSize) {
          document.documentElement.style.setProperty('--reader-font-size', typo.fontSize + 'px');
        }
        if (typo && typo.lineHeight) {
          document.documentElement.style.setProperty('--reader-line-height', String(typo.lineHeight));
        }
        if (typo && typo.maxWidth) {
          document.documentElement.style.setProperty('--reader-max-width', typo.maxWidth + 'px');
        }
      }
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'warm-paper');
    }

    function removeNoTransition() {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          document.documentElement.classList.remove('no-theme-transition');
        });
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', removeNoTransition);
    } else {
      removeNoTransition();
    }
  })();
</script>
```

#### Settings Store & Reader Engine Synchronization:
- `js/storage/settings-store.js`:
  ```javascript
  export const THEMES = Object.freeze({
    WARM_PAPER: 'warm-paper',
    SOFT_DARK: 'soft-dark',
    DAYLIGHT: 'daylight',
    SAGE: 'sage',
    SOLARIZED_LIGHT: 'solarized-light',
    SOLARIZED_DARK: 'solarized-dark',
    NORD: 'nord',
    OLED_BLACK: 'oled-black',
    ROSE_PINE: 'rose-pine',
    E_INK: 'e-ink'
  });
  export const VALID_THEMES = Object.freeze(Object.values(THEMES));
  ```
- `js/reader/reader-engine.js`:
  `THEME_PALETTES` must map all 10 theme IDs to `{ '--color-bg', '--color-surface', '--color-text', '--color-text-secondary', '--color-accent', '--color-border' }`.
  When `applyTheme(themeId)` is called:
  1. Sets `data-theme` on `document.documentElement`, `document.body`, and `#reader-stage`.
  2. Sets `data-theme` on `iframeDoc.documentElement`.
  3. Iterates `THEME_PALETTES[themeId]` and calls `iframeDoc.documentElement.style.setProperty(prop, val)`.
  4. Sets `iframeDoc.body.style.backgroundColor = palette['--color-bg']` and `iframeDoc.body.style.color = palette['--color-text']`.

---

## 6. Architectural Impact & File Touch Matrix

| Target File | Changes Required | Rationale / Dependency |
|-------------|------------------|------------------------|
| `index.html` | 1. Update `<script>` inline head: expand `allowed` array to 10 themes.<br>2. Update `#file-input` `accept` to `.epub,.pdf,.mobi,.azw,.txt,.md` + MIME types.<br>3. Update `#drop-zone` copy.<br>4. Add `.format-filter-bar` in library header.<br>5. Add 6 new theme buttons in `#settings-drawer .theme-swatches`. | R1 file acceptance, header filtering; R4 10 themes & zero-FOUC boot |
| `css/themes.css` | 1. Append complete 22-token variable definitions for `solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`.<br>2. Ensure contrast ratios exceed 7.0:1 for body text. | R4 10 eye-comfort themes meeting WCAG AAA |
| `css/main.css` | 1. Add `.book-format-badge` positioning and format styles (`.format-pdf`, `.format-mobi`, etc.).<br>2. Add `.format-filter-bar` button styling.<br>3. Add theme swatch button circle styling for the 6 new themes. | R1 visual badges & filter UX; R4 settings drawer swatches |
| `js/storage/settings-store.js` | 1. Expand `THEMES` enum and `VALID_THEMES` array to 10 themes. | R4 theme validation and persistence |
| `js/storage/db.js` | 1. Upgrade `WebReaderDB` to include `book_files` object store.<br>2. Update `saveBook()` to split `fileBlob` into `book_files` and store only metadata in `books`.<br>3. Update `getAllBooks()` to load exclusively from `books` store (zero binary buffers in RAM).<br>4. Update `getBook()` to fetch metadata and join binary from `book_files`.<br>5. Update `deleteBook()` to atomically purge all 4 stores. | R1 & R5 metadata vs binary separation; memory optimization |
| `js/storage/storage-manager.js` | 1. Export convenience methods `getAllBooksMetadata()` and `getBookBinary(id)`. | R1 & R5 storage facade parity |
| `js/ui/library-view.js` | 1. Accept 5 formats in `importFiles()`.<br>2. Route to appropriate format parser.<br>3. Stamp `format` on `bookRecord`.<br>4. Render format badge on card cover.<br>5. Wire up format filter bar click listeners and filtering in `renderBooks()`. | R1 multi-format import, badges, and header filtering |
| `js/ui/settings-panel.js` | 1. Ensure `_bindControls()` and `syncUI()` reflect active state across all 10 theme buttons. | R4 theme drawer interaction |
| `js/reader/reader-engine.js` | 1. Expand `THEME_PALETTES` to 10 themes.<br>2. Ensure `applyTheme()` syncs all 10 palettes to iframe.<br>3. Update `destroy()` to blank out iframe and revoke URLs. | R4 iframe theme injection; R5 memory cleanup |
| `js/parser/asset-extractor.js` | 1. Verify `DOMSanitizer` is exported and used universally across all formats. | R1 security sanitization (`window.__xssTriggered = false`) |
| `js/app.js` | 1. In `openBook(id)`: dynamically dispatch to format-specific parser based on `bookRecord.format`.<br>2. In `closeBookToLibrary()`: ensure `readerEngine.destroy()` is called to revoke URLs and release memory. | R1 parser routing; R5 memory lifecycle |

---

## 7. Acceptance Criteria for Implementation & Verification

### Multi-Format Import & Unified Library (R1)
- [ ] File input `accept` attribute and drag-and-drop handler accept `.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, and `.md` files without rejecting valid extensions.
- [ ] Dragging or importing an invalid or unsupported file produces a non-blocking error toast without uncaught console errors or page crash.
- [ ] Every book card in `#library-grid` displays an accurate format badge (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) in the top-left of the cover.
- [ ] Library header contains format filter buttons (`All`, `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`); clicking any filter isolates cards of that format in-place.
- [ ] When a filter has 0 books, an empty state is rendered with a quick action to restore the filter to `All`.
- [ ] `WebReaderDB` isolates `fileBlob` into `book_files`; calling `StorageManager.getAllBooks()` does not load `ArrayBuffer` / `Blob` payloads for every book.
- [ ] Cascading deletion of a book removes its records from `books`, `book_files`, `reading_progress`, and `bookmarks` with 0 orphaned records left in raw IndexedDB stores.
- [ ] Any embedded or malicious script markup across `.md`, `.mobi`, `.txt`, `.pdf`, or `.epub` is sanitized by `DOMSanitizer`; `window.__xssTriggered` remains falsy in all tests.

### Expanded Reading Themes (R4)
- [ ] The Settings Drawer displays swatches for all 10 reading themes (`warm-paper`, `soft-dark`, `daylight`, `sage`, `solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`).
- [ ] Selecting each theme updates `document.documentElement.dataset.theme` and injects theme CSS variables into both host and reader iframe.
- [ ] All 10 themes compute a foreground/background contrast ratio exceeding 7.0:1 (WCAG AAA) for body text.
- [ ] Hard page refresh with any of the 10 themes restores the theme instantaneously via inline `<head>` script with zero FOUC.
- [ ] All existing automated tests (`test/e2e.test.js`, `test/challenger_storage.test.js`, `test/challenger_m2_r2_adversarial.js`) pass without regressions.
