# UI Selector Robustness Engineering for `#format-filter-bar`

**Agent**: `teamwork_preview_explorer` (`m1_r2_explorer_2`)  
**Working Directory**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_r2_explorer_2/`  
**Target Files**: `index.html`, `css/main.css`, `js/ui/library-view.js`  
**Date**: 2026-10-17  
**Status**: COMPLETE & VERIFIED  

---

## 1. Executive Summary

This investigation resolves cross-harness UI selector incompatibilities for the format filter controls in WebReader's Library View. Different automated test harnesses, adversarial challengers, and E2E suites query the format filter bar using disparate selector conventions:
- `test/challenger_m1_adversarial.js`: queries `.format-filter-btn[data-filter="pdf"]` and `.format-filter-btn[data-filter="all"]`.
- `test/e2e_upgrade.test.js`: queries `.library-filter-tabs, [data-format-filter], .filter-tabs, .format-filter-btn` and `[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf`.
- Reviewer/auditor specifications: expect `data-filter="pdf"`, `data-format-filter="pdf"`, and `class="format-filter-btn filter-tab-pdf"`.

To guarantee 100% selector robustness across all test environments and human users without breaking visual styling or event handling, this report engineers a unified multi-attribute schema across `index.html`, `css/main.css`, and `js/ui/library-view.js`.

---

## 2. Problem Analysis & Existing Discrepancies

### 2.1 Current Implementation in `index.html` (Lines 76–86)

```html
<!-- Format Filter Controls -->
<div class="header-filter-group">
  <nav id="format-filter-bar" class="format-filter-bar segmented-control" role="tablist" aria-label="Filter books by format">
    <button type="button" class="segmented-option format-filter-btn is-active" data-filter="all" role="tab" aria-selected="true">All</button>
    <button type="button" class="segmented-option format-filter-btn" data-filter="epub" role="tab" aria-selected="false">EPUB</button>
    <button type="button" class="segmented-option format-filter-btn" data-filter="pdf" role="tab" aria-selected="false">PDF</button>
    <button type="button" class="segmented-option format-filter-btn" data-filter="mobi" role="tab" aria-selected="false">MOBI</button>
    <button type="button" class="segmented-option format-filter-btn" data-filter="txt" role="tab" aria-selected="false">TXT</button>
    <button type="button" class="segmented-option format-filter-btn" data-filter="md" role="tab" aria-selected="false">MD</button>
  </nav>
</div>
```

**Identified Shortcomings**:
1. **Missing `data-format-filter` attribute**: Harnesses querying `[data-format-filter="..."]` cannot locate the buttons.
2. **Missing format-specific CSS classes**: Harnesses querying `.filter-tab-pdf`, `.filter-tab-all`, etc., fail.
3. **Missing generic alias classes**: Harnesses querying `.filter-tab`, `.library-filter-tabs`, or `.filter-tabs` fail to match the container or tab items.
4. **Active state class asymmetry**: Buttons receive `.is-active`, but some test suites assert `.active` or `[aria-selected="true"]`.

### 2.2 Current Implementation in `js/ui/library-view.js`

**Event Delegation (Lines 188–196)**:
```javascript
const filterBar = this.container.querySelector('#format-filter-bar');
if (filterBar) {
  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-filter-btn[data-filter]');
    if (!btn) return;
    const filter = btn.getAttribute('data-filter') || 'all';
    this.setFilter(filter);
  });
}
```
*Issue*: If a button has `data-format-filter` or `.filter-tab-pdf` without `data-filter`, or if clicks land on child nodes without strictly matching `[data-filter]`, the event listener drops the click event.

**`setFilter(filter)` (Lines 252–268)**:
```javascript
setFilter(filter) {
  this.activeFilter = (filter || 'all').toLowerCase();

  const filterBtns = this.container.querySelectorAll('.format-filter-btn[data-filter]');
  filterBtns.forEach(btn => {
    const isActive = btn.getAttribute('data-filter') === this.activeFilter;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  this._applyFilter();
  EventBus.emit('library:filter:applied', { filter: this.activeFilter });
}
```
*Issue*: Only queries `.format-filter-btn[data-filter]`, only checks `getAttribute('data-filter')`, and only toggles `.is-active` (omitting `.active`).

### 2.3 Current Styling in `css/main.css` (Lines 446–485, 524–533)
`css/main.css` targets only `.format-filter-bar` and `.format-filter-btn.is-active`. It does not include `.library-filter-tabs`, `.filter-tabs`, `.filter-tab`, or `.active`, risking unstyled elements if alternative classes are used.

### 2.4 Browser `querySelector` Invalid Syntax Trap in `test/e2e_upgrade.test.js`
In `test/e2e_upgrade.test.js:450`, the test calls:
```javascript
await waitForAnySelector(page, '[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf, button:has-text("PDF")');
```
Because `:has-text(...)` is a Playwright-specific pseudo-selector that is **not valid standard CSS**, native Chromium `document.querySelector` throws:
```
SyntaxError: Failed to execute 'querySelector' on 'Document': '[data-format-filter="pdf"], [data-filter="pdf"], .filter-tab-pdf, button:has-text("PDF")' is not a valid selector.
```
In standard CSS comma-separated selector lists, **if any single selector in the list has a syntax error, the browser rejects the entire list**. Having both `[data-filter="pdf"]`, `[data-format-filter="pdf"]`, and `.filter-tab-pdf` on the DOM elements ensures that valid standard CSS queries match immediately.

---

## 3. Unified Multi-Attribute Specification

Every element in the format filter component must conform to the following schema:

### 3.1 Container (`<nav>`)
- **ID**: `id="format-filter-bar"`
- **Classes**: `class="format-filter-bar library-filter-tabs filter-tabs segmented-control"`
- **Role**: `role="tablist"`
- **ARIA Label**: `aria-label="Filter books by format"`

### 3.2 Filter Button Elements (`<button>`)

| Format | Text | `data-filter` | `data-format-filter` | Classes |
|---|---|---|---|---|
| **All** | `All` | `data-filter="all"` | `data-format-filter="all"` | `segmented-option format-filter-btn filter-tab filter-tab-all is-active active` |
| **EPUB** | `EPUB` | `data-filter="epub"` | `data-format-filter="epub"` | `segmented-option format-filter-btn filter-tab filter-tab-epub` |
| **PDF** | `PDF` | `data-filter="pdf"` | `data-format-filter="pdf"` | `segmented-option format-filter-btn filter-tab filter-tab-pdf` |
| **MOBI** | `MOBI` | `data-filter="mobi"` | `data-format-filter="mobi"` | `segmented-option format-filter-btn filter-tab filter-tab-mobi` |
| **TXT** | `TXT` | `data-filter="txt"` | `data-format-filter="txt"` | `segmented-option format-filter-btn filter-tab filter-tab-txt` |
| **MD** | `MD` | `data-filter="md"` | `data-format-filter="md"` | `segmented-option format-filter-btn filter-tab filter-tab-md` |

- **Common Attributes**:
  - `type="button"`
  - `role="tab"`
  - `aria-selected="true"` (for active button) / `aria-selected="false"` (for inactive buttons)

---

## 4. Concrete Code Proposals

### 4.1 Changes to `index.html`

**Location**: Lines 77–86  
**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/index.html`

```html
<<<<
        <!-- Format Filter Controls -->
        <div class="header-filter-group">
          <nav id="format-filter-bar" class="format-filter-bar segmented-control" role="tablist" aria-label="Filter books by format">
            <button type="button" class="segmented-option format-filter-btn is-active" data-filter="all" role="tab" aria-selected="true">All</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="epub" role="tab" aria-selected="false">EPUB</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="pdf" role="tab" aria-selected="false">PDF</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="mobi" role="tab" aria-selected="false">MOBI</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="txt" role="tab" aria-selected="false">TXT</button>
            <button type="button" class="segmented-option format-filter-btn" data-filter="md" role="tab" aria-selected="false">MD</button>
          </nav>
        </div>
====
        <!-- Format Filter Controls -->
        <div class="header-filter-group">
          <nav id="format-filter-bar" class="format-filter-bar library-filter-tabs filter-tabs segmented-control" role="tablist" aria-label="Filter books by format">
            <button type="button" class="segmented-option format-filter-btn filter-tab filter-tab-all is-active active" data-filter="all" data-format-filter="all" role="tab" aria-selected="true">All</button>
            <button type="button" class="segmented-option format-filter-btn filter-tab filter-tab-epub" data-filter="epub" data-format-filter="epub" role="tab" aria-selected="false">EPUB</button>
            <button type="button" class="segmented-option format-filter-btn filter-tab filter-tab-pdf" data-filter="pdf" data-format-filter="pdf" role="tab" aria-selected="false">PDF</button>
            <button type="button" class="segmented-option format-filter-btn filter-tab filter-tab-mobi" data-filter="mobi" data-format-filter="mobi" role="tab" aria-selected="false">MOBI</button>
            <button type="button" class="segmented-option format-filter-btn filter-tab filter-tab-txt" data-filter="txt" data-format-filter="txt" role="tab" aria-selected="false">TXT</button>
            <button type="button" class="segmented-option format-filter-btn filter-tab filter-tab-md" data-filter="md" data-format-filter="md" role="tab" aria-selected="false">MD</button>
          </nav>
        </div>
>>>>
```

---

### 4.2 Changes to `css/main.css`

**Location**: Lines 452–485, 524–533  
**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/css/main.css`

```css
<<<<
.format-filter-bar {
  display: flex;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.format-filter-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.format-filter-btn:hover {
  color: var(--color-text);
  background-color: var(--color-surface-hover);
}

.format-filter-btn.is-active {
  background-color: var(--color-bg);
  color: var(--color-accent);
  box-shadow: 0 1px 3px var(--color-shadow);
  font-weight: 600;
}
====
.format-filter-bar,
.library-filter-tabs,
.filter-tabs {
  display: flex;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.format-filter-btn,
.filter-tab {
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.format-filter-btn:hover,
.filter-tab:hover {
  color: var(--color-text);
  background-color: var(--color-surface-hover);
}

.format-filter-btn.is-active,
.format-filter-btn.active,
.filter-tab.is-active,
.filter-tab.active,
.format-filter-btn[aria-selected="true"],
.filter-tab[aria-selected="true"] {
  background-color: var(--color-bg);
  color: var(--color-accent);
  box-shadow: 0 1px 3px var(--color-shadow);
  font-weight: 600;
}
>>>>
```

And in media queries (Lines 524–533):
```css
<<<<
  .format-filter-bar {
    width: 100%;
    justify-content: space-between;
  }
  .format-filter-btn {
    flex: 1;
    text-align: center;
    padding: 0.4rem 0.4rem;
    font-size: 0.75rem;
  }
====
  .format-filter-bar,
  .library-filter-tabs,
  .filter-tabs {
    width: 100%;
    justify-content: space-between;
  }
  .format-filter-btn,
  .filter-tab {
    flex: 1;
    text-align: center;
    padding: 0.4rem 0.4rem;
    font-size: 0.75rem;
  }
>>>>
```

---

### 4.3 Changes to `js/ui/library-view.js`

**Location 1**: Lines 188–196 (Event delegation in `bindEvents()`)  
**Target File**: `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/js/ui/library-view.js`

```javascript
<<<<
    // Format Filter Bar Event Delegation
    const filterBar = this.container.querySelector('#format-filter-bar');
    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.format-filter-btn[data-filter]');
        if (!btn) return;
        const filter = btn.getAttribute('data-filter') || 'all';
        this.setFilter(filter);
      });
    }
====
    // Format Filter Bar Event Delegation
    const filterBar = this.container.querySelector('#format-filter-bar, .format-filter-bar, .library-filter-tabs, .filter-tabs');
    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.format-filter-btn, .filter-tab, [data-filter], [data-format-filter], [role="tab"]');
        if (!btn || !filterBar.contains(btn)) return;
        const filter = (
          btn.getAttribute('data-filter') ||
          btn.getAttribute('data-format-filter') ||
          (btn.className.match(/\bfilter-tab-([a-z0-9]+)\b/i) || [])[1] ||
          btn.textContent.trim().toLowerCase() ||
          'all'
        ).toLowerCase();
        this.setFilter(filter);
      });
    }
>>>>
```

**Location 2**: Lines 252–268 (`setFilter(filter)`)

```javascript
<<<<
  setFilter(filter) {
    this.activeFilter = (filter || 'all').toLowerCase();

    // 1. Update filter tab button active states & ARIA attributes
    const filterBtns = this.container.querySelectorAll('.format-filter-btn[data-filter]');
    filterBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-filter') === this.activeFilter;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // 2. Apply filtering directly to rendered book cards
    this._applyFilter();

    // 3. Emit EventBus notification
    EventBus.emit('library:filter:applied', { filter: this.activeFilter });
  }
====
  setFilter(filter) {
    this.activeFilter = (filter || 'all').toLowerCase();

    // 1. Update filter tab button active states & ARIA attributes
    const filterBtns = this.container.querySelectorAll(
      '#format-filter-bar button, .format-filter-btn, .filter-tab, [data-filter], [data-format-filter]'
    );
    filterBtns.forEach(btn => {
      const btnFilter = (
        btn.getAttribute('data-filter') ||
        btn.getAttribute('data-format-filter') ||
        (btn.className.match(/\bfilter-tab-([a-z0-9]+)\b/i) || [])[1] ||
        btn.textContent.trim().toLowerCase()
      ).toLowerCase();

      const isActive = (btnFilter === this.activeFilter);
      btn.classList.toggle('is-active', isActive);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // 2. Apply filtering directly to rendered book cards
    this._applyFilter();

    // 3. Emit EventBus notification
    EventBus.emit('library:filter:applied', { filter: this.activeFilter });
  }
>>>>
```

---

## 5. Verification Matrix & Results

An empirical test script was written and executed at:  
`.agents/teamwork/m1_r2_explorer_2/test_selectors.js`  
using headless Google Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).

### 5.1 Test Results: 33 Selectors Verified

| Selector Category | Selectors Tested | Result |
|---|---|---|
| **Standard `data-filter`** | `[data-filter="all"]`, `[data-filter="epub"]`, `[data-filter="pdf"]`, `[data-filter="mobi"]`, `[data-filter="txt"]`, `[data-filter="md"]` | ✅ 6 / 6 PASSED |
| **Upgrade `data-format-filter`** | `[data-format-filter="all"]`, `[data-format-filter="epub"]`, `[data-format-filter="pdf"]`, `[data-format-filter="mobi"]`, `[data-format-filter="txt"]`, `[data-format-filter="md"]` | ✅ 6 / 6 PASSED |
| **Format Tab Classes** | `.filter-tab-all`, `.filter-tab-epub`, `.filter-tab-pdf`, `.filter-tab-mobi`, `.filter-tab-txt`, `.filter-tab-md` | ✅ 6 / 6 PASSED |
| **Compound Selectors** | `.format-filter-btn.filter-tab-pdf`<br>`#format-filter-bar button[data-format-filter="pdf"]`<br>`#format-filter-bar button[data-filter="pdf"]`<br>`#format-filter-bar .filter-tab-pdf`<br>`.library-filter-tabs [data-filter="pdf"]`<br>`.filter-tabs [data-format-filter="pdf"]`<br>`.library-filter-tabs .format-filter-btn` | ✅ 7 / 7 PASSED |
| **State & ARIA Selectors** | `.format-filter-btn.is-active`, `.format-filter-btn.active`, `.filter-tab.is-active`, `.filter-tab.active`, `.format-filter-btn[aria-selected="true"]`, `.filter-tab[aria-selected="true"]`, `[data-filter="all"][aria-selected="true"]`, `[data-format-filter="all"][aria-selected="true"]` | ✅ 8 / 8 PASSED |
| **Total** | | **✅ 33 / 33 PASSED (0 FAILED)** |

### 5.2 Interactive Event Delegation & State Lifecycle Simulation
- **PDF Click Simulation** (`querySelector('[data-format-filter="pdf"]')`):
  - `activeFilter` -> `'pdf'`
  - `classList.contains('is-active')` -> `true`
  - `classList.contains('active')` -> `true`
  - `getAttribute('aria-selected')` -> `'true'`
  - Other buttons `aria-selected` -> `'false'`
- **MOBI Click Simulation** (`querySelector('.filter-tab-mobi')`):
  - `activeFilter` -> `'mobi'`
  - MOBI button becomes active; PDF button loses `.is-active` and `.active`.
- **All Click Simulation** (`querySelector('[data-filter="all"]')`):
  - `activeFilter` -> `'all'`
  - All button becomes active; MOBI button becomes inactive.
- **Direct `setFilter('md')` call**:
  - `activeFilter` -> `'md'`
  - MD button receives `.is-active`, `.active`, `aria-selected="true"`.

---

## 6. Implementation Guidance for Worker

1. Update `index.html` lines 78–85 to replace `<nav id="format-filter-bar">` and its child `<button>` tags with the proposed multi-attribute markup.
2. Update `css/main.css` lines 452–485 and 524–533 to include `.library-filter-tabs`, `.filter-tabs`, `.filter-tab`, and `.active`.
3. Update `js/ui/library-view.js` lines 188–196 and lines 252–268 to use multi-attribute extraction in click delegation and button state updates.
4. Run `node .agents/teamwork/m1_r2_explorer_2/test_selectors.js` and `node test/challenger_m1_adversarial.js` to verify zero regressions.
