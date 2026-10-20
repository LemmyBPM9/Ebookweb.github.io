# Milestone 2 Explorer 2 Handoff Report: Zero-FOUC Inline Head Bootstrap & Storage Settings for 10 Themes

**Milestone**: Milestone 2 — Expanded 10 Eye-Comfort Themes & Contrast Engine  
**Author**: teamwork_preview_explorer (`m2_explorer_2`)  
**Timestamp**: 2026-10-17T19:53:00Z  
**Target Recipient**: Orchestrator / Milestone 2 Worker  

---

## 1. Observation

1. **`index.html` Inline `<head>` Script (Lines 8–49)**:
   - Line 12: `var theme = localStorage.getItem('webreader_theme') || 'warm-paper';`
   - Line 13: `var allowed = ['warm-paper', 'soft-dark', 'daylight', 'sage'];`
   - Line 14: `if (allowed.indexOf(theme) === -1) theme = 'warm-paper';`
   - Line 15: `document.documentElement.setAttribute('data-theme', theme);`
   - Line 16: `document.documentElement.classList.add('no-theme-transition');`
   - Line 32: `document.documentElement.setAttribute('data-theme', 'warm-paper');` (in catch block)
   - Line 35–47: Double-rAF removal of `no-theme-transition` attached to `DOMContentLoaded`.
   - The allowed array only lists 4 legacy themes. Stored values for any of the 6 new themes (`solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`) are rejected and reset to `'warm-paper'`.

2. **`js/storage/settings-store.js` (Lines 7–15 & Lines 68–83)**:
   - Lines 7–12:
     ```javascript
     export const THEMES = Object.freeze({
       WARM_PAPER: 'warm-paper',
       SOFT_DARK: 'soft-dark',
       DAYLIGHT: 'daylight',
       SAGE: 'sage'
     });
     ```
   - Line 14: `export const VALID_THEMES = Object.freeze(Object.values(THEMES));`
   - Lines 68–71:
     ```javascript
     static getTheme() {
       const theme = this._safeGet(STORAGE_KEYS.THEME);
       return VALID_THEMES.includes(theme) ? theme : THEMES.WARM_PAPER;
     }
     ```
   - Lines 77–83:
     ```javascript
     static setTheme(themeId) {
       const validTheme = VALID_THEMES.includes(themeId) ? themeId : THEMES.WARM_PAPER;
       this._safeSet(STORAGE_KEYS.THEME, validTheme);
       if (typeof document !== 'undefined' && document.documentElement) {
         document.documentElement.setAttribute('data-theme', validTheme);
       }
     }
     ```
   - `THEMES` and `VALID_THEMES` reject all 6 new themes, causing `getTheme()` and `setTheme()` to fall back to `warm-paper`.

3. **Verbatim Error from `node test/e2e_upgrade.test.js --tier=1`**:
   - Execution command: `node test/e2e_upgrade.test.js --tier=1`
   - Verbatim error log:
     ```
     • 1.9 Zero-FOUC Theme Boot & Persistence Across Reload for 10 Themes ... FAILED (1118ms)
       Error: Synchronous head script must restore "nord" theme on initial DOM load: expected "nord", got "warm-paper"
           at assertEqual (/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/test/e2e_upgrade.test.js:114:11)
           at Object.fn (/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/test/e2e_upgrade.test.js:742:7)
           at async runTestSuite (/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/test/e2e_upgrade.test.js:1113:11)
     ```

4. **Baseline Storage & E2E Test Suite Status**:
   - `node test/challenger_storage.test.js`: 22/22 tests PASSED (0 failures).
   - `npm test` (`node test/e2e.test.js`): 21/21 tests PASSED (0 failures across all 4 Tiers).

5. **`ORIGINAL_REQUEST.md` (## 2026-10-17T18:34:26Z, lines 74–83)**:
   - Requires expanding the palette to 10 themes total: `warm-paper`, `soft-dark`, `daylight`, `sage`, `solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`.
   - "All 10 themes must meet at least WCAG AA/AAA readability standards (contrast ratio >= 7.0:1 for body text), apply instantaneously without page reload or FOUC, style both the host UI and reader content, and persist in `localStorage`."

---

## 2. Logic Chain

1. **Step 1 (Root Cause of Test 1.9 Failure)**:
   - Observation 3 shows that test 1.9 sets `localStorage.setItem('webreader_theme', 'nord')` and calls `page.reload({ waitUntil: 'domcontentloaded' })`.
   - Observation 1 shows that upon reload, the inline script in `index.html` inspects `var theme = localStorage.getItem('webreader_theme')`.
   - Because `allowed` only contains `['warm-paper', 'soft-dark', 'daylight', 'sage']`, `allowed.indexOf('nord')` evaluates to `-1`.
   - Therefore, `theme` is overridden with `'warm-paper'`.
   - `document.documentElement.setAttribute('data-theme', 'warm-paper')` is called, causing test 1.9 to fail (`expected "nord", got "warm-paper"`).

2. **Step 2 (Root Cause of Theme Persistence Failure in Settings Store)**:
   - Observation 2 shows that `VALID_THEMES` is generated via `Object.freeze(Object.values(THEMES))`.
   - Because `THEMES` in `js/storage/settings-store.js` only has 4 keys (`WARM_PAPER`, `SOFT_DARK`, `DAYLIGHT`, `SAGE`), `VALID_THEMES.includes('solarized-light')` (or any of the 6 new themes) evaluates to `false`.
   - Any call to `SettingsManager.setTheme('nord')` or `SettingsManager.getTheme()` resets the theme to `THEMES.WARM_PAPER`.
   - Therefore, runtime UI theme switching cannot persist any of the 6 new themes without updating `THEMES` and `VALID_THEMES`.

3. **Step 3 (Zero-FOUC Delivery Mechanism)**:
   - Browser HTML parser executes synchronous `<script>` in `<head>` before `<link rel="stylesheet">` elements and before `<body>` content rendering.
   - When `document.documentElement.dataset.theme = theme` and `document.documentElement.setAttribute('data-theme', theme)` execute synchronously, the root element is tagged before CSS rules are evaluated or pixels painted.
   - The addition of `no-theme-transition` prevents CSS transitions from animating background color shifts during initial paint.
   - Double `requestAnimationFrame` removes `no-theme-transition` after layout/paint, allowing smooth 0.22s transitions for user-initiated clicks.

4. **Step 4 (Backward Compatibility & Safe Fallbacks)**:
   - If `webreader_theme` in `localStorage` is missing, corrupted, or invalid, or if `localStorage` access throws a `SecurityError` (e.g. private mode or sandboxed iframe), the script safely defaults to `warm-paper`.
   - Existing baseline tests (`challenger_storage.test.js` and `e2e.test.js`) continue to pass 100% because `warm-paper` remains the default theme, and all 4 legacy themes remain fully valid members of `allowed` and `VALID_THEMES`.

---

## 3. Caveats

1. **CSS Palette Definitions**:
   - This handoff specifies the inline head bootstrap and storage settings layer.
   - The actual CSS custom properties for the 6 new themes in `css/themes.css` are being developed by peer explorer `m2_explorer_1`. The theme IDs (`solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`) must match identically across both files.
2. **Settings Drawer Swatches & Reader Engine Iframe Sync**:
   - The swatch UI buttons in `index.html` and reader iframe stylesheet injection in `js/reader/reader-engine.js` are in scope for `m2_explorer_3`.
   - Once all three components are applied by the worker, full test 1.8 (all 10 themes) and test 1.9 (zero-FOUC reload) will pass in `test/e2e_upgrade.test.js`.

---

## 4. Conclusion

1. **`index.html` Inline `<head>` Script**:
   - Update `allowed` array to:
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
   - Update assignment to:
     ```javascript
     document.documentElement.dataset.theme = theme;
     document.documentElement.setAttribute('data-theme', theme);
     ```
   - Ensure `catch` block sets both `dataset.theme` and `setAttribute('data-theme', 'warm-paper')`.

2. **`js/storage/settings-store.js`**:
   - Expand `THEMES` to:
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
   - In `SettingsManager.setTheme(themeId)`:
     ```javascript
     document.documentElement.dataset.theme = validTheme;
     document.documentElement.setAttribute('data-theme', validTheme);
     ```

3. **Complete Technical Blueprint**:
   - Detailed blueprint with code replacements and architectural explanations has been written to:
     `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_explorer_2/analysis.md`

---

## 5. Verification Method

1. **Zero-FOUC Reload Verification Command**:
   ```bash
   node test/e2e_upgrade.test.js --tier=1
   ```
   - **Verification**: Test 1.9 passes without assertion failure.
2. **Storage Manager Theme Concurrency Verification Command**:
   ```bash
   node test/challenger_storage.test.js
   ```
   - **Verification**: 22/22 tests pass, including rapid 50 sequential theme toggles across all 10 themes in `VALID_THEMES`.
3. **Baseline Regression Verification Command**:
   ```bash
   npm test
   ```
   - **Verification**: 21/21 tests pass across Tiers 0–4.
4. **Invalidation Conditions**:
   - If `test/e2e_upgrade.test.js` reports `expected "nord", got "warm-paper"`, `index.html` inline script did not include `'nord'` in `allowed` or did not set `data-theme`.
   - If `SettingsManager.getTheme()` returns `'warm-paper'` when `localStorage.getItem('webreader_theme') === 'nord'`, `VALID_THEMES` was not updated with the new theme IDs.
