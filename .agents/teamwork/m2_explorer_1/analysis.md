# Milestone 2 Technical Blueprint: Expanded 10 Eye-Comfort Themes & Contrast Engine

**Agent Instance**: `m2_explorer_1` (teamwork_preview_explorer)  
**Date**: 2026-10-17  
**Scope**: Milestone 2 — Features 45 (10 Eye-Comfort Themes), 46 (Zero-FOUC Inline Head Bootstrap), and 47 (Settings Drawer 10-Theme Swatch Grid).

---

## 1. Executive Summary & Architecture Overview

WebReader 2.0 expands from 4 baseline palettes to a curated collection of 10 eye-comfort reading themes designed for long reading sessions across diverse ambient light conditions (bright daytime, dim indoor, pitch-black night, and e-ink reflective conditions).

### Key Architectural Pillars
1. **Strict WCAG 2.1 AAA Contrast Standard**: The contrast ratio between `--text-primary` and `--bg-primary` must equal or exceed **7.0:1** for every single theme (actual ratios range from **10.84:1** to **15.80:1**).
2. **Canonical 11-Property Token Suite**: Standardizes on 11 semantic CSS custom properties:
   - Surface hierarchy: `--bg-primary`, `--bg-secondary`, `--bg-elevated`
   - Typography hierarchy: `--text-primary`, `--text-secondary`, `--text-muted`
   - Interactive & Accents: `--border-color`, `--accent-color`, `--accent-hover`, `--selection-bg`, `--selection-color`
3. **Dual-Context Application (Host UI + Reader Iframe)**:
   - Host Application UI: Selectors match `:root, [data-theme="<theme>"]` on `document.documentElement` and `#reader-stage`.
   - Reader Iframe Content: Selectors match `[data-theme="<theme>"]`, `.theme-<theme>`, and `body.theme-<theme>` in the sandboxed reading iframe.
4. **Seamless Backward Compatibility**: Complete aliasing of existing tokens (`--color-bg`, `--color-surface`, `--color-text`, `--color-accent`, etc.) to guarantee 100% regression-free compatibility with existing UI components and automated test suites (`test/e2e.test.js`, `test/challenger_storage.test.js`).
5. **Zero-FOUC Synchronous Boot**: Upgrades the synchronous `<head>` script in `index.html` to validate and apply all 10 theme keys from `localStorage` before the first paint frame, suppressing transitions via `.no-theme-transition`.

---

## 2. Theoretical Contrast Engine & W3C Formulas

The WebReader contrast calculation engine strictly implements the W3C Web Content Accessibility Guidelines (WCAG) 2.1 relative luminance and contrast ratio algorithms.

### 2.1. Relative Luminance ($L$)
For any sRGB color component $V \in \{R, G, B\}$ represented as an 8-bit integer $[0, 255]$:
$$V_{sRGB} = \frac{V_{8bit}}{255}$$

Linearize $V_{sRGB}$ according to the sRGB gamma transfer function:
$$v = \begin{cases} \frac{V_{sRGB}}{12.92} & \text{if } V_{sRGB} \le 0.03928 \\ \left(\frac{V_{sRGB} + 0.055}{1.055}\right)^{2.4} & \text{if } V_{sRGB} > 0.03928 \end{cases}$$

Relative luminance $L$ is computed using the CIE 1931 photopic luminous efficiency coefficients:
$$L = 0.2126 \cdot r + 0.7152 \cdot g + 0.0722 \cdot b$$

### 2.2. Contrast Ratio ($CR$)
Given two colors with relative luminances $L_1$ and $L_2$, where $L_1 \ge L_2$:
$$CR = \frac{L_1 + 0.05}{L_2 + 0.05}$$

The resulting ratio ranges from $1.0:1$ (identical colors) to $21.0:1$ (pure black on pure white).

### 2.3. Compliance Thresholds
- **WCAG 2.1 Level AA**: $CR \ge 4.5:1$ for normal body text; $CR \ge 3.0:1$ for large text and UI components.
- **WCAG 2.1 Level AAA**: $CR \ge 7.0:1$ for normal body text; $CR \ge 4.5:1$ for large text.
- **WebReader Eye-Comfort Requirement**: **Every theme must achieve $CR \ge 7.0:1$ (AAA)** for primary body text while strictly avoiding ocular halation (scattering of pure white text on pitch black) and photopic glare (pure white `#FFFFFF` under daylight).

---

## 3. Exhaustive 10-Theme Luminance & Contrast Matrix

The following table presents the exact mathematically calculated relative luminances and contrast ratios for all 10 eye-comfort themes:

| # | Theme ID | Palette Scheme | Background (`--bg-primary`) | BG Luminance ($L_1$) | Text Primary (`--text-primary`) | Text Luminance ($L_2$) | Contrast Ratio ($CR$) | WCAG Compliance | Text Secondary Contrast |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `warm-paper` | Light (Warm) | `#f8f1e3` | `0.88413` | `#2c2523` | `0.01980` | **13.38 : 1** | **WCAG AAA** (Pass) | 6.92 : 1 (AA) |
| 2 | `soft-dark` | Dark (Low-Blue) | `#1a1c1e` | `0.01144` | `#e2e2e0` | `0.75943` | **13.17 : 1** | **WCAG AAA** (Pass) | 6.36 : 1 (AA) |
| 3 | `daylight` | Light (Clean) | `#fcfbf9` | `0.96529` | `#1e2022` | `0.01425` | **15.80 : 1** | **WCAG AAA** (Pass) | 6.64 : 1 (AA) |
| 4 | `sage` | Light (Calm) | `#eef3ed` | `0.88393` | `#1c2820` | `0.01869` | **13.60 : 1** | **WCAG AAA** (Pass) | 6.28 : 1 (AA) |
| 5 | `solarized-light` | Light (Cream) | `#fdf6e3` | `0.92340` | `#073642` | `0.03077` | **12.05 : 1** | **WCAG AAA** (Pass) | 4.99 : 1 (AA) |
| 6 | `solarized-dark` | Dark (Petrol) | `#002b36` | `0.01994` | `#eee8d5` | `0.80694` | **12.25 : 1** | **WCAG AAA** (Pass) | 5.61 : 1 (AA) |
| 7 | `nord` | Dark (Arctic) | `#2e3440` | `0.03407` | `#eceff4` | `0.86098` | **10.84 : 1** | **WCAG AAA** (Pass) | 9.25 : 1 (AAA) |
| 8 | `oled-black` | Dark (True Black) | `#000000` | `0.00000` | `#c8c8c8` | `0.57758` | **12.55 : 1** | **WCAG AAA** (Pass) | 6.41 : 1 (AA) |
| 9 | `rose-pine` | Dark (Dusk) | `#191724` | `0.00947` | `#e0def4` | `0.74621` | **13.39 : 1** | **WCAG AAA** (Pass) | 5.48 : 1 (AA) |
| 10 | `e-ink` | Light (Monochrome) | `#f0f0eb` | `0.86844` | `#1a1a1a` | `0.01033` | **15.22 : 1** | **WCAG AAA** (Pass) | 8.52 : 1 (AAA) |

### Physiological & Ergonomic Justification per Theme
1. **`warm-paper` (Default)**: Yellow-amber spectrum cream background absorbs high-energy visible (HEV) blue light, mimicking physical book paper.
2. **`soft-dark`**: Slate/charcoal night palette avoids extreme high-contrast halation (starbursting) by capping background luminance above pitch black and warming white text.
3. **`daylight`**: Off-white matte background engineered for high ambient illumination without the retina-straining reflectance of `#ffffff`.
4. **`sage`**: Gentle botanical green matches the human eye's peak sensitivity wavelength (~555nm photopic vision), minimizing ciliary muscle fatigue.
5. **`solarized-light`**: Ethan Schoonover's precision CIE Lab-calibrated light theme with base3 cream and base00 deep petrol text.
6. **`solarized-dark`**: Deep teal base03 background paired with warm stone base2 text, maintaining consistent perceptual lightness across darkroom reading.
7. **`nord`**: Arctic IceStudio Polar Night palette (`#2e3440`) with Snow Storm bright text (`#eceff4`); cool slate tones reduce circadian disruption.
8. **`oled-black`**: Pure `#000000` background turns off individual pixels on OLED/AMOLED displays (zero battery draw, infinite contrast), paired with softened silver text (`#c8c8c8`) to eradicate contrast bloom.
9. **`rose-pine`**: Warm dusk palette with subtle pine undertones (`#191724`) and soft lilac-cream typography (`#e0def4`) for calming evening reading.
10. **`e-ink`**: High-contrast matte paper simulation (`#f0f0eb` and `#1a1a1a`) with completely neutral zero-chroma saturation for maximum typographic sharpness.

---

## 4. Canonical Custom Properties & Token Mapping

Each theme definition defines **11 primary tokens** plus backward-compatibility aliases:

```css
/* --- Primary Tokens --- */
--bg-primary: <hex>;        /* Base reader stage & viewport canvas */
--bg-secondary: <hex>;      /* Elevated cards, drawer backgrounds, toolbars */
--bg-elevated: <hex>;       /* Hover surfaces, popovers, active controls */
--text-primary: <hex>;      /* Chapter headings, body paragraphs, high-contrast labels */
--text-secondary: <hex>;    /* Author names, progress stats, metadata captions */
--text-muted: <hex>;        /* Inactive icons, subtle footnotes, disabled states */
--border-color: <hex>;      /* Card outlines, drawer dividers, segmented border */
--accent-color: <hex>;      /* Brand accent, active tabs, progress track fill */
--accent-hover: <hex>;      /* Interactive hover state for accent controls */
--selection-bg: <hex|rgba>; /* Text selection highlight background */
--selection-color: <hex>;   /* Text selection highlight foreground */

/* --- Backward Compatibility Aliases --- */
--color-bg: var(--bg-primary);
--color-surface: var(--bg-secondary);
--color-surface-hover: var(--bg-elevated);
--color-text: var(--text-primary);
--color-text-secondary: var(--text-secondary);
--color-text-muted: var(--text-muted);
--color-border: var(--border-color);
--color-accent: var(--accent-color);
--color-accent-hover: var(--accent-hover);
--color-highlight: var(--selection-bg);
```

---

## 5. Dual-Selector Architecture: Host UI vs Reader Iframe

To ensure theme styles cascade seamlessly across the entire application:

### 5.1. Selector Grouping Pattern
Each theme rule block in CSS binds to:
1. `:root[data-theme="<theme>"]` or `[data-theme="<theme>"]`: Targets the host application root `<html>` and `#reader-stage`.
2. `.theme-<theme>`: Targets any container styled with explicit theme classes.
3. `body.theme-<theme>`: Targets the reader `<iframe>` document body when classes are assigned.

```css
:root,
[data-theme="warm-paper"],
.theme-warm-paper,
body.theme-warm-paper {
  color-scheme: light;
  /* tokens ... */
}
```

### 5.2. Text Selection Styling
To guarantee that text selections in both the host UI and reader iframe are legible:
```css
[data-theme="warm-paper"] ::selection,
.theme-warm-paper ::selection,
body.theme-warm-paper ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}
```

### 5.3. Reader Iframe Bridge in `ReaderEngine`
In `js/reader/reader-engine.js`, `applyTheme(themeId)` sets:
```javascript
// 1. Host Root
document.documentElement.setAttribute('data-theme', validTheme);
document.body.setAttribute('data-theme', validTheme);
if (this.stage) this.stage.setAttribute('data-theme', validTheme);

// 2. Sandboxed Iframe Root & Body
const iframeDoc = this.iframe?.contentDocument;
if (iframeDoc && iframeDoc.documentElement) {
  iframeDoc.documentElement.setAttribute('data-theme', validTheme);
  iframeDoc.body.className = `theme-${validTheme}`;
  
  // Set custom properties directly on iframe root
  const palette = THEME_PALETTES[validTheme];
  for (const [prop, val] of Object.entries(palette)) {
    iframeDoc.documentElement.style.setProperty(prop, val);
  }
  
  // Fallback direct body styling
  if (iframeDoc.body) {
    iframeDoc.body.style.backgroundColor = palette['--bg-primary'];
    iframeDoc.body.style.color = palette['--text-primary'];
  }
}
```

---

## 6. Complete CSS Specification (`css/themes.css`)

Here is the complete, drop-in replacement CSS specification for `css/themes.css`:

```css
/**
 * WebReader — Expanded 10 Eye-Comfort Themes & Contrast Engine
 * File: css/themes.css
 * Spec: Strict WCAG 2.1 AAA Compliant Low-Glare Palettes (All CR >= 7.0:1)
 */

/* ==========================================================================
   0. Global Typography & Reader Defaults
   ========================================================================== */
:root {
  --reader-font-family: 'Merriweather', 'Georgia', 'Iowan Old Style', 'Palatino Linotype', serif;
  --reader-font-size: 18px;
  --reader-line-height: 1.75;
  --reader-max-width: 720px;
  --reader-text-align: left;
  --reader-paragraph-spacing: 1.25em;
  --reader-page-margin: 40px;
}

/* ==========================================================================
   Theme 1: Warm Paper / Sepia (Default)
   CR: 13.38:1 (AAA) | L_bg: 0.8841 | L_text: 0.0198
   ========================================================================== */
:root,
[data-theme="warm-paper"],
.theme-warm-paper,
body.theme-warm-paper {
  color-scheme: light;

  /* Primary Canonical Properties */
  --bg-primary: #f8f1e3;
  --bg-secondary: #efe5d0;
  --bg-elevated: #e7d9bf;
  --text-primary: #2c2523;
  --text-secondary: #5c504a;
  --text-muted: #70625b;
  --border-color: #dfd3bd;
  --accent-color: #8b5a2b;
  --accent-hover: #724820;
  --selection-bg: #fcedbe;
  --selection-color: #2c2523;

  /* Backward Compatibility Aliases */
  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #dfd0b2;
  --color-border: var(--border-color);
  --color-border-strong: #96836e;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(139, 90, 43, 0.12);
  --color-accent-text: #ffffff;
  --color-focus-ring: var(--accent-color);
  --color-highlight: var(--selection-bg);
  --color-scrollbar: #dcd0b7;
  --color-scrollbar-hover: #c9baa0;
  --color-shadow: rgba(44, 37, 35, 0.08);
  --color-overlay: rgba(44, 37, 35, 0.40);
  --color-error: #9e2a2b;
  --color-error-bg: #fbeae8;
  --color-success: #2d7348;
  --color-success-bg: #e6f3eb;
}

[data-theme="warm-paper"] ::selection,
.theme-warm-paper ::selection,
body.theme-warm-paper ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 2: Soft Dark / Night (Low-Blue-Light, Zero Halation)
   CR: 13.17:1 (AAA) | L_bg: 0.0114 | L_text: 0.7594
   ========================================================================== */
[data-theme="soft-dark"],
.theme-soft-dark,
body.theme-soft-dark {
  color-scheme: dark;

  --bg-primary: #1a1c1e;
  --bg-secondary: #24282c;
  --bg-elevated: #2f343a;
  --text-primary: #e2e2e0;
  --text-secondary: #9e9e9a;
  --text-muted: #92928d;
  --border-color: #33383e;
  --accent-color: #e5a869;
  --accent-hover: #f3be86;
  --selection-bg: #453c28;
  --selection-color: #ffffff;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #383e46;
  --color-border: var(--border-color);
  --color-border-strong: #636b75;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(229, 168, 105, 0.16);
  --color-accent-text: #1a1c1e;
  --color-focus-ring: var(--accent-color);
  --color-highlight: var(--selection-bg);
  --color-scrollbar: #3c424a;
  --color-scrollbar-hover: #505862;
  --color-shadow: rgba(0, 0, 0, 0.50);
  --color-overlay: rgba(0, 0, 0, 0.70);
  --color-error: #f28b82;
  --color-error-bg: #3c1e1e;
  --color-success: #81c995;
  --color-success-bg: #1e3324;
}

[data-theme="soft-dark"] ::selection,
.theme-soft-dark ::selection,
body.theme-soft-dark ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 3: Daylight / Clean Light (Low-Glare Off-White)
   CR: 15.80:1 (AAA) | L_bg: 0.9653 | L_text: 0.0143
   ========================================================================== */
[data-theme="daylight"],
.theme-daylight,
body.theme-daylight {
  color-scheme: light;

  --bg-primary: #fcfbf9;
  --bg-secondary: #f3f2ee;
  --bg-elevated: #e8e6df;
  --text-primary: #1e2022;
  --text-secondary: #555b62;
  --text-muted: #666d75;
  --border-color: #e0dfd9;
  --accent-color: #2364a0;
  --accent-hover: #1b4f80;
  --selection-bg: #dbeafe;
  --selection-color: #1e2022;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #dedcd4;
  --color-border: var(--border-color);
  --color-border-strong: #8d9299;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(35, 100, 160, 0.10);
  --color-accent-text: #ffffff;
  --color-focus-ring: var(--accent-color);
  --color-highlight: #e1ecf8;
  --color-scrollbar: #dcdbd5;
  --color-scrollbar-hover: #c8c7bf;
  --color-shadow: rgba(30, 32, 34, 0.06);
  --color-overlay: rgba(30, 32, 34, 0.35);
  --color-error: #ba1a1a;
  --color-error-bg: #ffdad6;
  --color-success: #1b6d36;
  --color-success-bg: #d7eedc;
}

[data-theme="daylight"] ::selection,
.theme-daylight ::selection,
body.theme-daylight ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 4: Sage / Forest Calm (Peak Photopic Comfort)
   CR: 13.60:1 (AAA) | L_bg: 0.8839 | L_text: 0.0187
   ========================================================================== */
[data-theme="sage"],
.theme-sage,
body.theme-sage {
  color-scheme: light;

  --bg-primary: #eef3ed;
  --bg-secondary: #e1eae0;
  --bg-elevated: #d6e3d5;
  --text-primary: #1c2820;
  --text-secondary: #4a5d50;
  --text-muted: #56685c;
  --border-color: #cfdcd0;
  --accent-color: #2d7348;
  --accent-hover: #225636;
  --selection-bg: #d7eedc;
  --selection-color: #1c2820;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #c8d8c6;
  --color-border: var(--border-color);
  --color-border-strong: #778d7b;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(45, 115, 72, 0.12);
  --color-accent-text: #ffffff;
  --color-focus-ring: var(--accent-color);
  --color-highlight: #d7eedc;
  --color-scrollbar: #cbdbcc;
  --color-scrollbar-hover: #b5c7b6;
  --color-shadow: rgba(28, 40, 32, 0.07);
  --color-overlay: rgba(28, 40, 32, 0.35);
  --color-error: #a82222;
  --color-error-bg: #fae1e1;
  --color-success: #205c36;
  --color-success-bg: #d1ead8;
}

[data-theme="sage"] ::selection,
.theme-sage ::selection,
body.theme-sage ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 5: Solarized Light (Warm Muted Cream & Teal Ink)
   CR: 12.05:1 (AAA) | L_bg: 0.9234 | L_text: 0.0308
   ========================================================================== */
[data-theme="solarized-light"],
.theme-solarized-light,
body.theme-solarized-light {
  color-scheme: light;

  --bg-primary: #fdf6e3;
  --bg-secondary: #eee8d5;
  --bg-elevated: #e0d8c3;
  --text-primary: #073642;
  --text-secondary: #586e75;
  --text-muted: #657b83;
  --border-color: #d3cbb7;
  --accent-color: #268bd2;
  --accent-hover: #1a6091;
  --selection-bg: #cfe5eb;
  --selection-color: #073642;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #d6ccb4;
  --color-border: var(--border-color);
  --color-border-strong: #839496;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(38, 139, 210, 0.12);
  --color-accent-text: #ffffff;
  --color-focus-ring: var(--accent-color);
  --color-highlight: var(--selection-bg);
  --color-scrollbar: #dcd4be;
  --color-scrollbar-hover: #c9bea2;
  --color-shadow: rgba(7, 54, 66, 0.08);
  --color-overlay: rgba(7, 54, 66, 0.40);
  --color-error: #dc322f;
  --color-error-bg: #fbeae8;
  --color-success: #859900;
  --color-success-bg: #eff5d4;
}

[data-theme="solarized-light"] ::selection,
.theme-solarized-light ::selection,
body.theme-solarized-light ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 6: Solarized Dark (Petrol Blue & Warm Stone Ink)
   CR: 12.25:1 (AAA) | L_bg: 0.0199 | L_text: 0.8069
   ========================================================================== */
[data-theme="solarized-dark"],
.theme-solarized-dark,
body.theme-solarized-dark {
  color-scheme: dark;

  --bg-primary: #002b36;
  --bg-secondary: #073642;
  --bg-elevated: #0e4250;
  --text-primary: #eee8d5;
  --text-secondary: #93a1a1;
  --text-muted: #839496;
  --border-color: #154855;
  --accent-color: #2aa198;
  --accent-hover: #36b8af;
  --selection-bg: #0e4757;
  --selection-color: #eee8d5;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #134f5e;
  --color-border: var(--border-color);
  --color-border-strong: #586e75;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(42, 161, 152, 0.16);
  --color-accent-text: #002b36;
  --color-focus-ring: var(--accent-color);
  --color-highlight: #0d3a47;
  --color-scrollbar: #1b4b57;
  --color-scrollbar-hover: #276270;
  --color-shadow: rgba(0, 0, 0, 0.50);
  --color-overlay: rgba(0, 0, 0, 0.70);
  --color-error: #dc322f;
  --color-error-bg: #3a1c1d;
  --color-success: #859900;
  --color-success-bg: #223517;
}

[data-theme="solarized-dark"] ::selection,
.theme-solarized-dark ::selection,
body.theme-solarized-dark ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 7: Nord (Arctic Polar Slate & Snow Storm Ink)
   CR: 10.84:1 (AAA) | L_bg: 0.0341 | L_text: 0.8610
   ========================================================================== */
[data-theme="nord"],
.theme-nord,
body.theme-nord {
  color-scheme: dark;

  --bg-primary: #2e3440;
  --bg-secondary: #3b4252;
  --bg-elevated: #434c5e;
  --text-primary: #eceff4;
  --text-secondary: #d8dee9;
  --text-muted: #929fb4;
  --border-color: #4c566a;
  --accent-color: #88c0d0;
  --accent-hover: #81a1c1;
  --selection-bg: #434c5e;
  --selection-color: #eceff4;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #4c566a;
  --color-border: var(--border-color);
  --color-border-strong: #78859e;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(136, 192, 208, 0.16);
  --color-accent-text: #2e3440;
  --color-focus-ring: var(--accent-color);
  --color-highlight: #3b4252;
  --color-scrollbar: #434c5e;
  --color-scrollbar-hover: #4c566a;
  --color-shadow: rgba(0, 0, 0, 0.45);
  --color-overlay: rgba(0, 0, 0, 0.65);
  --color-error: #bf616a;
  --color-error-bg: #3c2427;
  --color-success: #a3be8c;
  --color-success-bg: #253326;
}

[data-theme="nord"] ::selection,
.theme-nord ::selection,
body.theme-nord ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 8: OLED Black (True Pitch Black & Dimmed Silver Ink)
   CR: 12.55:1 (AAA) | L_bg: 0.0000 | L_text: 0.5776
   ========================================================================== */
[data-theme="oled-black"],
.theme-oled-black,
body.theme-oled-black {
  color-scheme: dark;

  --bg-primary: #000000;
  --bg-secondary: #121212;
  --bg-elevated: #1e1e1e;
  --text-primary: #c8c8c8;
  --text-secondary: #8e8e8e;
  --text-muted: #767676;
  --border-color: #282828;
  --accent-color: #e0a96d;
  --accent-hover: #f0bc84;
  --selection-bg: #2a2a2a;
  --selection-color: #f0f0f0;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #2a2a2a;
  --color-border: var(--border-color);
  --color-border-strong: #505050;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(224, 169, 109, 0.16);
  --color-accent-text: #000000;
  --color-focus-ring: var(--accent-color);
  --color-highlight: #242424;
  --color-scrollbar: #242424;
  --color-scrollbar-hover: #333333;
  --color-shadow: rgba(0, 0, 0, 0.85);
  --color-overlay: rgba(0, 0, 0, 0.85);
  --color-error: #e57373;
  --color-error-bg: #2d1414;
  --color-success: #81c784;
  --color-success-bg: #152918;
}

[data-theme="oled-black"] ::selection,
.theme-oled-black ::selection,
body.theme-oled-black ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 9: Rosé Pine (Deep Dusk & Warm Lilac Rose Ink)
   CR: 13.39:1 (AAA) | L_bg: 0.0095 | L_text: 0.7462
   ========================================================================== */
[data-theme="rose-pine"],
.theme-rose-pine,
body.theme-rose-pine {
  color-scheme: dark;

  --bg-primary: #191724;
  --bg-secondary: #1f1d2e;
  --bg-elevated: #26233a;
  --text-primary: #e0def4;
  --text-secondary: #908caa;
  --text-muted: #797593;
  --border-color: #393552;
  --accent-color: #ebbcba;
  --accent-hover: #f3d0ce;
  --selection-bg: #312c49;
  --selection-color: #f0eefc;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #312c49;
  --color-border: var(--border-color);
  --color-border-strong: #6e6a86;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(235, 188, 186, 0.16);
  --color-accent-text: #191724;
  --color-focus-ring: var(--accent-color);
  --color-highlight: #2a283e;
  --color-scrollbar: #2a283e;
  --color-scrollbar-hover: #3b3754;
  --color-shadow: rgba(0, 0, 0, 0.55);
  --color-overlay: rgba(0, 0, 0, 0.75);
  --color-error: #eb6f92;
  --color-error-bg: #381924;
  --color-success: #9ccfd8;
  --color-success-bg: #1a2d33;
}

[data-theme="rose-pine"] ::selection,
.theme-rose-pine ::selection,
body.theme-rose-pine ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   Theme 10: E-Ink Paper (Matte Monochrome High-Contrast Grayscale)
   CR: 15.22:1 (AAA) | L_bg: 0.8684 | L_text: 0.0103
   ========================================================================== */
[data-theme="e-ink"],
.theme-e-ink,
body.theme-e-ink {
  color-scheme: light;

  --bg-primary: #f0f0eb;
  --bg-secondary: #e2e2dc;
  --bg-elevated: #d4d4cc;
  --text-primary: #1a1a1a;
  --text-secondary: #444444;
  --text-muted: #666666;
  --border-color: #cccccc;
  --accent-color: #2b2b2b;
  --accent-hover: #000000;
  --selection-bg: #d0d0c8;
  --selection-color: #000000;

  --color-bg: var(--bg-primary);
  --color-surface: var(--bg-secondary);
  --color-surface-hover: var(--bg-elevated);
  --color-surface-active: #c8c8bf;
  --color-border: var(--border-color);
  --color-border-strong: #777777;
  --color-text: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
  --color-accent-light: rgba(0, 0, 0, 0.10);
  --color-accent-text: #ffffff;
  --color-focus-ring: var(--accent-color);
  --color-highlight: var(--selection-bg);
  --color-scrollbar: #c8c8c2;
  --color-scrollbar-hover: #b4b4ad;
  --color-shadow: rgba(0, 0, 0, 0.08);
  --color-overlay: rgba(0, 0, 0, 0.40);
  --color-error: #555555;
  --color-error-bg: #dddddd;
  --color-success: #333333;
  --color-success-bg: #e2e2e2;
}

[data-theme="e-ink"] ::selection,
.theme-e-ink ::selection,
body.theme-e-ink ::selection {
  background-color: var(--selection-bg);
  color: var(--selection-color);
}

/* ==========================================================================
   FOUC Prevention & Smooth Transitions
   ========================================================================== */
.no-theme-transition,
.no-theme-transition *,
.no-theme-transition *::before,
.no-theme-transition *::after {
  -webkit-transition: none !important;
  -moz-transition: none !important;
  -o-transition: none !important;
  -ms-transition: none !important;
  transition: none !important;
}

html:not(.no-theme-transition) body,
html:not(.no-theme-transition) .app-header,
html:not(.no-theme-transition) .app-footer,
html:not(.no-theme-transition) .card,
html:not(.no-theme-transition) .segmented-control,
html:not(.no-theme-transition) .theme-swatch-btn {
  transition: background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;
}

html:not(.no-theme-transition) .drawer {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;
}

html:not(.no-theme-transition) .btn {
  transition: background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease, transform 0.1s ease;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
```

---

## 7. Variables Architecture Recommendation (`css/variables.css`)

Currently, WebReader bundles all CSS custom properties directly into `css/themes.css`. To satisfy the prompt recommendation for `css/variables.css` without breaking the single stylesheet import order:
1. `css/variables.css` can be introduced as the baseline design token stylesheet containing:
   - Global typography stacks (`--reader-font-serif`, `--reader-font-sans`, `--reader-font-dyslexic`)
   - Layout constants (`--header-height: 56px;`, `--footer-height: 48px;`, `--drawer-width: 320px;`)
   - Animation easing tokens (`--ease-spring: cubic-bezier(0.16, 1, 0.3, 1);`)
2. `index.html` can include `<link rel="stylesheet" href="css/variables.css">` immediately preceding `<link rel="stylesheet" href="css/themes.css">`, or `css/themes.css` can import it via `@import url('variables.css');`.
3. For maximum zero-build robustness, keeping the theme palette definitions in `css/themes.css` while declaring typography and spacing tokens in `css/variables.css` creates a clean separation of concerns.

---

## 8. Host UI & JavaScript Integration Touchpoints

Implementing the 10-theme collection requires synchronized updates across 5 files:

### 8.1. `index.html`: Synchronous `<head>` Bootstrap (Test 1.9 Fix)
In `<head>` inline script:
```javascript
// BEFORE:
var allowed = ['warm-paper', 'soft-dark', 'daylight', 'sage'];

// AFTER (Must whitelist all 10 themes):
var allowed = [
  'warm-paper', 'soft-dark', 'daylight', 'sage',
  'solarized-light', 'solarized-dark', 'nord',
  'oled-black', 'rose-pine', 'e-ink'
];
```

### 8.2. `index.html`: Settings Drawer Swatches Grid (Test 1.8 Fix)
In `#settings-drawer .theme-swatches`, add the 6 new swatch buttons:
```html
<div class="theme-swatches">
  <!-- 4 Existing Themes -->
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

  <!-- 6 New Themes -->
  <button type="button" id="theme-solarized-light" class="theme-swatch-btn" data-theme-choice="solarized-light" aria-pressed="false">
    <span class="theme-circle" style="background-color: #fdf6e3; border-color: #268bd2;"></span>
    <span class="theme-swatch-label">Solarized Light</span>
  </button>
  <button type="button" id="theme-solarized-dark" class="theme-swatch-btn" data-theme-choice="solarized-dark" aria-pressed="false">
    <span class="theme-circle" style="background-color: #002b36; border-color: #2aa198;"></span>
    <span class="theme-swatch-label">Solarized Dark</span>
  </button>
  <button type="button" id="theme-nord" class="theme-swatch-btn" data-theme-choice="nord" aria-pressed="false">
    <span class="theme-circle" style="background-color: #2e3440; border-color: #88c0d0;"></span>
    <span class="theme-swatch-label">Nord Arctic</span>
  </button>
  <button type="button" id="theme-oled-black" class="theme-swatch-btn" data-theme-choice="oled-black" aria-pressed="false">
    <span class="theme-circle" style="background-color: #000000; border-color: #e0a96d;"></span>
    <span class="theme-swatch-label">OLED Black</span>
  </button>
  <button type="button" id="theme-rose-pine" class="theme-swatch-btn" data-theme-choice="rose-pine" aria-pressed="false">
    <span class="theme-circle" style="background-color: #191724; border-color: #ebbcba;"></span>
    <span class="theme-swatch-label">Rosé Pine</span>
  </button>
  <button type="button" id="theme-e-ink" class="theme-swatch-btn" data-theme-choice="e-ink" aria-pressed="false">
    <span class="theme-circle" style="background-color: #f0f0eb; border-color: #1a1a1a;"></span>
    <span class="theme-swatch-label">E-Ink Paper</span>
  </button>
</div>
```

### 8.3. `css/main.css`: Theme Swatches Grid Layout
In `css/main.css`:
```css
/* Update grid to accommodate 10 buttons cleanly */
.theme-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 0.5rem;
}
```

### 8.4. `js/storage/settings-store.js`: Enum & Whitelist Expansion
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
```

### 8.5. `js/reader/reader-engine.js`: Palette Map Expansion
Expand `THEME_PALETTES` to define all 10 themes with both canonical and alias properties:
```javascript
export const THEME_PALETTES = Object.freeze({
  'warm-paper': {
    '--bg-primary': '#f8f1e3',
    '--text-primary': '#2c2523',
    '--color-bg': '#f8f1e3',
    '--color-text': '#2c2523',
    '--color-surface': '#efe5d0',
    '--color-accent': '#8b5a2b',
    '--color-border': '#dfd3bd'
  },
  'soft-dark': {
    '--bg-primary': '#1a1c1e',
    '--text-primary': '#e2e2e0',
    '--color-bg': '#1a1c1e',
    '--color-text': '#e2e2e0',
    '--color-surface': '#24282c',
    '--color-accent': '#e5a869',
    '--color-border': '#33383e'
  },
  'daylight': {
    '--bg-primary': '#fcfbf9',
    '--text-primary': '#1e2022',
    '--color-bg': '#fcfbf9',
    '--color-text': '#1e2022',
    '--color-surface': '#f3f2ee',
    '--color-accent': '#2364a0',
    '--color-border': '#e0dfd9'
  },
  'sage': {
    '--bg-primary': '#eef3ed',
    '--text-primary': '#1c2820',
    '--color-bg': '#eef3ed',
    '--color-text': '#1c2820',
    '--color-surface': '#e1eae0',
    '--color-accent': '#2d7348',
    '--color-border': '#cfdcd0'
  },
  'solarized-light': {
    '--bg-primary': '#fdf6e3',
    '--text-primary': '#073642',
    '--color-bg': '#fdf6e3',
    '--color-text': '#073642',
    '--color-surface': '#eee8d5',
    '--color-accent': '#268bd2',
    '--color-border': '#d3cbb7'
  },
  'solarized-dark': {
    '--bg-primary': '#002b36',
    '--text-primary': '#eee8d5',
    '--color-bg': '#002b36',
    '--color-text': '#eee8d5',
    '--color-surface': '#073642',
    '--color-accent': '#2aa198',
    '--color-border': '#154855'
  },
  'nord': {
    '--bg-primary': '#2e3440',
    '--text-primary': '#eceff4',
    '--color-bg': '#2e3440',
    '--color-text': '#eceff4',
    '--color-surface': '#3b4252',
    '--color-accent': '#88c0d0',
    '--color-border': '#4c566a'
  },
  'oled-black': {
    '--bg-primary': '#000000',
    '--text-primary': '#c8c8c8',
    '--color-bg': '#000000',
    '--color-text': '#c8c8c8',
    '--color-surface': '#121212',
    '--color-accent': '#e0a96d',
    '--color-border': '#282828'
  },
  'rose-pine': {
    '--bg-primary': '#191724',
    '--text-primary': '#e0def4',
    '--color-bg': '#191724',
    '--color-text': '#e0def4',
    '--color-surface': '#1f1d2e',
    '--color-accent': '#ebbcba',
    '--color-border': '#393552'
  },
  'e-ink': {
    '--bg-primary': '#f0f0eb',
    '--text-primary': '#1a1a1a',
    '--color-bg': '#f0f0eb',
    '--color-text': '#1a1a1a',
    '--color-surface': '#e2e2dc',
    '--color-accent': '#2b2b2b',
    '--color-border': '#cccccc'
  }
});
```

---

## 9. Verification & Automated Testing Plan

The implementer can verify the implementation against existing automated suites:

1. **Baseline Contrast Engine Verification**:
   ```bash
   npm run test:upgrade:tier0
   ```
   *Expected*: Passes test `0.4 WCAG AAA Contrast Calculation Engine Baseline for All 10 Themes`.

2. **10-Theme Swatches & Zero-FOUC Verification**:
   ```bash
   node test/e2e_upgrade.test.js --grep="1.8"
   node test/e2e_upgrade.test.js --grep="1.9"
   ```
   *Expected*: Passes both tests `1.8` (iterates all 10 theme swatches, computes contrast on DOM, asserts $CR \ge 7.0$) and `1.9` (persists `'nord'`, reloads page, confirms instant DOM data-theme restoration without FOUC).

3. **Regression Safety Check**:
   ```bash
   npm test
   ```
   *Expected*: 100% pass across all baseline EPUB tests (`test/e2e.test.js`).
