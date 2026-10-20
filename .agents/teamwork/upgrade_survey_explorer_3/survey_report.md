# Comprehensive Technical Investigation Report: R3 (MOBI/AZW, TXT, MD) & R5 (Ultra-Low Memory & CPU Optimization)

**Instance**: `upgrade_survey_explorer_3`  
**Date**: 2026-10-17  
**Status**: COMPLETE  
**Target Scope**: 
- **Requirement 3 (R3)**: MOBI / AZW, Plain Text (.txt) & Markdown (.md) Reading Support
- **Requirement 5 (R5)**: Ultra-Low Memory Footprint & CPU Performance Optimization
- **Cross-Cutting**: Persistence layer separation in StorageManager, polymorphic `ParsedBook` engine contract, deterministic lifecycle destruction, and adversarial security.

---

## 1. Executive Summary & Problem Formulation

The WebReader upgrade requirement (recorded under `ORIGINAL_REQUEST.md ## 2026-10-17T18:34:26Z`) requires expanding the browser-based e-reader to support multiple document formats (`.epub`, `.pdf`, `.mobi`/`.azw`, `.txt`, `.md`) while guaranteeing:
1. **Zero build steps & pure client-side execution**: Vanilla modern JavaScript (ES Modules), HTML5, and CSS with zero node build steps or bundling requirements.
2. **Seamless Reading Experience**: Unifying all supported formats under WebReader's dual reading modes (CSS Multi-Column Pagination & Continuous Vertical Scroll), 10 eye-comfort color themes, typography controls, nested Table of Contents (TOC), bookmarks, and reading progress tracking.
3. **Strict Memory & CPU Bounds**: Preventing memory ballooning (allocating only active chapters/pages, isolating binary blobs from library metadata listings, recycling off-screen canvas buffers, revoking 100% of Blob URLs on destruction), and enforcing zero idle CPU with throttled/passive event listeners.

This investigation explores the current implementation (`js/parser/`, `js/storage/`, `js/reader/`, `js/ui/`, `js/app.js`), diagnoses architectural bottlenecks, and provides detailed specifications, algorithms, data structures, and verification protocols.

---

## 2. Requirement 3 (R3): MOBI / AZW Parsing Client-Side

### 2.1 PDB / Palm Database Container Structure

Mobipocket (`.mobi`) and Amazon Kindle (`.azw`, `.azw3`, KF7) ebooks are structured around the Palm Database (PDB) container format. A PDB file consists of a 78-byte header followed by an array of 8-byte record descriptors, which point to raw byte offsets within the file.

#### PDB Header Layout (Big-Endian)
| Byte Offset | Field Length | Data Type | Description |
|---|---|---|---|
| `0x00 - 0x1F` | 32 bytes | ASCII String | Database Name (null-terminated or padded with 0x00) |
| `0x20 - 0x21` | 2 bytes | uint16 | File Attributes / Flags |
| `0x22 - 0x23` | 2 bytes | uint16 | File Version |
| `0x24 - 0x27` | 4 bytes | uint32 | Creation Date (Palm epoch: seconds since Jan 1, 1904) |
| `0x28 - 0x2B` | 4 bytes | uint32 | Modification Date |
| `0x2C - 0x2F` | 4 bytes | uint32 | Backup Date |
| `0x30 - 0x33` | 4 bytes | uint32 | Modification Number |
| `0x34 - 0x37` | 4 bytes | uint32 | App Info ID (Offset to AppInfo block, usually 0) |
| `0x38 - 0x3B` | 4 bytes | uint32 | Sort Info ID (Offset to SortInfo block, usually 0) |
| `0x3C - 0x3F` | 4 bytes | ASCII (4) | Type Identifier (`BOOK` for ebooks, `TEXt` for PalmDOC) |
| `0x40 - 0x43` | 4 bytes | ASCII (4) | Creator Identifier (`MOBI` for Mobipocket, `REAd` for PalmDOC) |
| `0x44 - 0x47` | 4 bytes | uint32 | Unique ID Seed |
| `0x48 - 0x4B` | 4 bytes | uint32 | Next Record List ID (always 0) |
| `0x4C - 0x4D` | 2 bytes | uint16 | Number of Records (`numRecords`) |
| `0x4E+` | `numRecords * 8` | Array | Record Header Entries |

#### Record Header Entry Layout (8 bytes each)
Each record entry from index `0` to `numRecords - 1`:
- **`offset`** (4 bytes, uint32 big-endian): Absolute byte offset from the start of the file to the record's payload.
- **`attributes`** (1 byte): Record flags (e.g., dirty, secret).
- **`uniqueID`** (3 bytes): 24-bit integer identifier.

The record byte length is computed as:
$$\text{length}(i) = \begin{cases} \text{offset}(i+1) - \text{offset}(i), & \text{if } i < \text{numRecords} - 1 \\ \text{fileSize} - \text{offset}(i), & \text{if } i = \text{numRecords} - 1 \end{cases}$$

---

### 2.2 Record 0: PalmDOC & MOBI Headers

Record 0 is the metadata control record containing the PalmDOC header and the MOBI header.

#### PalmDOC Header (Offset `0x00 - 0x0F` within Record 0)
- `0x00 - 0x01` (uint16): **Compression Type**:
  - `1`: No compression (plain text).
  - `2`: **PalmDOC LZ77-based compression** (supported).
  - `17480` (`0x4448` 'DH'): HUFF/CDIC compression (Kindle Huffdic).
- `0x02 - 0x03` (uint16): Unused (always 0).
- `0x04 - 0x07` (uint32): **Uncompressed Text Length** (total decompressed byte count).
- `0x08 - 0x09` (uint16): **Text Record Count** ($N$ text records: records `1` to $N$).
- `0x0A - 0x0B` (uint16): **Record Size** (typically `4096` bytes uncompressed per record).
- `0x0C - 0x0F` (uint32): Current reading position / Encryption flag (`0` = unencrypted).

#### MOBI Header (Offset `0x10+` within Record 0)
Begins with 4-byte magic ASCII: `MOBI` (`0x4D, 0x4F, 0x42, 0x49`).
- `0x14 - 0x17` (uint32): Header length.
- `0x18 - 0x1B` (uint32): Mobi type (`2` = Mobipocket Book).
- `0x1C - 0x1F` (uint32): **Text Encoding**:
  - `1252`: Windows-1252 / CP1252.
  - `65001`: UTF-8.
- `0x20 - 0x23` (uint32): Unique ID.
- `0x24 - 0x27` (uint32): File version.
- `0x50 - 0x53` (uint32): **Full Name (Title) Offset** (relative to the start of Record 0).
- `0x54 - 0x57` (uint32): **Full Name Length** (length of title string in bytes).
- `0x6C - 0x6F` (uint32): **First Image Index** (`firstImageIndex`): Record index where embedded images begin.
- `0x80 - 0x83` (uint32): **EXTH Flags** (Bit 6 / `0x40`: EXTH header exists following MOBI header).
- `0xF2 - 0xF3` (uint16): **Extra Data Flags** (`extraFlags`): Determines trailing variable-length metadata at the end of text records.

---

### 2.3 PalmDOC Decompression Algorithm (LZ77 Variant)

The uncompressed text is split across records `1` through $N$ (`textRecordCount`). Each compressed record decompresses to a maximum of 4096 bytes.

```
                  ┌───────────────────────────────┐
                  │ Read next byte: b from stream │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
      b == 0x00               1 <= b <= 8            9 <= b <= 0x7F
   [Output 0x00]          [Literal copy next]      [Output literal b]
                          [b bytes from stream]
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
   0x80 <= b <= 0xBF                                0xC0 <= b <= 0xFF
 [Read byte c]                                    [Output space ' ' (0x20)]
 [word = (b << 8) | c]                            [Output (b ^ 0x80)]
 [distance = (word >> 3) & 0x07FF]
 [length = (word & 0x07) + 3]
 [Copy length bytes from output buffer]
 [starting distance bytes backwards]
```

#### Exact JavaScript Decompression Implementation
```javascript
export function decompressPalmDOCRecord(compressedBytes) {
  const output = new Uint8Array(4096 * 2); // safe upper bound buffer
  let writePos = 0;
  let readPos = 0;
  const inLen = compressedBytes.length;

  while (readPos < inLen) {
    const b = compressedBytes[readPos++];

    if (b === 0x00) {
      // 1. Literal 0x00
      output[writePos++] = 0x00;
    } else if (b >= 0x01 && b <= 0x08) {
      // 2. Literal copy of next b bytes
      for (let i = 0; i < b && readPos < inLen; i++) {
        output[writePos++] = compressedBytes[readPos++];
      }
    } else if (b >= 0x09 && b <= 0x7F) {
      // 3. Literal single byte
      output[writePos++] = b;
    } else if (b >= 0x80 && b <= 0xBF) {
      // 4. LZ77 Length-Distance pair
      if (readPos >= inLen) break;
      const c = compressedBytes[readPos++];
      const word = (b << 8) | c;
      const distance = (word >> 3) & 0x07FF;
      const length = (word & 0x07) + 3;

      if (distance <= 0 || distance > writePos) {
        // Corrupted distance guard
        continue;
      }

      for (let i = 0; i < length; i++) {
        output[writePos] = output[writePos - distance];
        writePos++;
      }
    } else if (b >= 0xC0 && b <= 0xFF) {
      // 5. Space + ASCII character (b ^ 0x80)
      output[writePos++] = 0x20;
      output[writePos++] = b ^ 0x80;
    }
  }

  return output.subarray(0, writePos);
}
```

---

### 2.4 Extra Data Flags & Backward Trailing Data Stripping

In modern MOBI files, text records contain trailing metadata (multibyte character overlap sequences and indexing entries) appended to the end of the compressed payload. If not stripped, the decompressor interprets metadata bytes as corrupted LZ77 stream commands.

#### Trailing Entries Size Computation (`getSizeOfTrailingDataEntries`)
```javascript
export function getTrailingDataSize(recordBytes, extraFlags) {
  if (!extraFlags || recordBytes.length === 0) return 0;

  let size = recordBytes.length;
  let num = 0;
  let testFlags = extraFlags >> 1;

  // Process variable-length trailing entries backward
  while (testFlags > 0) {
    if ((testFlags & 1) !== 0) {
      let bitpos = 0;
      let entrySize = 0;
      let curr = size - num;
      while (curr > 0) {
        const v = recordBytes[curr - 1];
        entrySize |= (v & 0x7F) << bitpos;
        bitpos += 7;
        curr--;
        if ((v & 0x80) !== 0 || bitpos >= 28 || curr <= 0) break;
      }
      num += entrySize;
    }
    testFlags >>= 1;
  }

  // Bit 0: Multibyte character overlap flag
  if ((extraFlags & 1) !== 0 && size - num > 0) {
    const overlapByte = recordBytes[size - num - 1];
    num += (overlapByte & 0x03) + 1;
  }

  return Math.min(num, recordBytes.length);
}
```

Prior to decompression, each record payload is stripped:
$$\text{payload} = \text{recordBytes.subarray}(0, \text{recordBytes.length} - \text{trailingSize})$$

---

### 2.5 EXTH Metadata & Cover Extraction

If the EXTH flag (`MOBI Header[0x80] & 0x40`) is set, the EXTH header immediately follows the MOBI header at:
$$\text{exthOffset} = 16 + \text{mobiHeaderLength}$$
Padded to a 4-byte boundary.

#### EXTH Record Types
| Record ID | Tag Name | Type | Description |
|---|---|---|---|
| `100` | Author | String | Book Creator (`dc:creator`) |
| `101` | Publisher | String | Publisher name |
| `103` | Description | String | Abstract / Blurb |
| `104` | ISBN | String | Standard Book Number |
| `105` | Subject | String | Subject / Genre |
| `106` | PublishingDate | String | Date of publication |
| `201` | CoverOffset | uint32 | Relative image record index for cover |
| `503` | UpdatedTitle | String | Clean title string |

#### Cover Extraction
If EXTH record `201` (`CoverOffset`) is present:
$$\text{coverRecordIndex} = \text{firstImageIndex} + \text{coverOffset}$$
Extract `records[coverRecordIndex]`. Read first 4 bytes to identify MIME type (`0xFF 0xD8 0xFF` $\to$ `image/jpeg`, `0x89 0x50 0x4E 0x47` $\to$ `image/png`, `GIF8` $\to$ `image/gif`). Create a Blob URL and assign to `coverBlobUrl`.

---

### 2.6 MOBI HTML Reconstruction, Chapter Splitting & Synthetic TOC

Decompressed MOBI text is HTML (often containing `<mbp:pagebreak>`, `<mbp:section>`, `filepos="000000000"` anchors, and `<h1>`..`<h3>` tags).

#### Chapter Splitting Strategy
1. **Primary Boundary**: Split by `<mbp:pagebreak>` or `<mbp:pagebreak/>` or `<div style="page-break-before:always">`.
2. **Secondary Boundary**: If no page breaks are declared, split at top-level `<h1>` or `<h2>` tag boundaries using a DOM tree walker or regex lookahead.
3. **Monolithic Fallback**: If the document is a single unbroken HTML stream, chunk at block boundaries (`<p>`, `<div>`) every ~40KB to maintain sub-16ms layout reflows in `PaginatedView`.
4. **TOC Hierarchy**: Extract headings (`<h1>`, `<h2>`, `<title>`) or parse `<a filepos="...">` references to build the hierarchical TOC tree matching the `ParsedBook.toc` interface contract.
5. **Image Link Rewriting**: MOBI images referenced as `<img recindex="12">` or `<img src="kindle:embed:000C">` are resolved to `firstImageIndex + recindex - 1` and rewritten to in-memory Blob URLs, tracked in `assetMap`.

---

## 3. Requirement 3 (R3): Plain Text (.txt) Parsing Engine

### 3.1 Binary Decoding & BOM Detection
Plain text files may be encoded in UTF-8, UTF-16LE, UTF-16BE, or Windows-1252.

```javascript
export function decodeTextBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  // Byte Order Mark (BOM) Detection
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  // Attempt UTF-8 with fatal flag to catch encoding errors
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (_) {
    // Fallback to Windows-1252
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
```

### 3.2 Paragraph & Chapter Segmentation Algorithm
1. **Normalization**: Normalize CRLF (`\r\n`) and CR (`\r`) to `\n`.
2. **Chapter Heading Regex**:
   ```javascript
   const CHAPTER_REGEX = /^(?:chapter\s+([0-9ivxlcdm]+|[a-z]+)|book\s+([0-9ivxlcdm]+)|part\s+([0-9ivxlcdm]+)|section\s+([0-9ivxlcdm]+)|#+\s+(.+)|([A-Z0-9\s.,'":-]{4,60}))$/i;
   ```
3. **Paragraph Detection**: Blocks separated by two or more newlines (`\n{2,}`) are treated as paragraphs (`<p>`). Lines within a single block are joined by spaces (or preserved with `<br>` if poetry/verse indent is detected).
4. **HTML Escaping**: All text is strictly escaped:
   ```javascript
   function escapeHtml(str) {
     return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
   }
   ```
5. **Synthetic TOC & Spine**:
   - Each detected chapter heading creates a TOC item `{ id, title, href: 'chapter_N.html', fullPath: 'chapter_N.html', children: [] }`.
   - If no headings are detected, chunk into 50-paragraph chapters titled "Section 1", "Section 2", etc.
   - Return conformant `ParsedBook` with `getChapterDocument(path)` returning a DOM Document containing styled `<p>` elements.

---

## 4. Requirement 3 (R3): Markdown (.md) Parsing Engine

### 4.1 Zero-Dependency Client-Side Architecture
To comply with the pure HTML/CSS/JS zero-build requirement, the Markdown parser must run client-side in vanilla JS without external node dependencies. A dedicated `MarkdownParser` class implements a lightweight, stateful, line-by-line streaming block lexer and inline tokenizer.

### 4.2 Syntax Coverage & Semantic HTML Mapping
| Markdown Syntax | Semantic HTML Output | Notes |
|---|---|---|
| `# H1` .. `###### H6` | `<h1 id="anchor">` .. `<h6 id="anchor">` | Generates slugified `id` for TOC anchors |
| `**bold**` / `__bold__` | `<strong>...</strong>` | Standard GFM strong emphasis |
| `*italic*` / `_italic_` | `<em>...</em>` | Standard GFM emphasis |
| `~~strikethrough~~` | `<del>...</del>` | GFM strikethrough |
| `` `code` `` | `<code>...</code>` | Inline code, HTML-escaped |
| ```` ```lang ... ``` ```` | `<pre><code class="language-lang">` | Fenced code block with code escaping |
| `> quote` (nested `>>`) | `<blockquote><p>...</p></blockquote>` | Recursive blockquote parsing |
| `- item` / `* item` / `+ item` | `<ul><li>...</li></ul>` | Nested list indent support |
| `1. item` | `<ol><li>...</li></ol>` | Ordered list support |
| `[text](url)` | `<a href="url" rel="noopener">` | Strips `javascript:` URIs |
| `![alt](url)` | `<img alt="alt" src="url" loading="lazy">` | Sanitized src |
| `---` / `***` | `<hr>` | Horizontal rule / page break |
| `\| col \| col \|` | `<table><thead>...<tbody>...</table>` | GFM table syntax |

### 4.3 Heading Hierarchy to TOC Extraction
As headings are parsed, a tree builder maintains a stack of active heading levels:
```javascript
export function buildTocFromHeadings(headings) {
  const root = [];
  const stack = [{ level: 0, children: root }];

  headings.forEach((h, idx) => {
    const item = {
      id: h.id || `heading-${idx}`,
      title: h.text,
      href: `${h.chapterPath}#${h.id}`,
      fullPath: h.chapterPath,
      hash: h.id,
      children: []
    };

    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(item);
    stack.push({ level: h.level, children: item.children });
  });

  return root;
}
```

### 4.4 Chapter Chunking for Large Markdown Books
If a Markdown document contains multiple `# ` (H1) headings or `---` horizontal page dividers, it is split into separate spine chapters (`chapter_0.html`, `chapter_1.html`). This prevents huge monolithic DOM trees from degrading pagination layout performance.

---

## 5. Requirement 5 (R5): Ultra-Low Memory Footprint & Storage Architecture

### 5.1 StorageManager Metadata vs. Binary Separation Architecture

#### The Problem in Existing Codebase
In `js/storage/db.js`, the `books` store holds the entire `bookRecord`:
```javascript
bookRecord = {
  id: '...',
  title: '...',
  fileBlob: new Blob([...]), // 10MB - 100MB per book!
  ...
};
```
When `StorageManager.getAllBooks()` is called (e.g. during library shelf render), IndexedDB deserializes every book object, hydrating tens or hundreds of megabytes of raw binaries into JavaScript memory simultaneously.

#### The Architectural Solution: Two-Store Separation
Split the storage schema into two distinct object stores within `WebReaderDB` (Version 2 upgrade):

```
┌────────────────────────────────────────────────────────┐
│                   IndexedDB: WebReaderDB               │
├────────────────────────────┬───────────────────────────┤
│    Store: 'books'          │    Store: 'book_files'    │
│    (Metadata Only)         │    (Binary Payloads)      │
├────────────────────────────┼───────────────────────────┤
│  id (keyPath)              │  id (keyPath)             │
│  title                     │  fileBlob (Blob/Buffer)   │
│  author                    │                           │
│  format ('epub'|'pdf'|...) │                           │
│  coverBlob (small thumb)   │                           │
│  fileSize (bytes)          │                           │
│  dateAdded, lastRead       │                           │
└────────────────────────────┴───────────────────────────┘
```

#### Schema Migration Protocol (Version 1 $\to$ Version 2)
In `db.js`:
```javascript
static DB_VERSION = 2;

// Inside request.onupgradeneeded:
if (event.oldVersion < 2) {
  if (!db.objectStoreNames.contains('book_files')) {
    db.createObjectStore('book_files', { keyPath: 'id' });
  }
  // Migrate existing books in background transaction
  const tx = event.currentTarget.transaction;
  const bookStore = tx.objectStore('books');
  const fileStore = tx.objectStore('book_files');
  const req = bookStore.openCursor();
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const record = cursor.value;
      if (record.fileBlob) {
        fileStore.put({ id: record.id, fileBlob: record.fileBlob });
        delete record.fileBlob;
        cursor.update(record);
      }
      cursor.continue();
    }
  };
}
```

#### Updated Storage Contracts & Implementations
1. **`getAllBooks()`**:
   Queries `books` store only. Returns metadata records with zero file binaries:
   ```javascript
   static async getAllBooks() {
     const db = await this.openDB();
     return new Promise((resolve, reject) => {
       const tx = db.transaction('books', 'readonly');
       const store = tx.objectStore('books');
       const index = store.index('by_lastRead');
       const req = index.getAll();
       req.onsuccess = () => {
         const list = (req.result || []).reverse();
         // Guarantee fileBlob is never present
         for (const b of list) delete b.fileBlob;
         resolve(list);
       };
       req.onerror = () => reject(req.error);
     });
   }
   ```
2. **`getBook(id)`**:
   Hydrates binary on-demand using a single transaction across `['books', 'book_files']`:
   ```javascript
   static async getBook(id) {
     if (!id) return null;
     const db = await this.openDB();
     return new Promise((resolve, reject) => {
       const tx = db.transaction(['books', 'book_files'], 'readonly');
       const bookStore = tx.objectStore('books');
       const fileStore = tx.objectStore('book_files');
       const bookReq = bookStore.get(id);
       const fileReq = fileStore.get(id);

       tx.oncomplete = () => {
         const book = bookReq.result;
         if (!book) return resolve(null);
         const fileRec = fileReq.result;
         book.fileBlob = fileRec?.fileBlob || null;
         resolve(book);
       };
       tx.onerror = () => reject(tx.error);
     });
   }
   ```
3. **`saveBook(bookRecord)`**:
   Separates payload atomically in a readwrite transaction:
   - `book_files.put({ id: bookRecord.id, fileBlob: bookRecord.fileBlob })`
   - Strips `fileBlob` from `metadata` object and executes `books.put(metadata)`.
4. **`deleteBook(id)`**:
   Deletes `id` across `['books', 'book_files', 'reading_progress', 'bookmarks']` atomically.

---

## 6. Requirement 5 (R5): On-Demand Lazy Rendering & Off-Screen Recycling

### 6.1 Paginated Mode
- Only the **active chapter** DOM document is loaded in `#reader-frame`.
- Turning pages uses hardware-accelerated CSS `transform: translateX(-N * pageWidth)` on `#content-wrapper` without re-rendering or duplicating DOM nodes.
- When crossing chapter boundaries, the old chapter document is unlinked from the iframe, garbage collecting its DOM subtrees.

### 6.2 Scroll Mode
- In Continuous Scroll View, large books or long chapters utilize CSS modern rendering hints:
  ```css
  .scroll-chapter-block {
    content-visibility: auto;
    contain-intrinsic-size: 800px;
  }
  ```
- The browser skips layout, styling, and paint for off-screen blocks while maintaining accurate scroll bar geometry.

### 6.3 PDF Visual Page Mode Buffer Recycling
For PDF Visual Page Mode (rendering 100+ PDF pages on `<canvas>`):
1. **The Canvas Memory Problem**: An uncompressed RGBA canvas for a standard page ($1200 \times 1600 \text{ px}$) consumes:
   $$1200 \times 1600 \times 4 \text{ bytes} \approx 7.68 \text{ MB per page}$$
   Rendering 100 pages concurrently would consume over **768 MB** of memory and trigger mobile browser tab crashes.
2. **Windowed Buffer Pool Algorithm**:
   - Only pages within the active window (current page $-1$, current, current $+1$) hold rendered `<canvas>` buffers (maximum 3 canvases $\approx 23\text{ MB}$).
   - Off-screen pages are represented by lightweight placeholder `<div>` containers maintaining the exact computed height:
     $$\text{height} = \text{containerWidth} \times \frac{\text{pageHeight}}{\text{pageWidth}}$$
   - When a page leaves the active window:
     ```javascript
     canvas.width = 0;
     canvas.height = 0; // Immediately releases GPU backing bitmap
     canvas.remove();
     ```
   - An `IntersectionObserver` with `rootMargin: '200px 0px'` lazily instantiates canvases as placeholders approach the viewport.

---

## 7. Requirement 5 (R5): Deterministic Resource Cleanup & Zero-Leak Guarantees

### 7.1 Lifecycle Breakdown in `ReaderEngine.destroy()`
Existing code in `ReaderEngine.destroy()` merely calls sub-view `destroy()` and `parsedEpub.cleanup()`. It leaves the iframe, DOM trees, and background listeners active.

#### Complete Deterministic Cleanup Implementation Spec
```javascript
destroy() {
  // 1. Deactivate & destroy views
  if (this.paginatedView) {
    this.paginatedView.destroy();
    this.paginatedView = null;
  }
  if (this.scrollView) {
    this.scrollView.destroy();
    this.scrollView = null;
  }

  // 2. Disconnect all observers
  if (this._resizeObserver) {
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
  }
  if (this._intersectionObserver) {
    this._intersectionObserver.disconnect();
    this._intersectionObserver = null;
  }

  // 3. Cancel pending animation frames and timers
  if (this._rafId) {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }
  if (this._saveProgressTimer) {
    clearTimeout(this._saveProgressTimer);
    this._saveProgressTimer = null;
  }

  // 4. Revoke 100% of tracked Blob URLs
  if (this.parsedBook && typeof this.parsedBook.cleanup === 'function') {
    this.parsedBook.cleanup();
  }
  if (this.trackedBlobUrls) {
    for (const url of this.trackedBlobUrls) {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
    this.trackedBlobUrls.clear();
  }

  // 5. Tear down iframe and clean detached DOM nodes
  if (this.iframe) {
    try {
      const doc = this.iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
        doc.close();
      }
      this.iframe.src = 'about:blank';
      this.iframe.remove();
    } catch (_) {}
    this.iframe = null;
  }

  // 6. Tear down canvases (release GPU memory)
  if (this.stage) {
    const canvases = this.stage.querySelectorAll('canvas');
    for (const c of canvases) {
      c.width = 0;
      c.height = 0;
      c.remove();
    }
  }

  // 7. Null out large objects
  this.parsedBook = null;
  this.activeBookId = null;
}
```

### 7.2 Memory Stress Test Benchmark
To verify zero leaks under adversarial conditions:
- **Test Protocol**: Execute 10 consecutive open $\to$ navigate $\to$ close cycles in Chromium headless via Puppeteer.
- **Pass Criteria**:
  1. `window.performance.memory.usedJSHeapSize` delta after 10 cycles is bounded ($< 5\text{ MB}$).
  2. Number of active `blob:` URLs in the page equals 0 when returning to the library shelf.
  3. Detached DOM nodes count remains flat.
  4. Active iframes count in the DOM equals 0 (or 1 reusable standby iframe).

---

## 8. Requirement 5 (R5): Zero Idle CPU & Event Listener Optimization

### 8.1 Passive & Throttled Event Listeners
1. **Passive Listeners**: All `scroll`, `touchmove`, `touchstart`, and `wheel` listeners must be attached with `{ passive: true }`:
   ```javascript
   this.stage.addEventListener('scroll', this._boundOnScroll, { passive: true });
   ```
2. **Debounced Progress Persistence**: Scroll progress must not initiate an IndexedDB write transaction on every pixel tick. A 500ms debounce buffer holds state, flushing immediately only when:
   - Chapter changes
   - Book is closed (`closeBookToLibrary()`)
   - Page unloads (`beforeunload` / `visibilitychange`)

### 8.2 Zero Idle CPU Execution
- When the user is not actively reading, scrolling, or turning pages, WebReader must consume **0% CPU**.
- Prohibit any background `setInterval` timers.
- When `document.visibilityState === 'hidden'`, pause any pending render tasks.

---

## 9. Unified Interface Contracts & Module Boundaries

### 9.1 The Polymorphic `ParsedBook` Contract
All format parsers (`EpubParser`, `MobiParser`, `TxtParser`, `MarkdownParser`, `PdfParser`) must return an object satisfying this contract:

```typescript
interface ParsedBook {
  metadata: {
    title: string;
    author: string;
    format: 'epub' | 'pdf' | 'mobi' | 'txt' | 'md';
    language?: string;
    identifier?: string;
    description?: string;
    publisher?: string;
    date?: string;
  };
  coverBlobUrl: string | null;
  spine: Array<{
    id: string;
    href: string;
    fullPath: string;
    isLinear?: boolean;
    pageNumber?: number; // For PDF
  }>;
  toc: Array<TocItem>; // Hierarchical tree { id, title, href, fullPath, hash, children }
  getChapterDocument(fullPath: string): Promise<Document>;
  assetMap?: Map<string, string>;
  cleanup(): void;
}
```

### 9.2 The Master `BookParser` Factory
A unified coordinator detects the file format via magic bytes and file extension:

```javascript
export class BookParser {
  static async parse(fileOrBuffer, filename = '') {
    const ext = filename.split('.').pop().toLowerCase();
    
    // 1. Detect by extension & magic bytes
    if (ext === 'epub' || await this.isZip(fileOrBuffer)) {
      return EpubParser.parse(fileOrBuffer);
    }
    if (ext === 'mobi' || ext === 'azw' || await this.isMobi(fileOrBuffer)) {
      return MobiParser.parse(fileOrBuffer);
    }
    if (ext === 'txt') {
      return TxtParser.parse(fileOrBuffer, filename);
    }
    if (ext === 'md') {
      return MarkdownParser.parse(fileOrBuffer, filename);
    }
    if (ext === 'pdf') {
      return PdfParser.parse(fileOrBuffer);
    }
    throw new Error(`Unsupported book format: .${ext}`);
  }
}
```

---

## 10. Exhaustive Feature Traceability Matrix

| Feature ID | Scope | Technical Algorithm / Strategy | Key Dependencies | Verification Criteria |
|---|---|---|---|---|
| **F-R3-01** | MOBI / AZW PDB Parser | Big-endian PDB header unpack, Record table offset calculation | Pure JS DataView | Correctly maps record boundaries on valid MOBI |
| **F-R3-02** | PalmDOC Decompressor | LZ77 variant: literal 0x00, 1-8 copy, ASCII, length-distance, space+char | Pure JS TypedArrays | 100% byte fidelity against uncompressed reference |
| **F-R3-03** | MOBI Trailing Stripper | Reverse variable-length varint decoder based on `extraFlags` | Pure JS | Strips multibyte and indexing tails without corrupting text |
| **F-R3-04** | MOBI Metadata & Cover | Record 0 MOBI & EXTH header parser; PDB image record extraction | `assetMap`, Blob URLs | Extracts title, author, and cover Blob URL |
| **F-R3-05** | MOBI Chapter & TOC | Split by `<mbp:pagebreak>` / `<h1>`, generate synthetic TOC tree | DOMParser, DOMSanitizer | Creates navigable spine & TOC matching EPUB |
| **F-R3-06** | TXT Paragraph Parser | BOM detector, `\n{2,}` paragraph block parser, HTML escaping | TextDecoder | Escapes markup, creates clean `<p>` blocks |
| **F-R3-07** | TXT Chapter Detector | Heading regex matching (`Chapter \d+`, `Book \d+`, `# `) | Regex Engine | Generates synthetic TOC & spine chunks |
| **F-R3-08** | MD Lexer & AST Parser | State-driven line parser: headers, lists, code, quotes, tables | Pure JS | Emits semantic HTML conforming to GFM specs |
| **F-R3-09** | MD TOC Tree Builder | Heading stack algorithm (H1..H6) with slugified anchor IDs | TOC builder | Builds hierarchical nested TOC with jump anchors |
| **F-R3-10** | R3 Security Sanitizer | Strip scripts, `on*` attributes, dangerous URIs across all formats | `DOMSanitizer` | Passes all adversarial XSS injection vectors |
| **F-R5-01** | Storage Separation | Two-store architecture: `books` (metadata) + `book_files` (binary) | `IndexedDB` v2 | `getAllBooks()` returns zero `fileBlob` buffers |
| **F-R5-02** | On-Demand Hydration | `getBook(id)` fetches binary payload only when opening a book | `IndexedDB` transaction | Loads binary on open, releases on library return |
| **F-R5-03** | Scroll Mode Lazy Render | `content-visibility: auto` + `contain-intrinsic-size` | Modern CSS engine | Flat DOM layout cost during long scroll reading |
| **F-R5-04** | Canvas Buffer Recycling | Windowed canvas rendering (current ± 1 page), `width=0` cleanup | Canvas 2D API | Flat canvas memory usage (< 25MB) across 100+ pages |
| **F-R5-05** | Deterministic Destruction | Revoke 100% Blob URLs, tear down iframe, disconnect observers | `URL.revokeObjectURL` | Zero unrevoked Blob URLs on book close |
| **F-R5-06** | Zero Idle CPU & Passive | Passive scroll/touch listeners (`{ passive: true }`), debounced save | EventTarget API | 0% idle CPU usage, smooth 60fps scrolling |

---

## 11. Memory & Performance Audit Criteria and Benchmarks

### Benchmark 1: StorageManager Memory Footprint
- **Scenario**: Library populated with 50 books (average file size: 15MB each = 750MB total data).
- **Target**:
  - `getAllBooks()` execution: $< 50\text{ ms}$.
  - Peak memory consumed during `getAllBooks()`: $< 500\text{ KB}$ (metadata only).
  - Residual memory: 0 bytes of binary payloads.

### Benchmark 2: Memory Leak Stress Test (10 Cycles)
- **Scenario**: Headless Chromium opens a book, navigates 5 chapters, and closes to library, repeated 10 times.
- **Target**:
  - Unrevoked `blob:` URLs: exactly `0`.
  - Detached `<canvas>` and `<iframe>` elements: `0`.
  - Heap growth ($\Delta \text{Heap}$): $< 5\text{ MB}$ across all 10 cycles.

### Benchmark 3: Zero Idle CPU Verification
- **Scenario**: Reader open at active chapter, no user input for 10 seconds.
- **Target**:
  - CPU usage: `0.0%`.
  - Active timers (`setInterval`): `0`.
  - Animation frames pending: `0`.

---

## 12. Conclusion & Implementation Recommendations

1. **Format Expansion**: Implement `MobiParser`, `TxtParser`, and `MarkdownParser` conforming to the unified `ParsedBook` contract. Wrap them with a master `BookParser` detection facade.
2. **Persistence Upgrade**: Upgrade `WebReaderDB` to Version 2 with separate `books` and `book_files` stores. Ensure `getAllBooks()` returns lightweight metadata only.
3. **Engine Hardening**: Update `ReaderEngine.destroy()` and `app.js closeBookToLibrary()` to guarantee 100% Blob URL revocation, observer disconnection, and iframe teardown.
4. **Validation**: Add end-to-end automated tests verifying `.mobi`, `.txt`, `.md` import/reading, and execute the 10-cycle memory leak stress test in Chromium.
