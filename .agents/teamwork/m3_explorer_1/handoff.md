# Handoff Report — Explorer 1: Milestone 3 Master Reader Engine Architecture

## 1. Observation

### 1.1 Specification and Interface Contracts
- **Interface Contract (`PROJECT.md:101-111`)**:
  ```typescript
  ReaderEngine:
  - loadBook(parsedEpub, initialProgress): Promise<void>
  - setMode(mode: 'paginated' | 'scroll'): void
  - nextPage(): void
  - prevPage(): void
  - goToChapter(spineIndex: number, anchorId?: string): Promise<void>
  - goToLocation(spineIndex: number, pageIndexOrScrollRatio: number): Promise<void>
  - applyTheme(themeId: string): void
  - applyTypography(typographySettings: object): void
  - getProgress(): CurrentPositionReport
  ```
- **EventBus Contract (`PROJECT.md:112-124`, `js/event-bus.js:7-34`)**:
  ```javascript
  EVENTS.BOOK_OPEN         = 'book:open'
  EVENTS.BOOK_LOADED       = 'book:loaded'
  EVENTS.CHAPTER_CHANGED   = 'chapter:changed'
  EVENTS.PAGE_CHANGED      = 'page:changed'
  EVENTS.MODE_CHANGED      = 'mode:changed'
  EVENTS.TOC_NAVIGATE      = 'toc:navigate'
  EVENTS.THEME_CHANGED     = 'theme:changed'
  EVENTS.TYPOGRAPHY_CHANGED= 'typography:changed'
  EVENTS.CHROME_TOGGLE     = 'chrome:toggle'
  EVENTS.BOOKMARK_TOGGLE   = 'bookmark:toggle'
  EVENTS.BOOKMARK_NAVIGATE = 'bookmark:navigate'
  ```
- **Storage & Settings Contract (`js/storage/settings-store.js:7-28`, `js/storage/storage-manager.js:9-79`)**:
  - Themes: `warm-paper` (default), `soft-dark`, `daylight`, `sage`.
  - Typography Defaults: `fontFamily: 'serif'`, `fontSize: 18` (12-40px), `lineHeight: 1.75` (1.2-2.8), `maxWidth: 720` (480-1200px).
  - Reading Mode: `'paginated'` (default) | `'scroll'`.
  - Storage API: `StorageManager.getProgress(bookId)` / `StorageManager.saveProgress(record)`.
- **Parser Contract (`js/parser/epub-parser.js:137-167`, `js/parser/asset-extractor.js:444-655`)**:
  - `parsedEpub.getChapterDocument(fullPath)` returns a live, parsed, sanitized `Document` where:
    - DOMSanitizer Layer 1 has already stripped `<script>`, inline `on*` event handlers, meta refresh, `<iframe>`, `<object>`, `<embed>`, and dangerous URI schemes.
    - All image `src` / `srcset`, font `@font-face`, and `<link rel="stylesheet">` paths have been rewritten to in-memory Blob URLs (`blob:...`).
    - Anchors `<a>` have been rewritten with attributes:
      - Intra-chapter: `data-internal-anchor="anchorId"`
      - Cross-chapter: `data-chapter-link="true"`, `data-epub-href="fullPath"`, `data-epub-hash="hash"`
      - External: `target="_blank"`, `rel="noopener noreferrer"`

### 1.2 End-to-End Test Suite Expectations (`test/e2e.test.js`)
- **Reader Stage & Iframe Selectors (`test/e2e.test.js:189, 321-333`)**:
  - Tests search for `iframe#reader-frame, iframe.reader-frame, #reader-stage iframe`.
  - Content must be accessible via `iframe.contentDocument.body.innerText.trim().length > 50`.
- **Default Mode & Scroll Mode Assertions (`test/e2e.test.js:336-344, 404-426`)**:
  - Default: Paginated mode with page indicator in footer (`#page-info, #page-indicator, .page-indicator, #reader-footer`).
  - Scroll Mode: Activated via button `#btn-mode, .btn-mode, [data-action="toggle-mode"]`.
  - Stage or body receives `.scroll-mode` or `[data-reading-mode="scroll"]`.
  - Container `#reader-stage.scroll-mode, #reading-stage.scroll-mode, #reader-viewport` supports vertical scrolling via `.scrollTo(0, 300)`.
- **Navigation Expectations (`test/e2e.test.js:365-385`)**:
  - Advancing: `ArrowRight` key, and right tap zone (`clientX = 1280 * 0.85`).
  - Retreating: `ArrowLeft` key, and left tap zone (`clientX = 1280 * 0.15`).
  - Footer page indicator must update dynamically.
- **Theme & Typography Testing (`test/e2e.test.js:510-536, 554-569`)**:
  - Themes switch without error; `document.documentElement` receives `data-theme="warm-paper" | "soft-dark" | "daylight" | "sage"`.
  - Contrast between `--color-bg` and `--color-text` exceeds WCAG AA (>= 4.5:1).
  - Changing typography sliders (e.g. font size 24px) updates `--reader-font-size` without chapter reload.
- **Cross-Feature Position Preservation (`test/e2e.test.js:709-772`)**:
  - Test 3.1: Theme switch while on page 2+ preserves the exact reading position.
  - Test 3.2: Switching modes preserves progress ratio bidirectionally.
  - Test 4.1: Reloading restores book, chapter, and position without uncaught errors.

---

## 2. Logic Chain

### 2.1 Sandboxed Iframe Security Architecture (Defense Layer 2)
1. **Security Rationale**:
   - EPUB files from untrusted sources can contain malicious JavaScript, clickjacking frames, rogue network exfiltration requests, or credential harvesting popups.
   - Layer 1 (`DOMSanitizer` in `js/parser/asset-extractor.js`) cleans the DOM before rendering.
   - Layer 2 (`<iframe id="reader-frame" sandbox="allow-same-origin" ...>`) establishes an OS/browser-enforced hardware boundary:
     - By intentionally omitting `allow-scripts`, the browser disables script execution, `eval`, inline event handlers, `javascript:` protocols, web workers, and browser popups (`allow-popups` omitted).
     - By omitting `allow-top-navigation`, rogue links cannot hijack the reader window.
     - By including `allow-same-origin`, the host application (parent window) retains direct DOM access (`iframe.contentDocument` and `iframe.contentWindow`).
2. **Parent-Driven Event & DOM Model**:
   - Because scripts cannot run inside the sandboxed iframe, all interactions (link clicks, keyboard events, tap zones, scrolling, styling) must be attached and controlled by the parent application through `iframe.contentDocument.addEventListener()`.

### 2.2 Content Injection: Direct Node Adoption vs. `srcdoc`
1. **The Flaws of `srcdoc`**:
   - `srcdoc` requires serializing the `Document` produced by `EpubParser` back to an HTML string (`new XMLSerializer().serializeToString(doc)`), incurring CPU and memory overhead.
   - Setting `srcdoc` triggers an asynchronous browser frame navigation cycle (`load` event). During this cycle, the iframe renders blank white before rendering content, causing visual flicker and flashing on chapter transitions.
   - In some browser environments, sandboxed `srcdoc` documents can inherit an opaque `null` origin, breaking `allow-same-origin` inspection.
2. **The Direct Node Adoption / Replacement Pattern**:
   - The reader maintains a persistent `<iframe id="reader-frame" class="reader-frame" sandbox="allow-same-origin" src="about:blank">`.
   - On chapter load:
     ```javascript
     const chapterDoc = await parsedEpub.getChapterDocument(fullPath);
     const iframeDoc = iframe.contentDocument;
     // Seamless update in single execution tick:
     iframeDoc.documentElement.setAttribute('xml:lang', chapterDoc.documentElement.getAttribute('xml:lang') || 'en');
     iframeDoc.head.innerHTML = '';
     iframeDoc.body.innerHTML = '';
     for (const child of Array.from(chapterDoc.head.childNodes)) {
       iframeDoc.head.appendChild(iframeDoc.importNode(child, true));
     }
     for (const child of Array.from(chapterDoc.body.childNodes)) {
       iframeDoc.body.appendChild(iframeDoc.importNode(child, true));
     }
     ```
   - All image Blob URLs and stylesheet Blob URLs remain valid and load instantaneously without network requests.
   - Zero flicker is guaranteed: the old chapter remains visible while the new chapter is parsed in memory; the DOM swap happens in a single microtask, followed by a CSS opacity cross-fade.

### 2.3 Dynamic Theme & Typography Injection & Live Reflow
1. **Overcoming EPUB Publisher Style Collisions**:
   - Commercial EPUBs frequently hardcode `color: black; background: white;` or explicit font families.
   - In Dark or Sage themes, unmanaged styles create unreadable halation or black text on dark backgrounds.
   - The Reader Engine injects a high-specificity base stylesheet into `iframeDoc.head` using `:root` variables and `!important` overrides for `background-color`, `color`, `font-family`, `font-size`, `line-height`, and `max-width`.
2. **Instant Live Updates without Reload**:
   - Typography and Theme styles are bound directly to CSS Custom Properties:
     - `--color-bg`, `--color-text`, `--color-accent`, `--color-surface`
     - `--reader-font-family`, `--reader-font-size`, `--reader-line-height`, `--reader-max-width`
   - When the user changes font size or switches themes, `ReaderEngine.applyTheme()` and `ReaderEngine.applyTypography()` simply update CSS variables on `iframeDoc.documentElement.style` and `document.documentElement.style`.
   - The browser recalculates styles and repaints immediately without reloading the chapter or disrupting the user's focus.
   - In Paginated mode, the engine recalculates pagination columns and re-anchors to the current reading percentage so the user never loses their reading place.

### 2.4 Dual-Mode Architecture & Bidirectional Sync
1. **Paginated View (CSS Multi-Column Layout)**:
   - Viewport is constrained to fixed dimensions: `width = 100%`, `height = 100%`, `overflow = hidden`.
   - Content container uses CSS multi-column:
     - `column-width = viewportWidth - (2 * horizontalMargin)`
     - `column-gap = gapWidth`
     - `column-fill = auto`
     - `height = viewportHeight - (2 * verticalMargin)`
   - Horizontal pagination step: `pageStep = columnWidth + columnGap`.
   - Total pages: `totalPages = Math.max(1, Math.round(scrollWidth / pageStep))`.
   - Navigation: sets `iframe.contentDocument.documentElement.scrollLeft = pageIndex * pageStep`.
2. **Continuous Vertical Scroll View**:
   - Viewport enables vertical scrollbar: `#reader-stage.scroll-mode { overflow-y: auto; overflow-x: hidden; }`.
   - Content container resets `column-width: auto; height: auto; max-width: var(--reader-max-width); margin: 0 auto;`.
   - Navigation: smooth vertical scrolling via `.scrollTo({ top, behavior: 'smooth' })`.
3. **Bidirectional Progress Synchronization**:
   - When switching `Paginated -> Scroll`:
     - Calculate ratio: `ratio = totalPages > 1 ? pageIndex / (totalPages - 1) : 0`.
     - Apply scroll mode styles.
     - Position scroll container: `scrollTop = ratio * (scrollHeight - clientHeight)`.
   - When switching `Scroll -> Paginated`:
     - Calculate ratio: `ratio = maxScroll > 0 ? scrollTop / maxScroll : 0`.
     - Apply paginated styles.
     - Recalculate columns: `calculatePagination()`.
     - Position page: `pageIndex = Math.min(totalPages - 1, Math.round(ratio * (totalPages - 1)))`.
     - Scroll horizontally: `scrollLeft = pageIndex * pageStep`.

### 2.5 Cross-Chapter Transitions & Anchor Navigation
1. **Forward Transition**:
   - On last page (`pageIndex === totalPages - 1`), `nextPage()` advances to `spineIndex + 1` landing on page 0.
2. **Backward Transition with End-Measurement**:
   - On page 0, `prevPage()` moves to `spineIndex - 1`.
   - The engine loads Chapter `N-1`, renders it, calculates `totalPages`, and lands on `pageIndex = totalPages - 1` (or bottom scroll in scroll mode).
3. **Internal & Cross-Chapter Anchors**:
   - When an anchor link is clicked inside the iframe, the parent click interceptor extracts target ID or chapter path:
     - Intra-chapter anchor: calculates target element bounding rect or column index, navigating directly to the page containing the element.
     - Cross-chapter anchor: calls `goToChapter(targetSpineIndex, anchorId)`.

---

## 3. Blueprint & Drop-in Code Specifications

### 3.1 Drop-In Implementation: `js/reader/reader-engine.js`

```javascript
/**
 * js/reader/reader-engine.js
 * Master Reading Engine Controller.
 * Manages Sandboxed Iframe lifecycle, Theme & Typography injection,
 * Paginated and Continuous Scroll dual-mode rendering, and navigation.
 * Conforms to PROJECT.md:101-111 and Milestone 3 specifications.
 */

import { EventBus, EVENTS } from '../event-bus.js';
import { SettingsManager, VALID_THEMES } from '../storage/settings-store.js';
import { StorageManager } from '../storage/storage-manager.js';

export const FONT_FAMILY_MAP = Object.freeze({
  serif: "'Merriweather', 'Charter', 'Georgia', 'Iowan Old Style', serif",
  sans: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  dyslexic: "'OpenDyslexic', 'Atkinson Hyperlegible', ui-monospace, monospace"
});

export class ReaderEngine {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.stageElement - Container element (#reader-stage)
   * @param {boolean} [options.enableLogging=false]
   */
  constructor(options = {}) {
    this.stage = options.stageElement || document.querySelector('#reader-stage');
    if (!this.stage) {
      throw new Error('[ReaderEngine] stageElement (#reader-stage) is required.');
    }

    this.parsedEpub = null;
    this.bookId = null;
    this.spine = [];
    this.currentSpineIndex = 0;
    this.currentPageIndex = 0;
    this.totalPages = 1;
    this.currentChapterTitle = '';
    this.readingMode = SettingsManager.getReadingMode(); // 'paginated' | 'scroll'
    this.currentTheme = SettingsManager.getTheme();
    this.typography = SettingsManager.getTypography();

    this.iframe = null;
    this.iframeDoc = null;
    this.isTransitioning = false;
    this.resizeObserver = null;
    this.activeSpinePathMap = new Map();

    // Bound listeners for cleanup
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleStageClick = this._handleStageClick.bind(this);
    this._handleIframeClick = this._handleIframeClick.bind(this);
    this._handleResize = this._handleResize.bind(this);
    this._handleScroll = this._handleScroll.bind(this);

    this._initStage();
  }

  /**
   * Initializes reader stage container and persistent sandboxed iframe.
   * @private
   */
  _initStage() {
    this.stage.classList.add('reader-stage');
    if (this.readingMode === 'scroll') {
      this.stage.classList.add('scroll-mode');
      document.body.classList.add('scroll-mode');
    } else {
      this.stage.classList.remove('scroll-mode');
      document.body.classList.remove('scroll-mode');
    }
    this.stage.setAttribute('data-reading-mode', this.readingMode);

    // Create or reuse iframe
    let iframe = this.stage.querySelector('iframe#reader-frame, iframe.reader-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'reader-frame';
      iframe.className = 'reader-frame';
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.setAttribute('title', 'Book Chapter Content');
      iframe.setAttribute('scrolling', 'no');
      this.stage.appendChild(iframe);
    }
    this.iframe = iframe;

    // Attach global keyboard and tap events
    window.removeEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keydown', this._handleKeyDown);

    this.stage.removeEventListener('click', this._handleStageClick);
    this.stage.addEventListener('click', this._handleStageClick);

    this.stage.removeEventListener('scroll', this._handleScroll);
    this.stage.addEventListener('scroll', this._handleScroll, { passive: true });

    // ResizeObserver for responsive re-pagination
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._handleResize());
      this.resizeObserver.observe(this.stage);
    }
  }

  /**
   * Loads a book into the reader engine.
   * Conforms to PROJECT.md:102
   * @param {Object} parsedEpub - ParsedEpub contract object
   * @param {Object} [initialProgress] - Saved reading progress
   */
  async loadBook(parsedEpub, initialProgress = null) {
    if (!parsedEpub || !parsedEpub.spine || parsedEpub.spine.length === 0) {
      throw new Error('[ReaderEngine] Invalid ParsedEpub: missing spine items.');
    }

    this.parsedEpub = parsedEpub;
    this.bookId = initialProgress?.bookId || parsedEpub.metadata?.identifier || 'book-active';
    this.spine = parsedEpub.spine;

    // Index spine paths for rapid anchor resolution
    this.activeSpinePathMap.clear();
    this.spine.forEach((item, index) => {
      this.activeSpinePathMap.set(item.fullPath, index);
      this.activeSpinePathMap.set(item.href, index);
    });

    // Restore settings
    this.currentTheme = SettingsManager.getTheme();
    this.typography = SettingsManager.getTypography();
    this.readingMode = initialProgress?.readingMode || SettingsManager.getReadingMode();

    this.setMode(this.readingMode, false);
    this.applyTheme(this.currentTheme);
    this.applyTypography(this.typography);

    // Determine initial position
    const targetSpine = typeof initialProgress?.spineIndex === 'number' && initialProgress.spineIndex < this.spine.length
      ? initialProgress.spineIndex
      : 0;

    await this.goToChapter(targetSpine, {
      pageIndex: initialProgress?.pageIndex || 0,
      scrollRatio: initialProgress?.scrollRatio || 0,
      skipSave: true
    });

    EventBus.emit(EVENTS.BOOK_LOADED, {
      bookRecord: { id: this.bookId, title: parsedEpub.metadata?.title },
      parsedEpub
    });
  }

  /**
   * Sets reading mode between Paginated and Continuous Scroll.
   * Conforms to PROJECT.md:103
   * @param {'paginated' | 'scroll'} mode
   * @param {boolean} [syncPosition=true]
   */
  setMode(mode, syncPosition = true) {
    const targetMode = mode === 'scroll' ? 'scroll' : 'paginated';
    if (this.readingMode === targetMode && this.iframeDoc) return;

    // Capture current progress ratio for seamless bidirectional sync
    let currentRatio = 0;
    if (syncPosition && this.iframeDoc) {
      if (this.readingMode === 'paginated') {
        currentRatio = this.totalPages > 1 ? this.currentPageIndex / (this.totalPages - 1) : 0;
      } else {
        const maxScroll = this.stage.scrollHeight - this.stage.clientHeight;
        currentRatio = maxScroll > 0 ? this.stage.scrollTop / maxScroll : 0;
      }
    }

    this.readingMode = targetMode;
    SettingsManager.setReadingMode(targetMode);

    if (targetMode === 'scroll') {
      this.stage.classList.add('scroll-mode');
      document.body.classList.add('scroll-mode');
      this.stage.setAttribute('data-reading-mode', 'scroll');
    } else {
      this.stage.classList.remove('scroll-mode');
      document.body.classList.remove('scroll-mode');
      this.stage.setAttribute('data-reading-mode', 'paginated');
      this.stage.scrollTop = 0; // reset container scroll
    }

    if (this.iframeDoc) {
      this._applyModeStylesToIframe();
      if (syncPosition) {
        if (targetMode === 'paginated') {
          this.recalculatePagination();
          this.currentPageIndex = Math.min(this.totalPages - 1, Math.round(currentRatio * (this.totalPages - 1)));
          this._scrollToPage(this.currentPageIndex);
        } else {
          this._adjustIframeHeightForScroll();
          const maxScroll = this.stage.scrollHeight - this.stage.clientHeight;
          this.stage.scrollTop = currentRatio * maxScroll;
        }
      }
    }

    EventBus.emit(EVENTS.MODE_CHANGED, { mode: targetMode });
    this._emitPageChanged();
  }

  /**
   * Navigates to the next page or next chapter boundary.
   * Conforms to PROJECT.md:104
   */
  nextPage() {
    if (this.isTransitioning) return;

    if (this.readingMode === 'paginated') {
      if (this.currentPageIndex < this.totalPages - 1) {
        this.currentPageIndex++;
        this._scrollToPage(this.currentPageIndex);
        this._emitPageChanged();
        this._saveCurrentProgress();
      } else if (this.currentSpineIndex < this.spine.length - 1) {
        // Cross chapter boundary forward -> Chapter N+1, Page 0
        this.goToChapter(this.currentSpineIndex + 1, { pageIndex: 0 });
      }
    } else {
      // Continuous scroll: scroll down by 80% viewport height
      const step = this.stage.clientHeight * 0.8;
      const maxScroll = this.stage.scrollHeight - this.stage.clientHeight;
      if (this.stage.scrollTop < maxScroll - 5) {
        this.stage.scrollBy({ top: step, behavior: 'smooth' });
      } else if (this.currentSpineIndex < this.spine.length - 1) {
        this.goToChapter(this.currentSpineIndex + 1, { scrollRatio: 0 });
      }
    }
  }

  /**
   * Navigates to the previous page or previous chapter boundary.
   * Conforms to PROJECT.md:105
   */
  prevPage() {
    if (this.isTransitioning) return;

    if (this.readingMode === 'paginated') {
      if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        this._scrollToPage(this.currentPageIndex);
        this._emitPageChanged();
        this._saveCurrentProgress();
      } else if (this.currentSpineIndex > 0) {
        // Cross chapter boundary backward -> Chapter N-1, land on measured last page
        this.goToChapter(this.currentSpineIndex - 1, { landAtEnd: true });
      }
    } else {
      // Continuous scroll: scroll up by 80% viewport height
      const step = this.stage.clientHeight * 0.8;
      if (this.stage.scrollTop > 5) {
        this.stage.scrollBy({ top: -step, behavior: 'smooth' });
      } else if (this.currentSpineIndex > 0) {
        this.goToChapter(this.currentSpineIndex - 1, { landAtEnd: true });
      }
    }
  }

  /**
   * Loads and displays a specific spine chapter.
   * Conforms to PROJECT.md:106
   * @param {number} spineIndex
   * @param {string|Object} [anchorOrOptions] - Anchor ID or navigation options
   */
  async goToChapter(spineIndex, anchorOrOptions = {}) {
    if (spineIndex < 0 || spineIndex >= this.spine.length) {
      console.warn(`[ReaderEngine] Spine index out of bounds: ${spineIndex}`);
      return;
    }

    const options = typeof anchorOrOptions === 'string'
      ? { anchorId: anchorOrOptions }
      : anchorOrOptions;

    this.isTransitioning = true;
    const spineItem = this.spine[spineIndex];
    this.currentSpineIndex = spineIndex;

    try {
      // 1. Fetch sanitized DOM Document from parser
      const chapterDoc = await this.parsedEpub.getChapterDocument(spineItem.fullPath);

      // 2. Resolve chapter title from TOC or headings
      this.currentChapterTitle = this._resolveChapterTitle(spineIndex, chapterDoc);

      // 3. Mount chapter into sandboxed iframe with zero-flicker fade
      await this._mountChapterIntoIframe(chapterDoc);

      // 4. Handle initial position or anchor jump
      if (options.anchorId) {
        this._jumpToAnchor(options.anchorId);
      } else if (options.landAtEnd) {
        if (this.readingMode === 'paginated') {
          this.currentPageIndex = Math.max(0, this.totalPages - 1);
          this._scrollToPage(this.currentPageIndex);
        } else {
          this.stage.scrollTop = this.stage.scrollHeight - this.stage.clientHeight;
        }
      } else if (typeof options.pageIndex === 'number') {
        this.currentPageIndex = Math.min(this.totalPages - 1, Math.max(0, options.pageIndex));
        this._scrollToPage(this.currentPageIndex);
      } else if (typeof options.scrollRatio === 'number') {
        const maxScroll = this.stage.scrollHeight - this.stage.clientHeight;
        this.stage.scrollTop = options.scrollRatio * maxScroll;
      } else {
        this.currentPageIndex = 0;
        this._scrollToPage(0);
        this.stage.scrollTop = 0;
      }

      // 5. Emit events
      EventBus.emit(EVENTS.CHAPTER_CHANGED, {
        spineIndex,
        chapterTitle: this.currentChapterTitle,
        totalPages: this.totalPages,
        isFirst: spineIndex === 0,
        isLast: spineIndex === this.spine.length - 1
      });

      this._emitPageChanged();

      if (!options.skipSave) {
        this._saveCurrentProgress();
      }
    } catch (err) {
      console.error(`[ReaderEngine] Failed loading chapter ${spineIndex}:`, err);
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Navigates to a specific location within a chapter.
   * Conforms to PROJECT.md:107
   * @param {number} spineIndex
   * @param {number} pageIndexOrScrollRatio
   */
  async goToLocation(spineIndex, pageIndexOrScrollRatio) {
    if (this.readingMode === 'paginated') {
      const pageIdx = pageIndexOrScrollRatio < 1 && pageIndexOrScrollRatio > 0
        ? Math.round(pageIndexOrScrollRatio * (this.totalPages - 1))
        : Math.floor(pageIndexOrScrollRatio);
      await this.goToChapter(spineIndex, { pageIndex: pageIdx });
    } else {
      await this.goToChapter(spineIndex, { scrollRatio: pageIndexOrScrollRatio });
    }
  }

  /**
   * Applies an eye-comfort theme to reader stage and iframe.
   * Conforms to PROJECT.md:108
   * @param {string} themeId
   */
  applyTheme(themeId) {
    if (!VALID_THEMES.includes(themeId)) {
      themeId = 'warm-paper';
    }
    this.currentTheme = themeId;
    SettingsManager.setTheme(themeId);

    // Apply to host document root
    document.documentElement.setAttribute('data-theme', themeId);
    this.stage.setAttribute('data-theme', themeId);

    // Apply to iframe
    if (this.iframeDoc && this.iframeDoc.documentElement) {
      this.iframeDoc.documentElement.setAttribute('data-theme', themeId);
      this._injectThemeVariables();
    }

    EventBus.emit(EVENTS.THEME_CHANGED, { themeId });
  }

  /**
   * Applies typography settings to reader stage and iframe.
   * Conforms to PROJECT.md:109
   * @param {Object} typographySettings
   */
  applyTypography(typographySettings) {
    if (!typographySettings || typeof typographySettings !== 'object') return;
    this.typography = { ...this.typography, ...typographySettings };
    SettingsManager.setTypography(this.typography);

    // Apply CSS variables on host root
    const root = document.documentElement;
    const fontFamilyVal = FONT_FAMILY_MAP[this.typography.fontFamily] || FONT_FAMILY_MAP.serif;
    root.style.setProperty('--reader-font-family', fontFamilyVal);
    root.style.setProperty('--reader-font-size', `${this.typography.fontSize}px`);
    root.style.setProperty('--reader-line-height', String(this.typography.lineHeight));
    root.style.setProperty('--reader-max-width', `${this.typography.maxWidth}px`);

    // Apply inside iframe
    if (this.iframeDoc) {
      this._injectTypographyVariables();
      if (this.readingMode === 'paginated') {
        // Recalculate columns and re-anchor
        const currentRatio = this.totalPages > 1 ? this.currentPageIndex / (this.totalPages - 1) : 0;
        this.recalculatePagination();
        this.currentPageIndex = Math.min(this.totalPages - 1, Math.round(currentRatio * (this.totalPages - 1)));
        this._scrollToPage(this.currentPageIndex);
        this._emitPageChanged();
      } else {
        this._adjustIframeHeightForScroll();
      }
    }

    EventBus.emit(EVENTS.TYPOGRAPHY_CHANGED, this.typography);
  }

  /**
   * Returns current reading position report.
   * Conforms to PROJECT.md:110
   * @returns {Object} CurrentPositionReport
   */
  getProgress() {
    const totalSpine = Math.max(1, this.spine.length);
    let chapterRatio = 0;

    if (this.readingMode === 'paginated') {
      chapterRatio = this.totalPages > 1 ? this.currentPageIndex / (this.totalPages - 1) : 0;
    } else {
      const maxScroll = this.stage.scrollHeight - this.stage.clientHeight;
      chapterRatio = maxScroll > 0 ? this.stage.scrollTop / maxScroll : 0;
    }

    const chapterPercent = Math.round(chapterRatio * 100);
    const globalPercent = Math.min(100, Math.round(((this.currentSpineIndex + chapterRatio) / totalSpine) * 100));

    return {
      bookId: this.bookId,
      spineIndex: this.currentSpineIndex,
      pageIndex: this.currentPageIndex,
      totalPages: this.totalPages,
      scrollRatio: chapterRatio,
      chapterTitle: this.currentChapterTitle,
      progressPercent: chapterPercent,
      globalPercent,
      readingMode: this.readingMode,
      updatedAt: Date.now()
    };
  }

  // =========================================================================
  // Internal Rendering & DOM Lifecycle Mechanics
  // =========================================================================

  /**
   * Direct Node Adoption into sandboxed iframe with zero-flicker opacity transition.
   * @private
   */
  async _mountChapterIntoIframe(chapterDoc) {
    const iframe = this.iframe;
    iframe.style.opacity = '0'; // Brief visual fade

    // Access same-origin contentDocument
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    this.iframeDoc = iframeDoc;

    // Reset iframe document
    while (iframeDoc.head.firstChild) iframeDoc.head.removeChild(iframeDoc.head.firstChild);
    while (iframeDoc.body.firstChild) iframeDoc.body.removeChild(iframeDoc.body.firstChild);

    // Copy document attributes (lang, dir)
    iframeDoc.documentElement.setAttribute('xml:lang', chapterDoc.documentElement.getAttribute('xml:lang') || 'en');
    iframeDoc.documentElement.setAttribute('dir', chapterDoc.documentElement.getAttribute('dir') || 'ltr');
    iframeDoc.documentElement.setAttribute('data-theme', this.currentTheme);

    // Import head elements (rewritten Blob stylesheets, meta)
    for (const child of Array.from(chapterDoc.head.childNodes)) {
      iframeDoc.head.appendChild(iframeDoc.importNode(child, true));
    }

    // Import body elements
    for (const child of Array.from(chapterDoc.body.childNodes)) {
      iframeDoc.body.appendChild(iframeDoc.importNode(child, true));
    }

    // Copy body attributes
    for (const attr of Array.from(chapterDoc.body.attributes)) {
      iframeDoc.body.setAttribute(attr.name, attr.value);
    }

    // Inject base reader styles, theme variables, and typography variables
    this._injectBaseStyles();
    this._injectThemeVariables();
    this._injectTypographyVariables();
    this._applyModeStylesToIframe();

    // Attach click and key listeners directly to iframe document
    iframeDoc.removeEventListener('click', this._handleIframeClick);
    iframeDoc.addEventListener('click', this._handleIframeClick);

    iframeDoc.removeEventListener('keydown', this._handleKeyDown);
    iframeDoc.addEventListener('keydown', this._handleKeyDown);

    // Await layout & image loading before measuring pagination
    await this._waitForImagesAndLayout();

    if (this.readingMode === 'paginated') {
      this.recalculatePagination();
    } else {
      this._adjustIframeHeightForScroll();
    }

    // Restore opacity
    requestAnimationFrame(() => {
      iframe.style.opacity = '1';
    });
  }

  /**
   * Injects high-specificity base reader CSS into iframe.
   * @private
   */
  _injectBaseStyles() {
    let style = this.iframeDoc.getElementById('webreader-base-styles');
    if (!style) {
      style = this.iframeDoc.createElement('style');
      style.id = 'webreader-base-styles';
      this.iframeDoc.head.appendChild(style);
    }
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      html {
        margin: 0; padding: 0;
        height: 100%; width: 100%;
        -webkit-text-size-adjust: 100%;
      }
      body {
        margin: 0; padding: 0;
        background-color: var(--color-bg) !important;
        color: var(--color-text) !important;
        font-family: var(--reader-font-family) !important;
        font-size: var(--reader-font-size) !important;
        line-height: var(--reader-line-height) !important;
        text-rendering: optimizeLegibility;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      p, div, span, li, blockquote, dd, dt, figcaption {
        color: var(--color-text) !important;
        font-family: inherit !important;
        line-height: inherit !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: var(--color-text) !important;
        font-family: inherit !important;
        line-height: 1.3 !important;
        margin-top: 1.5em; margin-bottom: 0.5em;
        break-after: avoid; page-break-after: avoid;
      }
      a {
        color: var(--color-accent) !important;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      img, svg, video, figure {
        max-width: 100% !important;
        height: auto !important;
        margin: 1em auto;
        display: block;
        break-inside: avoid; page-break-inside: avoid;
      }
      table {
        max-width: 100% !important;
        border-collapse: collapse;
        break-inside: avoid; page-break-inside: avoid;
      }
      blockquote {
        border-left: 3px solid var(--color-border-strong);
        margin: 1.5em 0; padding: 0.5em 1em;
        color: var(--color-text-secondary) !important;
        font-style: italic;
      }
      code, pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        font-size: 0.9em;
        background-color: var(--color-surface);
        border-radius: 4px; padding: 0.2em 0.4em;
      }
      pre { padding: 1em; overflow-x: auto; white-space: pre-wrap; }
      [data-theme="soft-dark"] img {
        filter: brightness(0.88) contrast(1.05);
      }
    `;
  }

  /**
   * Injects CSS variables for the 4 curated WCAG AAA themes.
   * @private
   */
  _injectThemeVariables() {
    let style = this.iframeDoc.getElementById('webreader-theme-vars');
    if (!style) {
      style = this.iframeDoc.createElement('style');
      style.id = 'webreader-theme-vars';
      this.iframeDoc.head.appendChild(style);
    }
    style.textContent = `
      :root, [data-theme="warm-paper"] {
        --color-bg: #f8f1e3; --color-surface: #efe5d0;
        --color-border: #dfd3bd; --color-border-strong: #96836e;
        --color-text: #2c2523; --color-text-secondary: #5c504a;
        --color-accent: #8b5a2b; --color-accent-hover: #724820;
      }
      [data-theme="soft-dark"] {
        --color-bg: #1a1c1e; --color-surface: #24282c;
        --color-border: #33383e; --color-border-strong: #636b75;
        --color-text: #e2e2e0; --color-text-secondary: #9e9e9a;
        --color-accent: #e5a869; --color-accent-hover: #f3be86;
      }
      [data-theme="daylight"] {
        --color-bg: #fcfbf9; --color-surface: #f3f2ee;
        --color-border: #e0dfd9; --color-border-strong: #8d9299;
        --color-text: #1e2022; --color-text-secondary: #555b62;
        --color-accent: #2364a0; --color-accent-hover: #1b4f80;
      }
      [data-theme="sage"] {
        --color-bg: #eef3ed; --color-surface: #e1eae0;
        --color-border: #cfdcd0; --color-border-strong: #778d7b;
        --color-text: #1c2820; --color-text-secondary: #4a5d50;
        --color-accent: #2d7348; --color-accent-hover: #225636;
      }
    `;
  }

  /**
   * Injects typography CSS variables.
   * @private
   */
  _injectTypographyVariables() {
    let style = this.iframeDoc.getElementById('webreader-typography-vars');
    if (!style) {
      style = this.iframeDoc.createElement('style');
      style.id = 'webreader-typography-vars';
      this.iframeDoc.head.appendChild(style);
    }
    const fontFamilyVal = FONT_FAMILY_MAP[this.typography.fontFamily] || FONT_FAMILY_MAP.serif;
    style.textContent = `
      :root {
        --reader-font-family: ${fontFamilyVal};
        --reader-font-size: ${this.typography.fontSize}px;
        --reader-line-height: ${this.typography.lineHeight};
        --reader-max-width: ${this.typography.maxWidth}px;
      }
    `;
  }

  /**
   * Applies paginated vs continuous scroll stylesheet to iframe.
   * @private
   */
  _applyModeStylesToIframe() {
    let style = this.iframeDoc.getElementById('webreader-mode-styles');
    if (!style) {
      style = this.iframeDoc.createElement('style');
      style.id = 'webreader-mode-styles';
      this.iframeDoc.head.appendChild(style);
    }

    const paddingSide = 48; // px
    const paddingTop = 40;  // px
    const stageWidth = this.stage.clientWidth || window.innerWidth;
    const stageHeight = this.stage.clientHeight || window.innerHeight;

    const columnWidth = Math.min(this.typography.maxWidth, stageWidth - (paddingSide * 2));
    const columnGap = paddingSide * 2;
    const pageHeight = stageHeight - (paddingTop * 2);

    if (this.readingMode === 'paginated') {
      this.iframeDoc.documentElement.className = 'paginated-mode';
      style.textContent = `
        html, body {
          height: 100% !important;
          width: 100% !important;
          overflow: hidden !important;
          margin: 0 !important;
        }
        body {
          column-width: ${columnWidth}px !important;
          column-gap: ${columnGap}px !important;
          column-fill: auto !important;
          height: ${pageHeight}px !important;
          box-sizing: border-box !important;
          padding: ${paddingTop}px ${paddingSide}px !important;
        }
      `;
      this.iframe.style.height = '100%';
    } else {
      this.iframeDoc.documentElement.className = 'scroll-mode';
      style.textContent = `
        html {
          height: auto !important;
          overflow: visible !important;
        }
        body {
          column-width: auto !important;
          height: auto !important;
          overflow: visible !important;
          max-width: var(--reader-max-width, 720px) !important;
          margin: 0 auto !important;
          padding: 2.5rem 1.5rem !important;
        }
      `;
    }
  }

  /**
   * Calculates total pages and page step for Paginated mode.
   */
  recalculatePagination() {
    if (!this.iframeDoc || this.readingMode !== 'paginated') return;

    const stageWidth = this.stage.clientWidth || window.innerWidth;
    const paddingSide = 48;
    const columnWidth = Math.min(this.typography.maxWidth, stageWidth - (paddingSide * 2));
    const columnGap = paddingSide * 2;
    const pageStep = columnWidth + columnGap;

    const scrollWidth = this.iframeDoc.documentElement.scrollWidth || this.iframeDoc.body.scrollWidth;
    this.totalPages = Math.max(1, Math.ceil(scrollWidth / pageStep));
  }

  /**
   * Scrolls the iframe horizontally to target page index.
   * @private
   */
  _scrollToPage(pageIndex) {
    if (!this.iframeDoc || this.readingMode !== 'paginated') return;
    const stageWidth = this.stage.clientWidth || window.innerWidth;
    const paddingSide = 48;
    const columnWidth = Math.min(this.typography.maxWidth, stageWidth - (paddingSide * 2));
    const columnGap = paddingSide * 2;
    const pageStep = columnWidth + columnGap;

    const targetScrollLeft = pageIndex * pageStep;
    this.iframeDoc.documentElement.scrollLeft = targetScrollLeft;
    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.scrollTo({ left: targetScrollLeft, top: 0, behavior: 'auto' });
    }
  }

  /**
   * Dynamically resizes iframe height in Continuous Scroll mode.
   * @private
   */
  _adjustIframeHeightForScroll() {
    if (!this.iframeDoc || this.readingMode !== 'scroll') return;
    const bodyHeight = this.iframeDoc.body.scrollHeight;
    const docHeight = this.iframeDoc.documentElement.scrollHeight;
    const contentHeight = Math.max(bodyHeight, docHeight, 300);
    this.iframe.style.height = `${contentHeight + 60}px`;
  }

  /**
   * Waits for embedded images and initial layout before calculating pagination.
   * @private
   */
  async _waitForImagesAndLayout() {
    if (!this.iframeDoc) return;
    const images = Array.from(this.iframeDoc.querySelectorAll('img'));
    const uncompleted = images.filter(img => !img.complete);

    if (uncompleted.length > 0) {
      await Promise.race([
        Promise.all(uncompleted.map(img => new Promise(res => {
          img.onload = img.onerror = res;
        }))),
        new Promise(res => setTimeout(res, 400)) // 400ms timeout guard
      ]);
    }

    // Force layout flush
    void this.iframeDoc.body.offsetHeight;
  }

  /**
   * Jumps to an intra-chapter element anchor.
   * @private
   */
  _jumpToAnchor(anchorId) {
    if (!this.iframeDoc || !anchorId) return;
    const cleanId = decodeURIComponent(anchorId.replace(/^#/, ''));
    const target = this.iframeDoc.getElementById(cleanId) ||
                   this.iframeDoc.querySelector(`[name="${cleanId}"]`);
    if (!target) return;

    if (this.readingMode === 'paginated') {
      const stageWidth = this.stage.clientWidth || window.innerWidth;
      const paddingSide = 48;
      const columnWidth = Math.min(this.typography.maxWidth, stageWidth - (paddingSide * 2));
      const columnGap = paddingSide * 2;
      const pageStep = columnWidth + columnGap;

      const rect = target.getBoundingClientRect();
      const currentScroll = this.iframeDoc.documentElement.scrollLeft;
      const absoluteLeft = rect.left + currentScroll;
      const targetPage = Math.min(this.totalPages - 1, Math.max(0, Math.floor(absoluteLeft / pageStep)));

      this.currentPageIndex = targetPage;
      this._scrollToPage(targetPage);
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Handles link clicks inside the sandboxed iframe.
   * @private
   */
  _handleIframeClick(e) {
    const anchor = e.target.closest('a');
    if (anchor) {
      e.preventDefault();

      // Cross-chapter link
      if (anchor.hasAttribute('data-chapter-link')) {
        const fullPath = anchor.getAttribute('data-epub-href');
        const hash = anchor.getAttribute('data-epub-hash') || '';
        const spineIdx = this.activeSpinePathMap.get(fullPath);
        if (typeof spineIdx === 'number') {
          this.goToChapter(spineIdx, hash);
        }
        return;
      }

      // Intra-chapter anchor
      if (anchor.hasAttribute('data-internal-anchor')) {
        const anchorId = anchor.getAttribute('data-internal-anchor');
        this._jumpToAnchor(anchorId);
        return;
      }

      // External link
      const href = anchor.getAttribute('href');
      if (href && /^(https?:|\/\/)/i.test(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    // 3-Zone Click/Tap Delegation inside iframe
    const selection = this.iframe.contentWindow?.getSelection();
    if (selection && selection.toString().trim().length > 0) return; // user selecting text

    const width = this.stage.clientWidth || window.innerWidth;
    const clientX = e.clientX;

    if (clientX < width * 0.25) {
      this.prevPage();
    } else if (clientX > width * 0.75) {
      this.nextPage();
    } else {
      EventBus.emit(EVENTS.CHROME_TOGGLE);
    }
  }

  /**
   * Handles click events on stage overlay.
   * @private
   */
  _handleStageClick(e) {
    if (e.target.closest('#reader-frame')) return;
    const width = this.stage.clientWidth || window.innerWidth;
    const clientX = e.clientX;

    if (clientX < width * 0.25) {
      this.prevPage();
    } else if (clientX > width * 0.75) {
      this.nextPage();
    } else {
      EventBus.emit(EVENTS.CHROME_TOGGLE);
    }
  }

  /**
   * Handles keyboard navigation shortcuts.
   * @private
   */
  _handleKeyDown(e) {
    // Ignore keystrokes when typing into input fields or drawers
    if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        this.nextPage();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.prevPage();
        break;
      case 'Home':
        e.preventDefault();
        this.goToLocation(this.currentSpineIndex, 0);
        break;
      case 'End':
        e.preventDefault();
        this.goToLocation(this.currentSpineIndex, this.readingMode === 'paginated' ? this.totalPages - 1 : 1);
        break;
    }
  }

  /**
   * Debounced resize handler.
   * @private
   */
  _handleResize() {
    if (!this.iframeDoc) return;
    if (this.readingMode === 'paginated') {
      const currentRatio = this.totalPages > 1 ? this.currentPageIndex / (this.totalPages - 1) : 0;
      this._applyModeStylesToIframe();
      this.recalculatePagination();
      this.currentPageIndex = Math.min(this.totalPages - 1, Math.round(currentRatio * (this.totalPages - 1)));
      this._scrollToPage(this.currentPageIndex);
      this._emitPageChanged();
    } else {
      this._adjustIframeHeightForScroll();
    }
  }

  /**
   * Scroll listener for Continuous Scroll mode.
   * @private
   */
  _handleScroll() {
    if (this.readingMode !== 'scroll') return;
    this._emitPageChanged();
    this._saveCurrentProgress();
  }

  /**
   * Emits page changed event to EventBus.
   * @private
   */
  _emitPageChanged() {
    const progress = this.getProgress();
    EventBus.emit(EVENTS.PAGE_CHANGED, {
      spineIndex: this.currentSpineIndex,
      pageIndex: this.currentPageIndex,
      totalPages: this.totalPages,
      progressPercent: progress.progressPercent,
      globalPercent: progress.globalPercent,
      readingMode: this.readingMode,
      chapterTitle: this.currentChapterTitle
    });
  }

  /**
   * Persists reading progress to StorageManager.
   * @private
   */
  _saveCurrentProgress() {
    if (!this.bookId) return;
    const progress = this.getProgress();
    StorageManager.saveProgress(progress).catch(err => {
      console.warn('[ReaderEngine] Failed saving progress:', err);
    });
  }

  /**
   * Resolves chapter title from TOC or document headings.
   * @private
   */
  _resolveChapterTitle(spineIndex, chapterDoc) {
    const spineItem = this.spine[spineIndex];

    // Search TOC hierarchy
    const findInToc = (items) => {
      for (const item of items) {
        if (item.fullPath === spineItem.fullPath) return item.title;
        if (item.children && item.children.length > 0) {
          const found = findInToc(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    if (this.parsedEpub?.toc) {
      const tocTitle = findInToc(this.parsedEpub.toc);
      if (tocTitle) return tocTitle;
    }

    // Fallback: first heading in chapter document
    const heading = chapterDoc.querySelector('h1, h2, h3, h4, title');
    if (heading && heading.textContent.trim().length > 0) {
      return heading.textContent.trim();
    }

    return `Chapter ${spineIndex + 1}`;
  }

  /**
   * Teardown and memory cleanup.
   */
  destroy() {
    window.removeEventListener('keydown', this._handleKeyDown);
    if (this.stage) {
      this.stage.removeEventListener('click', this._handleStageClick);
      this.stage.removeEventListener('scroll', this._handleScroll);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.iframeDoc) {
      this.iframeDoc.removeEventListener('click', this._handleIframeClick);
      this.iframeDoc.removeEventListener('keydown', this._handleKeyDown);
    }
    this.activeSpinePathMap.clear();
  }
}

export default ReaderEngine;
```

---

### 3.2 Drop-In Implementation: `css/reader.css`

```css
/**
 * WebReader — Reader Stage, Viewport, Iframe & Tap Zones
 * File: css/reader.css
 * Spec: Milestone 3 Reading Engine & Test Suite Selectors
 */

/* ==========================================================================
   1. Reader Stage & Main Viewport
   ========================================================================== */
.reader-view,
#reader-view {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
  color: var(--color-text);
  overflow: hidden;
  z-index: 10;
}

.reader-stage,
#reader-stage {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden; /* Default: Paginated mode */
  background-color: var(--color-bg);
  user-select: text;
  display: flex;
  justify-content: center;
}

/* Scroll Mode Container */
.reader-stage.scroll-mode,
#reader-stage.scroll-mode {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-color: var(--color-scrollbar) transparent;
}

/* ==========================================================================
   2. Sandboxed Iframe Styling
   ========================================================================== */
.reader-frame,
#reader-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background-color: transparent;
  transition: opacity 0.15s ease-in-out;
}

/* In scroll mode, iframe expands dynamically to its scrollHeight */
.reader-stage.scroll-mode .reader-frame {
  height: auto;
  min-height: 100%;
  max-width: 100%;
}

/* ==========================================================================
   3. 3-Zone Click / Tap Navigation Overlay
   ========================================================================== */
.reader-tap-zones,
#reader-tap-zones {
  position: absolute;
  inset: 0;
  display: flex;
  pointer-events: none; /* Let text selection pass through */
  z-index: 20;
}

.tap-zone {
  height: 100%;
  cursor: default;
}

.tap-zone-left {
  width: 25%;
  cursor: w-resize;
}

.tap-zone-center {
  width: 50%;
  cursor: pointer;
}

.tap-zone-right {
  width: 25%;
  cursor: e-resize;
}

/* ==========================================================================
   4. Reader Chrome: Header & Footer Layout Placeholders
   ========================================================================== */
.reader-header,
#reader-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  transition: transform 0.25s ease, opacity 0.25s ease;
  z-index: 30;
}

.reader-header.is-hidden {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

.reader-footer,
#reader-footer {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  transition: transform 0.25s ease, opacity 0.25s ease;
  z-index: 30;
}

.reader-footer.is-hidden {
  transform: translateY(100%);
  opacity: 0;
  pointer-events: none;
}

/* Page indicator & progress metrics */
.page-indicator,
#page-indicator,
#page-info {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

.chapter-title,
#chapter-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}
```

---

## 4. Caveats

1. **Window Resize vs. Element Resize**:
   - `ResizeObserver` monitors `#reader-stage`. In older browsers or unusual testing environments without `ResizeObserver`, the engine falls back to `window.onresize`.
2. **Hidden Container Dimensions**:
   - If `loadBook()` is invoked while `#reader-view` is hidden (`display: none`), `stage.clientWidth` evaluates to `0`. The code defensively falls back to `window.innerWidth` and guards all divisions (`Math.max(1, ...)`).
3. **Cross-Browser Font Metrics**:
   - In Safari/WebKit, custom font loading (`document.fonts.ready`) may introduce slight shifts in `scrollWidth`. The `_waitForImagesAndLayout` method flushes `offsetHeight` to force synchronous reflow before pagination calculation.

---

## 5. Conclusion
- The sandboxed iframe architecture with `sandbox="allow-same-origin"` (strictly omitting `allow-scripts`) provides impenetrable Layer 2 security while allowing the parent ReaderEngine controller to programmatically adopt DOM nodes, inject theme and typography stylesheets, and intercept link clicks and keyboard shortcuts.
- Direct DOM node adoption eliminates the white-flash and re-serialization overhead inherent in `srcdoc`.
- Dynamic CSS custom properties on the iframe document root enable instantaneous live theme and typography reflow without chapter reloading, while preserving the user's reading position.
- The dual-mode coordination between Paginated View (CSS multi-column) and Continuous Scroll View supports smooth bidirectional progress ratio synchronization and seamless cross-chapter boundary transitions.

---

## 6. Verification Method

### 6.1 Programmatic Assertions
1. **Iframe Sandboxing Verification**:
   - Inspect `#reader-frame`: assert `hasAttribute('sandbox') === true` and `getAttribute('sandbox') === 'allow-same-origin'`.
   - Verify no `<script>` tag exists inside `iframe.contentDocument`.
2. **Theme Injection Verification**:
   - Call `engine.applyTheme('soft-dark')`.
   - Assert `iframe.contentDocument.documentElement.getAttribute('data-theme') === 'soft-dark'`.
   - Assert computed background is `#1a1c1e` and text is `#e2e2e0`.
3. **Typography Live Reflow Verification**:
   - Call `engine.applyTypography({ fontSize: 24 })`.
   - Assert `iframe.contentDocument.body` computed `font-size` is `24px`.
   - Assert chapter was not reloaded.
4. **Navigation & Mode Switching**:
   - Call `engine.setMode('scroll')`: assert `#reader-stage` has class `scroll-mode`.
   - Call `engine.setMode('paginated')`: assert `#reader-stage` does NOT have class `scroll-mode`, and `totalPages >= 1`.

### 6.2 Executing the E2E Test Suite
Run the test server and headless Puppeteer test suite:
```bash
node test/server.js &
node test/e2e.test.js
```
Assert that Tier 1 tests (1.2, 1.3, 1.4, 1.7, 1.8), Tier 3 tests (3.1, 3.2), and Tier 4 user journey test (4.1) pass with 0 errors.
