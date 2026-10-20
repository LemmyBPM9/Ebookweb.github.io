# Milestone 2 Technical Analysis & Worker Implementation Blueprint
## Settings Drawer 10-Theme Swatch Grid & Reader Engine Iframe Theme Sync

**Author**: `teamwork_preview_explorer` (Instance `m2_explorer_3`)  
**Date**: 2026-10-17  
**Milestone**: Milestone 2 — Expanded 10 Eye-Comfort Themes & Contrast Engine  
**Technical Focus**:
1. Settings Drawer 10-Theme Swatch Grid (`index.html`, `js/ui/settings-panel.js`, `css/main.css`)
2. Reader Engine Iframe Theme Sync (`js/reader/reader-engine.js`)
3. Synthesized Step-by-Step Blueprint for Worker

---

## 1. Executive Summary

Milestone 2 expands the WebReader eye-comfort palette from the initial 4 baseline themes (`warm-paper`, `soft-dark`, `daylight`, `sage`) to a comprehensive collection of 10 low-fatigue reading themes:
- **Light Themes**: `warm-paper` (Sepia), `daylight` (Off-white), `sage` (Forest Calm), `solarized-light` (Solarized Cream), `e-ink` (Matte Grayscale Paper)
- **Dark Themes**: `soft-dark` (Night Slate), `solarized-dark` (Petrol Blue), `nord` (Arctic Polar Night), `oled-black` (True Pitch Black #000000), `rose-pine` (Dusk Palette)

Every single theme has been mathematically verified to achieve a body text contrast ratio between **10.84:1** and **15.80:1**, comfortably exceeding the **WCAG AAA standard (>= 7.0:1)**.

### Root Causes of Current Test Failures
1. **Settings Drawer Lacks 6 New Themes**: In `index.html:259-279`, `.theme-swatches` only contains buttons for the 4 baseline themes. Tier 1 Test 1.8 immediately fails when waiting for `[data-theme-choice="solarized-light"], #theme-solarized-light, [data-theme="solarized-light"]`.
2. **Missing Accessible Radio Attributes**: The container lacks `id="theme-options"` and `role="radiogroup"`, and the swatch buttons lack `role="radio"`, `aria-checked`, and accessible outline focus styling.
3. **Reader Engine Falls Back on Unknown Themes**: In `js/reader/reader-engine.js:21-54`, `THEME_PALETTES` only defines 4 themes. Line 434 executes:
   ```javascript
   const validTheme = THEME_PALETTES[themeId] ? themeId : 'warm-paper';
   ```
   When any of the 6 new themes is selected, the reader engine silently falls back to `'warm-paper'`.
4. **Lack of Dedicated Iframe Theme Stylesheet**: In `ReaderEngine.applyTheme`, theme variables are set as inline properties on `iframeDoc.documentElement`. Book internal stylesheets and default user-agent styles for links (`a:link`), blockquotes, and code blocks can override these variables or display harsh un-themed colors (e.g. bright blue links on dark backgrounds). A dedicated, synchronous `<style id="webreader-theme-style">` element must be injected and updated inside the chapter iframe.

---

## 2. Palette Specification & Contrast Verification

All 10 themes meet WCAG AAA contrast standards (>= 7.0:1) with zero halation:

| # | Theme ID | Background (`--color-bg`) | Text (`--color-text`) | Surface (`--color-surface`) | Accent (`--color-accent`) | Luminance (BG / Text) | Contrast Ratio | WCAG Compliance |
|---|----------|---------------------------|-----------------------|----------------------------|---------------------------|-----------------------|----------------|-----------------|
| 1 | `warm-paper` | `#f8f1e3` | `#2c2523` | `#efe5d0` | `#8b5a2b` | 0.892 / 0.021 | **13.38:1** | **AAA** |
| 2 | `soft-dark` | `#1a1c1e` | `#e2e2e0` | `#24282c` | `#e5a869` | 0.012 / 0.751 | **13.17:1** | **AAA** |
| 3 | `daylight` | `#fcfbf9` | `#1e2022` | `#f3f2ee` | `#2364a0` | 0.958 / 0.014 | **15.80:1** | **AAA** |
| 4 | `sage` | `#eef3ed` | `#1c2820` | `#e1eae0` | `#2d7348` | 0.891 / 0.020 | **13.60:1** | **AAA** |
| 5 | `solarized-light` | `#fdf6e3` | `#073642` | `#eee8d5` | `#268bd2` | 0.939 / 0.033 | **12.05:1** | **AAA** |
| 6 | `solarized-dark` | `#002b36` | `#eee8d5` | `#073642` | `#2aa198` | 0.022 / 0.832 | **12.25:1** | **AAA** |
| 7 | `nord` | `#2e3440` | `#eceff4` | `#3b4252` | `#88c0d0` | 0.035 / 0.871 | **10.84:1** | **AAA** |
| 8 | `oled-black` | `#000000` | `#dcdcdc` | `#121212` | `#e0e0e0` | 0.000 / 0.715 | **15.31:1** | **AAA** |
| 9 | `rose-pine` | `#191724` | `#e0def4` | `#1f1d2e` | `#ebbcba` | 0.012 / 0.782 | **13.39:1** | **AAA** |
| 10 | `e-ink` | `#f0f0eb` | `#1a1a1a` | `#e4e4dd` | `#2b2b2b` | 0.859 / 0.010 | **15.22:1** | **AAA** |

---

## 3. Settings Drawer 10-Theme Swatch Grid Specification

### 3.1 Markup Architecture (`index.html`)
The container in the Settings Drawer is upgraded from `.theme-swatches` to:
```html
<div class="form-group">
  <label class="form-label" id="theme-group-label">Eye-Comfort Theme</label>
  <div class="theme-swatches theme-options-grid" id="theme-options" role="radiogroup" aria-labelledby="theme-group-label">
    <!-- 10 Theme Swatch Buttons -->
  </div>
</div>
```

Each of the 10 theme options follows a strict accessible contract:
```html
<button type="button"
  id="theme-warm-paper"
  class="theme-swatch-btn theme-option is-active"
  data-theme-choice="warm-paper"
  data-theme="warm-paper"
  role="radio"
  aria-checked="true"
  aria-pressed="true"
  aria-label="Warm Paper (Sepia)"
  tabindex="0">
  <span class="theme-circle" style="background-color: #f8f1e3; border-color: #8b5a2b;"></span>
  <span class="theme-swatch-label">Warm Paper</span>
</button>
```

#### Complete Button Matrix for all 10 Themes:
1. `theme-warm-paper`:
   - `data-theme-choice="warm-paper"` / `data-theme="warm-paper"`
   - Swatch: `background-color: #f8f1e3; border-color: #8b5a2b;`
   - Label: `Warm Paper`
2. `theme-soft-dark`:
   - `data-theme-choice="soft-dark"` / `data-theme="soft-dark"`
   - Swatch: `background-color: #1a1c1e; border-color: #e5a869;`
   - Label: `Soft Dark`
3. `theme-daylight`:
   - `data-theme-choice="daylight"` / `data-theme="daylight"`
   - Swatch: `background-color: #fcfbf9; border-color: #2364a0;`
   - Label: `Daylight`
4. `theme-sage`:
   - `data-theme-choice="sage"` / `data-theme="sage"`
   - Swatch: `background-color: #eef3ed; border-color: #2d7348;`
   - Label: `Sage Calm`
5. `theme-solarized-light`:
   - `data-theme-choice="solarized-light"` / `data-theme="solarized-light"`
   - Swatch: `background-color: #fdf6e3; border-color: #268bd2;`
   - Label: `Solarized Light`
6. `theme-solarized-dark`:
   - `data-theme-choice="solarized-dark"` / `data-theme="solarized-dark"`
   - Swatch: `background-color: #002b36; border-color: #2aa198;`
   - Label: `Solarized Dark`
7. `theme-nord`:
   - `data-theme-choice="nord"` / `data-theme="nord"`
   - Swatch: `background-color: #2e3440; border-color: #88c0d0;`
   - Label: `Nord`
8. `theme-oled-black`:
   - `data-theme-choice="oled-black"` / `data-theme="oled-black"`
   - Swatch: `background-color: #000000; border-color: #dcdcdc;`
   - Label: `OLED Black`
9. `theme-rose-pine`:
   - `data-theme-choice="rose-pine"` / `data-theme="rose-pine"`
   - Swatch: `background-color: #191724; border-color: #ebbcba;`
   - Label: `Rosé Pine`
10. `theme-e-ink`:
    - `data-theme-choice="e-ink"` / `data-theme="e-ink"`
    - Swatch: `background-color: #f0f0eb; border-color: #1a1a1a;`
    - Label: `E-Ink`

### 3.2 Styling & Swatch Grid CSS (`css/main.css`)
In `css/main.css:228-267`:
1. **5x2 Grid Layout**:
   ```css
   .theme-swatches,
   #theme-options {
     display: grid;
     grid-template-columns: repeat(5, 1fr);
     gap: 0.5rem 0.25rem;
   }

   @media (max-width: 340px) {
     .theme-swatches,
     #theme-options {
       grid-template-columns: repeat(2, 1fr);
     }
   }
   ```
2. **Active Outline & Focus States**:
   ```css
   .theme-swatch-btn {
     display: flex;
     flex-direction: column;
     align-items: center;
     justify-content: center;
     gap: 0.35rem;
     padding: 0.5rem 0.2rem;
     border-radius: 8px;
     border: 2px solid transparent;
     background-color: var(--color-surface);
     cursor: pointer;
     transition: border-color 0.15s ease, transform 0.1s ease, outline 0.15s ease, background-color 0.15s ease;
     user-select: none;
     -webkit-user-select: none;
   }

   .theme-swatch-btn:hover {
     transform: translateY(-1px);
     background-color: var(--color-surface-hover);
   }

   .theme-swatch-btn.is-active,
   .theme-swatch-btn[aria-checked="true"],
   .theme-swatch-btn.active {
     border-color: var(--color-accent);
     outline: 2px solid var(--color-accent);
     outline-offset: 1px;
     background-color: var(--color-surface-hover);
   }

   .theme-swatch-btn:focus-visible {
     outline: 2px solid var(--color-focus-ring, var(--color-accent));
     outline-offset: 2px;
   }
   ```
3. **Circle Swatch & Dark Mode Contrast**:
   ```css
   .theme-circle {
     width: 26px;
     height: 26px;
     border-radius: 50%;
     border: 2px solid rgba(0, 0, 0, 0.2);
     box-sizing: border-box;
     flex-shrink: 0;
     box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
   }

   /* High contrast swatch boundary for dark mode */
   [data-theme="soft-dark"] .theme-circle,
   [data-theme="solarized-dark"] .theme-circle,
   [data-theme="nord"] .theme-circle,
   [data-theme="oled-black"] .theme-circle,
   [data-theme="rose-pine"] .theme-circle {
     border-color: rgba(255, 255, 255, 0.25);
   }

   .theme-swatch-label {
     font-size: 0.6875rem;
     font-weight: 500;
     color: var(--color-text-secondary);
     text-align: center;
     line-height: 1.15;
     white-space: normal;
     word-break: break-word;
     max-width: 100%;
   }

   .theme-swatch-btn.is-active .theme-swatch-label,
   .theme-swatch-btn[aria-checked="true"] .theme-swatch-label {
     font-weight: 600;
     color: var(--color-text);
   }
   ```

### 3.3 Controller Updates (`js/ui/settings-panel.js`)
1. **Multi-Attribute Selector Support**:
   Query theme buttons with `this.drawer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')`.
2. **Event Handling & Two-Way Sync**:
   When a theme button is clicked:
   ```javascript
   const themeId = btn.getAttribute('data-theme-choice') || btn.getAttribute('data-theme');
   if (themeId) {
     SettingsManager.setTheme(themeId);
     document.documentElement.setAttribute('data-theme', themeId);
     if (document.body) document.body.setAttribute('data-theme', themeId);
     EventBus.emit('ui:set-theme', { themeId });
     EventBus.emit(EVENTS.THEME_CHANGED, { themeId });
     this.syncUI();
   }
   ```
3. **ARIA Radio Group Keyboard Navigation**:
   Support Arrow keys (`ArrowRight`, `ArrowLeft`, `ArrowDown`, `ArrowUp`), `Home`, and `End` across the 10 swatches:
   - Moves focus with roving `tabindex="0"`.
   - Immediately selects the newly focused theme.
4. **Subscribe to External Theme Changes**:
   In constructor:
   ```javascript
   EventBus.on(EVENTS.THEME_CHANGED, () => this.syncUI());
   ```
5. **State Synchronization in `syncUI()`**:
   ```javascript
   syncUI() {
     if (!this.drawer) return;
     const theme = SettingsManager.getTheme();
     const typo = SettingsManager.getTypography();

     const themeBtns = Array.from(
       this.drawer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
     );
     for (const btn of themeBtns) {
       const btnTheme = btn.getAttribute('data-theme-choice') || btn.getAttribute('data-theme');
       const isMatch = btnTheme === theme;
       btn.classList.toggle('is-active', isMatch);
       btn.classList.toggle('active', isMatch);
       btn.setAttribute('aria-checked', String(isMatch));
       btn.setAttribute('aria-pressed', String(isMatch));
       btn.setAttribute('tabindex', isMatch ? '0' : '-1');
     }
     // ... sync typography sliders ...
   }
   ```

---

## 4. Reader Engine Iframe Theme Sync Architecture (`js/reader/reader-engine.js`)

### 4.1 Expand `THEME_PALETTES` to all 10 Themes
In `js/reader/reader-engine.js:21-55`:
```javascript
export const THEME_PALETTES = Object.freeze({
  'warm-paper': {
    '--color-bg': '#f8f1e3',
    '--color-surface': '#efe5d0',
    '--color-text': '#2c2523',
    '--color-text-secondary': '#5c504a',
    '--color-accent': '#8b5a2b',
    '--color-accent-hover': '#724820',
    '--color-border': '#dfd3bd',
    '--color-highlight': '#fcedbe'
  },
  'soft-dark': {
    '--color-bg': '#1a1c1e',
    '--color-surface': '#24282c',
    '--color-text': '#e2e2e0',
    '--color-text-secondary': '#9e9e9a',
    '--color-accent': '#e5a869',
    '--color-accent-hover': '#f3be86',
    '--color-border': '#33383e',
    '--color-highlight': '#453c28'
  },
  'daylight': {
    '--color-bg': '#fcfbf9',
    '--color-surface': '#f3f2ee',
    '--color-text': '#1e2022',
    '--color-text-secondary': '#555b62',
    '--color-accent': '#2364a0',
    '--color-accent-hover': '#1b4f80',
    '--color-border': '#e0dfd9',
    '--color-highlight': '#e1ecf8'
  },
  'sage': {
    '--color-bg': '#eef3ed',
    '--color-surface': '#e1eae0',
    '--color-text': '#1c2820',
    '--color-text-secondary': '#4a5d50',
    '--color-accent': '#2d7348',
    '--color-accent-hover': '#225636',
    '--color-border': '#cfdcd0',
    '--color-highlight': '#d7eedc'
  },
  'solarized-light': {
    '--color-bg': '#fdf6e3',
    '--color-surface': '#eee8d5',
    '--color-text': '#073642',
    '--color-text-secondary': '#586e75',
    '--color-accent': '#268bd2',
    '--color-accent-hover': '#1f70a8',
    '--color-border': '#d8d1bc',
    '--color-highlight': '#fbf0c8'
  },
  'solarized-dark': {
    '--color-bg': '#002b36',
    '--color-surface': '#073642',
    '--color-text': '#eee8d5',
    '--color-text-secondary': '#93a1a1',
    '--color-accent': '#2aa198',
    '--color-accent-hover': '#36b9af',
    '--color-border': '#0d404f',
    '--color-highlight': '#054354'
  },
  'nord': {
    '--color-bg': '#2e3440',
    '--color-surface': '#3b4252',
    '--color-text': '#eceff4',
    '--color-text-secondary': '#d8dee9',
    '--color-accent': '#88c0d0',
    '--color-accent-hover': '#81a1c1',
    '--color-border': '#434c5e',
    '--color-highlight': '#3f4a5c'
  },
  'oled-black': {
    '--color-bg': '#000000',
    '--color-surface': '#121212',
    '--color-text': '#dcdcdc',
    '--color-text-secondary': '#a0a0a0',
    '--color-accent': '#e0e0e0',
    '--color-accent-hover': '#ffffff',
    '--color-border': '#262626',
    '--color-highlight': '#262626'
  },
  'rose-pine': {
    '--color-bg': '#191724',
    '--color-surface': '#1f1d2e',
    '--color-text': '#e0def4',
    '--color-text-secondary': '#908caa',
    '--color-accent': '#ebbcba',
    '--color-accent-hover': '#eb6f92',
    '--color-border': '#26233a',
    '--color-highlight': '#2a273f'
  },
  'e-ink': {
    '--color-bg': '#f0f0eb',
    '--color-surface': '#e4e4dd',
    '--color-text': '#1a1a1a',
    '--color-text-secondary': '#4d4d4d',
    '--color-accent': '#2b2b2b',
    '--color-accent-hover': '#000000',
    '--color-border': '#cccccc',
    '--color-highlight': '#deded6'
  }
});
```

### 4.2 Upgraded `applyTheme(themeId)` & Iframe Stylesheet Injection
In `js/reader/reader-engine.js`:
```javascript
  /**
   * Applies one of the 10 eye-comfort themes to both host DOM and sandboxed iframe.
   * Injects/updates the theme stylesheet inside the chapter iframe.
   * @param {string} themeId
   */
  applyTheme(themeId) {
    const validTheme = THEME_PALETTES[themeId] ? themeId : 'warm-paper';
    this.themeId = validTheme;
    SettingsManager.setTheme(validTheme);

    // Apply to host root, body and reader stage
    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
      document.body.setAttribute('data-theme', validTheme);
    }
    if (this.stage) {
      this.stage.setAttribute('data-theme', validTheme);
    }

    const palette = THEME_PALETTES[validTheme];
    const iframeDoc = this.iframe?.contentDocument;
    if (iframeDoc && iframeDoc.documentElement) {
      iframeDoc.documentElement.setAttribute('data-theme', validTheme);
      for (const [prop, val] of Object.entries(palette)) {
        iframeDoc.documentElement.style.setProperty(prop, val);
      }
      if (iframeDoc.body) {
        iframeDoc.body.style.backgroundColor = palette['--color-bg'];
        iframeDoc.body.style.color = palette['--color-text'];
      }

      // Synchronously inject or update dedicated theme stylesheet inside iframe
      this._injectIframeThemeStylesheet(iframeDoc, validTheme, palette);
    }

    EventBus.emit(EVENTS.THEME_CHANGED, { themeId: validTheme });
  }

  /**
   * Injects or updates high-specificity theme override rules inside the iframe.
   * @param {Document} iframeDoc
   * @param {string} themeId
   * @param {object} palette
   * @private
   */
  _injectIframeThemeStylesheet(iframeDoc, themeId, palette) {
    if (!iframeDoc || !iframeDoc.head) return;

    let styleEl = iframeDoc.getElementById('webreader-theme-style');
    if (!styleEl) {
      styleEl = iframeDoc.createElement('style');
      styleEl.id = 'webreader-theme-style';
      iframeDoc.head.appendChild(styleEl);
    }

    const isDark = ['soft-dark', 'solarized-dark', 'nord', 'oled-black', 'rose-pine'].includes(themeId);

    styleEl.textContent = `
      :root, [data-theme="${themeId}"] {
        color-scheme: ${isDark ? 'dark' : 'light'};
        --color-bg: ${palette['--color-bg']} !important;
        --color-surface: ${palette['--color-surface']} !important;
        --color-text: ${palette['--color-text']} !important;
        --color-text-secondary: ${palette['--color-text-secondary']} !important;
        --color-accent: ${palette['--color-accent']} !important;
        --color-accent-hover: ${palette['--color-accent-hover']} !important;
        --color-border: ${palette['--color-border']} !important;
        --color-highlight: ${palette['--color-highlight']} !important;
      }
      html, body {
        background-color: var(--color-bg) !important;
        color: var(--color-text) !important;
      }
      body, p, div, span, li, dd, dt {
        color: var(--color-text) !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: var(--color-text) !important;
      }
      a, a:link, a:visited {
        color: var(--color-accent) !important;
        text-decoration: underline;
        text-decoration-color: var(--color-accent);
      }
      a:hover, a:active {
        color: var(--color-accent-hover) !important;
      }
      blockquote {
        border-left: 3px solid var(--color-accent) !important;
        color: var(--color-text-secondary) !important;
        background: transparent !important;
      }
      code, pre, kbd, samp {
        background-color: var(--color-surface) !important;
        color: var(--color-text) !important;
        border: 1px solid var(--color-border) !important;
      }
      hr {
        border: none !important;
        border-top: 1px solid var(--color-border) !important;
      }
      table, th, td {
        border-color: var(--color-border) !important;
      }
      th {
        background-color: var(--color-surface) !important;
        color: var(--color-text) !important;
      }
      ::selection {
        background-color: var(--color-highlight) !important;
        color: inherit !important;
      }
    `;
  }
```

---

## 5. Step-by-Step Implementation Blueprint for Worker

The worker should execute changes across 4 files in this exact order:

### Step 1: `index.html` — Settings Drawer Swatch Grid
- **Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/index.html`
- **Lines**: ~257 to 281
- **TargetContent**:
```html
        <!-- Eye-Comfort Color Themes -->
        <div class="form-group">
          <label class="form-label">Eye-Comfort Theme</label>
          <div class="theme-swatches">
            <button type="button" id="theme-warm-paper" class="theme-swatch-btn is-active" data-theme-choice="warm-paper" aria-pressed="true">
              <span class="theme-circle" style="background-color: #f8f1e3; border-color: #8b5a2b;"></span>
              <span class="theme-swatch-label">Warm Paper</span>
            </button>

            <button type="button" id="theme-soft-dark" class="theme-swatch-btn" data-theme-choice="soft-dark" aria-pressed="false">
              <span class="theme-circle" style="background-color: #1a1c1e; border-color: #e5a869;"></span>
              <span class="theme-swatch-label">Soft Dark</span>
            </button>

            <button type="button" id="theme-daylight" class="theme-swatch-btn" data-theme-choice="daylight" aria-pressed="false">
              <span class="theme-circle" style="background-color: #fcfbf9; border-color: #2364a0;"></span>
              <span class="theme-swatch-label">Daylight</span>
            </button>

            <button type="button" id="theme-sage" class="theme-swatch-btn" data-theme-choice="sage" aria-pressed="false">
              <span class="theme-circle" style="background-color: #eef3ed; border-color: #2d7348;"></span>
              <span class="theme-swatch-label">Sage Calm</span>
            </button>
          </div>
        </div>
```
- **ReplacementContent**:
```html
        <!-- Eye-Comfort Color Themes -->
        <div class="form-group">
          <label class="form-label" id="theme-group-label">Eye-Comfort Theme</label>
          <div class="theme-swatches theme-options-grid" id="theme-options" role="radiogroup" aria-labelledby="theme-group-label">
            <button type="button" id="theme-warm-paper" class="theme-swatch-btn theme-option is-active" data-theme-choice="warm-paper" data-theme="warm-paper" role="radio" aria-checked="true" aria-pressed="true" aria-label="Warm Paper (Sepia)" tabindex="0">
              <span class="theme-circle" style="background-color: #f8f1e3; border-color: #8b5a2b;"></span>
              <span class="theme-swatch-label">Warm Paper</span>
            </button>

            <button type="button" id="theme-soft-dark" class="theme-swatch-btn theme-option" data-theme-choice="soft-dark" data-theme="soft-dark" role="radio" aria-checked="false" aria-pressed="false" aria-label="Soft Dark (Night)" tabindex="-1">
              <span class="theme-circle" style="background-color: #1a1c1e; border-color: #e5a869;"></span>
              <span class="theme-swatch-label">Soft Dark</span>
            </button>

            <button type="button" id="theme-daylight" class="theme-swatch-btn theme-option" data-theme-choice="daylight" data-theme="daylight" role="radio" aria-checked="false" aria-pressed="false" aria-label="Daylight (Clean Light)" tabindex="-1">
              <span class="theme-circle" style="background-color: #fcfbf9; border-color: #2364a0;"></span>
              <span class="theme-swatch-label">Daylight</span>
            </button>

            <button type="button" id="theme-sage" class="theme-swatch-btn theme-option" data-theme-choice="sage" data-theme="sage" role="radio" aria-checked="false" aria-pressed="false" aria-label="Sage Calm (Forest)" tabindex="-1">
              <span class="theme-circle" style="background-color: #eef3ed; border-color: #2d7348;"></span>
              <span class="theme-swatch-label">Sage Calm</span>
            </button>

            <button type="button" id="theme-solarized-light" class="theme-swatch-btn theme-option" data-theme-choice="solarized-light" data-theme="solarized-light" role="radio" aria-checked="false" aria-pressed="false" aria-label="Solarized Light" tabindex="-1">
              <span class="theme-circle" style="background-color: #fdf6e3; border-color: #268bd2;"></span>
              <span class="theme-swatch-label">Solarized Light</span>
            </button>

            <button type="button" id="theme-solarized-dark" class="theme-swatch-btn theme-option" data-theme-choice="solarized-dark" data-theme="solarized-dark" role="radio" aria-checked="false" aria-pressed="false" aria-label="Solarized Dark" tabindex="-1">
              <span class="theme-circle" style="background-color: #002b36; border-color: #2aa198;"></span>
              <span class="theme-swatch-label">Solarized Dark</span>
            </button>

            <button type="button" id="theme-nord" class="theme-swatch-btn theme-option" data-theme-choice="nord" data-theme="nord" role="radio" aria-checked="false" aria-pressed="false" aria-label="Nord (Arctic)" tabindex="-1">
              <span class="theme-circle" style="background-color: #2e3440; border-color: #88c0d0;"></span>
              <span class="theme-swatch-label">Nord</span>
            </button>

            <button type="button" id="theme-oled-black" class="theme-swatch-btn theme-option" data-theme-choice="oled-black" data-theme="oled-black" role="radio" aria-checked="false" aria-pressed="false" aria-label="OLED Black" tabindex="-1">
              <span class="theme-circle" style="background-color: #000000; border-color: #dcdcdc;"></span>
              <span class="theme-swatch-label">OLED Black</span>
            </button>

            <button type="button" id="theme-rose-pine" class="theme-swatch-btn theme-option" data-theme-choice="rose-pine" data-theme="rose-pine" role="radio" aria-checked="false" aria-pressed="false" aria-label="Rosé Pine" tabindex="-1">
              <span class="theme-circle" style="background-color: #191724; border-color: #ebbcba;"></span>
              <span class="theme-swatch-label">Rosé Pine</span>
            </button>

            <button type="button" id="theme-e-ink" class="theme-swatch-btn theme-option" data-theme-choice="e-ink" data-theme="e-ink" role="radio" aria-checked="false" aria-pressed="false" aria-label="E-Ink (Grayscale)" tabindex="-1">
              <span class="theme-circle" style="background-color: #f0f0eb; border-color: #1a1a1a;"></span>
              <span class="theme-swatch-label">E-Ink</span>
            </button>
          </div>
        </div>
```

---

### Step 2: `css/main.css` — 10-Theme Swatch Grid Styles
- **Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/css/main.css`
- **Lines**: ~227 to 267
- **TargetContent**:
```css
/* Theme Swatches Selector */
.theme-swatches {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.theme-swatch-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.25rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background-color: var(--color-surface);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease;
}

.theme-swatch-btn:hover {
  transform: translateY(-1px);
}

.theme-swatch-btn.is-active {
  border-color: var(--color-accent);
}

.theme-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.theme-swatch-label {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}
```
- **ReplacementContent**:
```css
/* Theme Swatches Selector (10-Theme Responsive Grid) */
.theme-swatches,
#theme-options {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem 0.25rem;
}

@media (max-width: 340px) {
  .theme-swatches,
  #theme-options {
    grid-template-columns: repeat(2, 1fr);
  }
}

.theme-swatch-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.5rem 0.2rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background-color: var(--color-surface);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease, outline 0.15s ease, background-color 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}

.theme-swatch-btn:hover {
  transform: translateY(-1px);
  background-color: var(--color-surface-hover);
}

.theme-swatch-btn.is-active,
.theme-swatch-btn[aria-checked="true"],
.theme-swatch-btn.active {
  border-color: var(--color-accent);
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
  background-color: var(--color-surface-hover);
}

.theme-swatch-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring, var(--color-accent));
  outline-offset: 2px;
}

.theme-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.2);
  box-sizing: border-box;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* High contrast swatch boundary for dark mode */
[data-theme="soft-dark"] .theme-circle,
[data-theme="solarized-dark"] .theme-circle,
[data-theme="nord"] .theme-circle,
[data-theme="oled-black"] .theme-circle,
[data-theme="rose-pine"] .theme-circle {
  border-color: rgba(255, 255, 255, 0.25);
}

.theme-swatch-label {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.15;
  white-space: normal;
  word-break: break-word;
  max-width: 100%;
}

.theme-swatch-btn.is-active .theme-swatch-label,
.theme-swatch-btn[aria-checked="true"] .theme-swatch-label {
  font-weight: 600;
  color: var(--color-text);
}
```

---

### Step 3: `js/ui/settings-panel.js` — Settings Panel Controller
- **Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/ui/settings-panel.js`
- **Lines**: ~17 to 44 and ~100 to 111
- **TargetContent 1** (Constructor & theme button binding):
```javascript
  constructor(options = {}) {
    this.drawer = options.drawer;
    this.backdrop = options.backdrop;
    this.closeBtn = this.drawer?.querySelector('#btn-close-settings');

    this._bindControls();
    this.syncUI();
  }

  _bindControls() {
    if (!this.drawer) return;

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // 1. Theme Swatches
    const themeBtns = Array.from(this.drawer.querySelectorAll('[data-theme-choice]'));
    for (const btn of themeBtns) {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme-choice');
        if (themeId) {
          EventBus.emit('ui:set-theme', { themeId });
          this.syncUI();
        }
      });
    }
```
- **ReplacementContent 1**:
```javascript
  constructor(options = {}) {
    this.drawer = options.drawer;
    this.backdrop = options.backdrop;
    this.closeBtn = this.drawer?.querySelector('#btn-close-settings');

    this._bindControls();
    this.syncUI();

    // Listen to theme changes from ReaderEngine or external events
    EventBus.on(EVENTS.THEME_CHANGED, () => this.syncUI());
  }

  _bindControls() {
    if (!this.drawer) return;

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // 1. Theme Swatches (Handles all 10 themes with accessible radio group interaction)
    const themeBtns = Array.from(
      this.drawer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
    );
    for (const btn of themeBtns) {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme-choice') || btn.getAttribute('data-theme');
        if (themeId) {
          SettingsManager.setTheme(themeId);
          document.documentElement.setAttribute('data-theme', themeId);
          if (document.body) document.body.setAttribute('data-theme', themeId);
          EventBus.emit('ui:set-theme', { themeId });
          EventBus.emit(EVENTS.THEME_CHANGED, { themeId });
          this.syncUI();
        }
      });
    }

    // Keyboard Arrow navigation inside #theme-options radio group
    const themeContainer = this.drawer.querySelector('#theme-options, .theme-swatches');
    if (themeContainer) {
      themeContainer.addEventListener('keydown', (e) => {
        const btns = Array.from(
          themeContainer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
        );
        const currentIndex = btns.findIndex(b => b === document.activeElement);
        if (currentIndex === -1) return;

        let targetIndex = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          targetIndex = (currentIndex + 1) % btns.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          targetIndex = (currentIndex - 1 + btns.length) % btns.length;
        } else if (e.key === 'Home') {
          targetIndex = 0;
        } else if (e.key === 'End') {
          targetIndex = btns.length - 1;
        }

        if (targetIndex !== -1) {
          e.preventDefault();
          const targetBtn = btns[targetIndex];
          targetBtn.focus();
          targetBtn.click();
        }
      });
    }
```
- **TargetContent 2** (`syncUI` theme button updating):
```javascript
    const themeBtns = Array.from(this.drawer.querySelectorAll('[data-theme-choice]'));
    for (const btn of themeBtns) {
      const isMatch = btn.getAttribute('data-theme-choice') === theme;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    }
```
- **ReplacementContent 2**:
```javascript
    const themeBtns = Array.from(
      this.drawer.querySelectorAll('[data-theme-choice], [data-theme], .theme-option')
    );
    for (const btn of themeBtns) {
      const btnTheme = btn.getAttribute('data-theme-choice') || btn.getAttribute('data-theme');
      const isMatch = btnTheme === theme;
      btn.classList.toggle('is-active', isMatch);
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-checked', String(isMatch));
      btn.setAttribute('aria-pressed', String(isMatch));
      btn.setAttribute('tabindex', isMatch ? '0' : '-1');
    }
```

---

### Step 4: `js/reader/reader-engine.js` — 10 Palettes & Iframe Theme Stylesheet
- **Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/reader/reader-engine.js`
- **Lines**: ~21 to 55 and ~430 to 461
- **TargetContent 1** (`THEME_PALETTES`):
```javascript
export const THEME_PALETTES = Object.freeze({
  'warm-paper': {
    '--color-bg': '#f8f1e3',
    '--color-surface': '#efe5d0',
    '--color-text': '#2c2523',
    '--color-text-secondary': '#5c504a',
    '--color-accent': '#8b5a2b',
    '--color-border': '#dfd3bd'
  },
  'soft-dark': {
    '--color-bg': '#1a1c1e',
    '--color-surface': '#24282c',
    '--color-text': '#e2e2e0',
    '--color-text-secondary': '#9e9e9a',
    '--color-accent': '#e5a869',
    '--color-border': '#33383e'
  },
  'daylight': {
    '--color-bg': '#fcfbf9',
    '--color-surface': '#f3f2ee',
    '--color-text': '#1e2022',
    '--color-text-secondary': '#555b62',
    '--color-accent': '#2364a0',
    '--color-border': '#e0dfd9'
  },
  'sage': {
    '--color-bg': '#eef3ed',
    '--color-surface': '#e1eae0',
    '--color-text': '#1c2820',
    '--color-text-secondary': '#4a5d50',
    '--color-accent': '#2d7348',
    '--color-border': '#cfdcd0'
  }
});
```
- **ReplacementContent 1**:
```javascript
export const THEME_PALETTES = Object.freeze({
  'warm-paper': {
    '--color-bg': '#f8f1e3',
    '--color-surface': '#efe5d0',
    '--color-text': '#2c2523',
    '--color-text-secondary': '#5c504a',
    '--color-accent': '#8b5a2b',
    '--color-accent-hover': '#724820',
    '--color-border': '#dfd3bd',
    '--color-highlight': '#fcedbe'
  },
  'soft-dark': {
    '--color-bg': '#1a1c1e',
    '--color-surface': '#24282c',
    '--color-text': '#e2e2e0',
    '--color-text-secondary': '#9e9e9a',
    '--color-accent': '#e5a869',
    '--color-accent-hover': '#f3be86',
    '--color-border': '#33383e',
    '--color-highlight': '#453c28'
  },
  'daylight': {
    '--color-bg': '#fcfbf9',
    '--color-surface': '#f3f2ee',
    '--color-text': '#1e2022',
    '--color-text-secondary': '#555b62',
    '--color-accent': '#2364a0',
    '--color-accent-hover': '#1b4f80',
    '--color-border': '#e0dfd9',
    '--color-highlight': '#e1ecf8'
  },
  'sage': {
    '--color-bg': '#eef3ed',
    '--color-surface': '#e1eae0',
    '--color-text': '#1c2820',
    '--color-text-secondary': '#4a5d50',
    '--color-accent': '#2d7348',
    '--color-accent-hover': '#225636',
    '--color-border': '#cfdcd0',
    '--color-highlight': '#d7eedc'
  },
  'solarized-light': {
    '--color-bg': '#fdf6e3',
    '--color-surface': '#eee8d5',
    '--color-text': '#073642',
    '--color-text-secondary': '#586e75',
    '--color-accent': '#268bd2',
    '--color-accent-hover': '#1f70a8',
    '--color-border': '#d8d1bc',
    '--color-highlight': '#fbf0c8'
  },
  'solarized-dark': {
    '--color-bg': '#002b36',
    '--color-surface': '#073642',
    '--color-text': '#eee8d5',
    '--color-text-secondary': '#93a1a1',
    '--color-accent': '#2aa198',
    '--color-accent-hover': '#36b9af',
    '--color-border': '#0d404f',
    '--color-highlight': '#054354'
  },
  'nord': {
    '--color-bg': '#2e3440',
    '--color-surface': '#3b4252',
    '--color-text': '#eceff4',
    '--color-text-secondary': '#d8dee9',
    '--color-accent': '#88c0d0',
    '--color-accent-hover': '#81a1c1',
    '--color-border': '#434c5e',
    '--color-highlight': '#3f4a5c'
  },
  'oled-black': {
    '--color-bg': '#000000',
    '--color-surface': '#121212',
    '--color-text': '#dcdcdc',
    '--color-text-secondary': '#a0a0a0',
    '--color-accent': '#e0e0e0',
    '--color-accent-hover': '#ffffff',
    '--color-border': '#262626',
    '--color-highlight': '#262626'
  },
  'rose-pine': {
    '--color-bg': '#191724',
    '--color-surface': '#1f1d2e',
    '--color-text': '#e0def4',
    '--color-text-secondary': '#908caa',
    '--color-accent': '#ebbcba',
    '--color-accent-hover': '#eb6f92',
    '--color-border': '#26233a',
    '--color-highlight': '#2a273f'
  },
  'e-ink': {
    '--color-bg': '#f0f0eb',
    '--color-surface': '#e4e4dd',
    '--color-text': '#1a1a1a',
    '--color-text-secondary': '#4d4d4d',
    '--color-accent': '#2b2b2b',
    '--color-accent-hover': '#000000',
    '--color-border': '#cccccc',
    '--color-highlight': '#deded6'
  }
});
```

- **TargetContent 2** (`applyTheme`):
```javascript
  /**
   * Applies one of the 4 eye-comfort themes to both host DOM and sandboxed iframe.
   * @param {string} themeId
   */
  applyTheme(themeId) {
    const validTheme = THEME_PALETTES[themeId] ? themeId : 'warm-paper';
    this.themeId = validTheme;
    SettingsManager.setTheme(validTheme);

    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
      document.body.setAttribute('data-theme', validTheme);
    }
    if (this.stage) {
      this.stage.setAttribute('data-theme', validTheme);
    }

    const palette = THEME_PALETTES[validTheme];
    const iframeDoc = this.iframe?.contentDocument;
    if (iframeDoc && iframeDoc.documentElement) {
      iframeDoc.documentElement.setAttribute('data-theme', validTheme);
      for (const [prop, val] of Object.entries(palette)) {
        iframeDoc.documentElement.style.setProperty(prop, val);
      }
      if (iframeDoc.body) {
        iframeDoc.body.style.backgroundColor = palette['--color-bg'];
        iframeDoc.body.style.color = palette['--color-text'];
      }
    }

    EventBus.emit(EVENTS.THEME_CHANGED, { themeId: validTheme });
  }
```
- **ReplacementContent 2**:
```javascript
  /**
   * Applies one of the 10 eye-comfort themes to both host DOM and sandboxed iframe.
   * Injects/updates the theme stylesheet inside the chapter iframe.
   * @param {string} themeId
   */
  applyTheme(themeId) {
    const validTheme = THEME_PALETTES[themeId] ? themeId : 'warm-paper';
    this.themeId = validTheme;
    SettingsManager.setTheme(validTheme);

    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
      document.body.setAttribute('data-theme', validTheme);
    }
    if (this.stage) {
      this.stage.setAttribute('data-theme', validTheme);
    }

    const palette = THEME_PALETTES[validTheme];
    const iframeDoc = this.iframe?.contentDocument;
    if (iframeDoc && iframeDoc.documentElement) {
      iframeDoc.documentElement.setAttribute('data-theme', validTheme);
      for (const [prop, val] of Object.entries(palette)) {
        iframeDoc.documentElement.style.setProperty(prop, val);
      }
      if (iframeDoc.body) {
        iframeDoc.body.style.backgroundColor = palette['--color-bg'];
        iframeDoc.body.style.color = palette['--color-text'];
      }

      // Synchronously inject or update dedicated theme stylesheet inside iframe
      this._injectIframeThemeStylesheet(iframeDoc, validTheme, palette);
    }

    EventBus.emit(EVENTS.THEME_CHANGED, { themeId: validTheme });
  }

  /**
   * Injects or updates high-specificity theme override rules inside the iframe.
   * @param {Document} iframeDoc
   * @param {string} themeId
   * @param {object} palette
   * @private
   */
  _injectIframeThemeStylesheet(iframeDoc, themeId, palette) {
    if (!iframeDoc || !iframeDoc.head) return;

    let styleEl = iframeDoc.getElementById('webreader-theme-style');
    if (!styleEl) {
      styleEl = iframeDoc.createElement('style');
      styleEl.id = 'webreader-theme-style';
      iframeDoc.head.appendChild(styleEl);
    }

    const isDark = ['soft-dark', 'solarized-dark', 'nord', 'oled-black', 'rose-pine'].includes(themeId);

    styleEl.textContent = `
      :root, [data-theme="${themeId}"] {
        color-scheme: ${isDark ? 'dark' : 'light'};
        --color-bg: ${palette['--color-bg']} !important;
        --color-surface: ${palette['--color-surface']} !important;
        --color-text: ${palette['--color-text']} !important;
        --color-text-secondary: ${palette['--color-text-secondary']} !important;
        --color-accent: ${palette['--color-accent']} !important;
        --color-accent-hover: ${palette['--color-accent-hover']} !important;
        --color-border: ${palette['--color-border']} !important;
        --color-highlight: ${palette['--color-highlight']} !important;
      }
      html, body {
        background-color: var(--color-bg) !important;
        color: var(--color-text) !important;
      }
      body, p, div, span, li, dd, dt {
        color: var(--color-text) !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: var(--color-text) !important;
      }
      a, a:link, a:visited {
        color: var(--color-accent) !important;
        text-decoration: underline;
        text-decoration-color: var(--color-accent);
      }
      a:hover, a:active {
        color: var(--color-accent-hover) !important;
      }
      blockquote {
        border-left: 3px solid var(--color-accent) !important;
        color: var(--color-text-secondary) !important;
        background: transparent !important;
      }
      code, pre, kbd, samp {
        background-color: var(--color-surface) !important;
        color: var(--color-text) !important;
        border: 1px solid var(--color-border) !important;
      }
      hr {
        border: none !important;
        border-top: 1px solid var(--color-border) !important;
      }
      table, th, td {
        border-color: var(--color-border) !important;
      }
      th {
        background-color: var(--color-surface) !important;
        color: var(--color-text) !important;
      }
      ::selection {
        background-color: var(--color-highlight) !important;
        color: inherit !important;
      }
    `;
  }
```

---

## 6. Verification & Test Plan

1. **Automated Tier 1 Theme Assertions**:
   ```bash
   node test/e2e_upgrade.test.js --tier=1
   ```
   - Test 1.8 (`All 10 Eye-Comfort Themes & WCAG AAA Contrast Assertions (>= 7.0:1)`) clicks every swatch and validates:
     - `document.documentElement.getAttribute('data-theme') === theme`
     - Computed contrast ratio >= 7.0:1 for all 10 themes.
2. **Baseline Regression Verification**:
   ```bash
   npm test -- --tier=0
   npm test -- --tier=1
   ```
   Asserts 100% pass on baseline EPUB tests without regressions.
3. **Manual Iframe Theme Inspection**:
   - Open reader with sample book or any EPUB/TXT/MD document.
   - Open Settings Drawer (`Aa` button).
   - Click each of the 10 theme swatches:
     - Verify active outline highlight updates immediately.
     - Verify outer UI and inner iframe change colors synchronously.
     - Verify links, headers, code blocks, and blockquotes inside the chapter adopt theme accent and text colors without halation or harsh white glare.
   - Use Arrow keys to navigate between swatches; verify keyboard focus and selection wrap around smoothly.
