# WebReader E2E Test Infrastructure Specification

## 1. Overview & Architecture

The WebReader E2E Test Infrastructure provides an automated, requirement-driven, opaque-box testing harness designed to verify all functional, ergonomic, typographic, and persistence acceptance criteria of the WebReader application with **zero build step**.

```
+---------------------------------------------------------------------------------+
|                                 TEST HARNESS                                    |
|                               (test/e2e.test.js)                                |
+-----------------------+---------------------------------+-----------------------+
                        |                                 |
                        v                                 v
         +------------------------------+  +-------------------------------+
         |    Headless Google Chrome    |  |       Static HTTP Server      |
         |       (puppeteer-core)       |  |        (test/server.js)       |
         | /Applications/Google Chrome  |  |   node:http, node:fs, node:path|
         +--------------+---------------+  +---------------+---------------+
                        |                                  |
                        +----------------+-----------------+
                                         |
                                         v
                         +-------------------------------+
                         |    WebReader Application      |
                         |   (Pure HTML5, CSS3, ES6 JS)  |
                         |  Library View <-> Reader View |
                         +-------------------------------+
                                         ^
                                         |
                         +---------------+---------------+
                         |       Synthetic Fixtures      |
                         |      (test/test-fixtures/)    |
                         |   valid, empty-title, corrupt |
                         +-------------------------------+
```

### Core Design Principles:
1. **Opaque-Box Verification**: Tests interact strictly via public user interfaces (clicking buttons, pressing keyboard shortcuts, uploading files, reading rendered DOM text and computed styles) without coupling to internal private state.
2. **Deterministic & Isolated**: Each test runs in a fresh, isolated browser context with dedicated viewport (`1280x800`) and fresh IndexedDB/localStorage storage boundaries.
3. **Zero Build Step Alignment**: Test scripts and the static server use standard Node.js built-ins (`node:http`, `node:fs`, `node:path`, `node:zlib`) and `puppeteer-core` driving the local Google Chrome binary (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).
4. **Console & Error Zero-Tolerance**: All tests monitor `page.on('console')` and `page.on('pageerror')`. Any uncaught JavaScript exception or unexpected console error immediately fails the test.

---

## 2. Server Module (`test/server.js`)

A lightweight, standalone static HTTP server implemented entirely with Node.js built-in modules.

### Capabilities:
- **Port Management**: Serves on port `3000` by default; supports `--port=<number>`, `PORT` environment variable, or automatic dynamic port binding (`port: 0`) when port 3000 is occupied.
- **Strict MIME Type Resolution**:
  | Extension | MIME Media Type |
  |-----------|-----------------|
  | `.html`, `.htm` | `text/html; charset=utf-8` |
  | `.xhtml` | `application/xhtml+xml; charset=utf-8` |
  | `.css` | `text/css; charset=utf-8` |
  | `.js`, `.mjs` | `application/javascript; charset=utf-8` |
  | `.json` | `application/json; charset=utf-8` |
  | `.svg` | `image/svg+xml` |
  | `.png` | `image/png` |
  | `.jpg`, `.jpeg` | `image/jpeg` |
  | `.epub` | `application/epub+zip` |
  | `.xml` | `application/xml; charset=utf-8` |
  | `.ncx` | `application/x-dtbncx+xml; charset=utf-8` |
  | `.woff`, `.woff2`, `.ttf`, `.otf` | Standard font media types |
- **Security Sandboxing**: Resolves requested paths against `PROJECT_ROOT` and rejects path traversal (`../`) attempts with `403 Forbidden`.
- **CORS & Cache Control**: Sets `Access-Control-Allow-Origin: *` and `Cache-Control: no-cache, no-store, must-revalidate` to ensure deterministic test execution.
- **Dual Execution Modes**:
  - CLI: `node test/server.js [--port 3000]`
  - Programmatic API: `const { startServer } = require('./server.js'); const { url, close } = await startServer();`

---

## 3. Synthetic Test Fixtures (`test/test-fixtures/`)

To test file ingestion, parsing, error handling, and corner cases without external network dependencies, a native zero-dependency ZIP archive builder (`test/test-fixtures/zip-helper.js`) generates synthetic EPUB archives:

1. **`valid-sample.epub`**:
   - Valid OCF EPUB 3/2 container structure (`mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`).
   - Dual Table of Contents: EPUB 3 Navigation Document (`nav.xhtml`) and EPUB 2 NCX (`toc.ncx`).
   - 3 rich chapters (`ch1.xhtml`, `ch2.xhtml`, `ch3.xhtml`) with nested headings and multiple paragraphs to test multi-column pagination and continuous scroll.
   - SVG cover jacket and external stylesheet (`style.css`).
2. **`empty-title.epub`**:
   - Valid EPUB archive where `<dc:title>` contains only whitespace.
   - Used in Tier 2 to verify that the application falls back gracefully to `"Untitled Book"` or filename rather than crashing or showing `"undefined"`.
3. **`corrupted.epub`**:
   - Malformed binary containing non-ZIP garbage bytes.
   - Used in Tier 2 to verify that invalid files are rejected with a non-blocking error toast and zero page crash.

Fixtures are automatically generated on test suite startup via `test/test-fixtures/generate-fixtures.js`.

---

## 4. Test Matrix & 4-Tier Methodology (`test/e2e.test.js`)

The test suite is structured into 4 requirement tiers (plus Tier 0 for infrastructure validation):

| Tier | Name | Focus | Test Count |
|------|------|-------|------------|
| **Tier 0** | **Infrastructure Verification** | Static server, Chrome launch, fixtures, WCAG contrast engine | 4 |
| **Tier 1** | **Feature Coverage** | Core acceptance criteria (Library boot, sample book seed, paginated view, scroll view, TOC, bookmarks, 4 themes, typography) | 8 |
| **Tier 2** | **Boundary & Corner Cases** | Edge cases (Corrupted EPUB rejection, empty title fallback, boundary page clamping, zero halation night theme, rapid keystroke stress) | 5 |
| **Tier 3** | **Cross-Feature Combinations** | Multi-feature interactions (Theme switch while paginated, reading mode switch progress preservation, cross-chapter bookmark jump in scroll mode) | 3 |
| **Tier 4** | **Real-World Scenarios** | Complete end-to-end journey (Import EPUB -> read -> bookmark -> change theme/typography -> hard reload -> exact state restoration & zero console errors) | 1 |
| **Total** | | | **21 Tests** |

### Detailed Test Inventory:

#### Tier 0: Infrastructure Verification
- `0.1`: Static HTTP Server Serves MIME Types & Enforces Security Boundaries
- `0.2`: Headless Google Chrome Launches, Executes Scripts & Closes Cleanly
- `0.3`: Synthetic EPUB Fixtures Built with Correct OCF/OPF Architecture
- `0.4`: WCAG Contrast Calculation Engine Calibrates All 4 Eye-Comfort Themes

#### Tier 1: Feature Coverage
- `1.1`: Library View Boot & Sample Book Auto-Seeding
- `1.2`: Book Open & Paginated View Render (Default Mode)
- `1.3`: Paginated Navigation via Keyboard and Tap Zones
- `1.4`: Continuous Vertical Scroll View Mode
- `1.5`: Table of Contents (TOC) Drawer Open & Chapter Navigation
- `1.6`: Bookmark Creation, Drawer Listing & Jump
- `1.7`: All 4 Eye-Comfort Themes (Contrast >= 4.5:1 & WCAG AA/AAA)
- `1.8`: Typography Customization (Font Family, Size, Line Height, Margin)

#### Tier 2: Boundary & Corner Cases
- `2.1`: Corrupted EPUB / Invalid ZIP Rejection with Non-Blocking Error Toast
- `2.2`: Empty Book Title Fallback Handling
- `2.3`: Boundary Page Clamping (First Page & Last Page)
- `2.4`: Zero Halation on Soft Dark / Night Theme
- `2.5`: Rapid Consecutive Navigation Keystroke Stress

#### Tier 3: Cross-Feature Combinations
- `3.1`: Theme Switch While Navigated to Page 2+ (Preserves Position)
- `3.2`: Reading Mode Switch with Bidirectional Progress Ratio Sync
- `3.3`: Bookmark Jump Across Chapters While in Scroll Mode

#### Tier 4: Real-World Application Scenarios
- `4.1`: Complete User Journey: Import EPUB -> Read -> Bookmark -> Style -> Hard Reload -> Exact State Restoration & Zero Console Errors

---

## 5. Execution & Verification Guide

### Prerequisites:
- **Node.js**: >= 20.0.0 (Tested on Node v25.9.0)
- **Google Chrome**: System binary at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (or set `CHROME_BIN`)
- **Dependencies**: `npm install` installs `puppeteer-core`

### Execution Commands:

1. **Run Full Test Suite (Default)**:
   ```bash
   node test/e2e.test.js
   ```

2. **Verify Test Infrastructure Only (Tier 0 Smoke Test)**:
   ```bash
   node test/e2e.test.js --verify-infra
   ```

3. **Run Specific Test Tier**:
   ```bash
   node test/e2e.test.js --tier=1   # Feature Coverage
   node test/e2e.test.js --tier=2   # Boundary Cases
   node test/e2e.test.js --tier=3   # Cross-Feature Combinations
   node test/e2e.test.js --tier=4   # Real-World Scenarios
   ```

4. **Filter Tests by Pattern**:
   ```bash
   node test/e2e.test.js --grep="Theme"
   ```

5. **Run in Visual Browser Mode (Non-Headless Debugging)**:
   ```bash
   node test/e2e.test.js --headless=false
   ```

6. **Start Standalone Static Server**:
   ```bash
   node test/server.js --port=3000
   ```
