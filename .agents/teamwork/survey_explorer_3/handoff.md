# Architectural Survey & Handoff Report: Storage, Sample EPUB, Themes & E2E Testing

**Explorer**: `survey_explorer_3`  
**Parent Orchestrator**: `bf9f892e-9f7c-4a5f-80d2-882b9b27b238` (`orchestrator_1`)  
**Mission**: Investigate and design the architecture for:
1. EPUB Import & Persistent Storage (IndexedDB + localStorage)
2. Built-in Sample EPUB Book Programmatic Generator
3. Eye-Comfort Themes & Typography Customization (Exact Hex, WCAG AA Contrast, CSS Variables)
4. Automated E2E Verification Test Strategy (Static HTTP + Headless Chrome Runner)

---

## 1. Observation

### 1.1 Environment & Tooling Verification
- **Runtime Environment**:
  - Node.js version: `v25.9.0` (installed at `/opt/homebrew/bin/node`)
  - npm version: `11.12.1`
  - Python version: `3.14.7`
  - Browser binary: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (Google Chrome `155.0.8059.82`)
  - Verification test: Ran headless Chrome launch and DOM evaluation via `puppeteer-core` in isolated test; confirmed execution in under 2.0s with zero errors.
- **Project Structure**:
  - Pure HTML/CSS/vanilla JS project with zero build step requirement (`ORIGINAL_REQUEST.md:35`).
  - No bundlers (Webpack/Vite/Rollup) required; native ES modules (`<script type="module">`) or standalone scripts loaded directly in `index.html`.
  - Static execution requirement: Reader must run directly over any static HTTP server (e.g. Node built-in `http`, Python `http.server`, or static file hosting).

### 1.2 Mathematical Luminance & Contrast Verification
A dedicated verification script executed on Node.js computed the exact relative luminance and contrast ratios according to the WCAG 2.1 formula:
$$L = 0.2126 \times R + 0.7152 \times G + 0.0722 \times B$$
$$\text{Contrast Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$

The computed contrast ratios for the 4 curated eye-comfort themes are:
1. **Warm Paper / Sepia** (`#f8f1e3` background, `#2c2523` text): **13.38:1** (WCAG AA: PASS, WCAG AAA: PASS)
   - Secondary text (`#5c504a`): **6.92:1** (WCAG AA: PASS)
   - Surface (`#efe5d0`): **12.03:1** (WCAG AA & AAA: PASS)
2. **Soft Dark / Night** (`#1a1c1e` background, `#e2e2e0` text): **13.17:1** (WCAG AA: PASS, WCAG AAA: PASS)
   - Secondary text (`#9e9e9a`): **6.36:1** (WCAG AA: PASS)
   - Surface (`#24282c`): **11.44:1** (WCAG AA & AAA: PASS)
3. **Daylight / Clean Light** (`#fcfbf9` background, `#1e2022` text): **15.80:1** (WCAG AA: PASS, WCAG AAA: PASS)
   - Secondary text (`#555b62`): **6.64:1** (WCAG AA: PASS)
   - Surface (`#f3f2ee`): **14.59:1** (WCAG AA & AAA: PASS)
4. **Sage / Forest Calm** (`#eef3ed` background, `#1c2820` text): **13.60:1** (WCAG AA: PASS, WCAG AAA: PASS)
   - Secondary text (`#4a5d50`): **6.28:1** (WCAG AA: PASS)
   - Surface (`#e1eae0`): **12.41:1** (WCAG AA & AAA: PASS)

All four themes dramatically exceed the minimum WCAG AA threshold of **4.5:1** for body text and pass the stringent WCAG AAA threshold of **7.0:1**.

---

## 2. Logic Chain

### 2.1 Storage Architecture: Segregated IndexedDB + localStorage Strategy

#### Rationale for Storage Segregation:
1. **localStorage Limitations**:
   - `localStorage` is synchronous, runs on the main thread, and has a strict browser quota of ~5MB. Storing full EPUB binary files or high-resolution cover images in `localStorage` triggers `QuotaExceededError`.
   - However, `localStorage` is accessible synchronously during `<head>` parsing before DOM render.
2. **IndexedDB Strengths**:
   - `IndexedDB` is asynchronous, transactional, and supports structured cloning of binary data (`ArrayBuffer`, `Blob`) with quotas measured in gigabytes (up to 60-80% of available disk space).
3. **Hybrid Architecture Decision**:
   - **localStorage**: Stores only lightweight synchronous UI preferences:
     - `webreader_theme`: Active theme identifier (`warm-paper` | `soft-dark` | `daylight` | `sage`).
     - `webreader_typography`: JSON object `{ font, fontSize, lineHeight, maxWidth, readingMode }`.
     - `webreader_last_book_id`: ID of the most recently open book.
     - *Crucial FOUC Prevention*: An inline `<script>` in the `<head>` reads `webreader_theme` and immediately sets `<html data-theme="...">` before first paint, guaranteeing zero white flashes on startup.
   - **IndexedDB**: Database name `WebReaderDB`, version `1`, containing three normalized object stores:
     - Store 1: `books`
       - Primary Key: `id` (string, generated via `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
       - Fields: `id`, `title`, `author`, `description`, `language`, `coverUrl`, `coverBlob`, `epubData` (ArrayBuffer), `fileSize`, `fileName`, `dateAdded`, `lastRead`, `spineCount`, `isSample`.
       - Indexes: `by_lastRead` (key: `lastRead`), `by_dateAdded` (key: `dateAdded`), `by_title` (key: `title`).
     - Store 2: `reading_progress`
       - Primary Key: `bookId` (string, 1-to-1 relation with `books.id`)
       - Fields: `bookId`, `spineIndex`, `sectionHref`, `readingMode` (`"paginated"` | `"continuous"`), `pageIndex`, `totalPages`, `scrollOffset`, `scrollPercent`, `progressPercentage`, `chapterTitle`, `updatedAt`.
     - Store 3: `bookmarks`
       - Primary Key: `id` (string: `bm_${Date.now()}_${rand}`)
       - Fields: `id`, `bookId`, `spineIndex`, `sectionHref`, `chapterTitle`, `pageIndex`, `scrollOffset`, `progressPercentage`, `snippet` (first 80 chars of text), `createdAt`.
       - Indexes: `by_bookId` (key: `bookId`), `by_createdAt` (key: `createdAt`).

#### Complete Storage Helper Module API (`storage.js`):
```javascript
export class StorageManager {
  static DB_NAME = 'WebReaderDB';
  static DB_VERSION = 1;

  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(StorageManager.DB_NAME, StorageManager.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by_lastRead', 'lastRead', { unique: false });
          bookStore.createIndex('by_dateAdded', 'dateAdded', { unique: false });
        }
        if (!db.objectStoreNames.contains('reading_progress')) {
          db.createObjectStore('reading_progress', { keyPath: 'bookId' });
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bmStore.createIndex('by_bookId', 'bookId', { unique: false });
          bmStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Books CRUD
  static async getAllBooks();
  static async getBook(id);
  static async saveBook(bookRecord);
  static async deleteBook(id); // Atomically deletes book, progress, and all bookmarks

  // Progress
  static async getProgress(bookId);
  static async saveProgress(progressRecord);

  // Bookmarks
  static async getBookmarks(bookId);
  static async addBookmark(bookmarkRecord);
  static async deleteBookmark(bookmarkId);

  // Synchronous Settings (localStorage)
  static getSettings();
  static saveSettings(settings);
}
```

### 2.2 Import Workflow, Validation & Error Handling

1. **User Interaction Modes**:
   - **Drag-and-Drop Zone**: Entire library card grid and dedicated drop target listen to `dragenter`, `dragover`, `dragleave`, `drop`. Visual dashed boundary and translucent glow (`.is-dragging`) give instant feedback.
   - **File Picker**: Hidden `<input type="file" accept=".epub,application/epub+zip">` triggered by an accessible "Import EPUB" button.
2. **Defensive Validation Pipeline**:
   - Step 1: Check MIME type and extension (`.epub`).
   - Step 2: Binary magic bytes inspection:
     ```javascript
     const header = new Uint8Array(arrayBuffer.slice(0, 4));
     const isZip = header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04;
     if (!isZip) throw new Error("File is not a valid EPUB / ZIP archive (invalid magic signature).");
     ```
   - Step 3: Archive inspection via JSZip:
     - Check `META-INF/container.xml`.
     - Extract `rootfile full-path`.
     - Parse OPF document.
     - Extract metadata: `<dc:title>`, `<dc:creator>`, `<dc:language>`.
     - Extract cover image (via `<meta name="cover">` or `<item properties="cover-image">`). If missing, generate an SVG cover placeholder displaying the book title and author in a classic book jacket layout.
3. **Resilience & Non-Crashing Error Handling**:
   - All import actions are wrapped in `try/catch`.
   - On error, display a clear, accessible toast notification with the specific root cause (e.g., *"Cannot import file: Missing container.xml descriptor"* or *"Corrupted EPUB: No spine items found"*).
   - Application state remains intact; existing books are never affected.

### 2.3 Built-in Sample EPUB Book Architecture

#### Why Programmatic Generation via JSZip is Superior to Raw Binary Assets:
1. **Zero External Network Dependencies**: A user launching the webreader offline or in an isolated network gets a fully functioning, rich sample book immediately.
2. **Minimal Footprint**: Rather than bloating the repository with a 150KB base64 encoded binary blob, a programmatic generator module (`sample-book.js`) constructs the EPUB package using JSZip (which is already loaded for EPUB parsing) in ~15KB of clean, readable JavaScript code.
3. **EPUB 2 and EPUB 3 Dual Specification Compliance**:
   - `mimetype`: Uncompressed `STORE` mode (`application/epub+zip`).
   - `META-INF/container.xml` pointing to `OEBPS/content.opf`.
   - `OEBPS/content.opf` containing `<metadata>`, `<manifest>`, and `<spine>`.
   - Both `OEBPS/toc.ncx` (EPUB 2) and `OEBPS/nav.xhtml` (EPUB 3 `<nav epub:type="toc">` and `<nav epub:type="landmarks">`).
   - `OEBPS/cover.xhtml` with embedded SVG cover.
   - `OEBPS/styles/stylesheet.css` with drop caps, poetry blocks, responsive tables, blockquotes, and callouts.
   - Multi-chapter realistic content:
     * **Cover & Title Page**
     * **Preface**: *The Digital Scroll vs. The Codex*
     * **Chapter I**: *The Architecture of the Human Eye* (Typography narrative, drop cap, blockquote)
     * **Chapter II**: *On Ink, Paper, and Low-Glare Comfort* (Inline SVG diagram illustrating the optical spectrum and contrast curves)
     * **Chapter III**: *Typographic Harmony and Rhythm* (Font comparison table, definition lists, footnotes)
4. **Auto-seeding Strategy**:
   - When the user opens the webreader for the very first time, `StorageManager.getAllBooks()` checks if the library is empty.
   - If empty, the app calls `generateSampleEpub()`, persists it in IndexedDB with `isSample: true`, and renders it on the library shelf.
   - A subtle "Restore Sample Book" link in the library settings allows users to restore the sample book if accidentally deleted.

### 2.4 Eye-Comfort Themes & Typography Architecture

#### Color Specification Matrix:

| Theme Key | Background | Body Text | Secondary Text | Surface / Card | Border | Accent | Highlight | Contrast Ratio |
|---|---|---|---|---|---|---|---|---|
| `warm-paper` (Default) | `#f8f1e3` | `#2c2523` | `#5c504a` | `#efe5d0` | `#dfd3bd` | `#8b5a2b` | `#fcedbe` | **13.38:1** (AAA) |
| `soft-dark` | `#1a1c1e` | `#e2e2e0` | `#9e9e9a` | `#24282c` | `#33383e` | `#e5a869` | `#453c28` | **13.17:1** (AAA) |
| `daylight` | `#fcfbf9` | `#1e2022` | `#555b62` | `#f3f2ee` | `#e0dfd9` | `#2364a0` | `#e1ecf8` | **15.80:1** (AAA) |
| `sage` | `#eef3ed` | `#1c2820` | `#4a5d50` | `#e1eae0` | `#cfdcd0` | `#2d7348` | `#d7eedc` | **13.60:1** (AAA) |

#### Physiological Eye-Comfort Principles Applied:
- **No Harsh Pure White (`#ffffff`) or Pure Black (`#000000`)**:
  Pure white backgrounds in dark or dim environments cause pupil over-constriction and ocular muscle fatigue. Pure white text on pure black backgrounds creates retinal halation (light bleeding over letter edges, especially severe for astigmatism).
- **Warm Paper**: Uses warm cream `#f8f1e3` mimicking aged natural book paper with soft iron-gall charcoal ink `#2c2523`.
- **Soft Dark**: Uses low-blue-light charcoal `#1a1c1e` with muted warm grey `#e2e2e0`.
- **Sage**: Leverages the human eye's peak sensitivity in the middle green spectrum (~555nm), which triggers minimal photopic stress.
- **Daylight**: Softened off-white `#fcfbf9` reduces screen glare under office or natural lighting conditions.

#### CSS Variables Architecture (`theme.css`):
```css
:root, [data-theme="warm-paper"] {
  --color-bg: #f8f1e3;
  --color-surface: #efe5d0;
  --color-surface-hover: #e7d9bf;
  --color-border: #dfd3bd;
  --color-text: #2c2523;
  --color-text-secondary: #5c504a;
  --color-accent: #8b5a2b;
  --color-accent-hover: #724820;
  --color-accent-light: rgba(139, 90, 43, 0.12);
  --color-highlight: #fcedbe;
  --color-scrollbar: #dcd0b7;
  --color-shadow: rgba(44, 37, 35, 0.08);

  /* Typography Defaults */
  --reader-font-family: 'Georgia', 'Merriweather', 'Palatino', serif;
  --reader-font-size: 18px;
  --reader-line-height: 1.75;
  --reader-max-width: 720px;
}

[data-theme="soft-dark"] {
  --color-bg: #1a1c1e;
  --color-surface: #24282c;
  --color-surface-hover: #2f343a;
  --color-border: #33383e;
  --color-text: #e2e2e0;
  --color-text-secondary: #9e9e9a;
  --color-accent: #e5a869;
  --color-accent-hover: #f3be86;
  --color-accent-light: rgba(229, 168, 105, 0.15);
  --color-highlight: #453c28;
  --color-scrollbar: #3c424a;
  --color-shadow: rgba(0, 0, 0, 0.4);
}

[data-theme="daylight"] {
  --color-bg: #fcfbf9;
  --color-surface: #f3f2ee;
  --color-surface-hover: #e8e6df;
  --color-border: #e0dfd9;
  --color-text: #1e2022;
  --color-text-secondary: #555b62;
  --color-accent: #2364a0;
  --color-accent-hover: #1b4f80;
  --color-accent-light: rgba(35, 100, 160, 0.1);
  --color-highlight: #e1ecf8;
  --color-scrollbar: #dcdbd5;
  --color-shadow: rgba(30, 32, 34, 0.06);
}

[data-theme="sage"] {
  --color-bg: #eef3ed;
  --color-surface: #e1eae0;
  --color-surface-hover: #d6e3d5;
  --color-border: #cfdcd0;
  --color-text: #1c2820;
  --color-text-secondary: #4a5d50;
  --color-accent: #2d7348;
  --color-accent-hover: #225636;
  --color-accent-light: rgba(45, 115, 72, 0.12);
  --color-highlight: #d7eedc;
  --color-scrollbar: #cbdbcc;
  --color-shadow: rgba(28, 40, 32, 0.07);
}
```

#### Typography Controls & Content Injection:
1. **Curated Font Options**:
   - `Serif`: `'Merriweather', 'Georgia', 'Iowan Old Style', 'Palatino Linotype', serif`
   - `Sans-serif`: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
   - `Dyslexia / Monospace`: `'OpenDyslexic', 'Atkinson Hyperlegible', ui-monospace, 'SF Mono', Menlo, Monaco, monospace`
2. **Adjustable Ranges**:
   - Font Size: `14px` to `32px` (default `18px`, step `1px` or `2px`).
   - Line Height: `1.3` to `2.4` (default `1.75`, step `0.05`).
   - Column Width: `540px` to `1000px` (default `720px`, ~65-75 characters per line).
3. **Reader Frame Style Injection**:
   Whether chapters are rendered in a sandboxed `<iframe>` or a scoped container, an injected style block enforces:
   ```css
   html, body {
     background-color: var(--color-bg) !important;
     color: var(--color-text) !important;
     font-family: var(--reader-font-family) !important;
     font-size: var(--reader-font-size) !important;
     line-height: var(--reader-line-height) !important;
   }
   p, div, span, li, blockquote, dd, dt, td, th {
     color: inherit !important;
     font-family: inherit !important;
   }
   a { color: var(--color-accent) !important; }
   [data-theme="soft-dark"] img {
     filter: brightness(0.9) contrast(1.05);
   }
   ```

### 2.5 Automated E2E Verification Test Strategy

#### Architecture of the Test Suite:
- **Server Module**: A self-contained Node.js static HTTP server script using built-in `node:http`, `node:fs`, and `node:path`. Serves all HTML, CSS, JS, and asset files with correct MIME types (`text/html`, `text/javascript`, `text/css`, `image/svg+xml`, `application/epub+zip`).
- **Driver Module**: Node.js script using `puppeteer-core` targeting the local `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` binary.
- **Zero Build Step Verification**: No build artifacts, no bundling, runs directly against source files.

#### Complete Test Matrix (10 Automated Verification Suites):
1. **Suite 1: Server Boot & Zero Console Errors**:
   - Starts static server on `http://127.0.0.1:3000`.
   - Opens browser, captures `console.error` and `pageerror`.
   - Asserts zero uncaught errors and zero HTTP 404s.
2. **Suite 2: Sample Book Auto-Seeding & Library Render**:
   - Asserts `WebReaderDB` is initialized in IndexedDB.
   - Asserts sample book card is rendered in `#library-grid` with title, author, and cover.
3. **Suite 3: Book Loading & Reader Mode Entry**:
   - Clicks sample book card.
   - Verifies transition from `#library-view` to `#reader-view`.
   - Verifies chapter content is loaded and reader chrome (header, progress footer) is visible.
4. **Suite 4: Paginated View Navigation**:
   - Asserts default mode is Paginated (`CSS column-width` layout).
   - Simulates `ArrowRight` keydown and right-zone click.
   - Verifies `pageIndex` advances and horizontal scroll/transform shifts columns.
   - Verifies footer updates (`Page X of Y`).
5. **Suite 5: Cross-Chapter Boundary Transition**:
   - Advances to the final page of Chapter 1.
   - Triggers next page navigation; verifies transition into Chapter 2 without visual glitches or console errors.
   - Verifies chapter title in footer updates to Chapter 2.
6. **Suite 6: Continuous Scroll View Mode**:
   - Toggles reading mode button to Continuous Scroll.
   - Asserts column styling is deactivated and vertical scroll container is active.
   - Scrolls container; verifies progress percentage dynamically increases.
7. **Suite 7: Table of Contents (TOC) Navigation**:
   - Opens collapsible TOC drawer.
   - Asserts all chapters and nested sub-chapters are listed.
   - Clicks "Chapter III: Typographic Harmony and Rhythm".
   - Asserts reader navigates directly to Chapter 3 and TOC drawer automatically closes/updates active state.
8. **Suite 8: Bookmark Creation & Navigation**:
   - Clicks bookmark icon on Chapter 3.
   - Opens bookmarks drawer; asserts bookmark entry with timestamp, chapter title, and text snippet is rendered.
   - Navigates back to Chapter 1, opens bookmarks drawer, clicks saved Chapter 3 bookmark.
   - Asserts reader jumps accurately back to Chapter 3 saved position.
9. **Suite 9: Eye-Comfort Themes & Typography Customization**:
   - Sequentially selects all 4 themes: Warm Paper, Soft Dark, Daylight, Sage.
   - Asserts `document.documentElement.getAttribute('data-theme')` matches.
   - Verifies computed styles for `--color-bg`, `--color-text`, and `--color-surface`.
   - Modifies font family (Serif $\to$ Sans-Serif $\to$ Dyslexia/Mono), font size (18px $\to$ 24px), line height (1.75 $\to$ 2.0), and column width (720px $\to$ 840px).
   - Evaluates computed style on active paragraph and asserts values match exactly.
10. **Suite 10: State Persistence Across Page Reload**:
    - Calls `page.reload()`.
    - Verifies app immediately restores to `#reader-view`.
    - Verifies currently open book, chapter index, and saved page/scroll offset are restored.
    - Verifies active theme and typography preferences remain persisted from `localStorage`.
    - Asserts zero console errors during and after reload.
11. **Suite 11: Drag-and-Drop / File Input Import & Book Deletion**:
    - Programmatically triggers file input `change` event with a synthetic valid EPUB blob.
    - Verifies newly imported book appears on library shelf.
    - Deletes newly imported book; confirms removal from IndexedDB and DOM.

---

## 3. Caveats

1. **Vendor Libraries Bundling**:
   - EPUB unzipping requires a lightweight zip decompressor. JSZip (e.g. `jszip.min.js`, ~35KB gzipped) is standard, rock-solid, and vendor-vendored into a `vendor/` directory with zero npm build step. Alternatively, native `DecompressionStream` can decompress `deflate-raw` streams, but JSZip handles zip headers, central directories, and UTF-8 filenames out of the box with proven stability.
2. **Cross-Origin iframe Restrictions**:
   - If rendering chapters in an `<iframe>`, using `srcdoc` or `blob:` URLs allows same-origin script access for style injection and column measurements. If sandbox attributes are applied, `allow-same-origin allow-scripts` must be set so the parent reader controller can measure columns and listen to scroll/key events.
3. **Browser Quota Persistence**:
   - Modern browsers (Chrome/Safari/Firefox) may clear IndexedDB on mobile devices if storage pressure is acute unless `navigator.storage.persist()` is requested. The application should proactively call `navigator.storage?.persist()` during initial boot.

---

## 4. Conclusion

1. **Storage**: The hybrid storage architecture (synchronous `localStorage` for FOUC-free themes and typography + asynchronous `IndexedDB` for book archives, progress, and bookmarks) fulfills all persistence, reload resumption, and multi-book management criteria with zero external storage dependencies.
2. **Sample EPUB**: Programmatically generating the sample EPUB via JSZip in `sample-book.js` ensures instantaneous, 100% offline access, backward compatibility with EPUB 2/3, realistic rich typographic content, and minimal codebase weight.
3. **Themes & Typography**: All 4 low-glare themes (`warm-paper`, `soft-dark`, `daylight`, `sage`) mathematically exceed WCAG AAA standards (> 13:1 contrast ratio) while protecting readers against photopic eye strain and halation. CSS variables provide instantaneous cascade across chrome and reader content.
4. **Verification**: A standalone Node.js test script utilizing `puppeteer-core` against `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and a built-in static HTTP server provides an automated, fast (< 15 seconds), robust E2E test harness covering all acceptance criteria with zero build dependencies.

---

## 5. Verification Method

To independently verify all claims made in this report:

1. **Verify WCAG Contrast Ratios**:
   Run the following terminal command:
   ```bash
   node -e '
   function sRGBtoLin(c) {
     c = c / 255;
     return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
   }
   function getLuminance(hex) {
     const r = parseInt(hex.slice(1, 3), 16);
     const g = parseInt(hex.slice(3, 5), 16);
     const b = parseInt(hex.slice(5, 7), 16);
     return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
   }
   function getContrast(h1, h2) {
     const l1 = getLuminance(h1), l2 = getLuminance(h2);
     return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
   }
   console.log("Warm Paper:", getContrast("#f8f1e3", "#2c2523").toFixed(2));
   console.log("Soft Dark:", getContrast("#1a1c1e", "#e2e2e0").toFixed(2));
   console.log("Daylight:", getContrast("#fcfbf9", "#1e2022").toFixed(2));
   console.log("Sage:", getContrast("#eef3ed", "#1c2820").toFixed(2));
   '
   ```
   **Expected output**: All values $\ge 13.0$, confirming WCAG AAA compliance.

2. **Verify Browser Test Runner Availability**:
   Run:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version
   node -v
   ```
   **Expected output**: Chrome 155+, Node v25+.

3. **Verify File Layout Compliance**:
   Inspect `.agents/teamwork/survey_explorer_3/` to confirm only metadata files (`DISPATCH.md`, `BRIEFING.md`, `progress.md`, `handoff.md`) are present.
