/**
 * js/reader/position-tracker.js
 * Reading Progress Calculator, Chapter Title Resolver & Snippet Extractor.
 */

export class PositionTracker {
  /**
   * Computes chapter-level and global book-level progress percentages.
   *
   * @param {object} params
   * @param {number} params.spineIndex - Active chapter index (0-based)
   * @param {number} params.spineLength - Total number of spine chapters
   * @param {number} [params.pageIndex=0] - Active page index within chapter
   * @param {number} [params.totalPages=1] - Total pages in active chapter
   * @param {number} [params.scrollRatio=0] - Normalized scroll ratio [0..1]
   * @param {'paginated'|'scroll'} [params.mode='paginated']
   * @returns {{
   *   spineIndex: number,
   *   pageIndex: number,
   *   totalPages: number,
   *   scrollRatio: number,
   *   chapterRatio: number,
   *   progressPercent: number,
   *   globalPercent: number
   * }}
   */
  static computeProgress({
    spineIndex = 0,
    spineLength = 1,
    pageIndex = 0,
    totalPages = 1,
    scrollRatio = 0,
    mode = 'paginated'
  }) {
    const safeSpineTotal = Math.max(1, spineLength);
    const safeSpineIdx = Math.max(0, Math.min(safeSpineTotal - 1, spineIndex));
    const safeTotalPages = Math.max(1, totalPages);
    const safePageIdx = Math.max(0, Math.min(safeTotalPages - 1, pageIndex));

    let chapterRatio = 0;
    if (mode === 'scroll') {
      chapterRatio = Math.max(0, Math.min(1, scrollRatio));
    } else {
      chapterRatio = safeTotalPages > 1 ? safePageIdx / (safeTotalPages - 1) : 1;
    }

    const progressPercent = Math.round(chapterRatio * 100);
    const globalRatio = (safeSpineIdx + chapterRatio) / safeSpineTotal;
    const globalPercent = Math.max(0, Math.min(100, Math.round(globalRatio * 100)));

    return {
      spineIndex: safeSpineIdx,
      pageIndex: safePageIdx,
      totalPages: safeTotalPages,
      scrollRatio: mode === 'scroll' ? chapterRatio : (safeTotalPages > 1 ? safePageIdx / (safeTotalPages - 1) : 0),
      chapterRatio,
      progressPercent,
      globalPercent
    };
  }

  /**
   * Resolves a human-readable chapter title for a given spine item using the TOC tree or DOM headings.
   *
   * @param {Array<object>} toc - Hierarchical TOC tree
   * @param {object} spineItem - Spine entry { id, href, fullPath }
   * @param {number} spineIndex - 0-based spine index
   * @param {Document} [chapterDoc] - Loaded chapter Document
   * @returns {string}
   */
  static resolveChapterTitle(toc, spineItem, spineIndex, chapterDoc = null) {
    if (toc && Array.isArray(toc) && spineItem) {
      const matched = this._findTocMatch(toc, spineItem.fullPath, spineItem.href);
      if (matched && matched.title) {
        return matched.title.trim();
      }
    }

    if (chapterDoc) {
      const heading = chapterDoc.querySelector('h1, h2, h3, title');
      if (heading && heading.textContent && heading.textContent.trim().length > 0) {
        return heading.textContent.trim().replace(/\s+/g, ' ').slice(0, 120);
      }
    }

    return `Chapter ${spineIndex + 1}`;
  }

  static _findTocMatch(items, fullPath, href) {
    for (const item of items) {
      const itemFull = (item.fullPath || '').split('#')[0];
      const itemHref = (item.href || '').split('#')[0];
      if (
        (fullPath && itemFull === fullPath) ||
        (href && (itemHref === href || itemFull.endsWith(href)))
      ) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const childMatch = this._findTocMatch(item.children, fullPath, href);
        if (childMatch) return childMatch;
      }
    }
    return null;
  }

  /**
   * Extracts a short text snippet from the current chapter for bookmark previews.
   *
   * @param {Document} chapterDoc
   * @param {number} [ratio=0]
   * @returns {string}
   */
  static extractSnippet(chapterDoc, ratio = 0) {
    if (!chapterDoc || !chapterDoc.body) return 'Bookmarked position';

    const paragraphs = Array.from(chapterDoc.body.querySelectorAll('p, h1, h2, h3, blockquote'))
      .map(el => (el.textContent || '').trim().replace(/\s+/g, ' '))
      .filter(text => text.length > 15);

    if (paragraphs.length === 0) {
      const raw = (chapterDoc.body.textContent || '').trim().replace(/\s+/g, ' ');
      return raw ? raw.slice(0, 110) : 'Bookmarked position';
    }

    const idx = Math.max(0, Math.min(paragraphs.length - 1, Math.floor(ratio * paragraphs.length)));
    const text = paragraphs[idx];
    return text.length > 110 ? text.slice(0, 107) + '...' : text;
  }
}

export default PositionTracker;
