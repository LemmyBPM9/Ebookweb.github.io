/**
 * js/ui/toc-drawer.js
 * Collapsible Nested Table of Contents (TOC) & Bookmarks Navigation Drawer.
 * Supports hierarchical chapter indentation, active chapter highlighting,
 * and integrated tab switching between Contents and Bookmarks.
 */

import { EventBus, EVENTS } from '../event-bus.js';

export class TocDrawer {
  /**
   * @param {object} options
   * @param {HTMLElement} options.drawer - #toc-drawer element
   * @param {HTMLElement} options.backdrop - #drawer-backdrop element
   */
  constructor(options = {}) {
    this.drawer = options.drawer;
    this.backdrop = options.backdrop;
    this.tocListEl = this.drawer?.querySelector('#toc-list');
    this.bookmarksPanelEl = this.drawer?.querySelector('#bookmarks-panel');
    this.tabTocBtn = this.drawer?.querySelector('#tab-toc');
    this.tabBookmarksBtn = this.drawer?.querySelector('#tab-bookmarks');
    this.closeBtn = this.drawer?.querySelector('#btn-close-toc');

    this.spine = [];
    this.toc = [];
    this.activeSpineIndex = 0;

    this._bindEvents();
  }

  _bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.tabTocBtn) {
      this.tabTocBtn.addEventListener('click', () => this.switchTab('toc'));
    }

    if (this.tabBookmarksBtn) {
      this.tabBookmarksBtn.addEventListener('click', () => this.switchTab('bookmarks'));
    }

    EventBus.on(EVENTS.CHAPTER_CHANGED, ({ spineIndex }) => {
      this.setActiveChapter(spineIndex);
    });
  }

  /**
   * Populates the TOC tree for the currently loaded book.
   *
   * @param {Array<object>} toc - Hierarchical TocItem list
   * @param {Array<object>} spine - Spine items list
   * @param {number} [activeSpineIndex=0]
   */
  render(toc = [], spine = [], activeSpineIndex = 0) {
    this.toc = Array.isArray(toc) ? toc : [];
    this.spine = Array.isArray(spine) ? spine : [];
    this.activeSpineIndex = activeSpineIndex;

    if (!this.tocListEl) return;
    this.tocListEl.innerHTML = '';

    if (this.toc.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'drawer-empty-note';
      empty.textContent = 'No chapters listed.';
      this.tocListEl.appendChild(empty);
      return;
    }

    const treeRoot = this._buildTocList(this.toc, 0);
    this.tocListEl.appendChild(treeRoot);
    this.setActiveChapter(activeSpineIndex);
  }

  _buildTocList(items, depth = 0) {
    const ul = document.createElement('ul');
    ul.className = `toc-tree-list toc-depth-${depth}`;

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'toc-tree-node';

      const spineIndex = this._resolveSpineIndex(item);
      const anchorId = item.hash ? item.hash.replace(/^#/, '') : '';

      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'toc-item';
      link.setAttribute('data-toc-href', item.href || item.fullPath || '');
      link.setAttribute('data-spine-index', String(spineIndex));
      if (anchorId) {
        link.setAttribute('data-anchor-id', anchorId);
      }
      link.style.paddingLeft = `${0.85 + depth * 1.1}rem`;
      link.textContent = (item.title || 'Untitled Section').trim();

      link.addEventListener('click', () => {
        this.close();
        EventBus.emit(EVENTS.TOC_NAVIGATE, {
          spineIndex: spineIndex >= 0 ? spineIndex : 0,
          anchorId: anchorId || undefined
        });
      });

      li.appendChild(link);

      if (Array.isArray(item.children) && item.children.length > 0) {
        li.appendChild(this._buildTocList(item.children, depth + 1));
      }

      ul.appendChild(li);
    }

    return ul;
  }

  _resolveSpineIndex(tocItem) {
    if (!this.spine || this.spine.length === 0) return 0;

    const cleanFull = (tocItem.fullPath || '').split('#')[0];
    const cleanHref = (tocItem.href || '').split('#')[0];

    const exactIdx = this.spine.findIndex(
      s => (cleanFull && s.fullPath === cleanFull) || (cleanHref && s.href === cleanHref)
    );
    if (exactIdx !== -1) return exactIdx;

    const suffixIdx = this.spine.findIndex(
      s => (cleanHref && s.fullPath.endsWith(cleanHref)) || (cleanFull && s.fullPath.endsWith(cleanFull))
    );
    return suffixIdx !== -1 ? suffixIdx : 0;
  }

  /**
   * Highlights the TOC entry matching the active spine index.
   * @param {number} spineIndex
   */
  setActiveChapter(spineIndex) {
    this.activeSpineIndex = spineIndex;
    if (!this.tocListEl) return;

    const items = Array.from(this.tocListEl.querySelectorAll('.toc-item'));
    let highlighted = false;

    for (const el of items) {
      const idx = parseInt(el.getAttribute('data-spine-index'), 10);
      if (!highlighted && idx === spineIndex) {
        el.classList.add('is-active', 'active');
        el.setAttribute('aria-current', 'true');
        highlighted = true;
      } else {
        el.classList.remove('is-active', 'active');
        el.removeAttribute('aria-current');
      }
    }
  }

  /**
   * Switches between 'toc' and 'bookmarks' tabs inside the navigation drawer.
   * @param {'toc'|'bookmarks'} tabName
   */
  switchTab(tabName) {
    const isBookmarks = tabName === 'bookmarks';

    if (this.tabTocBtn) {
      this.tabTocBtn.classList.toggle('is-active', !isBookmarks);
      this.tabTocBtn.setAttribute('aria-selected', String(!isBookmarks));
    }
    if (this.tabBookmarksBtn) {
      this.tabBookmarksBtn.classList.toggle('is-active', isBookmarks);
      this.tabBookmarksBtn.setAttribute('aria-selected', String(isBookmarks));
    }

    if (this.tocListEl) {
      this.tocListEl.style.display = isBookmarks ? 'none' : 'block';
    }
    if (this.bookmarksPanelEl) {
      this.bookmarksPanelEl.style.display = 'block';
    }
  }

  /**
   * Opens the drawer and optionally switches to a specific tab ('toc' | 'bookmarks').
   * @param {'toc'|'bookmarks'} [tab='toc']
   */
  open(tab = 'toc') {
    if (!this.drawer) return;
    this.switchTab(tab);

    this.drawer.classList.add('is-open', 'open');
    this.drawer.setAttribute('aria-hidden', 'false');

    if (this.backdrop) {
      this.backdrop.classList.add('is-open', 'open');
    }
    EventBus.emit(EVENTS.DRAWER_OPEN, { drawer: 'toc', tab });
  }

  /**
   * Closes the drawer.
   */
  close() {
    if (!this.drawer) return;
    this.drawer.classList.remove('is-open', 'open');
    this.drawer.setAttribute('aria-hidden', 'true');

    if (this.backdrop) {
      this.backdrop.classList.remove('is-open', 'open');
    }
    EventBus.emit(EVENTS.DRAWER_CLOSE, { drawer: 'toc' });
  }

  isOpen() {
    return Boolean(this.drawer?.classList.contains('is-open') || this.drawer?.classList.contains('open'));
  }
}

export default TocDrawer;
