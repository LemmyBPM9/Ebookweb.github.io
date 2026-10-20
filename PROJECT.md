# Project: Minimal, Modern, Eye-Friendly Client-Side WebReader (Multi-Format Upgrade)

## Architecture
- **Paradigm**: Zero-build-step, pure client-side HTML5, CSS3, and vanilla ES6+ JavaScript (`<script type="module">`).
- **Hosting / Execution**: Runs directly from any static HTTP server (Node built-in `http`, Python `http.server`, static hosting) or local browser.
- **Data Flow & Decoupling**:
  - `EventBus`: Central pub/sub broker coordinating communication between UI, Reading Engine, Parsers, and Storage.
  - `StorageManager` (V2): Segregated storage — synchronous `localStorage` for instant FOUC-free theme/typography boot; two-tier asynchronous `IndexedDB` (`WebReaderDB` V2) with `books` (lightweight metadata, covers, lastRead) and `book_files` (binary payloads on-demand) to ensure library shelf queries never load raw book binaries.
  - `BookParser` (Polymorphic Factory): Routes file by magic bytes / extension to format-specific parsers (`EpubParser`, `PdfParser`, `MobiParser`, `TxtParser`, `MarkdownParser`), all returning the unified `ParsedBook` contract.
  - `ReaderEngine`: Orchestrates chapter lifecycle and presentation:
    - Text/Reflowable Modes: Sandboxed `<iframe>` (`sandbox="allow-same-origin"` without `allow-scripts`) managing Paginated View (`CSS column-width` layout) and Continuous Scroll View.
    - PDF Visual Mode: Canvas-based rendering (`PdfVisualView`) with theme-aware GPU-accelerated eye-comfort CSS filters (`mix-blend-mode: multiply` on light themes, color inversion/tint matrix on dark themes).
  - `UI Controller`: Library card grid with format badges and header format filters, drag-and-drop importer, reader chrome, 3-zone tap overlay, nested TOC drawer, bookmarks tab, and 10-theme typography settings panel.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `container.xml` Discovery & Parsing | Locates and parses OPF package path from `META-INF/container.xml` with `.opf` scan fallback | Baseline | survey |
| 2 | Dublin Core Metadata Extraction | Extracts title, creator/author, identifier, language, description, and date | Baseline | survey |
| 3 | Cover Image Identification Cascade | Resolves cover via EPUB 3 property, EPUB 2 meta, manifest heuristics, or SVG fallback jacket | Baseline | survey |
| 4 | Manifest Indexing | Maps item IDs, relative hrefs, MIME media-types, and property flags (`nav`, `cover-image`) | Baseline | survey |
| 5 | Spine Reading Order | Constructs ordered list of linear reading chapters from `<spine>` and `<itemref>` | Baseline | survey |
| 6 | EPUB 2 NCX Parsing | Extracts hierarchical TOC tree from `toc.ncx` `<navMap>` and nested `<navPoint>` elements | Baseline | survey |
| 7 | EPUB 3 Nav Document Parsing | Extracts hierarchical TOC tree from HTML5 `<nav epub:type="toc">` / `<nav role="doc-toc">` | Baseline | survey |
| 8 | Synthetic Spine TOC Fallback | Generates clean TOC from chapter headings when NCX and Nav Doc are both absent | Baseline | survey |
| 9 | Client-Side ZIP Decompression | Pure client-side zip extraction via standalone JSZip vendor script and native DecompressionStream | Baseline | survey |
| 10 | Standalone JSZip Vendor Engine | Vendored `vendor/jszip.min.js` with zero build step requirement | Baseline | survey |
| 11 | IndexedDB Persistent Storage | Persistent `WebReaderDB` storing book binaries, metadata, covers, progress, and bookmarks | Baseline | survey |
| 12 | FOUC-Free Synchronous Settings | `<head>` inline script reading `localStorage` theme and typography before first paint | Baseline | survey |
| 13 | 4 Eye-Comfort Color Themes | Warm Paper (Sepia), Soft Dark (Night), Daylight, Sage with verified WCAG AAA contrast (>13:1) | Baseline | survey |
| 14 | Built-in Sample EPUB Generator | Programmatic zero-network sample EPUB generator (`sample-book.js`) with 3 rich chapters & SVG diagrams | Baseline | survey |
| 15 | Auto-Seeding & Sample Restore | Automatically seeds sample book on first launch and provides library restore option | Baseline | survey |
| 16 | Relative Path Resolution | Resolves relative asset paths (`../`, `./`, `%20`) from chapter location to zip archive keys | Baseline | survey |
| 17 | Image & SVG Asset Rewriting | Replaces `img[src]`, `image[xlink:href]`, and media tags with in-memory Blob URLs | Baseline | survey |
| 18 | CSS URL Rewriting & Inlining | Rewrites relative `url(...)` declarations in stylesheets to Blob URLs and inlines styles | Baseline | survey |
| 19 | Security Sanitization & Sandboxing | Strips `<script>`, inline `on*` handlers; renders in iframe sandbox without `allow-scripts` | Baseline | survey |
| 20 | In-Memory Blob URL Cleanup | Tracks and revokes Blob URLs (`URL.revokeObjectURL`) on book close/deletion to prevent leaks | Baseline | survey |
| 21 | Theme & Typography CSS Cascade | Overrides hardcoded book styles in iframe using high-specificity CSS custom properties | Baseline | survey |
| 22 | Paginated Multi-Column View | Book-like CSS multi-column layout with horizontal page turns and zero vertical scrollbar clutter | Baseline | survey |
| 23 | Continuous Vertical Scroll View | Fluid continuous reading view with smooth scrolling and chapter end indicators | Baseline | survey |
| 24 | Dynamic Mode Switching | Seamless toggle between Paginated and Scroll modes with bidirectional progress ratio sync | Baseline | survey |
| 25 | Cross-Chapter Boundary Transitions | Forward to Chapter N+1 (Page 0) and backward to Chapter N-1 (measuring and landing on last page) | Baseline | survey |
| 26 | Internal Section Anchor Jumping | Navigates to specific chapter section anchors (`#sec-id`) from TOC or bookmarks | Baseline | survey |
| 27 | Reading Progress Calculation | Chapter-level and global book-level progress percentage calculations | Baseline | survey |
| 28 | Library View & Book Cards Grid | Shelf of imported books with cover art, titles, authors, progress badges, and delete buttons | Baseline | survey |
| 29 | Drag-and-Drop & File Picker Import | Import via drop zone or file picker with ZIP magic-byte validation (`PK\x03\x04`) and error toasts | Baseline | survey |
| 30 | Atomic Book Deletion | Removes book record, reading progress, and bookmarks from IndexedDB and updates UI | Baseline | survey |
| 31 | Unobtrusive Reader Chrome | Header with book title, back button, mode/theme/TOC buttons; auto-hides after inactivity | Baseline | survey |
| 32 | Subtle Progress Footer | Pinned bottom progress bar, chapter title, page count / scroll percentage indicator | Baseline | survey |
| 33 | 3-Zone Click/Tap Navigation | Left 25% prev page, Center 50% toggle chrome, Right 25% next page, with gesture guard | Baseline | survey |
| 34 | Keyboard Shortcuts | Navigation via ArrowLeft, ArrowRight, Space, PageUp, PageDown, Escape | Baseline | survey |
| 35 | Collapsible Nested TOC Drawer | Slide-in drawer with hierarchical chapters, indentation, active chapter highlight, auto-scroll | Baseline | survey |
| 36 | Bookmarks Drawer & Toggle | Header bookmark toggle, list of bookmarks with chapter title, snippet, timestamp, jump & delete | Baseline | survey |
| 37 | Typography Controls Panel | Popover/drawer to adjust font family (Serif, Sans, Dyslexia/Mono), font size, line height, width | Baseline | survey |
| 38 | State Restoration on Page Reload | Restores open book, chapter index, page/scroll position, theme, and typography after reload | Baseline | survey |
| 39 | E2E Headless Test Suite (Tiers 0-4) | Comprehensive Puppeteer/Chrome test suite covering 100% of EPUB requirements | Baseline | survey |
| 40 | Adversarial Coverage Hardening | White-box challenger verification of edge cases, stress testing, and boundary conditions | Baseline | survey |
| 41 | Multi-Format File Input & Drag-and-Drop | Accept `.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, `.md` with case-insensitivity in picker & drop zone | M1 | survey |
| 42 | Format Badges & Header Filter Controls | Distinct format badges (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) on cards; header filter tabs (`All` + formats) | M1 | survey |
| 43 | IndexedDB V2 Metadata vs. Binary Separation | Split `books` (metadata only) and `book_files` (binary payload on demand); `getAllBooks()` loads 0 binary bytes | M1 | survey |
| 44 | Universal DOMSanitizer Enforcement | Universal DOMSanitizer sanitizes all untrusted markup across all formats (`window.__xssTriggered` stays falsy) | M1 | survey |
| 45 | 10 Eye-Comfort Reading Themes | Full CSS custom properties for 10 themes with verified WCAG AAA (>= 7.0:1) contrast ratios | M2 | survey |
| 46 | Zero-FOUC Inline Head Bootstrap for 10 Themes | Synchronous inline head script validates and applies all 10 themes before first paint | M2 | survey |
| 47 | Settings Drawer 10-Theme Swatch Grid | Settings drawer displays 10 theme swatches with active outline, instant toggle and persistence | M2 | survey |
| 48 | Zero-Build Offline PDF.js Vendor Integration | Pure client-side `vendor/pdf.min.js` and `vendor/pdf.worker.min.js` loaded via script tag without bundlers | M3 | survey |
| 49 | PDF Reflowable Text Extraction Mode | `PdfParser` extracts text items, column gutters, and headings into semantic HTML for Paginated/Scroll views | M3 | survey |
| 50 | PDF Visual Page Mode Canvas Rendering | `PdfVisualView` renders PDF pages to `<canvas>` with zoom/fit controls (`fitWidth`, `fitPage`) | M3 | survey |
| 51 | GPU-Accelerated Eye-Comfort CSS Filters for PDF | CSS `mix-blend-mode: multiply` on light themes, inversion/tint on dark themes for 0ms CPU cost | M3 | survey |
| 52 | Dual-Mode PDF Toggling & Progress Sync | Mode toggle button switches between Reflowable and Visual PDF views while preserving current page & TOC | M3 | survey |
| 53 | MOBI / AZW PalmDOC LZ77 Decompression | Unpacks PalmDOC byte stream with trailing varint entry stripping when `extraFlags > 0` | M4 | survey |
| 54 | MOBI Metadata, Cover & Chapter Extraction | Parses Record 0 header, EXTH metadata/cover, splits chapters on `<mbp:pagebreak>`, generates TOC | M4 | survey |
| 55 | Plain Text (.txt) Parser & Synthetic TOC | Paragraph detection via blank lines, heading detection via regex (`Chapter ...`), synthetic spine TOC | M4 | survey |
| 56 | Markdown (.md) GFM Parser & Semantic HTML | Streaming GFM parser (headings, lists, blockquotes, code, tables), slugified anchors, nested TOC | M4 | survey |
| 57 | Unified Polymorphic BookParser Factory | `BookParser.parse(fileOrBuffer, filename)` routes by magic bytes/extension to return standard `ParsedBook` | M4 | survey |
| 58 | Off-Screen Buffer Virtualization & Canvas Recycling | Visual mode renders active page ± 1 buffer; deallocates GPU textures via `canvas.width=0; height=0; remove()` | M5 | survey |
| 59 | Deterministic Teardown in ReaderEngine.destroy() | 100% Blob URL revocation, iframe teardown, canvas bitmap zeroing, observer/rAF disconnection on book close | M5 | survey |
| 60 | Zero-Idle CPU & Passive Event Listeners | Strict `{ passive: true }` on scroll/touch, debounced progress saves, zero idle background timers | M5 | survey |
| 61 | Multi-Format & Dual-Mode PDF E2E Test Suite | Comprehensive automated tests verifying all formats, reflowable/visual PDF modes, 10 themes, and reload persistence | M6 / Test Track | survey |
| 62 | Memory Leak & Resource Cleanup Stress Suite | Automated Chromium tests verifying 10x repeated open/close cycles without detached iframes or unbounded heap growth | M6 / Test Track | survey |
| 63 | Documentation & Final Audit Report | Complete update of `README.md`, `PROJECT.md`, and `FINAL_AUDIT_REPORT.md` with verification metrics | M6 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| Baseline | EPUB Reader Core Foundation | Baseline EPUB reader (Features 1-40) | none | DONE |
| M1 | Multi-Format Library, Format Badges & Storage V2 | Features 41, 42, 43, 44: Accept all formats in picker/drag-drop, format badges & filter tabs, IndexedDB V2 metadata/binary separation, universal DOMSanitizer | Baseline | DONE |
| M2 | Expanded 10 Eye-Comfort Themes & Contrast Engine | Features 45, 46, 47: 10 WCAG AAA themes in CSS, zero-FOUC head bootstrap, settings drawer swatches | Baseline | DONE |
| M3 | Dual-Mode PDF Reading Engine (Reflowable & Visual) | Features 48, 49, 50, 51, 52: PDF.js vendor scripts, Reflowable text extraction, Visual canvas view, GPU eye-comfort filters, dual-mode toggle | M1, M2 | DONE |
| M4 | MOBI/AZW, Plain Text & Markdown Reading Support | Features 53, 54, 55, 56, 57: PalmDOC LZ77 decompressor, MOBI parser, TXT paragraph parser, Markdown GFM parser, polymorphic BookParser factory | M1, M2 | DONE |
| M5 | Ultra-Low Memory Footprint & Resource Cleanup | Features 58, 59, 60: Off-screen canvas recycling, deterministic ReaderEngine.destroy(), app.js closeBookToLibrary cleanup, zero idle CPU | M1, M2, M3, M4 | DONE |
| M6 | Final Verification, Adversarial Hardening & Docs | Features 61, 62, 63: Phase 1 pass 100% E2E test suite, Phase 2 adversarial coverage & memory leak stress test, update README/FINAL_AUDIT_REPORT/PROJECT | M1, M2, M3, M4, M5, T2 | DONE |

## Parallel E2E Testing Track
| # | Track Name | Scope | Dependencies | Status |
|---|------------|-------|-------------|--------|
| T1 | Baseline E2E Testing Track | Baseline test infra and EPUB E2E test suites (Features 39-40) | none | DONE |
| T2 | Multi-Format & Performance E2E Testing Track | Features 61, 62: automated test suites for all formats (.epub, .pdf, .mobi/.azw, .txt, .md), Reflowable vs Visual PDF, 10 themes, and 10x open/close memory leak tests; publish TEST_READY.md | M1, M2 | DONE |

## Interface Contracts

### Storage ↔ Application (`js/storage/`)
- `StorageManager.openDB()` -> Promise<IDBDatabase>
- `StorageManager.getAllBooks()` -> Promise<Array<BookMetadata>> (NEVER includes raw binary payload)
- `StorageManager.getBook(id)` -> Promise<BookRecord | null> (Joins `books` metadata and `book_files` binary)
- `StorageManager.saveBook(bookRecord)` -> Promise<string> (Atomically writes metadata to `books` and binary to `book_files`)
- `StorageManager.deleteBook(id)` -> Promise<void> (Atomically deletes book metadata, binary, progress, and bookmarks)
- `StorageManager.getProgress(bookId)` -> Promise<ReadingProgress | null>
- `StorageManager.saveProgress(progressRecord)` -> Promise<void>
- `StorageManager.getBookmarks(bookId)` -> Promise<Array<Bookmark>>
- `StorageManager.addBookmark(bookmarkRecord)` -> Promise<string>
- `StorageManager.deleteBookmark(id)` -> Promise<void>
- `SettingsManager.getSettings()` -> `{ theme, typography, lastBookId }`
- `SettingsManager.saveSettings(partialSettings)` -> void

### Unified Parser ↔ Reader Engine (`js/parser/`)
- `BookParser.parse(fileOrBuffer, filename)` -> Promise<ParsedBook>
  ```typescript
  interface ParsedBook {
    format: 'epub' | 'pdf' | 'mobi' | 'txt' | 'md';
    metadata: { title: string; author: string; language?: string; identifier?: string; description?: string };
    coverBlobUrl: string | null;
    spine: Array<{ id: string; href: string; fullPath: string; isLinear: boolean; title?: string }>;
    toc: Array<TocItem>; // Hierarchical tree: { id, title, href, fullPath, hash, children }
    getChapterDocument(fullPath: string): Promise<Document>;
    assetMap?: Map<string, string>; // assetKey -> blobUrl
    cleanup(): void; // revokes all created blob URLs and clears in-memory structures
    // Optional PDF-specific capabilities:
    pdfDoc?: any; // PDF.js document handle for Visual Page Mode
    pageCount?: number;
  }
  ```

### Reader Engine ↔ UI Chrome (`js/reader/` & `js/ui/`)
- `ReaderEngine.loadBook(parsedBook, initialProgress)` -> Promise<void>
- `ReaderEngine.setMode(mode: 'paginated' | 'scroll' | 'pdf-visual')` -> void
- `ReaderEngine.nextPage()` -> void
- `ReaderEngine.prevPage()` -> void
- `ReaderEngine.goToChapter(spineIndex: number, anchorId?: string)` -> Promise<void>
- `ReaderEngine.goToLocation(spineIndex: number, pageIndexOrScrollRatio: number)` -> Promise<void>
- `ReaderEngine.applyTheme(themeId: string)` -> void
- `ReaderEngine.applyTypography(typographySettings: object)` -> void
- `ReaderEngine.getProgress()` -> CurrentPositionReport
- `ReaderEngine.destroy()` -> void (Revokes 100% of Blob URLs, clears canvas/DOM buffers, disconnects observers)

### EventBus Events (`js/event-bus.js`)
- `book:open`: `{ bookId }`
- `book:loaded`: `{ bookRecord, parsedBook }`
- `chapter:changed`: `{ spineIndex, chapterTitle, totalPages, isFirst, isLast }`
- `page:changed`: `{ spineIndex, pageIndex, totalPages, progressPercent, globalPercent }`
- `mode:changed`: `{ mode: 'paginated' | 'scroll' | 'pdf-visual' }`
- `theme:changed`: `{ themeId }`
- `typography:changed`: `{ fontFamily, fontSize, lineHeight, maxWidth }`
- `chrome:toggle`: `{ visible?: boolean }`
- `toc:navigate`: `{ spineIndex, anchorId }`
- `bookmark:toggle`: `{}`
- `bookmark:navigate`: `{ bookmark }`
- `library:filter`: `{ format: string }`

## Code Layout
```
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/
├── index.html                   # Pure HTML5 entry point (zero build step)
├── css/
│   ├── main.css                 # Base resets, typography, layout grid, modals, drawers, format badges & filter tabs
│   ├── reader.css               # Reader stage, multi-column rules, tap zones, chrome, PDF visual stage
│   └── themes.css               # 10 Eye-comfort color themes & CSS custom properties
├── js/
│   ├── app.js                   # Application coordinator & router (Library <-> Reader)
│   ├── event-bus.js             # Pub/Sub event bus
│   ├── sample-book.js           # Built-in zero-network sample EPUB generator
│   ├── storage/
│   │   ├── db.js                # IndexedDB WebReaderDB V2 manager (metadata vs binary separation)
│   │   ├── settings-store.js    # LocalStorage synchronous settings (10 themes)
│   │   └── storage-manager.js   # Unified StorageManager facade
│   ├── parser/
│   │   ├── book-parser.js       # Master polymorphic BookParser factory
│   │   ├── epub-parser.js       # EPUB OCF/OPF coordinator
│   │   ├── pdf-parser.js        # PDF text extraction & structured chapter builder
│   │   ├── mobi-parser.js       # MOBI PalmDOC LZ77 decompressor & parser
│   │   ├── txt-parser.js        # Plain text paragraph & chapter detector
│   │   ├── markdown-parser.js   # Markdown GFM lexer & semantic HTML parser
│   │   ├── opf-parser.js        # OPF metadata, manifest & spine parser
│   │   ├── toc-parser.js        # EPUB 2 NCX & EPUB 3 Nav Document parser
│   │   ├── path-resolver.js     # Relative URI & zip path resolver
│   │   └── asset-extractor.js   # Universal DOMSanitizer, Blob URL generator & CSS rewriter
│   ├── reader/
│   │   ├── reader-engine.js     # Master reader controller, mode coordinator & deterministic teardown
│   │   ├── paginated-view.js    # CSS multi-column pagination & navigation math
│   │   ├── scroll-view.js       # Continuous vertical scroll manager
│   │   ├── pdf-visual-view.js   # PDF visual canvas renderer with zoom/fit & eye-comfort filter
│   │   └── position-tracker.js  # Progress calculation & anchor mapping
│   └── ui/
│       ├── library-view.js      # Library shelf, format badges, format filter tabs, drag-and-drop
│       ├── reader-chrome.js     # Header auto-hide, footer progress bar, 3-zone tap overlay, PDF visual toggle
│       ├── toc-drawer.js        # Nested TOC tree renderer & active highlight
│       ├── bookmarks-drawer.js  # Bookmarks drawer/tab & CRUD
│       ├── settings-panel.js    # 10-Theme selector & typography sliders
│       └── toast.js             # Accessible non-blocking notifications
├── vendor/
│   ├── jszip.min.js             # Standalone JSZip vendor library (zero build step)
│   ├── pdf.min.js               # Standalone Mozilla PDF.js vendor library
│   └── pdf.worker.min.js        # Standalone Mozilla PDF.js worker
└── test/
    ├── server.js                # Built-in static HTTP server runner (with .pdf MIME support)
    ├── e2e.test.js              # Comprehensive E2E test suite (Tiers 0-4)
    ├── challenger_storage.test.js # Storage V2 adversarial test suite
    └── challenger_m2_r2_adversarial.js # Parser security & memory test suite
```
