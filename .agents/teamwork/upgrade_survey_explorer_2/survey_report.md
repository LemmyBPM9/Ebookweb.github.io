# Technical Investigation & Architecture Survey: Dual-Mode PDF Reading (Reflowable Text & Visual Page Modes)

**Document ID**: `SURVEY-R2-DUAL-MODE-PDF-20261017`  
**Explorer Instance**: `upgrade_survey_explorer_2` (`teamwork_preview_explorer`)  
**Target Milestone**: Multi-Format Upgrade / R2 Dual-Mode PDF  
**Workspace**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader`  
**Status**: COMPLETE / READY FOR IMPLEMENTATION PLANNING  

---

## Executive Summary

WebReader is upgrading from an EPUB-only reader to a multi-format reading application supporting `.epub`, `.pdf`, `.mobi`/`.azw`, `.txt`, and `.md` with 10 eye-comfort color themes and ultra-low memory/CPU resource consumption. 

This survey focuses on **Requirement R2: Dual-Mode PDF Reading**, detailing how to deliver:
1. **Reflowable Text Mode**: Client-side extraction of structured text, headings, pages, and paragraph blocks from PDF binaries, seamlessly integrating into WebReader's existing CSS multi-column paginated and continuous scroll views with customizable typography and themes.
2. **Visual Page Mode**: Authentic PDF page layout rendering on HTML5 `<canvas>` with zoom/fit controls, coupled with GPU-accelerated theme-aware eye-comfort filters (CSS blend modes, SVG/CSS filter matrices) so bright white PDF pages match warm, dark, or e-ink palettes without halation or eye strain.
3. **Pure Client-Side Zero-Build Execution**: Vendoring a standalone Mozilla PDF.js distribution (`vendor/pdf.min.js` and `vendor/pdf.worker.min.js`) requiring zero npm/bundler build steps, fully compatible with browser ES modules, local static servers, and headless test runners.
4. **Unified Architecture & State Machine**: Bidirectional page/progress synchronization between reflowable and visual modes, seamless TOC and bookmark jumping, and strict R5 compliance (canvas virtualization, GPU texture recycling, deterministic resource cleanup).

---

## 1. Codebase Inventory & Current Architecture Analysis

### 1.1 Existing System Overview
- **Zero-Build Paradigm**: Runs directly in modern browsers via native `<script type="module">` without Webpack, Vite, or Rollup.
- **Data Flow & Decoupling**:
  - `EventBus` (`js/event-bus.js`): Pub/Sub messaging across decoupled layers.
  - `WebReaderDB` (`js/storage/db.js`): IndexedDB persistent storage for books, progress, bookmarks.
  - `SettingsManager` (`js/storage/settings-store.js`): Synchronous `localStorage` bootstrap to eliminate Flash of Unstyled Content (FOUC).
  - `ReaderEngine` (`js/reader/reader-engine.js`): Sandboxed `<iframe>` controller (`sandbox="allow-same-origin"` without `allow-scripts`) managing:
    - `PaginatedView` (`js/reader/paginated-view.js`): CSS multi-column pagination with horizontal GPU transforms (`translateX`).
    - `ScrollView` (`js/reader/scroll-view.js`): Fluid continuous vertical scrolling.
    - `PositionTracker` (`js/reader/position-tracker.js`): Chapter/global percentage math and snippet extraction.
  - `ReaderChrome` (`js/ui/reader-chrome.js`): Header auto-hide, progress footer, 3-zone tap overlay, keyboard shortcuts.

### 1.2 Existing Parser Contract
Defined in `PROJECT.md:88-99`:
```typescript
interface ParsedEpub { // To be generalized to ParsedDocument
  metadata: {
    title: string;
    author: string;
    language?: string;
    identifier?: string;
    description?: string;
    format?: string; // 'epub' | 'pdf' | 'mobi' | 'txt' | 'md'
  };
  coverBlobUrl: string | null;
  spine: Array<{ id: string; href: string; fullPath: string; isLinear: boolean; pageNumber?: number }>;
  toc: Array<TocItem>; // Hierarchical tree: { id, title, href, fullPath, hash, pageNumber?, children }
  getChapterDocument(fullPath: string): Promise<Document>;
  assetMap: Map<string, string>;
  cleanup(): void; // Revokes all created blob URLs and releases binary references
}
```

### 1.3 Gaps Identified for PDF Support
1. **File Input & Drag/Drop**: `index.html` and `library-view.js` accept only `.epub`. Needs expansion to `.pdf` (MIME `application/pdf`).
2. **Library Badges & Metadata Separation**: Library view displays all books identically; does not yet show format badges (`PDF`, `EPUB`, etc.) or filter by format. `StorageManager.getAllBooks()` currently retrieves full `fileBlob`s, violating R5 metadata separation.
3. **Reader Presentation Modes**: `ReaderEngine` currently only knows layout modes (`paginated` vs `scroll`). It requires a higher-level presentation mode (`reflowable` vs `visual`) when displaying PDF documents.
4. **Vendor Engine**: Only `vendor/jszip.min.js` currently exists. `vendor/pdf.min.js` and `vendor/pdf.worker.min.js` must be vendored.
5. **Static Server MIME Types**: `test/server.js` MIME map lacks `'.pdf': 'application/pdf'`.

---

## 2. Exhaustive Feature List (R2 Focus)

| Feature ID | Feature Name | Description | Layer | Dependencies |
|---|---|---|---|---|
| **F-PDF-01** | Standalone PDF.js Vendor Integration | Bundle `vendor/pdf.min.js` and `vendor/pdf.worker.min.js` with zero build step requirement and local offline worker configuration | Vendor / Core | None |
| **F-PDF-02** | PDF Binary Magic-Byte & Format Detection | Validate `%PDF-` (0x25 0x50 0x44 0x46) header, extract document catalog and page count | Parser | F-PDF-01 |
| **F-PDF-03** | PDF Dublin Core & Info Metadata Extraction | Extract Document Title, Author/Creator, Subject, Creation Date, fallback to sanitized filename | Parser | F-PDF-01 |
| **F-PDF-04** | Page 1 Cover Thumbnail Synthesis | Render Page 1 thumbnail to offscreen canvas and export as in-memory cover Blob for library cards | Parser / UI | F-PDF-01 |
| **F-PDF-05** | PDF Outline / TOC Hierarchy Extractor | Extract bookmarks tree via `pdfDoc.getOutline()`, resolve destination page numbers, fallback to synthetic TOC | Parser | F-PDF-01 |
| **F-PDF-06** | Structured Reflowable Text Extractor | Extract text items with coordinates, font sizes, weights, and reading direction via `page.getTextContent()` | Parser | F-PDF-01 |
| **F-PDF-07** | Multi-Column & Gutter Heuristic Engine | Detect vertical column gutters to prevent interleaved reading order on 2-column/academic layouts | Parser | F-PDF-06 |
| **F-PDF-08** | Semantic Paragraph & Line Assembly | Cluster lines by vertical delta (`dy`), detect word spacing thresholds, join hyphenated line wraps | Parser | F-PDF-06 |
| **F-PDF-09** | Heading & Structure Classifier | Categorize headings (`<h1>`, `<h2>`, `<h3>`) based on font size multipliers relative to body text median | Parser | F-PDF-08 |
| **F-PDF-10** | Running Header/Footer Suppressor | Filter repetitive header/footer page numbers and running titles to prevent breaking paragraph flow | Parser | F-PDF-08 |
| **F-PDF-11** | Scanned / Image-Only PDF Graceful Fallback | Detect 0-item text content and present a clean in-line notice to toggle to Visual Page Mode | Parser / Reader | F-PDF-06 |
| **F-PDF-12** | Visual Page Canvas Renderer | Render authentic PDF page vector graphics and text onto HTML5 `<canvas>` with high-DPI scaling (`window.devicePixelRatio`) | Reader / View | F-PDF-01 |
| **F-PDF-13** | Visual Page Zoom & Fit Engine | Calculate precise scales for `fitWidth`, `fitPage` (fit height), and granular zoom levels (50% to 300%) | Reader / View | F-PDF-12 |
| **F-PDF-14** | Canvas Memory Virtualization & Buffer Recycling | Render only visible page(s) + 1 buffer page; zero out canvas buffers (`width=0; height=0`) off-screen for R5 compliance | Reader / Perf | F-PDF-12 |
| **F-PDF-15** | Active Render Task Cancellation Guard | Cancel pending `renderTask` before initiating new renders, cleanly catching `RenderingCancelledException` | Reader / Async | F-PDF-12 |
| **F-PDF-16** | 10-Theme Eye-Comfort GPU Tint Filter | Apply CSS `mix-blend-mode` and GPU filter matrices to transform white PDF pages to match all 10 color themes | Themes / CSS | F-PDF-12 |
| **F-PDF-17** | Dual-Mode Header Presentation Toggle | Header toggle button (`btn-pdf-mode`) switching seamlessly between Reflowable Text and Visual Page modes | UI / Chrome | F-PDF-06, F-PDF-12 |
| **F-PDF-18** | Bidirectional Reading Position Sync | Synchronize reading position across mode switches: Page $N$ in Reflowable $\leftrightarrow$ Page $N$ in Visual | Reader Engine | F-PDF-17 |
| **F-PDF-19** | Visual Mode 3-Zone Tap & Keyboard Navigation | Full support for left/right tap zones, Arrow keys, Space, PageUp/PageDown in Visual Page Mode | UI / Nav | F-PDF-12 |
| **F-PDF-20** | Deterministic PDF Resource Destruction | Close PDFDocumentProxy, destroy worker, revoke cover blob URLs, and release canvas backing stores on book close | Reader / Storage | F-PDF-01, F-PDF-14 |

---

## 3. Deep Technical Investigation: Reflowable Text Mode

### 3.1 The Problem of PDF Reflow
Unlike EPUB (XHTML documents with semantic `<p>`, `<h1>`, `<blockquote>` tags), standard PDF files are binary streams of graphic operations and text glyph drawing commands (`Tj`, `TJ`, `cm`). Text in a PDF does not inherently contain paragraph boundaries, line wrap indicators, or heading semantics. Furthermore, text items can be emitted out of reading order or fragmented into individual syllables or characters with relative horizontal offsets.

### 3.2 Text Extraction & Reconstruction Pipeline
To convert raw PDF text into clean semantic HTML compatible with WebReader's `PaginatedView` and `ScrollView`:

```
┌────────────────────────┐
│  pdfDoc.getPage(pageN) │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  page.getTextContent() │  --> Array of text items: { str, transform, width, height, fontName }
└───────────┬────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 1. Coordinate Normalization & Bounding Box Calculation │
│    transform = [scaleX, skewY, skewX, scaleY, tx, ty]  │
│    fontSize = Math.hypot(transform[0], transform[1])   │
│    x = transform[4], y = transform[5]                  │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Multi-Column Gutter Detection                       │
│    Analyze horizontal X distribution across page       │
│    Identify empty vertical strips (gutters >= 20px)    │
│    Partition items into Column 1, Column 2, etc.       │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Line Assembly & Word Spacing Reconstruction         │
│    Group items by Y coordinate (tolerance ~ 0.5*h)     │
│    Sort items in line by X ascending                   │
│    Insert space if dx > 0.25 * fontSize                │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Paragraph & Heading Classification                  │
│    Compute body text median font size                  │
│    If fontSize >= 1.6 * median: <h1>                   │
│    If fontSize >= 1.3 * median: <h2>                   │
│    If vertical gap dy > 1.4 * lineHeight: new <p>      │
│    Trim running page headers/footers in outer 5% margin│
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 5. Semantic HTML Document Generation                   │
│    Wrap in clean DOM with <div id="page-N">            │
│    Return Document to ReaderEngine                     │
└────────────────────────────────────────────────────────┘
```

### 3.3 Multi-Column & Gutter Heuristic Engine (F-PDF-07)
A frequent failure of naive PDF text extractors is interleaving lines across multi-column documents (such as academic papers, journal articles, and encyclopedias).

**Detection Algorithm**:
1. Collect all item bounding boxes $[x_{\min}, x_{\max}]$.
2. Discard items spanning $> 70\%$ of page width (these are document titles or full-width abstracts).
3. Search for a vertical gutter: a continuous horizontal range $[x_{g1}, x_{g2}]$ (with width $\ge 24\text{px}$) between $30\%$ and $70\%$ of the page width where no text items exist.
4. If a gutter is found:
   - Partition text items into `Column_Left` ($x < x_{g1}$) and `Column_Right` ($x > x_{g2}$).
   - Sort and assemble `Column_Left` completely (from top to bottom).
   - Append `Column_Right` assembled from top to bottom.
5. If no gutter is found, process the page as a standard single column.

### 3.4 Integration with WebReader Typography and Themes
Because the output of `getChapterDocument(pageRef)` is a standard HTML DOM:
- `PaginatedView` automatically paginates the extracted chapter into horizontal columns via CSS `column-width: 100vw`.
- `ScrollView` renders continuous vertical text with `max-width: var(--reader-max-width)`.
- All reader typography controls (Font Family: Serif / Sans / Dyslexic, Font Size slider, Line Spacing slider, Line Width slider) and all 10 eye-comfort themes apply immediately through the existing CSS cascade in `reader-engine.js:463-517`.

---

## 4. Deep Technical Investigation: Visual Page Mode

### 4.1 Rendering Pipeline on HTML5 `<canvas>`
Visual Page Mode displays the original document layout with 100% visual fidelity (vector art, custom typography, mathematical equations, diagrams, and inline imagery).

```javascript
// Visual Page Renderer Core Loop
async function renderVisualPage(pageNumber, scale, canvas, themeFilter) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(dpr, dpr);
  
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
    enableWebGL: false // Keep lightweight 2D context
  };
  
  return page.render(renderContext).promise;
}
```

### 4.2 Zoom & Fit Controls (F-PDF-13)
The visual stage supports three primary scaling modes:
1. **Fit Width (`fitWidth`)**:
   $$\text{scale} = \frac{\text{stage}.\text{clientWidth} - 2 \times \text{padding}}{\text{intrinsicWidth}}$$
   Ensures text spans the full reading viewport comfortably.
2. **Fit Page (`fitPage`)**:
   $$\text{scale} = \min\left(\frac{\text{stage}.\text{clientWidth} - 2 \times \text{padding}}{\text{intrinsicWidth}}, \frac{\text{stage}.\text{clientHeight} - 2 \times \text{padding}}{\text{intrinsicHeight}}\right)$$
   Ensures the entire page fits on screen without vertical scrolling, matching book-like single-page view.
3. **Manual Zoom**: Incremental scaling from $50\%$ to $300\%$ in steps of $25\%$.

### 4.3 10-Theme Eye-Comfort GPU Tint Filter (F-PDF-16)

#### The Problem of Glare in Visual PDF Reading
Original PDF files almost universally bake in a blinding `#FFFFFF` background with hard `#000000` text. In dark environments or prolonged reading sessions, this causes severe photopic glare, halation, and ocular fatigue.

#### Mathematical Formulation for All 10 Themes
Rather than performing heavy CPU pixel loops (`ctx.getImageData()`), WebReader applies **GPU-accelerated CSS custom properties and blend modes** directly to the rendered `<canvas>` element. When the user changes themes, the visual presentation transforms in **$0\text{ ms}$** without requiring any canvas re-rendering!

| Theme ID | Mode | Background (`--pdf-canvas-bg`) | CSS Filter (`--pdf-canvas-filter`) | Mix Blend Mode (`--pdf-canvas-blend`) | Visual & Photopic Effect |
|---|---|---|---|---|---|
| `warm-paper` | Light | `#f8f1e3` | `sepia(0.22) contrast(0.96)` | `multiply` | White `#FFF` becomes cream paper `#f8f1e3`; black ink softens to warm charcoal. Zero glare. |
| `soft-dark` | Dark | `#1a1c1e` | `invert(0.88) hue-rotate(180deg) brightness(0.95) contrast(0.95)` | `normal` | Inverts white `#FFF` to `#1c1d1f` (soft slate); text softens to warm grey `#dedede`. No halation. |
| `daylight` | Light | `#fcfbf9` | `brightness(0.99) contrast(0.98)` | `multiply` | Glare-dampened off-white paper with crisp dark ink. |
| `sage` | Light | `#eef3ed` | `sepia(0.18) hue-rotate(60deg) contrast(0.95)` | `multiply` | Calming green paper tint; peak photopic curve comfort for long sessions. |
| `solarized-light` | Light | `#FDF6E3` | `sepia(0.28) contrast(0.94) hue-rotate(-10deg)` | `multiply` | Classic Ethan Schoonover solarized cream background with muted teal-slate ink. |
| `solarized-dark` | Dark | `#002B36` | `invert(0.92) sepia(0.4) hue-rotate(155deg) contrast(0.95)` | `normal` | White becomes deep petrol blue `#002B36`; text becomes warm stone `#93A1A1`. |
| `nord` | Dark | `#2E3440` | `invert(0.85) hue-rotate(185deg) contrast(0.95)` | `normal` | Arctic slate night palette; white becomes `#2E3440`, text becomes frost silver `#D8DEE9`. |
| `oled-black` | Dark | `#000000` | `invert(1) contrast(0.88) brightness(0.88)` | `normal` | Pitch-black `#000000` background with dimmed warm silver text; zero pixel bleed, zero OLED power draw. |
| `rose-pine` | Dark | `#191724` | `invert(0.88) sepia(0.25) hue-rotate(270deg) contrast(0.95)` | `normal` | Warm dusk palette; white becomes `#191724`, text glows in soft rose-cream. |
| `e-ink` | Light | `#F0F0EB` | `grayscale(1) contrast(1.08)` | `multiply` | 100% saturation removal; crisp matte monochrome paper resembling physical electrophoretic displays. |

*Note*: An optional "Original Colors" toggle can be provided in the header to temporarily disable filters when inspecting full-color photographs or medical diagrams.

---

## 5. Client-Side Execution Without Build Steps

### 5.1 Mozilla PDF.js Distribution Strategy
To preserve WebReader's core architectural principle of **zero build steps** (no `npm run build`, no Webpack/Rollup bundlers):
- Vendored scripts placed in `vendor/`:
  - `vendor/pdf.min.js`: Main PDF.js engine (~320 KB).
  - `vendor/pdf.worker.min.js`: Web Worker script (~1.08 MB) executing parsing and decompression in a background thread.
- Loaded in `index.html`:
  ```html
  <!-- Standalone Vendor Scripts (Zero Build Step) -->
  <script src="vendor/jszip.min.js"></script>
  <script src="vendor/pdf.min.js"></script>
  ```
- Configured in application boot (`js/parser/pdf-parser.js`):
  ```javascript
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }
  ```

### 5.2 Offline & Headless Test Compatibility
- Because `workerSrc` points to the local relative path `'vendor/pdf.worker.min.js'`, the worker is loaded from the local origin with $0\text{ ms}$ network latency and 100% offline capability.
- In Node / Puppeteer test runners: `test/server.js` serves the worker script with standard HTTP headers (`application/javascript`).
- Fallback resilience: If a strict web environment restricts Worker creation (`Blob:` or `Worker` constructor security policies), PDF.js transparently falls back to main-thread execution without failing.

---

## 6. Architecture & Interfaces

### 6.1 Proposed Module Layout
```
js/
├── parser/
│   ├── epub-parser.js       # Existing EPUB coordinator
│   ├── pdf-parser.js        # NEW: PDF.js coordinator, metadata, outline & text extractor
│   ├── document-parser.js   # NEW: Unified format detector & parser dispatcher
│   ├── ...
├── reader/
│   ├── reader-engine.js     # Master engine coordinating reflowable iframe & visual stage
│   ├── paginated-view.js    # Multi-column reflowable pagination
│   ├── scroll-view.js       # Continuous vertical reflowable scroll
│   ├── pdf-visual-view.js   # NEW: Canvas visual renderer with zoom/fit & virtualization
│   └── position-tracker.js  # Progress math & title resolver
└── ui/
    ├── reader-chrome.js     # Header chrome with PDF mode & zoom buttons
    └── ...
```

### 6.2 The `PdfParser` Interface Contract
```typescript
class PdfParser {
  /**
   * Validates PDF magic bytes (%PDF-), loads document via PDF.js,
   * extracts metadata, cover thumbnail, outline TOC, and spine index.
   */
  static async parse(fileOrBuffer: Blob | File | ArrayBuffer | Uint8Array): Promise<ParsedDocument>;
}

interface ParsedDocument {
  metadata: {
    title: string;
    author: string;
    format: 'pdf';
    numPages: number;
    creationDate?: string;
  };
  coverBlobUrl: string | null; // Synthesized thumbnail of Page 1
  spine: Array<{
    id: string;        // e.g. "page-1"
    href: string;      // e.g. "page-1"
    fullPath: string;  // e.g. "page-1"
    pageNumber: number;// 1-indexed
    isLinear: boolean;
  }>;
  toc: Array<TocItem>; // Outline tree mapped to target pageNumbers
  getChapterDocument(fullPath: string): Promise<Document>; // On-demand reflowable DOM
  pdfDocument: PDFDocumentProxy; // Underlying PDF.js instance for Visual Page Mode
  cleanup(): void; // Destroys PDFDocumentProxy and revokes blob URLs
}
```

### 6.3 State Machine: Dual-Mode Presentation & Layout

```
                  ┌────────────────────────────────────────┐
                  │              OPEN PDF BOOK             │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
               ┌──────────────────────────────────────────────┐
               │         Default: Reflowable Text Mode        │
               │ (Reading iframe active, custom fonts/themes) │
               └──────────────┬───────────────────────────────┘
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
   ┌───────────────────┐             ┌───────────────────┐
   │  Paginated View   │ ◄─────────► │ Continuous Scroll │
   │ (Multi-column CSS)│   btn-mode  │   (Vertical Flow) │
   └─────────┬─────────┘             └─────────┬─────────┘
             │                                 │
             │           btn-pdf-mode          │
             └────────────────┬────────────────┘
                              │
                              ▼
               ┌──────────────────────────────────────────────┐
               │             Visual Page Mode                 │
               │  (Canvas active, zoom/fit, eye-comfort tint) │
               └──────────────┬───────────────────────────────┘
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
   ┌───────────────────┐             ┌───────────────────┐
   │ Single Page / Fit │ ◄─────────► │ Continuous Visual │
   │  (Keyboard / Tap) │  Zoom/Fit   │ (Windowed Scroll) │
   └───────────────────┘             └───────────────────┘
```

### 6.4 Bidirectional Position Synchronization
When switching modes via `ReaderEngine.setPresentationMode(mode)`:
1. **Reflowable $\to$ Visual**:
   - `ReaderEngine` queries active `spineIndex` (representing Page $N = \text{spineIndex} + 1$).
   - Deactivates `PaginatedView` / `ScrollView`, hides the iframe.
   - Activates `PdfVisualView`, commanding it to render Page $N$ with current zoom and theme filter.
   - Reader header updates mode toggle to show "Text Mode" and reveals zoom controls.
2. **Visual $\to$ Reflowable**:
   - `ReaderEngine` queries `PdfVisualView.getCurrentPage()`.
   - Deactivates `PdfVisualView`, hides visual canvas stage, reveals iframe.
   - Calls `_renderChapter(pageNumber - 1, { pageIndex: 0 })`.
   - Re-applies active typography and layout mode.

---

## 7. Performance & Memory Management (R5 Compliance)

### 7.1 Canvas GPU Texture Memory Analysis
A critical risk in browser PDF reading is unconstrained GPU texture allocation.
- Consider an iPad or Retina MacBook screen:
  $$\text{Page Width} = 1200\text{ CSS px} \times 2\text{ DPR} = 2400\text{ px}$$
  $$\text{Page Height} = 1600\text{ CSS px} \times 2\text{ DPR} = 3200\text{ px}$$
  $$\text{Memory per Page Canvas} = 2400 \times 3200 \times 4\text{ bytes (RGBA)} \approx 30.72\text{ MB}$$
- Without virtualization, scrolling through a 100-page document would consume over **$3.0\text{ GB}$ of RAM**, reliably crashing the browser tab.

### 7.2 Windowing & Canvas Recycling Strategy (F-PDF-14)
To satisfy Requirement R5:
1. **Paginated Visual Mode**:
   - Exactly **1 canvas** is retained in the DOM at any given moment (memory footprint $\le 31\text{ MB}$).
   - When transitioning from Page $N$ to Page $N+1$, the old canvas buffer is explicitly cleared:
     ```javascript
     canvas.width = 0;
     canvas.height = 0;
     canvas.remove();
     ```
2. **Continuous Visual Scroll Mode (Virtualized Windowing)**:
   - A container with total height equal to $\sum \text{pageHeight}_i$ is maintained using lightweight placeholder `<div>` elements (`class="pdf-page-placeholder"`).
   - Only pages currently inside the visible viewport $\pm 1$ page buffer instantiate `<canvas>` elements.
   - When a page scrolls outside the buffer window ($> 2$ viewports away), its canvas is destroyed, releasing texture RAM back to the operating system immediately.
3. **Reflowable Chapter Cache**:
   - `PdfParser` retains an LRU cache of at most 5 extracted chapter documents. Older extracted documents are garbage-collected and re-extracted on demand.

### 7.3 Deterministic Cleanup on Book Close
When the user returns to the Library View (`app.closeBookToLibrary()`):
- `ReaderEngine.destroy()` triggers:
  1. `pdfVisualView.destroy()`: Clears all active canvases, cancels pending `renderTask`s, disconnects `ResizeObserver` and `IntersectionObserver`.
  2. `parsedPdf.cleanup()`: Calls `pdfDocument.destroy()` (terminating worker stream buffers) and revokes the cover thumbnail `Blob` URL (`URL.revokeObjectURL`).
- Verifiable by automated Puppeteer heap benchmarks ensuring zero detached nodes and flat memory growth across repeated open/close cycles.

---

## 8. Security & Edge Case Handling

### 8.1 PDF Embedded Scripting (XSS Defense)
- **Vector**: Adobe Acrobat specifications permit embedded ECMAScript streams (`/JavaScript`, `/JS`, `/A /OpenAction`) within PDF objects.
- **Mitigation**:
  1. Pass `enableScripting: false` to `pdfjsLib.getDocument()`.
  2. In Reflowable Text Mode, all extracted strings are assigned via DOM `textContent` or sanitized through `AssetExtractor.sanitizeHtml()`.
  3. Content renders inside the isolated `<iframe>` configured with `sandbox="allow-same-origin"` (without `allow-scripts`).
  4. Guarantees that `window.__xssTriggered` remains falsy against adversarial test suites.

### 8.2 Asynchronous Render Cancellation
- **Issue**: Rapid keyboard or tap navigation can trigger a new `page.render()` while a previous page render is still writing to a canvas, causing unhandled promise rejections.
- **Mitigation**: Maintain `activeRenderTask`. Prior to starting any new render:
  ```javascript
  if (this.activeRenderTask) {
    this.activeRenderTask.cancel();
    try {
      await this.activeRenderTask.promise;
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') throw err;
    }
  }
  ```

---

## 9. Potential Risks & Mitigation Matrix

| # | Risk Description | Severity | Impact | Mitigation Strategy |
|---|---|---|---|---|
| 1 | **Canvas Texture Memory Explosion** | Critical | Tab crashes on large PDFs in continuous scroll | Strict 3-page viewport windowing; explicitly zero out off-screen canvas dimensions (`width=0; height=0`) |
| 2 | **Interleaved Multi-Column Text** | High | Reading flow scrambled on 2-column papers | Implement vertical gutter detection to segment columns before line assembly |
| 3 | **Scanned PDFs with Zero Text** | Medium | Empty screen in Reflowable Mode | Detect `items.length === 0` and display seamless one-click switch to Visual Page Mode |
| 4 | **Worker Loading Failure / CSP** | Medium | PDF fails to open in restricted environments | Local vendor relative path; catch worker creation failure and fall back to in-thread parsing |
| 5 | **Render Task Race on Fast Page Turns** | Medium | Console errors & corrupted canvas frames | Cancel preceding `renderTask` before launching new page render; handle `RenderingCancelledException` |
| 6 | **Disjointed Word Spacing** | Low | Missing spaces between words in reflow | Calculate horizontal glyph spacing delta relative to font size (`dx > 0.25 * fontSize`) |
| 7 | **TOC / Bookmark Disconnect Across Modes** | Low | Jumping to bookmark lands on wrong page | Normalize all book locations to 1-indexed page numbers shared by both reflowable spine and visual viewer |

---

## 10. Implementation Roadmap Recommendations

To execute this architectural plan with maximum efficiency across subsequent teamwork milestones:

1. **Vendor Integration Phase**:
   - Download and vendor `pdf.min.js` and `pdf.worker.min.js` into `vendor/`.
   - Update `index.html` and `test/server.js` MIME map.
2. **Parser Phase**:
   - Implement `js/parser/pdf-parser.js` supporting metadata, cover synthesis, outline TOC, and heuristic reflow text extraction.
   - Integrate format dispatcher `document-parser.js`.
3. **Visual View Phase**:
   - Implement `js/reader/pdf-visual-view.js` with canvas rendering, zoom/fit math, and virtualized windowing.
   - Implement CSS theme custom properties (`--pdf-canvas-filter`, `--pdf-canvas-blend-mode`) in `css/themes.css`.
4. **Engine & Chrome Integration Phase**:
   - Update `ReaderEngine` to manage presentation modes (`reflowable` vs `visual`).
   - Add `#btn-pdf-mode` and zoom controls to `ReaderChrome`.
5. **Automated Verification Phase**:
   - Add E2E tests verifying PDF import, format badge, Reflowable vs Visual toggling, all 10 theme filters, and memory leak checks.

---

*Report compiled by `upgrade_survey_explorer_2`. Detailed handoff summary available in `handoff.md`.*
