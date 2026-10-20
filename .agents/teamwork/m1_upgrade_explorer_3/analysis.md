# Milestone 1 Comprehensive Synthesis & Worker Implementation Blueprint

**Milestone**: Milestone 1 — Multi-Format Library, Format Badges & Storage V2  
**Author**: Explorer 3 (`m1_upgrade_explorer_3`)  
**Date**: 2026-10-17T18:52:30Z  
**Status**: COMPLETE — Ready for Worker Implementation & Challenger Verification  

---

## 1. Executive Summary & Synthesis

The objective of Milestone 1 is to upgrade WebReader's persistence layer to Storage V2 (segregating lightweight book metadata from heavyweight binary payloads in IndexedDB), introduce multi-format acceptance (`.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, `.md`) with distinct format badges and header filter controls in the Library View, and establish a universal, modular `DOMSanitizer` capable of neutralizing untrusted markup across all current and future parsers.

### Empirical Baseline Verification
All three pre-existing test suites were executed on the working tree:
1. `node test/e2e.test.js`: **21/21 passed** (Tiers 0–4: static server, browser launch, library boot, paginated & continuous reading, TOC navigation, bookmarks, themes, typography, error toasts, and reload persistence).
2. `node test/challenger_storage.test.js`: **22/22 passed** (Suites 1–4: theme switching & smooth transitions, 100 concurrent book writes, 120 mixed operations, 50-writer single record contention, binary blob storage concurrency, atomic cascade delete across multiple books, EventBus stress & error isolation).
3. `node test/challenger_m2_r2_adversarial.js`: **4/4 passed** (hostile XHTML sanitization, form submission neutralization, unescaped ampersand & 10-level deep TOC resilience, and 65-asset Blob URL cleanup).

**Synthesis of Peer Explorer Scope**:
- `m1_upgrade_explorer_1`: StorageManager & IndexedDB Schema V2 (`js/storage/db.js`, `js/storage/storage-manager.js`).
- `m1_upgrade_explorer_2`: Multi-format file input, drag-and-drop, format badges & filter tabs (`index.html`, `css/main.css`, `js/ui/library-view.js`).
- `m1_upgrade_explorer_3` (This Blueprint): Universal `DOMSanitizer` verification & export, Storage V2 regression analysis, file touch boundaries synthesis, step-by-step worker plan, and Reviewer/Challenger test matrix.

---

## 2. Universal DOMSanitizer Verification & Export

### 2.1 Current Implementation Audit (`js/parser/asset-extractor.js`)
Currently, `DOMSanitizer` is exported from `js/parser/asset-extractor.js` as an ES6 class with a single static method `sanitize(root)`.

```javascript
export class DOMSanitizer {
  static sanitize(root) {
    if (!root) return root;
    // 1. Remove <script> tags
    // 2. Remove dangerous elements (meta refresh, object, embed, applet, base, iframe, frame, frameset)
    // 3. Neutralize <form> and controls
    // 4. Strip on* handlers and dangerous URI schemes (javascript:, vbscript:, data:text/html, etc.)
    return root;
  }
}
```

### 2.2 Vulnerability & Vector Audit Matrix
| Vector Category | Target Elements / Attributes | Audit Status | Sanitizer Defense Mechanism |
|---|---|---|---|
| **Script Execution** | `<script>` (inline, src, type="module", CDATA, SVG/MathML `<script>`) | **Neutralized** | `root.querySelectorAll('script').forEach(el => el.remove())` |
| **Active Embedding** | `<object>`, `<embed>`, `<applet>`, `<base>` | **Neutralized** | Stripped from DOM |
| **Framing & Phishing** | `<iframe>`, `<frame>`, `<frameset>`, `<meta http-equiv="refresh">` | **Neutralized** | Stripped completely from DOM |
| **Inline Event Handlers** | `onload`, `onerror`, `onclick`, `ONCLICK`, `onfocus`, `onmouseover`, etc. | **Neutralized** | Inspects all element attributes; any attribute whose name in lowercase begins with `on` is stripped via `removeAttribute()` |
| **Dangerous Schemes** | `javascript:`, `vbscript:`, `data:text/html`, `data:application/xhtml+xml` on `href`, `src`, `xlink:href`, `action`, `poster` | **Neutralized** | Strips ASCII control characters `[\u0000-\u001F\s]`, lowercases value, removes attribute if matching executable schemes |
| **Form Hijacking** | `<form>`, `<button formaction>`, `<input formaction>` | **Neutralized** | Strips `action`, `method`, `target`, `formaction`, `formmethod`, `formtarget` |
| **Non-Descendant Root Element (Bug Found)** | When `root` is an `Element` (e.g. `<a href="javascript:alert(1)">`) rather than `Document` | **CRITICAL FIX NEEDED** | `querySelectorAll('*')` only queries *descendants* of `root`. If `root` itself is an `Element` with dangerous tags or attributes, `root` was skipped. |
| **HTML String Input** | Markdown parser and plain text parser return HTML strings | **FEATURE NEEDED** | `DOMSanitizer.sanitizeHtml(htmlString)` must be added for zero-ceremony string sanitization. |

### 2.3 Required Hardening for `DOMSanitizer`
The upcoming Worker must update `DOMSanitizer` in `js/parser/asset-extractor.js`:

```javascript
/**
 * DOM Sanitizer (Security Defense Layer 1)
 * Universal sanitizer for Document, Element, DocumentFragment, and HTML strings.
 */
export class DOMSanitizer {
  /**
   * Sanitizes an HTML string and returns safe sanitized HTML markup.
   * @param {string} htmlString
   * @returns {string}
   */
  static sanitizeHtml(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    DOMSanitizer.sanitize(doc.body);
    return doc.body.innerHTML;
  }

  /**
   * Recursively sanitizes a DOM Document, Element, or DocumentFragment in-place.
   * Strips scripts, inline event handlers (on*), meta refresh, dangerous URIs, and dangerous embeds.
   * @param {Document|Element|DocumentFragment} root
   * @returns {Document|Element|DocumentFragment}
   */
  static sanitize(root) {
    if (!root) return root;

    // A. Check if root itself is a dangerous element
    if (root.nodeType === 1) { // Node.ELEMENT_NODE
      const tag = root.tagName.toLowerCase();
      if (
        tag === 'script' ||
        ['object', 'embed', 'applet', 'base', 'iframe', 'frame', 'frameset'].includes(tag)
      ) {
        root.remove();
        return root;
      }
    }

    // 1. Remove all <script> elements
    const scripts = root.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      scripts[i].remove();
    }

    // 2. Remove dangerous elements (meta refresh, object, embed, applet, base, iframe, frame, frameset)
    const dangerousTags = root.querySelectorAll('meta[http-equiv="refresh" i], object, embed, applet, base, iframe, frame, frameset');
    for (let i = 0; i < dangerousTags.length; i++) {
      dangerousTags[i].remove();
    }

    // 3. Neutralize <form> elements and form submission controls
    const forms = root.querySelectorAll('form');
    for (let i = 0; i < forms.length; i++) {
      forms[i].removeAttribute('action');
      forms[i].removeAttribute('method');
      forms[i].removeAttribute('target');
    }
    if (root.nodeType === 1 && root.tagName.toLowerCase() === 'form') {
      root.removeAttribute('action');
      root.removeAttribute('method');
      root.removeAttribute('target');
    }

    const formControls = root.querySelectorAll('button[formaction], input[formaction]');
    for (let i = 0; i < formControls.length; i++) {
      formControls[i].removeAttribute('formaction');
      formControls[i].removeAttribute('formmethod');
      formControls[i].removeAttribute('formtarget');
    }
    if (root.nodeType === 1 && (root.tagName.toLowerCase() === 'button' || root.tagName.toLowerCase() === 'input')) {
      root.removeAttribute('formaction');
      root.removeAttribute('formmethod');
      root.removeAttribute('formtarget');
    }

    // 4. Strip inline event handlers (on*) and dangerous URI schemes across all elements AND root
    const dangerousAttrs = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster'];
    const allElements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
    if (root.nodeType === 1) {
      allElements.unshift(root);
    }

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (!el.attributes) continue;
      const attrs = Array.from(el.attributes);

      for (let j = 0; j < attrs.length; j++) {
        const attr = attrs[j];
        const name = attr.name.toLowerCase();

        // Strip inline on* event listeners
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }

        // Check executable/dangerous URI schemes on relevant attributes
        if (dangerousAttrs.includes(name) || name.endsWith(':href')) {
          const val = attr.value || '';
          // Strip ASCII control characters and whitespace for inspection
          const sanitizedVal = val.replace(/[\u0000-\u001F\s]/g, '').toLowerCase();

          if (
            sanitizedVal.startsWith('javascript:') ||
            sanitizedVal.startsWith('vbscript:') ||
            sanitizedVal.startsWith('data:text/html') ||
            sanitizedVal.startsWith('data:application/xhtml+xml')
          ) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }

    return root;
  }
}
```

---

## 3. Storage V2 Regression Analysis & Backward Compatibility

### 3.1 Two-Tier Schema Architecture
In Storage V1, `WebReaderDB` stored book records directly in `books` with `fileBlob`.
In Storage V2:
- `DB_VERSION = 2`.
- Store `books`: Contains **only** lightweight metadata (`id`, `title`, `author`, `format`, `coverBlob`, `description`, `language`, `fileSize`, `spineCount`, `dateAdded`, `lastRead`, `isSample`). `fileBlob` is strictly prohibited from `books`.
- Store `book_files`: Keyed by `{ id }`, contains `{ id, fileBlob }`.
- Store `reading_progress`: Keyed by `{ bookId }` (unchanged).
- Store `bookmarks`: Keyed by `{ id }`, index `by_bookId` (unchanged).

### 3.2 Backward Compatibility & Auto-Migration (`onupgradeneeded`)
When existing databases upgraded from V1 to V2:
1. Object store `book_files` is created:
   ```javascript
   if (!db.objectStoreNames.contains('book_files')) {
     db.createObjectStore('book_files', { keyPath: 'id' });
   }
   ```
2. In `event.oldVersion < 2`, migrate existing records in `books`:
   ```javascript
   if (event.oldVersion < 2 && event.oldVersion > 0) {
     const bookStore = event.target.transaction.objectStore('books');
     const fileStore = event.target.transaction.objectStore('book_files');
     const cursorReq = bookStore.openCursor();
     cursorReq.onsuccess = (e) => {
       const cursor = e.target.result;
       if (cursor) {
         const record = cursor.value;
         if (record.fileBlob) {
           fileStore.put({ id: record.id, fileBlob: record.fileBlob });
           delete record.fileBlob;
           if (!record.format) record.format = 'epub';
           cursor.update(record);
         }
         cursor.continue();
       }
     };
   }
   ```
3. If a record in `books` is missing `format`, default to `'epub'`.

### 3.3 Zero-Binary Contract in `getAllBooks()`
In `WebReaderDB.getAllBooks()`:
```javascript
static async getAllBooks() {
  const db = await this.openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('books', 'readonly');
    const store = tx.objectStore('books');
    const index = store.index('by_lastRead');
    const request = index.getAll();

    request.onsuccess = () => {
      const books = request.result || [];
      books.reverse(); // Descending by lastRead
      // Ensure zero binary payload is present and format is canonicalized
      const metadataOnly = books.map(b => {
        const { fileBlob, ...meta } = b;
        return {
          format: meta.format || 'epub',
          ...meta
        };
      });
      resolve(metadataOnly);
    };
    request.onerror = () => reject(request.error);
  });
}
```

### 3.4 Joined Retrieval Contract in `getBook(id)`
When a book is opened by ID, `getBook(id)` fetches metadata from `books` and binary payload from `book_files` within a single readonly transaction:
```javascript
static async getBook(id) {
  if (!id) return null;
  const db = await this.openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['books', 'book_files'], 'readonly');
    const bookStore = tx.objectStore('books');
    const fileStore = tx.objectStore('book_files');

    let meta = null;
    let fileData = null;

    const bookReq = bookStore.get(id);
    bookReq.onsuccess = () => { meta = bookReq.result || null; };

    const fileReq = fileStore.get(id);
    fileReq.onsuccess = () => { fileData = fileReq.result || null; };

    tx.oncomplete = () => {
      if (!meta) {
        resolve(null);
        return;
      }
      resolve({
        ...meta,
        format: meta.format || 'epub',
        fileBlob: (fileData && fileData.fileBlob) ? fileData.fileBlob : (meta.fileBlob || null)
      });
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
```

### 3.5 Atomic Cascade Delete Contract (`deleteBook(id)`)
Atomically deletes from `books`, `book_files`, `reading_progress`, and `bookmarks` in one single readwrite transaction:
```javascript
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

    // 4. Delete all bookmarks via index cursor
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
```

### 3.6 Preserving Test Invariants in `saveBook(bookRecord)`
In existing test `test/challenger_storage.test.js`:
- Test 2.1 calls `saveBook` with `{ id, title, author, fileBlob }`.
- Test 2.2 calls `saveBook` with `{ id, title, author }` (updating metadata without re-specifying `fileBlob`).
- If `bookRecord.fileBlob` is provided: put `{ id, fileBlob }` into `book_files`.
- If `bookRecord.fileBlob` is NOT provided (undefined): do NOT delete or overwrite `book_files`! The existing binary payload remains safe in `book_files`.
- In `books`: always put `metaRecord` (excluding `fileBlob`).
This ensures 100% compatibility with all existing tests!

---

## 4. File Touch Boundaries & Specifications for Worker

### Touch Boundary 1: `index.html`
- **File Input `accept`**:
  ```html
  <input type="file" id="file-input" accept=".epub,.pdf,.mobi,.azw,.txt,.md,application/epub+zip,application/pdf,application/x-mobipocket-ebook,text/plain,text/markdown" multiple class="sr-only" aria-label="Import ebook or document">
  ```
- **Drop Zone Copy**:
  Update drop zone text to mention `.epub`, `.pdf`, `.mobi`, `.txt`, `.md`.
- **Shelf Header Format Filter Bar**:
  Insert `<div class="format-filter-bar" id="format-filter-bar" role="tablist" aria-label="Filter library by format">` with buttons: `All`, `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`.
- **Sample Book Card**:
  Add `<span class="book-format-badge format-badge-epub">EPUB</span>` inside `.book-cover-wrapper`.

### Touch Boundary 2: `css/main.css`
- **`.book-format-badge`**:
  Absolute positioned at `top: 0.5rem; left: 0.5rem; z-index: 2;`.
  Styling classes:
  - `.format-badge-epub`: accent border and surface bg.
  - `.format-badge-pdf`: `#d32f2f` red badge with white text.
  - `.format-badge-mobi`: `#0288d1` blue badge with white text.
  - `.format-badge-txt`: `#546e7a` slate badge with white text.
  - `.format-badge-md`: `#7b1fa2` purple badge with white text.
- **`.format-filter-bar` and `.format-filter-btn`**:
  Clean flex container with active state styles (`background-color: var(--color-accent); color: var(--color-accent-text);`).
- **`.library-empty-filter`**:
  Friendly message when a selected filter has 0 books.

### Touch Boundary 3: `js/storage/db.js`
- Bump `static DB_VERSION = 2;`
- Add `book_files` store and migration in `onupgradeneeded`.
- Refactor `getAllBooks()` to return metadata only without `fileBlob`.
- Refactor `getBook(id)` to join `books` and `book_files`.
- Refactor `saveBook(bookRecord)` to save metadata to `books` and binary to `book_files`.
- Refactor `deleteBook(id)` to cascade across `books`, `book_files`, `reading_progress`, and `bookmarks`.

### Touch Boundary 4: `js/storage/storage-manager.js`
- Re-export `WebReaderDB` methods.
- Add `getAllBooksMetadata()` as alias to `getAllBooks()` per contract.

### Touch Boundary 5: `js/ui/library-view.js`
- **Multi-Format Import**:
  - Support case-insensitive extensions: `.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, `.md`.
  - Format detection helper `detectFormat(file)`:
    - Checks file extension and magic bytes (EPUB: `PK\x03\x04`, PDF: `%PDF`, MOBI: PalmDOC / `BOOKMOBI`, TXT/MD: text).
  - For `.epub`: Parse via `EpubParser.parse(file)`.
  - For other formats: Extract clean title from filename, set format canonical code (`pdf`, `mobi`, `txt`, `md`), set appropriate MIME type, save record via `StorageManager.saveBook(bookRecord)`.
- **Card Rendering**:
  - Add format badge `.book-format-badge` with appropriate format class.
  - Set `data-format="${format}"` on `article.book-card`.
- **Filter Controller**:
  - Listen to clicks on `.format-filter-btn`.
  - Filter visible cards by `data-format` or show all when `all` is active.
  - Display `.library-empty-filter` when 0 books match active filter.

### Touch Boundary 6: `js/parser/asset-extractor.js`
- Add `DOMSanitizer.sanitizeHtml(htmlString)`.
- Harden `DOMSanitizer.sanitize(root)` to sanitize `root` itself when `root.nodeType === 1`.
- Ensure clean export of `DOMSanitizer`.

---

## 5. Step-by-Step Implementation Sequence for Worker

```
[Step 1: Security Layer Hardening]
  Update `js/parser/asset-extractor.js`:
  - Harden DOMSanitizer to inspect root element itself.
  - Implement DOMSanitizer.sanitizeHtml(htmlString).
  - Verify node test/challenger_m2_r2_adversarial.js passes.

[Step 2: Storage V2 Upgrade]
  Update `js/storage/db.js` & `js/storage/storage-manager.js`:
  - Bump DB_VERSION to 2.
  - Add `book_files` store and migration cursor in `onupgradeneeded`.
  - Update `getAllBooks()`, `getBook()`, `saveBook()`, `deleteBook()`.
  - Add `getAllBooksMetadata()` alias in `StorageManager`.
  - Verify node test/challenger_storage.test.js passes.

[Step 3: HTML & CSS UI Enhancements]
  Update `index.html`:
  - Update `accept` attribute on `#file-input`.
  - Update drop-zone text copy.
  - Insert `#format-filter-bar` tabs.
  Update `css/main.css`:
  - Add format badge styles (.format-badge-epub, .format-badge-pdf, etc.).
  - Add filter bar styles (.format-filter-bar, .format-filter-btn, .is-active).
  - Add .library-empty-filter empty state styles.

[Step 4: Library View Controller Multi-Format Upgrade]
  Update `js/ui/library-view.js`:
  - Update importFiles() to accept .epub, .pdf, .mobi, .azw, .txt, .md.
  - Add format badge to _createBookCard().
  - Add filter tabs click handling and setFormatFilter() filtering logic.

[Step 5: Regression & Verification Run]
  - Run `node test/e2e.test.js`.
  - Run `node test/challenger_storage.test.js`.
  - Run `node test/challenger_m2_r2_adversarial.js`.
  - All must pass with zero failures.
```

---

## 6. Reviewer & Challenger Test Assertions Matrix

| Verification Target | Test Strategy & Assertion | Invalidation Condition |
|---|---|---|
| **Storage V2 Binary Separation** | Inspect records returned by `StorageManager.getAllBooks()`: `record.fileBlob === undefined` for 100% of books | Any book returned by `getAllBooks()` has a defined `fileBlob` |
| **Storage V2 On-Demand Fetch** | Call `StorageManager.getBook(id)`: returned book record has valid `fileBlob` with `fileBlob instanceof Blob` and matching size | `getBook(id)` returns null `fileBlob` or fails to retrieve binary |
| **Storage V2 V1->V2 Migration** | Seed V1 database with book containing `fileBlob` in `books`. Open DB at V2. Verify `fileBlob` moved to `book_files` and removed from `books` | Data loss or un-migrated binary payload |
| **Atomic 4-Store Cascade Delete** | Save book with binary, progress, and 10 bookmarks. Call `deleteBook(id)`. Scan raw IDB stores `books`, `book_files`, `reading_progress`, and `bookmarks` | Any leftover record in any of the 4 stores (orphan detected) |
| **Multi-Format Input Acceptance** | Import `.pdf`, `.mobi`, `.txt`, `.md` files via file input / drop-zone. Verify all are added to library grid with correct format badge | File rejected with error toast or ignored |
| **Format Badges on Cards** | Every card in `#library-grid` has a `.book-format-badge` displaying `EPUB`, `PDF`, `MOBI`, `TXT`, or `MD` | Missing badge, improper styling, or incorrect format label |
| **Header Format Filter Tabs** | Click `PDF` tab in `#format-filter-bar`: only PDF cards visible. Click `All`: all cards visible. Click empty filter: displays empty state | Non-PDF cards displayed when filtered to PDF, or empty state broken |
| **DOMSanitizer Element Root Defense** | `DOMSanitizer.sanitize(document.createElement('a'))` with `href="javascript:alert(1)"` and `onclick="alert(1)"` removes both attributes | Dangerous attributes remain on root element |
| **DOMSanitizer String Sanitization** | `DOMSanitizer.sanitizeHtml('<p onclick="evil()">Hello<script>alert(1)</script></p>')` returns `<p>Hello</p>` | Script executes or un-sanitized attribute remains |
| **Full Regression Suite** | `node test/e2e.test.js`, `node test/challenger_storage.test.js`, `node test/challenger_m2_r2_adversarial.js` | Any test failure or console error |

---

## 7. Conclusion & Next Actions

Milestone 1 design is fully solidified. The architecture provides:
1. Zero-binary memory efficiency during shelf listing.
2. Full backward compatibility and auto-migration for existing databases.
3. Multi-format ingestion and visual organization (badges & filter bar).
4. Bulletproof DOM security ready to protect all upcoming format parsers.
5. Absolute preservation of all existing E2E and challenger tests.

The Worker can proceed directly using the implementation sequence in Section 5.
