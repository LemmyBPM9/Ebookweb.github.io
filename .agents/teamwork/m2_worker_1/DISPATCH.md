## 2026-10-17T19:56:23Z
You are teamwork_preview_worker (instance m2_worker_1).
Your working directory is:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_worker_1/

MANDATORY FIRST STEP: Read the user request file at:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
specifically paying attention to ## 2026-10-17T18:34:26Z.
Also read PROJECT.md at the project root:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Read the three Explorer blueprints for Milestone 2:
- Themes CSS & Contrast Calculations: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_explorer_1/analysis.md
- Zero-FOUC Head Bootstrap & SettingsStore: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_explorer_2/analysis.md
- Settings Drawer 10 Swatches, ReaderEngine Sync & Synthesized Worker Blueprint: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m2_explorer_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive Write Ownership:
You exclusively own and may edit the following files:
- `css/themes.css`
- `index.html`
- `css/main.css`
- `js/storage/settings-store.js`
- `js/ui/settings-panel.js`
- `js/reader/reader-engine.js`
Do NOT edit any test files in `test/`.

Your Tasks for Milestone 2:
1. `css/themes.css`:
   - Implement the complete CSS custom properties suite for all 10 themes:
     - 4 existing: `warm-paper`, `soft-dark`, `daylight`, `sage`
     - 6 new: `solarized-light`, `solarized-dark`, `nord`, `oled-black`, `rose-pine`, `e-ink`
   - Every theme must define both standard properties (`--bg-primary`, `--bg-secondary`, `--bg-elevated`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-color`, `--accent-color`, `--accent-hover`, `--selection-bg`, `--selection-color`) and backward-compatibility aliases (`--color-bg`, `--color-text`, `--color-surface`, `--color-border`, `--color-accent`, etc.).
   - Support both host UI selectors (`[data-theme="..."]`) and reader iframe selectors (`.theme-...`, `body.theme-...`).
   - All 10 themes must strictly satisfy WCAG AAA contrast ratio >= 7.0:1 between body text and background.
   - See drop-in code in `.agents/teamwork/m2_explorer_1/analysis.md § 4`.

2. `index.html`:
   - Synchronous head bootstrap script: Validate stored theme against all 10 theme IDs, set `document.documentElement.dataset.theme = theme` and `setAttribute('data-theme', theme)`, fall back to `warm-paper`, and preserve `no-theme-transition` double-rAF removal.
   - Settings Drawer (`#theme-options`): Expand `.theme-swatches` to a 10-theme grid (`role="radiogroup"`) containing accessible buttons for all 10 themes (`role="radio"`, `data-theme="<themeId>"`, `data-theme-choice="<themeId>"`, `id="theme-<themeId>"`, `aria-checked="true|false"`, label, and color swatch circle).
   - See drop-in code in `.agents/teamwork/m2_explorer_2/analysis.md § 3.1` and `.agents/teamwork/m2_explorer_3/analysis.md § 3.1`.

3. `css/main.css`:
   - Add styles for `.theme-options-grid`, `.theme-option`, `.theme-swatch-btn`, active outline (`outline: 2px solid var(--color-accent)`), dark swatch circle borders, and responsive 5x2 layout.
   - See `.agents/teamwork/m2_explorer_3/analysis.md § 3.2`.

4. `js/storage/settings-store.js`:
   - Expand `THEMES` enum and `VALID_THEMES` array to recognize all 10 themes with `DEFAULT_THEME = THEMES.WARM_PAPER`.
   - See `.agents/teamwork/m2_explorer_2/analysis.md § 3.2`.

5. `js/ui/settings-panel.js`:
   - Update event listeners and selection handlers to support `.theme-option, .theme-swatch-btn, [data-theme], [data-theme-choice]`.
   - Update active class and `aria-checked` states across all 10 buttons.
   - Dispatch `theme:changed` via EventBus and save via `SettingsStore`.
   - See `.agents/teamwork/m2_explorer_3/analysis.md § 4.1`.

6. `js/reader/reader-engine.js`:
   - Expand `THEME_PALETTES` object to define all 10 themes with complete color tokens.
   - Update `applyTheme(themeId)` to validate against all 10 themes and inject/update `<style id="webreader-theme-style">` inside the chapter iframe.
   - See `.agents/teamwork/m2_explorer_3/analysis.md § 5`.

7. Verification:
   Run the following verification commands and ensure 100% pass:
   - `node test/e2e_upgrade.test.js --tier=1` (specifically tests 1.7, 1.8, 1.9)
   - `node test/e2e_upgrade.test.js --tier=0`
   - `node test/e2e_upgrade.test.js --tier=2`
   - `node test/e2e_upgrade.test.js --tier=3`
   - `node test/e2e.test.js`
   - `node test/challenger_storage.test.js`
   - `node test/challenger_m1_adversarial.js`
   - `node test/challenger_m2_r2_adversarial.js`
