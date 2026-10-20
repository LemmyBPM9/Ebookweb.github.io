# Technical Blueprint: Zero-FOUC Inline Head Bootstrap & Storage Settings for 10 Eye-Comfort Themes

**Milestone**: Milestone 2 — Expanded 10 Eye-Comfort Themes & Contrast Engine  
**Author**: teamwork_preview_explorer (`m2_explorer_2`)  
**Date**: 2026-10-17  
**Working Directory**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_explorer_2/`  

---

## 1. Executive Summary & Problem Statement

### 1.1 Context
In Milestone 2, WebReader expands its color palette from 4 baseline eye-comfort themes to **10 curated eye-comfort themes**:
1. `warm-paper` (Sepia / Warm Cream — Default)
2. `soft-dark` (Night / Low-Blue-Light Slate)
3. `daylight` (Clean Light / Off-White)
4. `sage` (Forest Calm / Muted Green)
5. `solarized-light` (Warm Cream / Slate Teal)
6. `solarized-dark` (Petrol Blue / Soft Stone)
7. `nord` (Arctic Slate Grey)
8. `oled-black` (True Pitch-Black / Dimmed Silver)
9. `rose-pine` (Muted Dusk / Rose Cream)
10. `e-ink` (Matte Grayscale Paper)

### 1.2 Observed Failures & Root Causes
When running the upgrade verification test `test/e2e_upgrade.test.js --tier=1` (specifically Test 1.9), the test fails with:
```
• 1.9 Zero-FOUC Theme Boot & Persistence Across Reload for 10 Themes ... FAILED (1118ms)
  Error: Synchronous head script must restore "nord" theme on initial DOM load: expected "nord", got "warm-paper"
      at assertEqual (test/e2e_upgrade.test.js:114:11)
      at Object.fn (test/e2e_upgrade.test.js:742:7)
```

The investigation revealed two critical bottlenecks hardcoding the legacy 4 themes:
1. **`index.html` (Lines 11–15)**: The inline `<head>` script hardcodes `var allowed = ['warm-paper', 'soft-dark', 'daylight', 'sage'];`. When a user reloads the page with any of the 6 new themes in `localStorage` (such as `nord`), `allowed.indexOf(theme) === -1`, resetting the theme to `warm-paper`. Furthermore, it only calls `document.documentElement.setAttribute('data-theme', theme)`, but should also explicitly set `document.documentElement.dataset.theme = theme`.
2. **`js/storage/settings-store.js` (Lines 7–15 & 68–83)**: The `THEMES` object and `VALID_THEMES` array only define the 4 baseline themes. Any attempt by `SettingsManager.getTheme()` or `SettingsManager.setTheme()` to retrieve or persist one of the 6 new themes is rejected by `VALID_THEMES.includes(theme)` and falls back to `THEMES.WARM_PAPER`.

---

## 2. Technical Focus 1: Zero-FOUC Inline Head Bootstrap (`index.html`)

### 2.1 Browser Pipeline & Zero-FOUC Architecture
Flash of Unstyled Content (FOUC) occurs when a web browser renders the initial layout and paint using default styles (or light mode), and subsequently executes an asynchronous or deferred script that toggles the dark/custom theme, causing a jarring visual flicker.

To guarantee **zero FOUC**:
1. The script must execute **synchronously** in the `<head>` of the document **before** any `<link rel="stylesheet">` tags and before the `<body>` element is constructed.
2. At the time `<script>` in `<head>` runs, `document.documentElement` (`<html>`) is already instantiated by the parser.
3. Setting `document.documentElement.dataset.theme = theme` and `document.documentElement.setAttribute('data-theme', theme)` applies the data attribute synchronously.
4. When the browser later downloads and parses `css/themes.css` and calculates CSS cascades for the first paint, selector rules such as `[data-theme="nord"]` or `[data-theme="oled-black"]` immediately match the root element.
5. The class `no-theme-transition` is added synchronously to `document.documentElement`, disabling all CSS transitions during initial paint.
6. A double `requestAnimationFrame` callback after `DOMContentLoaded` removes `no-theme-transition`, ensuring subsequent user-initiated theme changes animate with smooth 0.22s transitions.

### 2.2 Allowed Theme IDs Validation
The inline script must validate `localStorage.getItem('webreader_theme')` against the canonical 10 theme IDs:
```javascript
var allowed = [
  'warm-paper',
  'soft-dark',
  'daylight',
  'sage',
  'solarized-light',
  'solarized-dark',
  'nord',
  'oled-black',
  'rose-pine',
  'e-ink'
];
```

### 2.3 Exact Blueprint for `index.html` Inline Script
```html
  <!-- Synchronous FOUC-Free Theme & Typography Bootstrap -->
  <script>
    (function() {
      try {
        var theme = localStorage.getItem('webreader_theme') || 'warm-paper';
        var allowed = [
          'warm-paper',
          'soft-dark',
          'daylight',
          'sage',
          'solarized-light',
          'solarized-dark',
          'nord',
          'oled-black',
          'rose-pine',
          'e-ink'
        ];
        if (allowed.indexOf(theme) === -1) theme = 'warm-paper';
        document.documentElement.dataset.theme = theme;
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
        document.documentElement.dataset.theme = 'warm-paper';
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

### 2.4 Defensive Edge Cases Handled in Inline Script
- **Missing or Empty Storage**: When `webreader_theme` is `null` or empty string, fallback to `'warm-paper'`.
- **Corrupted / Injected / Invalid Theme**: When `webreader_theme` is an arbitrary string (e.g. `'hacker-neon'`), `allowed.indexOf(theme) === -1` evaluates to `true`, safely defaulting to `'warm-paper'`.
- **LocalStorage Blocked / Disabled**: In locked-down enterprise environments, third-party sandboxed iframes, or disabled storage settings, `localStorage.getItem` throws a `SecurityError` or `DOMException`. The `try...catch` block catches this and safely sets `data-theme="warm-paper"`.
- **Malformed Typography JSON**: If `rawTypo` contains invalid JSON, `JSON.parse` will throw, caught by the outer `try...catch`.

---

## 3. Technical Focus 2: Storage & Default Settings (`js/storage/settings-store.js`)

### 3.1 Expanding `THEMES` & `VALID_THEMES`
In `js/storage/settings-store.js`, the `THEMES` enum defines constants for all supported theme IDs. `VALID_THEMES` is dynamically derived by `Object.values(THEMES)` and frozen with `Object.freeze()`.

#### Proposed Replacement for `THEMES` and `VALID_THEMES`:
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
export const DEFAULT_THEME = THEMES.WARM_PAPER;
```

### 3.2 Enhancing `SettingsManager` Methods
1. **`getTheme()`**:
   ```javascript
   static getTheme() {
     const theme = this._safeGet(STORAGE_KEYS.THEME);
     return VALID_THEMES.includes(theme) ? theme : THEMES.WARM_PAPER;
   }
   ```
2. **`setTheme(themeId)`**:
   ```javascript
   static setTheme(themeId) {
     const validTheme = VALID_THEMES.includes(themeId) ? themeId : THEMES.WARM_PAPER;
     this._safeSet(STORAGE_KEYS.THEME, validTheme);
     if (typeof document !== 'undefined' && document.documentElement) {
       document.documentElement.dataset.theme = validTheme;
       document.documentElement.setAttribute('data-theme', validTheme);
     }
   }
   ```
3. **`getSettings()` & `saveSettings(partialSettings)`**:
   - `getSettings()` returns `{ theme: this.getTheme(), typography: ..., readingMode: ..., lastBookId: ... }`.
   - `saveSettings({ theme: 'solarized-dark' })` delegates directly to `this.setTheme('solarized-dark')`, persisting to `localStorage` and updating the document element immediately.

---

## 4. Integration Matrix with Peer Milestone 2 Work

| Subsystem | Owner Agent | Integration Requirement | Status / Alignment |
|---|---|---|---|
| **Theme CSS Palettes** (`css/themes.css`) | `m2_explorer_1` / Worker | All 10 themes define WCAG AAA CSS variables (`--color-bg`, `--color-text`, etc.) matching selector `[data-theme="<themeId>"]`. | Perfectly matches the 10 theme IDs defined in `THEMES` and `index.html`. |
| **Settings Drawer Swatches** (`index.html`, `js/ui/settings-panel.js`) | `m2_explorer_3` / Worker | Swatches use `data-theme-choice="<themeId>"`. `settings-panel.js` emits `ui:set-theme` with `themeId`. | Validated against `VALID_THEMES` via `SettingsManager.setTheme`. |
| **Reader Engine Iframe Sync** (`js/reader/reader-engine.js`) | `m2_explorer_3` / Worker | `THEME_PALETTES` in `reader-engine.js` needs entries for all 10 themes so chapter iframes inherit the theme. | `applyTheme(themeId)` calls `SettingsManager.setTheme(validTheme)`, triggering synchronous storage persistence. |
| **Storage Facade** (`js/storage/storage-manager.js`) | Baseline / M1 | `StorageManager.getSettings()` and `StorageManager.saveSettings()` delegate to `SettingsManager`. | No modifications needed in `storage-manager.js`. |
| **Adversarial Storage Test Suite** (`test/challenger_storage.test.js`) | Verification | Tests 50 rapid sequential toggles across `VALID_THEMES` without desynchronization. | Seamlessly tests all 10 themes when `VALID_THEMES` is expanded. |
| **E2E Upgrade Test Suite** (`test/e2e_upgrade.test.js`) | Verification | Test 1.8 tests all 10 themes; Test 1.9 tests zero-FOUC reload with `'nord'`. | Test 1.9 unblocks immediately upon applying this blueprint. |

---

## 5. Concrete Code Replacement Chunks for Implementation Worker

### Chunk 1: `index.html` (Lines 11–16, 31–33)
**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/index.html`

```html
<<<< TARGET CODE (Lines 11-16)
      try {
        var theme = localStorage.getItem('webreader_theme') || 'warm-paper';
        var allowed = ['warm-paper', 'soft-dark', 'daylight', 'sage'];
        if (allowed.indexOf(theme) === -1) theme = 'warm-paper';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.add('no-theme-transition');
====
      try {
        var theme = localStorage.getItem('webreader_theme') || 'warm-paper';
        var allowed = [
          'warm-paper',
          'soft-dark',
          'daylight',
          'sage',
          'solarized-light',
          'solarized-dark',
          'nord',
          'oled-black',
          'rose-pine',
          'e-ink'
        ];
        if (allowed.indexOf(theme) === -1) theme = 'warm-paper';
        document.documentElement.dataset.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.add('no-theme-transition');
>>>>
```

And in the catch block:
```html
<<<< TARGET CODE (Lines 31-33)
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'warm-paper');
      }
====
      } catch (e) {
        document.documentElement.dataset.theme = 'warm-paper';
        document.documentElement.setAttribute('data-theme', 'warm-paper');
      }
>>>>
```

### Chunk 2: `js/storage/settings-store.js` (Lines 7–15, 77–83)
**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/storage/settings-store.js`

```javascript
<<<< TARGET CODE (Lines 7-15)
export const THEMES = Object.freeze({
  WARM_PAPER: 'warm-paper',
  SOFT_DARK: 'soft-dark',
  DAYLIGHT: 'daylight',
  SAGE: 'sage'
});

export const VALID_THEMES = Object.freeze(Object.values(THEMES));
====
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
export const DEFAULT_THEME = THEMES.WARM_PAPER;
>>>>
```

And in `SettingsManager.setTheme`:
```javascript
<<<< TARGET CODE (Lines 77-83)
  static setTheme(themeId) {
    const validTheme = VALID_THEMES.includes(themeId) ? themeId : THEMES.WARM_PAPER;
    this._safeSet(STORAGE_KEYS.THEME, validTheme);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', validTheme);
    }
  }
====
  static setTheme(themeId) {
    const validTheme = VALID_THEMES.includes(themeId) ? themeId : THEMES.WARM_PAPER;
    this._safeSet(STORAGE_KEYS.THEME, validTheme);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.theme = validTheme;
      document.documentElement.setAttribute('data-theme', validTheme);
    }
  }
>>>>
```

---

## 6. Verification & Invalidation Strategy

### 6.1 Test Execution Plan
1. **Zero-FOUC Theme Boot Verification**:
   ```bash
   node test/e2e_upgrade.test.js --tier=1
   ```
   *Expected Result*: Test 1.9 (`Zero-FOUC Theme Boot & Persistence Across Reload for 10 Themes`) must change from `FAILED` to `PASSED`.
2. **Storage Concurrency & Rapid Theme Switching Verification**:
   ```bash
   node test/challenger_storage.test.js
   ```
   *Expected Result*: Suite 1 test 1.6 (50 rapid sequential theme switches) cycles across all 10 themes in `VALID_THEMES` and passes 22/22 tests with 0 failures.
3. **Baseline Regression Verification**:
   ```bash
   npm test
   ```
   *Expected Result*: All 21/21 tests in `test/e2e.test.js` continue to pass without regression.

### 6.2 Invalidation Conditions
- If any of the 10 theme ID strings in `index.html` does not match the theme IDs in `js/storage/settings-store.js`, the zero-FOUC reload test will fail for that theme.
- If `document.documentElement.dataset.theme` is not set synchronously before stylesheets execute, or if `no-theme-transition` is removed before first frame paint, a flash of default colors will occur on reloads in dark themes.
