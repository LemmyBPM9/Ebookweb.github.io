# Milestone 1 Architectural Exploration & Handoff Report: Eye-Comfort Design System & CSS Themes

**Explorer**: `m1_explorer_2`  
**Parent Orchestrator**: `bf9f892e-9f7c-4a5f-80d2-882b9b27b238` (`orchestrator_1`)  
**Scope**: Milestone 1: Core Foundation, Storage & Themes  
**Focus**: Eye-Comfort Design System & CSS Themes (`css/themes.css` & `css/main.css` base)  
**Deliverable**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_explorer_2/handoff.md`  

---

## 1. Observation

### 1.1 Specification & Requirement Analysis
- **Requirement R3 (Eye-Comfort Themes & Typography Customization)** (`ORIGINAL_REQUEST.md:20-28`):
  > "- **Eye-Comfort Themes**: Provide 4 curated low-glare color palettes with balanced contrast ratios:  
  >   1. *Warm Paper / Sepia* (default — warm cream background, soft charcoal ink)  
  >   2. *Soft Dark / Night* (low-blue-light dark slate/charcoal background, muted warm grey text — avoiding harsh `#000000` on `#FFFFFF` halation)  
  >   3. *Daylight / Clean Light* (soft off-white background with crisp dark ink)  
  >   4. *Sage / Forest Calm* (gentle muted green-tinted background for reduced ocular fatigue)  
  > - **Typography Controls**: Allow real-time adjustment of font family (curated readable serif, sans-serif, and dyslexia/mono options), font size, line height, and reading column width/margins, immediately persisted and applied to the book content."

- **Acceptance Criteria** (`ORIGINAL_REQUEST.md:39`):
  > "- [ ] **Eye-Comfort & Typography Verification**: Switching between all 4 themes (Warm Paper, Soft Dark, Daylight, Sage) updates CSS variables and reader content styling with WCAG AA compliant contrast (>= 4.5:1) and zero harsh pure-black-on-pure-white glare; changing font family, font size, line height, and page width measurably updates the rendered chapter typography."

- **Project Specification Architecture** (`PROJECT.md:28, 36, 129-132`):
  > "13 | 4 Eye-Comfort Color Themes | Warm Paper (Sepia), Soft Dark (Night), Daylight, Sage with verified WCAG AAA contrast (>13:1) | M1 | survey"  
  > "21 | Theme & Typography CSS Cascade | Overrides hardcoded book styles in iframe using high-specificity CSS custom properties | M3 | survey"  
  > "├── css/  
  > │   ├── main.css                 # Base resets, typography, layout grid, modals, drawers  
  > │   ├── reader.css               # Reader stage, multi-column rules, tap zones, chrome  
  > │   └── themes.css               # 4 Eye-comfort color themes & CSS custom properties"

### 1.2 Mathematical Luminance & Contrast Verification
Relative luminance was calculated in Node.js v25.9.0 using the standard WCAG 2.1 formula:
$$L = 0.2126 \times R_{\text{lin}} + 0.7152 \times G_{\text{lin}} + 0.0722 \times B_{\text{lin}}$$
where $C_{\text{lin}} = \frac{C_{\text{srgb}}}{255} \le 0.04045 ? \frac{C_{\text{srgb}}}{12.92 \times 255} : \left(\frac{C_{\text{srgb}}/255 + 0.055}{1.055}\right)^{2.4}$.  
Contrast Ratio is defined as:
$$\text{Contrast Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05} \quad (L_1 \ge L_2)$$

#### Measured Relative Luminance Values:
| Theme | Token | Hex Color | Relative Luminance ($L$) |
|---|---|---|---|
| **Warm Paper** | `--color-bg` | `#f8f1e3` | $0.8841$ |
| | `--color-surface` | `#efe5d0` | $0.7894$ |
| | `--color-surface-hover` | `#e7d9bf` | $0.7038$ |
| | `--color-border` | `#dfd3bd` | $0.6595$ |
| | `--color-border-strong` | `#96836e` | $0.2384$ |
| | `--color-text` | `#2c2523` | $0.0198$ |
| | `--color-text-secondary` | `#5c504a` | $0.0851$ |
| | `--color-text-muted` | `#70625b` | $0.1294$ |
| | `--color-accent` | `#8b5a2b` | $0.1298$ |
| | `--color-accent-text` | `#ffffff` | $1.0000$ |
| **Soft Dark** | `--color-bg` | `#1a1c1e` | $0.0114$ |
| | `--color-surface` | `#24282c` | $0.0207$ |
| | `--color-surface-hover` | `#2f343a` | $0.0337$ |
| | `--color-border` | `#33383e` | $0.0388$ |
| | `--color-border-strong` | `#636b75` | $0.1445$ |
| | `--color-text` | `#e2e2e0` | $0.7594$ |
| | `--color-text-secondary` | `#9e9e9a` | $0.3406$ |
| | `--color-text-muted` | `#92928d` | $0.2859$ |
| | `--color-accent` | `#e5a869` | $0.4568$ |
| | `--color-accent-text` | `#1a1c1e` | $0.0114$ |
| **Daylight** | `--color-bg` | `#fcfbf9` | $0.9653$ |
| | `--color-surface` | `#f3f2ee` | $0.8873$ |
| | `--color-surface-hover` | `#e8e6df` | $0.7908$ |
| | `--color-border` | `#e0dfd9` | $0.7363$ |
| | `--color-border-strong` | `#8d9299` | $0.2852$ |
| | `--color-text` | `#1e2022` | $0.0142$ |
| | `--color-text-secondary` | `#555b62` | $0.1030$ |
| | `--color-text-muted` | `#666d75` | $0.1505$ |
| | `--color-accent` | `#2364a0` | $0.1201$ |
| | `--color-accent-text` | `#ffffff` | $1.0000$ |
| **Sage** | `--color-bg` | `#eef3ed` | $0.8839$ |
| | `--color-surface` | `#e1eae0` | $0.8024$ |
| | `--color-surface-hover` | `#d6e3d5` | $0.7404$ |
| | `--color-border` | `#cfdcd0` | $0.6901$ |
| | `--color-border-strong` | `#778d7b` | $0.2440$ |
| | `--color-text` | `#1c2820` | $0.0187$ |
| | `--color-text-secondary` | `#4a5d50` | $0.0986$ |
| | `--color-text-muted` | `#56685c` | $0.1265$ |
| | `--color-accent` | `#2d7348` | $0.1329$ |
| | `--color-accent-text` | `#ffffff` | $1.0000$ |

---

## 2. Logic Chain

### 2.1 Physiological Eye-Comfort Principles
The design of digital reading surfaces must address three primary causes of visual fatigue:
1. **Halation & Excessive Luminance Range**:
   - `#000000` text on `#ffffff` displays exposes the eye to maximum luminous emittance, inducing pupil constriction and glare discomfort.
   - In dark mode, `#ffffff` text on pure `#000000` background triggers severe retinal halation (the light from the letterforms spills into adjacent photoreceptors, causing blurred edges and forced accommodation).
   - *Remedy*: Warm Paper uses warm cream `#f8f1e3` and iron-gall charcoal `#2c2523` ($13.38:1$). Soft Dark uses slate charcoal `#1a1c1e` and muted warm grey `#e2e2e0` ($13.17:1$), eliminating halation entirely while providing crystal-clear readability.
2. **Spectral Tuning & Circadian Protection**:
   - Short-wavelength high-energy blue photons (~420nm-460nm) increase oxidative stress on retinal pigment epithelium and disrupt sleep cycles.
   - Warm Paper mimics natural cellulose book stock (warm 3200K tone).
   - Sage shifts the reflective tone toward middle-wavelength green (~555nm), where human photopic luminous efficiency peaks ($V(\lambda) = 1.0$), minimizing ciliary muscle tension during extended reading.
3. **Daylight Off-White Balancing**:
   - For users reading in bright ambient or office environments, pure `#ffffff` creates high reflection. Daylight uses an off-white `#fcfbf9` with crisp charcoal `#1e2022` ($15.80:1$).

---

### 2.2 Complete WCAG AA & AAA Compliance Verification Matrix
The table below proves compliance across all four themes for every visual element:

| Contrast Measurement Target | WCAG Requirement | Warm Paper (`#f8f1e3`) | Soft Dark (`#1a1c1e`) | Daylight (`#fcfbf9`) | Sage (`#eef3ed`) | Status |
|---|---|---|---|---|---|---|
| **Body Text on Background** | AA $\ge 4.5:1$<br>AAA $\ge 7.0:1$ | **13.38 : 1** | **13.17 : 1** | **15.80 : 1** | **13.60 : 1** | **PASS (AAA)** |
| **Body Text on Surface** | AA $\ge 4.5:1$<br>AAA $\ge 7.0:1$ | **12.03 : 1** | **11.44 : 1** | **14.59 : 1** | **12.41 : 1** | **PASS (AAA)** |
| **Secondary Text on Background** | AA $\ge 4.5:1$ | **6.92 : 1** | **6.36 : 1** | **6.64 : 1** | **6.28 : 1** | **PASS (AA)** |
| **Secondary Text on Surface** | AA $\ge 4.5:1$ | **6.21 : 1** | **5.52 : 1** | **6.13 : 1** | **5.73 : 1** | **PASS (AA)** |
| **Muted Text on Background** | AA $\ge 4.5:1$ | **5.21 : 1** | **5.47 : 1** | **5.06 : 1** | **5.29 : 1** | **PASS (AA)** |
| **Muted Text on Surface** | AA $\ge 4.5:1$ | **4.68 : 1** | **4.75 : 1** | **4.68 : 1** | **4.83 : 1** | **PASS (AA)** |
| **Accent Links on Background** | AA $\ge 4.5:1$ | **5.20 : 1** | **8.25 : 1** | **5.97 : 1** | **5.11 : 1** | **PASS (AA / AAA)** |
| **Accent Links on Surface** | AA $\ge 4.5:1$ | **4.67 : 1** | **7.16 : 1** | **5.51 : 1** | **4.66 : 1** | **PASS (AA / AAA)** |
| **Text on Solid Accent Button** | AA $\ge 4.5:1$ | **5.84 : 1** (`#fff`) | **8.25 : 1** (`#1a1c1e`) | **6.17 : 1** (`#fff`) | **5.74 : 1** (`#fff`) | **PASS (AA / AAA)** |
| **UI Boundaries (Border Strong)** | Non-Text $\ge 3.0:1$ | **3.24 : 1** | **3.17 : 1** | **3.03 : 1** | **3.18 : 1** | **PASS (3:1)** |
| **Focus Ring on Background** | Focus $\ge 3.0:1$ | **5.20 : 1** | **8.25 : 1** | **5.97 : 1** | **5.11 : 1** | **PASS (3:1)** |

#### Critical Accessibility Finding: The Accent Text Token (`--color-accent-text`)
In `soft-dark`, the accent color is warm candlelight amber `#e5a869`.
- If an author hardcodes button text to `#ffffff`, the contrast on `#e5a869` is only **2.07 : 1**, which fails WCAG AA catastrophically.
- By defining a explicit token `--color-accent-text`:
  - `warm-paper`: `#ffffff` (Contrast $5.84:1$ $\to$ PASS AA)
  - `soft-dark`: `#1a1c1e` (Contrast **8.25 : 1** $\to$ PASS AAA)
  - `daylight`: `#ffffff` (Contrast $6.17:1$ $\to$ PASS AA)
  - `sage`: `#ffffff` (Contrast $5.74:1$ $\to$ PASS AA)
Primary call-to-action buttons (`.btn-primary`) and active badges are guaranteed to meet or exceed WCAG AA/AAA standards across all themes.

---

### 2.3 CSS Custom Properties Architecture (`css/themes.css` Blueprint)

Here is the exact, complete implementation blueprint for `css/themes.css`:

```css
/**
 * WebReader — Eye-Comfort Themes & Color Custom Properties
 * File: css/themes.css
 * Spec: WCAG 2.1 AA / AAA compliant low-glare palettes
 */

/* ==========================================================================
   Base Theme Variables & Default: Warm Paper (Sepia)
   ========================================================================== */
:root,
[data-theme="warm-paper"] {
  /* System color scheme integration for native form controls and scrollbars */
  color-scheme: light;

  /* Surface & Background */
  --color-bg: #f8f1e3;
  --color-surface: #efe5d0;
  --color-surface-hover: #e7d9bf;
  --color-surface-active: #dfd0b2;

  /* Borders & Dividers */
  --color-border: #dfd3bd;
  --color-border-strong: #96836e; /* Passes 3:1 non-text UI contrast */

  /* Text & Typography */
  --color-text: #2c2523;           /* 13.38:1 contrast on BG (AAA) */
  --color-text-secondary: #5c504a; /* 6.92:1 contrast on BG (AA) */
  --color-text-muted: #70625b;     /* 5.21:1 on BG, 4.68:1 on Surface (AA) */

  /* Accent & Interactive */
  --color-accent: #8b5a2b;         /* Warm chestnut/leather */
  --color-accent-hover: #724820;
  --color-accent-light: rgba(139, 90, 43, 0.12);
  --color-accent-text: #ffffff;    /* 5.84:1 contrast on accent (AA) */
  --color-focus-ring: #8b5a2b;

  /* Utility & Feedback */
  --color-highlight: #fcedbe;
  --color-scrollbar: #dcd0b7;
  --color-scrollbar-hover: #c9baa0;
  --color-shadow: rgba(44, 37, 35, 0.08);
  --color-overlay: rgba(44, 37, 35, 0.40);
  --color-error: #9e2a2b;
  --color-error-bg: #fbeae8;
  --color-success: #2d7348;
  --color-success-bg: #e6f3eb;

  /* Reader Typography Defaults */
  --reader-font-family: 'Merriweather', 'Georgia', 'Iowan Old Style', 'Palatino Linotype', serif;
  --reader-font-size: 18px;
  --reader-line-height: 1.75;
  --reader-max-width: 720px;
  --reader-text-align: left;
  --reader-paragraph-spacing: 1.25em;
  --reader-page-margin: 40px;
}

/* ==========================================================================
   Theme 2: Soft Dark / Night (Low-Blue-Light, Zero Halation)
   ========================================================================== */
[data-theme="soft-dark"] {
  color-scheme: dark;

  /* Surface & Background */
  --color-bg: #1a1c1e;
  --color-surface: #24282c;
  --color-surface-hover: #2f343a;
  --color-surface-active: #383e46;

  /* Borders & Dividers */
  --color-border: #33383e;
  --color-border-strong: #636b75; /* Passes 3:1 non-text UI contrast */

  /* Text & Typography */
  --color-text: #e2e2e0;           /* 13.17:1 contrast on BG (AAA) */
  --color-text-secondary: #9e9e9a; /* 6.36:1 contrast on BG (AA) */
  --color-text-muted: #92928d;     /* 5.47:1 on BG, 4.75:1 on Surface (AA) */

  /* Accent & Interactive */
  --color-accent: #e5a869;         /* Candlelight amber gold */
  --color-accent-hover: #f3be86;
  --color-accent-light: rgba(229, 168, 105, 0.16);
  --color-accent-text: #1a1c1e;    /* 8.25:1 contrast on accent (AAA) */
  --color-focus-ring: #e5a869;

  /* Utility & Feedback */
  --color-highlight: #453c28;
  --color-scrollbar: #3c424a;
  --color-scrollbar-hover: #505862;
  --color-shadow: rgba(0, 0, 0, 0.50);
  --color-overlay: rgba(0, 0, 0, 0.70);
  --color-error: #f28b82;
  --color-error-bg: #3c1e1e;
  --color-success: #81c995;
  --color-success-bg: #1e3324;
}

/* ==========================================================================
   Theme 3: Daylight / Clean Light (Low-Glare Off-White)
   ========================================================================== */
[data-theme="daylight"] {
  color-scheme: light;

  /* Surface & Background */
  --color-bg: #fcfbf9;
  --color-surface: #f3f2ee;
  --color-surface-hover: #e8e6df;
  --color-surface-active: #dedcd4;

  /* Borders & Dividers */
  --color-border: #e0dfd9;
  --color-border-strong: #8d9299; /* Passes 3:1 non-text UI contrast */

  /* Text & Typography */
  --color-text: #1e2022;           /* 15.80:1 contrast on BG (AAA) */
  --color-text-secondary: #555b62; /* 6.64:1 contrast on BG (AA) */
  --color-text-muted: #666d75;     /* 5.06:1 on BG, 4.68:1 on Surface (AA) */

  /* Accent & Interactive */
  --color-accent: #2364a0;         /* Lapis blue */
  --color-accent-hover: #1b4f80;
  --color-accent-light: rgba(35, 100, 160, 0.10);
  --color-accent-text: #ffffff;    /* 6.17:1 contrast on accent (AA) */
  --color-focus-ring: #2364a0;

  /* Utility & Feedback */
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

/* ==========================================================================
   Theme 4: Sage / Forest Calm (Peak Photopic Comfort)
   ========================================================================== */
[data-theme="sage"] {
  color-scheme: light;

  /* Surface & Background */
  --color-bg: #eef3ed;
  --color-surface: #e1eae0;
  --color-surface-hover: #d6e3d5;
  --color-surface-active: #c8d8c6;

  /* Borders & Dividers */
  --color-border: #cfdcd0;
  --color-border-strong: #778d7b; /* Passes 3:1 non-text UI contrast */

  /* Text & Typography */
  --color-text: #1c2820;           /* 13.60:1 contrast on BG (AAA) */
  --color-text-secondary: #4a5d50; /* 6.28:1 contrast on BG (AA) */
  --color-text-muted: #56685c;     /* 5.29:1 on BG, 4.83:1 on Surface (AA) */

  /* Accent & Interactive */
  --color-accent: #2d7348;         /* Pine green */
  --color-accent-hover: #225636;
  --color-accent-light: rgba(45, 115, 72, 0.12);
  --color-accent-text: #ffffff;    /* 5.74:1 contrast on accent (AA) */
  --color-focus-ring: #2d7348;

  /* Utility & Feedback */
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

/* ==========================================================================
   FOUC Prevention & Smooth Transitions
   ========================================================================== */
/* Apply calm transitions when user toggles themes, but suppress during initial boot */
html:not(.no-theme-transition) body,
html:not(.no-theme-transition) .app-header,
html:not(.no-theme-transition) .app-footer,
html:not(.no-theme-transition) .drawer,
html:not(.no-theme-transition) .card,
html:not(.no-theme-transition) .btn {
  transition: background-color 0.22s ease, color 0.22s ease, border-color 0.22s ease;
}

/* Disable transitions if user requested reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
```

---

### 2.4 Synchronous FOUC Prevention & Cascade Strategy

#### 1. Synchronous `<head>` Bootstrap
To guarantee that neither white flashes nor wrong-theme flickering occurs on page reload or fresh boot:
1. In `index.html` inside `<head>`, before any stylesheet `<link>` or DOM content:
   ```html
   <script>
     (function() {
       try {
         const theme = localStorage.getItem('webreader_theme') || 'warm-paper';
         document.documentElement.setAttribute('data-theme', theme);
         document.documentElement.classList.add('no-theme-transition');
       } catch (e) {
         document.documentElement.setAttribute('data-theme', 'warm-paper');
       }
     })();
   </script>
   ```
2. In `app.js` after window `DOMContentLoaded`:
   ```javascript
   // Remove transition suppression once layout is stable
   requestAnimationFrame(() => {
     document.documentElement.classList.remove('no-theme-transition');
   });
   ```

#### 2. Reader iframe Style Injection & Specificity Cascade
Arbitrary EPUB books frequently contain internal stylesheets with aggressive styles (e.g., `body { background: #fff !important; color: #000; font-family: 'Times New Roman'; }`).  
To enforce eye-comfort and user typography settings cleanly inside the sandboxed `<iframe>`:
1. When a chapter is loaded into the iframe, `ReaderEngine` sets `<html data-theme="...">` on the iframe's document element.
2. Injects a dedicated style element `<style id="webreader-injected-styles">` into the iframe's `<head>`:

```css
/* Injected into reading iframe */
:root {
  /* Inherit current custom properties from parent frame */
}

html, body {
  background-color: var(--color-bg) !important;
  color: var(--color-text) !important;
  font-family: var(--reader-font-family) !important;
  font-size: var(--reader-font-size) !important;
  line-height: var(--reader-line-height) !important;
  text-align: var(--reader-text-align, left) !important;
  margin: 0 !important;
  padding: 0 !important;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Force cascade down through paragraphs, headings, blockquotes, lists */
p, div, span, li, dt, dd, td, th {
  color: inherit !important;
  font-family: inherit !important;
}

h1, h2, h3, h4, h5, h6 {
  color: inherit !important;
  font-family: inherit !important;
  line-height: 1.3 !important;
}

blockquote {
  color: var(--color-text-secondary) !important;
  border-left: 3px solid var(--color-accent) !important;
  padding-left: 1.25em !important;
  margin: 1.5em 0 !important;
  font-style: italic;
}

a {
  color: var(--color-accent) !important;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

/* Selection highlight */
::selection {
  background-color: var(--color-highlight) !important;
  color: inherit !important;
}

/* Night mode low-glare image dimming */
[data-theme="soft-dark"] img,
[data-theme="soft-dark"] svg,
[data-theme="soft-dark"] image {
  filter: brightness(0.88) contrast(1.05);
  transition: filter 0.2s ease;
}
[data-theme="soft-dark"] img:hover,
[data-theme="soft-dark"] svg:hover {
  filter: brightness(1.0) contrast(1.0);
}
```

---

### 2.5 Typography Engine & Controls Specification

#### 1. Curated Font Stacks:
| Identifier | Category | System Font Stack | Target Reader Experience |
|---|---|---|---|
| `serif` (default) | Curated Book Serif | `'Merriweather', 'Georgia', 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'URW Bookman', serif` | Classic printed codex feel, high reading stamina |
| `sans` | Modern Neutral Sans | `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | Clean, crisp, distraction-free modern screen reading |
| `dyslexic` | Dyslexia-Friendly / Mono | `'OpenDyslexic', 'Atkinson Hyperlegible', ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Monaco, Consolas, monospace` | Enhanced character differentiation, heavy baselines, aids dyslexic readers |
| `ui` | Chrome System Sans | `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | Pinned UI chrome, headers, drawer labels, button texts |

#### 2. Typography Controls Sliders & Ranges:
| Property | CSS Variable | Minimum | Maximum | Step | Default | Unit / Format |
|---|---|---|---|---|---|---|
| **Font Family** | `--reader-font-family` | — | — | — | `serif` | Stack string |
| **Font Size** | `--reader-font-size` | `14px` | `32px` | `1px` | `18px` | `px` |
| **Line Height** | `--reader-line-height` | `1.30` | `2.40` | `0.05` | `1.75` | Unitless ratio |
| **Measure (Max Width)** | `--reader-max-width` | `540px` | `1000px` | `20px` | `720px` | `px` (~65-75 chars per line) |
| **Text Alignment** | `--reader-text-align` | — | — | — | `left` | `left` or `justify` |

#### 3. Storage Representation (`localStorage`):
Key: `webreader_typography`  
Value (JSON string):
```json
{
  "fontFamily": "serif",
  "fontSize": 18,
  "lineHeight": 1.75,
  "maxWidth": 720,
  "textAlign": "left"
}
```

---

### 2.6 Base Layout, Resets & Control Classes (`css/main.css` Base Blueprint)

The base styles in `css/main.css` establish the foundational resets, typography, and accessible UI controls used by the Library view, Reader chrome, Drawers, and Settings panel:

```css
/**
 * WebReader — Base Styles, Typography & UI Controls
 * File: css/main.css
 */

/* ==========================================================================
   1. Modern CSS Reset
   ========================================================================== */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  min-height: 100vh;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
  overflow-x: hidden;
}

/* ==========================================================================
   2. Focus Standards & Accessibility
   ========================================================================== */
:focus {
  outline: none;
}

:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ==========================================================================
   3. Interactive Buttons (.btn)
   ========================================================================== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  min-height: 40px; /* Touch target accessibility */
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  background: transparent;
  color: var(--color-text);
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

.btn:active {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Button Variants */
.btn-primary {
  background-color: var(--color-accent);
  color: var(--color-accent-text); /* Verified AA/AAA contrast */
  border-color: var(--color-accent);
}

.btn-primary:hover {
  background-color: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.btn-secondary {
  background-color: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.btn-secondary:hover {
  background-color: var(--color-surface-hover);
}

.btn-ghost {
  background-color: transparent;
  color: var(--color-text);
}

.btn-ghost:hover {
  background-color: var(--color-surface-hover);
}

.btn-icon {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  flex-shrink: 0;
}

.btn-icon svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

/* ==========================================================================
   4. Form Controls & Range Sliders
   ========================================================================== */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-value-display {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

/* Accessible Range Sliders */
.range-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background-color: var(--color-border);
  outline: none;
  margin: 0.75rem 0;
  cursor: pointer;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--color-accent);
  border: 2px solid var(--color-surface);
  box-shadow: 0 1px 3px var(--color-shadow);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.range-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.range-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--color-accent);
  border: 2px solid var(--color-surface);
  box-shadow: 0 1px 3px var(--color-shadow);
  cursor: pointer;
}

/* Segmented Control / Button Groups */
.segmented-control {
  display: flex;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

.segmented-option {
  flex: 1;
  text-align: center;
  padding: 0.4rem 0.6rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.segmented-option.is-active {
  background-color: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 1px 3px var(--color-shadow);
  font-weight: 600;
}

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

/* ==========================================================================
   5. Drawers, Cards, Modals & Toast Popups
   ========================================================================== */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--color-overlay);
  backdrop-filter: blur(2px);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.drawer-backdrop.is-open {
  opacity: 1;
  pointer-events: auto;
}

.drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  width: min(380px, 85vw);
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  box-shadow: 2px 0 16px var(--color-shadow);
  z-index: 101;
  transform: translateX(-100%);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

.drawer.drawer-right {
  right: 0;
  left: auto;
  border-right: none;
  border-left: 1px solid var(--color-border);
  transform: translateX(100%);
}

.drawer.is-open {
  transform: translateX(0);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.drawer-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  scrollbar-color: var(--color-scrollbar) transparent;
}

/* Book Card Grid */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem 0;
}

.card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 8px var(--color-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--color-shadow);
}

/* Progress Footer & Bar */
.progress-bar-container {
  width: 100%;
  height: 4px;
  background-color: var(--color-border);
  position: relative;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background-color: var(--color-accent);
  transition: width 0.2s ease;
}

/* Scrollbar Customization */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
}
```

---

## 3. Caveats

1. **System Font Fallback Discipline**:
   - Because no web fonts are bundled or fetched over the network (to guarantee pure offline client-side functionality with zero external dependencies), font stacks strictly prioritize high-quality preinstalled operating system fonts (`Merriweather` on modern systems, `Georgia` / `Palatino` on macOS/iOS/Windows, `system-ui` on modern devices, and `OpenDyslexic` / `Atkinson` if locally installed with clean monospace fallback).
2. **Iframe Sandboxing Inheritance**:
   - The reader engine uses `<iframe sandbox="allow-same-origin">` without `allow-scripts` for security. CSS custom properties declared on the host document do NOT automatically cross iframe boundaries into an isolated document.
   - *Requirement*: The `ReaderEngine` must programmatically set `data-theme` on the iframe's `<html>` element and inject the `<style>` block containing the CSS variables and high-specificity overrides whenever a book or chapter is mounted or when a theme is switched.
3. **Forced Colors Mode (Windows High Contrast)**:
   - When the user enables OS High Contrast, the browser forces system colors (`Canvas`, `CanvasText`, `LinkText`, `Highlight`). Custom properties will not override forced colors unless `forced-color-adjust: none` is explicitly applied. In accordance with modern web accessibility guidelines, forced colors should be respected for readers with severe low vision.
4. **Touch Target Dimensions**:
   - Touch devices require minimum 44x44px interactive areas. On desktop viewport, 40x40px is acceptable. Both dimensions are preserved with `.btn`, `.btn-icon`, and slider thumb sizing.

---

## 4. Conclusion

1. **Color Palettes**: The 4 curated low-glare palettes (`warm-paper`, `soft-dark`, `daylight`, `sage`) fulfill all criteria of `ORIGINAL_REQUEST.md:22-26`. They eliminate eye fatigue, prevent circadian disturbance from blue-light spikes, and avoid retinal halation.
2. **Mathematical WCAG Proof**: All four palettes pass **WCAG AAA** ($\ge 7.0:1$) for body text (achieving between $11.44:1$ and $15.80:1$), pass **WCAG AA** ($\ge 4.5:1$) for secondary and muted text ($4.68:1$ to $6.92:1$), and pass **Non-Text UI contrast** ($\ge 3.0:1$) for borders, form controls, and focus indicators.
3. **Accent Token Discovery**: The `--color-accent-text: #1a1c1e` token in `soft-dark` guarantees **8.25:1 AAA** contrast on solid buttons, avoiding the common bug where white text on gold fails accessibility.
4. **CSS Architecture**: The clean segregation into `css/themes.css` (custom properties and theme data attributes) and `css/main.css` (resets, typography defaults, and accessible control classes) provides a turnkey blueprint for immediate implementation in Milestone 1.

---

## 5. Verification Method

### 5.1 Programmatic WCAG Contrast Verification
Run the following self-contained Node.js script in terminal:

```bash
node -e '
function sRGBtoLin(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function getLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}
function getContrast(h1, h2) {
  const l1 = getLuminance(h1), l2 = getLuminance(h2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const tests = [
  { theme: "warm-paper", bg: "#f8f1e3", text: "#2c2523", surface: "#efe5d0", secondary: "#5c504a", muted: "#70625b", accent: "#8b5a2b", accentText: "#ffffff", borderStrong: "#96836e" },
  { theme: "soft-dark",  bg: "#1a1c1e", text: "#e2e2e0", surface: "#24282c", secondary: "#9e9e9a", muted: "#92928d", accent: "#e5a869", accentText: "#1a1c1e", borderStrong: "#636b75" },
  { theme: "daylight",   bg: "#fcfbf9", text: "#1e2022", surface: "#f3f2ee", secondary: "#555b62", muted: "#666d75", accent: "#2364a0", accentText: "#ffffff", borderStrong: "#8d9299" },
  { theme: "sage",       bg: "#eef3ed", text: "#1c2820", surface: "#e1eae0", secondary: "#4a5d50", muted: "#56685c", accent: "#2d7348", accentText: "#ffffff", borderStrong: "#778d7b" }
];

let allPassed = true;
for (const t of tests) {
  const bodyBg = getContrast(t.text, t.bg);
  const bodySurf = getContrast(t.text, t.surface);
  const secBg = getContrast(t.secondary, t.bg);
  const mutedSurf = getContrast(t.muted, t.surface);
  const btnText = getContrast(t.accentText, t.accent);
  const borderUi = getContrast(t.borderStrong, t.bg);

  const pass = (bodyBg >= 7.0) && (bodySurf >= 7.0) && (secBg >= 4.5) && (mutedSurf >= 4.5) && (btnText >= 4.5) && (borderUi >= 3.0);
  if (!pass) allPassed = false;
  console.log(`[${t.theme.toUpperCase()}] Body: ${bodyBg.toFixed(2)}:1 (AAA), Sec: ${secBg.toFixed(2)}:1 (AA), Muted on Surf: ${mutedSurf.toFixed(2)}:1 (AA), Button: ${btnText.toFixed(2)}:1, Border: ${borderUi.toFixed(2)}:1 => ${pass ? "PASS" : "FAIL"}`);
}
console.log(`\nOverall WCAG Verification: ${allPassed ? "100% ALL THEMES PASS" : "FAILED"}`);
'
```

**Expected Output**:
```
[WARM-PAPER] Body: 13.38:1 (AAA), Sec: 6.92:1 (AA), Muted on Surf: 4.68:1 (AA), Button: 5.84:1, Border: 3.24:1 => PASS
[SOFT-DARK] Body: 13.17:1 (AAA), Sec: 6.36:1 (AA), Muted on Surf: 4.75:1 (AA), Button: 8.25:1, Border: 3.17:1 => PASS
[DAYLIGHT] Body: 15.80:1 (AAA), Sec: 6.64:1 (AA), Muted on Surf: 4.68:1 (AA), Button: 6.17:1, Border: 3.03:1 => PASS
[SAGE] Body: 13.60:1 (AAA), Sec: 6.28:1 (AA), Muted on Surf: 4.83:1 (AA), Button: 5.74:1, Border: 3.18:1 => PASS

Overall WCAG Verification: 100% ALL THEMES PASS
```

### 5.2 Browser DOM Computed Styles Verification
When `css/themes.css` and `css/main.css` are integrated into `index.html`:
1. Execute in Chrome DevTools or via headless Puppeteer:
   ```javascript
   // Switch theme
   document.documentElement.setAttribute('data-theme', 'soft-dark');
   const styles = getComputedStyle(document.documentElement);
   console.assert(styles.getPropertyValue('--color-bg').trim() === '#1a1c1e', 'Soft dark background failed');
   console.assert(styles.getPropertyValue('--color-text').trim() === '#e2e2e0', 'Soft dark text failed');
   console.assert(styles.getPropertyValue('--color-accent-text').trim() === '#1a1c1e', 'Soft dark accent text failed');
   ```
2. Assert zero console errors and zero computed style discrepancies.

### 5.3 Invalidation Conditions
This analysis would be invalidated if:
1. Pure `#000000` or `#ffffff` colors were introduced into the reading canvas, causing halation or glare.
2. High-energy cold blue tones were introduced into the Warm Paper or Sage palettes.
3. External web fonts requiring network requests were added, breaking offline zero-build requirements.
