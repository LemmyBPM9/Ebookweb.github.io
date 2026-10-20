# WebReader — Minimal, Modern, Ultra-Lightweight Multi-Format E-Book & Document Reader

**WebReader** is a zero-build, pure client-side multi-format e-book and document reader built with vanilla HTML5, CSS3, and ES6+ JavaScript. It supports **EPUB (`.epub`)**, **PDF (`.pdf` — both Reflowable Text & Visual Page modes)**, **MOBI / AZW (`.mobi`, `.azw`)**, **Plain Text (`.txt`)**, and **Markdown (`.md`)** with **10 WCAG AAA eye-comfort color themes** and an ultra-low memory & CPU architecture.

---

## Quick Start

Start the built-in zero-dependency static HTTP server (or Python's `http.server`):

```bash
python3 -m http.server 8080 --bind 127.0.0.1
# or:
node test/server.js --port=8080
```

Then open **`http://localhost:8080`** in any modern browser.

---

## Key Features

### 1. Multi-Format Support & Polymorphic Parser Factory
Drop or select any supported file format in the library view:
- **EPUB 2 & EPUB 3 (`.epub`)**: Full OCF/OPF package parsing, Dublin Core metadata, cover image cascade, hierarchical NCX & EPUB 3 `<nav epub:type="toc">`, and relative image/SVG/CSS Blob URL rewriting.
- **PDF (`.pdf`) — Dual Reading Modes**:
  - **Reflowable Text Mode**: Extracts headings, paragraphs, and multi-column text streams into clean semantic HTML that adapts to your chosen typeface, font size, line height, and Paginated or Scroll view.
  - **Visual Page Mode**: High-DPI HTML5 `<canvas>` rendering with zoom controls (`Zoom In`, `Zoom Out`, `Fit Width`, `Fit Page`) and theme-aware eye-comfort canvas rendering so dark/tinted themes never blind you with harsh `#ffffff` page backgrounds.
- **MOBI / Kindle (`.mobi`, `.azw`)**: Pure client-side PalmDOC LZ77 decompression (with trailing multibyte/varint entry stripping), Record 0 & EXTH metadata extraction, `<mbp:pagebreak>` / heading chapter splitting, and TOC generation.
- **Plain Text (`.txt`)**: Intelligent double-newline paragraph grouping, automatic chapter/part heading detection (`Chapter N`, `Part I`, etc.), and synthetic Table of Contents generation.
- **Markdown (`.md`)**: GitHub Flavored Markdown (GFM) parser rendering ATX headings (`#`–`######`), bulleted/numbered lists, blockquotes, fenced code blocks, and tables into semantic HTML with slugified section anchors and nested TOC hierarchy.
- **Format Badges & Instant Library Filtering**: Every library card displays its format badge (`EPUB`, `PDF`, `MOBI`, `TXT`, `MD`), and the header filter bar lets you filter your shelf by format (`All`, `EPUB`, `PDF`, `MOBI`, `TXT`, `MD`) with instant ARIA-accessible switching.

### 2. 10 WCAG AAA Eye-Comfort Reading Themes
All **10 low-glare reading palettes** exceed WCAG AAA contrast standards ($\ge 7.0:1$, ranging from **10.84:1** to **15.80:1**) with zero Flash of Unstyled Content (zero-FOUC synchronous `<head>` bootstrap):

| Theme ID | Display Name | Background | Primary Ink | Contrast Ratio | Category |
|----------|--------------|------------|-------------|----------------|----------|
| `warm-paper` | **Warm Paper (Sepia)** *(Default)* | `#f8f1e3` | `#2c2523` | **13.38 : 1** | Light / Warm |
| `soft-dark` | **Soft Dark (Night)** | `#1a1c1e` | `#e2e2e0` | **13.17 : 1** | Dark (Zero Halation) |
| `daylight` | **Daylight (Clean Light)** | `#fcfbf9` | `#1e2022` | **15.80 : 1** | Light / Crisp |
| `sage` | **Sage (Forest Calm)** | `#eef3ed` | `#1c2820` | **13.60 : 1** | Light / Tinted |
| `solarized-light` | **Solarized Light** | `#fdf6e3` | `#202b30` | **13.21 : 1** | Light / Warm |
| `solarized-dark` | **Solarized Dark** | `#002b36` | `#d8e2e0` | **11.98 : 1** | Dark / Teal |
| `nord` | **Nord (Arctic Dark)** | `#242933` | `#eceff4` | **12.50 : 1** | Dark / Cool Slate |
| `oled-black` | **OLED Pitch Black** | `#000000` | `#d4d4d4` | **14.13 : 1** | Dark / True OLED |
| `rose-pine` | **Rosé Pine Dawn** | `#faf4ed` | `#282433` | **13.65 : 1** | Light / Botanical |
| `e-ink` | **High-Contrast E-Ink** | `#f4f4f2` | `#111111` | **16.82 : 1** | Monochrome E-Ink |

### 3. Ultra-Low Memory Footprint & Zero-Idle CPU Optimizations
- **Two-Tier IndexedDB Storage (`WebReaderDB` V2)**: Separates lightweight book metadata (`books` store) from raw binary payloads (`book_files` store). Loading the library shelf via `StorageManager.getAllBooks()` reads **0 bytes** of book binaries into RAM; binary payloads are fetched strictly on-demand when opening a book.
- **Single Active Chapter / Canvas Virtualization**: Only the currently active chapter (or active PDF page canvas) is mounted in the DOM. Switching chapters or closing a book deterministically zeros out canvas bitmaps (`canvas.width = 0; canvas.height = 0`) and detaches nodes.
- **Deterministic Blob URL Lifecycle**: Every generated `blob:` URL (both inside chapters and temporary cover thumbnails in the library grid) is tracked and revoked via `URL.revokeObjectURL()` as soon as the image finishes decoding or when the book is closed (`ReaderEngine.unloadBook()` / `destroy()`).
- **Zero-Idle CPU & Passive Listeners**: Uses `{ passive: true }` on scroll and touch listeners, debounces progress persistence, and avoids background polling timers when idle.

### 4. Real-Time Typography, TOC, Bookmarks & Security Sandbox
- **8 Book Typefaces & Advanced Typography Controls (`Aa`)**:
  - **8 Curated Typefaces**: `Classic Serif`, `Literata` (E-Book Serif), `Merriweather` (Screen Serif), `Lora` (Calligraphic), `EB Garamond` (Classic Literary), `Crimson Pro` (Old-Style Book), `Sans-Serif`, and `Dyslexic` (`OpenDyslexic`), loaded via Google Fonts with instant local system fallbacks and `font-size-adjust: from-font` visual stability.
  - **Advanced Typography Sliders & Alignment**: Real-time adjustments for font size (`14px`–`32px`), font weight (`300 Light`–`700 Bold`), text alignment (`Left Aligned` with `text-wrap: pretty` or `Justified` with automatic `hyphens: auto`), line spacing (`1.30`–`2.40`), paragraph spacing (`0.50em`–`2.50em`), letter spacing (`-0.03em`–`0.15em`), word spacing (`0.00em`–`0.30em`), line width (`540px`–`1000px`), and a one-click **Reset Typography Defaults** button.
- **Nested TOC & Bookmarks Drawer**: Multi-level chapter hierarchy with active indicator, internal `#anchor` jumping, and one-click bookmarks with text snippets.
- **Universal `DOMSanitizer` & Sandbox**: Sanitizes untrusted markup across all 5 formats (stripping `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, inline `on*` handlers, and `javascript:`/`vbscript:`/`data:text/html` URIs) and isolates reflowable content inside `<iframe sandbox="allow-same-origin">` (without `allow-scripts`).

---

## Project Structure

```text
webreader/
├── index.html                        # Pure HTML5 application entry point (zero-FOUC 10-theme bootstrap)
├── css/
│   ├── themes.css                    # 10 WCAG AAA eye-comfort color themes & CSS variables
│   ├── main.css                      # Base styles, library grid, format badges, filter bar, drawers
│   └── reader.css                    # Reader viewport, sandboxed iframe, PDF visual stage, chrome
├── js/
│   ├── app.js                        # Main coordinator & router (Library View <-> Reader View)
│   ├── event-bus.js                  # Pub/Sub EventBus with error isolation & unsubscribe closures
│   ├── sample-book.js                # Zero-network programmatic sample EPUB 2/3 generator
│   ├── storage/
│   │   ├── db.js                     # IndexedDB V2 (books metadata store + book_files binary store)
│   │   ├── settings-store.js         # Synchronous localStorage manager for 10 themes & typography
│   │   └── storage-manager.js        # Unified StorageManager facade
│   ├── parser/
│   │   ├── book-parser.js            # Polymorphic BookParser factory (EPUB, PDF, MOBI/AZW, TXT, MD)
│   │   ├── epub-parser.js            # EPUB 2/3 OCF/OPF parser coordinator
│   │   ├── pdf-parser.js             # Client-side PDF 1.4-1.7 parser (FlateDecode, text & visual data)
│   │   ├── mobi-parser.js            # PalmDOC LZ77 decompressor & MOBI/EXTH chapter parser
│   │   ├── txt-parser.js             # Plain text paragraph & chapter heading detector
│   │   ├── markdown-parser.js        # GitHub Flavored Markdown (GFM) parser & TOC builder
│   │   ├── opf-parser.js             # container.xml, OPF metadata, manifest, spine & cover cascade
│   │   ├── toc-parser.js             # Dual EPUB 3 Nav Document & EPUB 2 NCX TOC parser
│   │   ├── path-resolver.js          # RFC 3986 relative path resolver & Zip-Slip guard
│   │   └── asset-extractor.js        # Universal DOMSanitizer, Blob URL manager & CSS rewriter
│   ├── reader/
│   │   ├── reader-engine.js          # Master reader controller, dual PDF mode & deterministic teardown
│   │   ├── paginated-view.js         # CSS multi-column pagination & subpixel-safe page math
│   │   ├── scroll-view.js            # Continuous vertical scroll manager
│   │   ├── pdf-visual-view.js        # HTML5 <canvas> PDF page renderer with zoom/fit & theme filter
│   │   └── position-tracker.js       # Chapter/book progress calculator & snippet extractor
│   └── ui/
│       ├── library-view.js           # Bookshelf grid, format badges, format filter bar & drag-and-drop
│       ├── reader-chrome.js          # Header/footer chrome, PDF mode toggle, 3-zone tap & shortcuts
│       ├── toc-drawer.js             # Nested TOC tree & Bookmarks drawer tabs
│       ├── bookmarks-drawer.js       # Bookmark creation, listing, jump & deletion
│       ├── settings-panel.js         # 10-Theme radiogroup swatches & typography sliders
│       └── toast.js                  # Accessible non-blocking toast notifications
├── vendor/
│   └── jszip.min.js                  # Vendored standalone JSZip (zero build step)
└── test/
    ├── server.js                     # Zero-dependency Node.js static HTTP server
    ├── e2e_upgrade.test.js           # Multi-Format, 10-Theme, Dual-PDF & 10x Memory Leak E2E Suite (20 tests)
    ├── e2e.test.js                   # Core EPUB Requirements E2E Suite (21 tests)
    ├── challenger_storage.test.js    # Storage concurrency, cascade delete & theme transition suite (22 tests)
    ├── challenger_storage_v2_adversarial.test.js # IndexedDB V2 binary/metadata isolation suite (19 tests)
    ├── challenger_m1_adversarial.js  # Multi-format validation & XSS sanitizer suite (13 tests)
    ├── challenger_m1_r2_adversarial.js # Deep DOMSanitizer & format routing adversarial suite (19 tests)
    ├── challenger_m2_r2_adversarial.js # EPUB parser security, deep TOC & Blob memory audit (4 suites)
    ├── challenger_filter_bar_adversarial.test.js # Format filter bar & ARIA radiogroup suite (47 tests)
    ├── challenger_m2_themes_zero_fouc.test.js # 10-theme WCAG AAA contrast & zero-FOUC suite (62 tests)
    ├── challenger_theme_stress.test.js # Rapid theme switching & persistence stress suite (135 tests)
    └── test-fixtures/                # Synthetic multi-format fixture generator (.epub, .pdf, .mobi, .txt, .md)
```

---

## Running the Automated Verification Suites

```bash
# 1. Multi-Format Upgrade, 10 Themes, Dual-Mode PDF & 10x Memory Leak E2E Suite (20 tests)
node test/e2e_upgrade.test.js

# 2. Core EPUB Requirements E2E Suite (21 tests)
node test/e2e.test.js

# 3. Adversarial Storage V2, Multi-Format Sanitizer & Theme Stress Suites
node test/challenger_storage.test.js
node test/challenger_storage_v2_adversarial.test.js
node test/challenger_m1_adversarial.js
node test/challenger_m1_r2_adversarial.js
node test/challenger_m2_r2_adversarial.js
node test/challenger_filter_bar_adversarial.test.js
node test/challenger_m2_themes_zero_fouc.test.js
node test/challenger_theme_stress.test.js
```
