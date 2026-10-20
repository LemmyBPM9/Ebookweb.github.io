/**
 * js/ui/bookmarks-drawer.js
 * Bookmarks Manager & Drawer Panel: Save, List, Jump & Delete Bookmarks per Book.
 */

import { EventBus, EVENTS } from '../event-bus.js';
import { StorageManager } from '../storage/storage-manager.js';
import { ToastManager } from './toast.js';

export class BookmarksDrawer {
  /**
   * @param {object} options
   * @param {HTMLElement} options.panel - #bookmarks-panel container inside drawer
   * @param {HTMLElement} options.bookmarkBtn - #btn-bookmark toggle button in header
   */
  constructor(options = {}) {
    this.panel = options.panel;
    this.bookmarkBtn = options.bookmarkBtn;
    this.bookId = null;
    this.bookmarks = [];
    this.currentReport = null;
  }

  /**
   * Loads bookmarks for the active book from IndexedDB and renders the list.
   * @param {string} bookId
   * @param {object} [currentReport]
   */
  async loadForBook(bookId, currentReport = null) {
    this.bookId = bookId;
    if (currentReport) {
      this.currentReport = currentReport;
    }
    this.bookmarks = bookId ? await StorageManager.getBookmarks(bookId) : [];
    this.render();
    this.updateHeaderButtonState(this.currentReport);
  }

  /**
   * Saves or updates a bookmark at the current reading position when the header bookmark button is clicked.
   * Individual bookmarks can be removed via the delete button inside the bookmarks panel.
   * @param {object} positionReport - Report from ReaderEngine.getProgress()
   */
  async toggleCurrentPosition(positionReport) {
    if (!this.bookId || !positionReport) return;
    this.currentReport = positionReport;

    const existing = this._findMatchingBookmark(positionReport);
    if (existing) {
      // Update timestamp so it stays saved and visible
      existing.createdAt = Date.now();
      await StorageManager.addBookmark(existing);
      this.bookmarks = await StorageManager.getBookmarks(this.bookId);
      this.render();
      this.updateHeaderButtonState(positionReport);
      ToastManager.show('Bookmark saved.', 'success', 2500);
      return;
    }

    const bmRecord = {
      bookId: this.bookId,
      spineIndex: positionReport.spineIndex,
      pageIndex: positionReport.pageIndex,
      scrollRatio: positionReport.scrollRatio,
      chapterTitle: positionReport.chapterTitle || `Chapter ${positionReport.spineIndex + 1}`,
      snippet: positionReport.snippet || 'Saved reading position',
      globalPercent: positionReport.globalPercent || 0,
      createdAt: Date.now()
    };
    const id = await StorageManager.addBookmark(bmRecord);
    this.bookmarks = await StorageManager.getBookmarks(this.bookId);
    this.render();
    this.updateHeaderButtonState(positionReport);
    EventBus.emit(EVENTS.BOOKMARK_ADDED, { bookmark: { ...bmRecord, id } });
    ToastManager.show('Bookmark saved.', 'success', 2500);
  }

  _findMatchingBookmark(report) {
    if (!report) return null;
    return this.bookmarks.find(bm => {
      if (bm.spineIndex !== report.spineIndex) return false;
      if (report.mode === 'scroll') {
        return Math.abs((bm.scrollRatio || 0) - (report.scrollRatio || 0)) < 0.08;
      }
      return bm.pageIndex === report.pageIndex;
    });
  }

  /**
   * Updates the header bookmark icon button to show active state if current page is bookmarked.
   * @param {object} [report]
   */
  updateHeaderButtonState(report) {
    if (report) this.currentReport = report;
    if (!this.bookmarkBtn) return;

    const matched = this._findMatchingBookmark(this.currentReport);
    this.bookmarkBtn.classList.toggle('is-active', Boolean(matched));
    this.bookmarkBtn.setAttribute('aria-pressed', String(Boolean(matched)));
  }

  /**
   * Renders the bookmarks list inside both #bookmarks-panel and TOC drawer so bookmarks are always discoverable.
   */
  render() {
    if (!this.panel) return;
    this.panel.innerHTML = '';

    if (this.bookmarks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'drawer-empty-note';
      empty.textContent = 'No bookmarks saved yet. Click the bookmark icon in the top bar while reading to save a spot.';
      this.panel.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'bookmarks-list';

    for (const bm of this.bookmarks) {
      const li = document.createElement('li');
      li.className = 'bookmark-item';
      li.setAttribute('data-bookmark-id', bm.id);
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');

      const infoDiv = document.createElement('div');
      infoDiv.className = 'bookmark-item-info';

      const chTitle = document.createElement('div');
      chTitle.className = 'bookmark-chapter-title';
      chTitle.textContent = `${bm.chapterTitle || 'Chapter'} • Page ${(bm.pageIndex || 0) + 1}`;

      const snippet = document.createElement('div');
      snippet.className = 'bookmark-snippet';
      snippet.textContent = bm.snippet || 'Saved reading position';

      infoDiv.appendChild(chTitle);
      infoDiv.appendChild(snippet);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-icon bookmark-delete-btn';
      delBtn.setAttribute('aria-label', 'Delete bookmark');
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await StorageManager.deleteBookmark(bm.id);
        this.bookmarks = await StorageManager.getBookmarks(this.bookId);
        this.render();
        this.updateHeaderButtonState(this.currentReport);
      });

      li.appendChild(infoDiv);
      li.appendChild(delBtn);

      const jumpToBm = () => {
        EventBus.emit(EVENTS.BOOKMARK_NAVIGATE, { bookmark: bm });
      };

      li.addEventListener('click', jumpToBm);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          jumpToBm();
        }
      });

      list.appendChild(li);
    }

    this.panel.appendChild(list);
  }
}

export default BookmarksDrawer;
