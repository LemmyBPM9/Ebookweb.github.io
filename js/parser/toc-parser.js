/**
 * js/parser/toc-parser.js
 * Dual TOC Parser for EPUB 3 Navigation Documents (HTML5/XHTML) and EPUB 2 NCX XML Documents,
 * with synthetic Spine-derived linear TOC fallback and hierarchical tree generation.
 *
 * Conforms to EPUB 3.3, EPUB 2.0.1, and WebReader Project Specification.
 */

import { PathResolver } from './path-resolver.js';

const MAX_RECURSION_DEPTH = 20;

/**
 * Splits an href into its file path part and decoded hash fragment.
 * Handles trailing hashes, empty anchors, and percent-encoded characters.
 *
 * @param {string} href - e.g. "text/ch01.xhtml#optical-mechanism"
 * @returns {{ pathPart: string, hash: string }}
 */
export function splitHrefAnchor(href) {
  if (!href || typeof href !== 'string') {
    return { pathPart: '', hash: '' };
  }

  const trimmed = href.trim();
  const hashIdx = trimmed.indexOf('#');

  if (hashIdx === -1) {
    return { pathPart: trimmed, hash: '' };
  }

  const pathPart = trimmed.substring(0, hashIdx);
  const rawHash = trimmed.substring(hashIdx + 1);

  if (!rawHash) {
    return { pathPart, hash: '' };
  }

  let decodedHash = rawHash;
  try {
    decodedHash = decodeURIComponent(rawHash);
  } catch {
    decodedHash = rawHash;
  }

  return { pathPart, hash: decodedHash };
}

/**
 * Sanitizes raw XML text by converting unescaped ampersands to &amp;.
 *
 * @param {string} xmlStr
 * @returns {string} XML string with safe entities
 */
export function sanitizeXmlEntities(xmlStr) {
  if (!xmlStr || typeof xmlStr !== 'string') return '';
  return xmlStr.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[a-f0-9]+);)/gi, '&amp;');
}

/**
 * Normalizes title text by collapsing whitespace and stripping control characters.
 *
 * @param {string} text
 * @returns {string} Clean title
 */
function cleanTitle(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Case-insensitive localName matching helper for XML elements (prefix tolerant).
 *
 * @param {Element} element
 * @param {string} targetLocalName
 * @returns {Element[]}
 */
function findChildElementsByLocalName(element, targetLocalName) {
  if (!element || !element.children) return [];
  const target = targetLocalName.toLowerCase();
  const results = [];
  const children = Array.from(element.children);
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const local = (child.localName || child.nodeName.split(':').pop() || '').toLowerCase();
    if (local === target) {
      results.push(child);
    }
  }
  return results;
}

/**
 * Dual TOC Parser Class.
 */
export class TocParser {
  /**
   * Main parsing entry point orchestrating EPUB 3 Nav Doc, EPUB 2 NCX, and Spine Fallback.
   *
   * @param {object} options
   * @returns {Promise<Array<object>>}
   */
  static async parse(options) {
    const {
      zip,
      manifest,
      spine = [],
      spineTocId,
      opfPath = 'OEBPS/content.opf',
      resolvePath = (base, rel) => PathResolver.resolvePath(base, rel)
    } = options;

    // Convert manifest collection (Array, Map, or Object) to unified array
    const manifestItems = Array.isArray(manifest)
      ? manifest
      : manifest instanceof Map
      ? Array.from(manifest.values())
      : Object.values(manifest || {});

    // -------------------------------------------------------------
    // Cascade Step 1: EPUB 3 Navigation Document
    // -------------------------------------------------------------
    const navItem = manifestItems.find(item => {
      const props = (Array.isArray(item.properties) ? item.properties.join(' ') : item.properties || '').toLowerCase();
      return props.split(/\s+/).includes('nav') || item.id === 'nav' || item.id === 'toc';
    });

    if (navItem && zip) {
      const navFullPath = navItem.fullPath || resolvePath(opfPath, navItem.href);
      const navZipEntry = PathResolver.findZipEntry(zip, navFullPath);
      if (navZipEntry) {
        try {
          const navContent = await navZipEntry.async('string');
          const tocItems = TocParser.parseNavDocument(navContent, navFullPath, { resolvePath });
          if (tocItems && tocItems.length > 0) {
            return tocItems;
          }
        } catch (err) {
          console.warn('[TocParser] Failed parsing EPUB 3 Nav Document, falling back:', err);
        }
      }
    }

    // -------------------------------------------------------------
    // Cascade Step 2: EPUB 2 NCX Document
    // -------------------------------------------------------------
    let ncxItem = null;
    if (spineTocId) {
      ncxItem = manifestItems.find(item => item.id === spineTocId);
    }
    if (!ncxItem) {
      ncxItem = manifestItems.find(item => {
        const media = (item.mediaType || item['media-type'] || '').toLowerCase();
        return media === 'application/x-dtbncx+xml';
      });
    }
    if (!ncxItem) {
      ncxItem = manifestItems.find(item => {
        const href = (item.href || '').toLowerCase();
        const id = (item.id || '').toLowerCase();
        return id === 'ncx' || href.endsWith('.ncx');
      });
    }

    let ncxFullPath = ncxItem?.fullPath || (ncxItem ? resolvePath(opfPath, ncxItem.href) : null);
    if (!ncxFullPath && zip) {
      // Direct file existence check fallback
      const candidateNcx = resolvePath(opfPath, 'toc.ncx');
      if (PathResolver.findZipEntry(zip, candidateNcx)) {
        ncxFullPath = candidateNcx;
      } else if (PathResolver.findZipEntry(zip, 'toc.ncx')) {
        ncxFullPath = 'toc.ncx';
      }
    }

    if (ncxFullPath && zip) {
      const ncxZipEntry = PathResolver.findZipEntry(zip, ncxFullPath);
      if (ncxZipEntry) {
        try {
          const ncxContent = await ncxZipEntry.async('string');
          const tocItems = TocParser.parseNcxDocument(ncxContent, ncxFullPath, { resolvePath });
          if (tocItems && tocItems.length > 0) {
            return tocItems;
          }
        } catch (err) {
          console.warn('[TocParser] Failed parsing EPUB 2 NCX Document, falling back:', err);
        }
      }
    }

    // -------------------------------------------------------------
    // Cascade Step 3: Synthetic Spine-Derived Linear Fallback
    // -------------------------------------------------------------
    return TocParser.buildSpineFallbackToc(spine, zip, { opfPath, resolvePath });
  }

  /**
   * Parses an EPUB 3 Navigation Document (HTML5/XHTML).
   *
   * @param {string} htmlContent
   * @param {string} navFullPath
   * @param {object} [options]
   * @returns {Array<object>}
   */
  static parseNavDocument(htmlContent, navFullPath, options = {}) {
    const resolvePath = options.resolvePath || ((base, rel) => PathResolver.resolvePath(base, rel));
    if (!htmlContent || typeof htmlContent !== 'string') return [];

    const parser = new DOMParser();
    let doc = null;

    // Dual-parse strategy: Try application/xhtml+xml, fallback to text/html on error
    try {
      doc = parser.parseFromString(htmlContent, 'application/xhtml+xml');
      if (doc.querySelector('parsererror')) {
        doc = parser.parseFromString(htmlContent, 'text/html');
      }
    } catch {
      doc = parser.parseFromString(htmlContent, 'text/html');
    }

    if (!doc) return [];

    // Locate the TOC <nav> element
    const navElement = TocParser.findTocNavElement(doc);
    if (!navElement) return [];

    // Find the top-level <ol> or <ul>
    const rootList = navElement.querySelector('ol, ul');
    if (!rootList) return [];

    let idCounter = 1;
    const visited = new Set();

    return TocParser._parseNavList(rootList, navFullPath, 1, visited, () => `nav-item-${idCounter++}`, resolvePath);
  }

  /**
   * Discovers the exact <nav> representing the Table of Contents, excluding landmarks and page-lists.
   *
   * @param {Document} doc
   * @returns {Element|null}
   */
  static findTocNavElement(doc) {
    const navs = Array.from(doc.querySelectorAll('nav'));
    if (navs.length === 0) return null;

    // 1. Explicit epub:type="toc" or role="doc-toc"
    for (let i = 0; i < navs.length; i++) {
      const nav = navs[i];
      const epubType = (nav.getAttribute('epub:type') || nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '').toLowerCase();
      const role = (nav.getAttribute('role') || '').toLowerCase();
      if (epubType === 'toc' || epubType.split(/\s+/).includes('toc') || role === 'doc-toc') {
        return nav;
      }
    }

    // 2. ID or class containing "toc"
    for (let i = 0; i < navs.length; i++) {
      const nav = navs[i];
      const id = (nav.getAttribute('id') || '').toLowerCase();
      const cls = (nav.getAttribute('class') || '').toLowerCase();
      if (id === 'toc' || cls.split(/\s+/).includes('toc')) {
        return nav;
      }
    }

    // 3. Aria-label or heading text
    for (let i = 0; i < navs.length; i++) {
      const nav = navs[i];
      const aria = (nav.getAttribute('aria-label') || '').toLowerCase();
      if (aria.includes('table of contents') || aria.includes('contents') || aria === 'toc') {
        return nav;
      }
      const heading = nav.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        const text = (heading.textContent || '').trim().toLowerCase();
        if (text.includes('contents') || text.includes('table of contents')) {
          return nav;
        }
      }
    }

    // 4. Exclude auxiliary navigation types (landmarks, page-list, lot, loi)
    const candidates = navs.filter(nav => {
      const epubType = (nav.getAttribute('epub:type') || '').toLowerCase();
      return !['landmarks', 'page-list', 'lot', 'loi', 'bibliography', 'glossary'].some(t => epubType.includes(t));
    });

    if (candidates.length > 0) {
      return candidates.find(n => n.querySelector('ol, ul')) || candidates[0];
    }

    return navs.find(n => n.querySelector('ol, ul')) || navs[0];
  }

  /**
   * Recursively parses an <ol> or <ul> list in a Nav Document into TocItem[].
   */
  static _parseNavList(listElement, navFullPath, depth, visited, nextId, resolvePath) {
    if (!listElement || depth > MAX_RECURSION_DEPTH) return [];
    if (visited.has(listElement)) return [];
    visited.add(listElement);

    const items = [];
    const lis = Array.from(listElement.children).filter(el => el.tagName.toLowerCase() === 'li');

    for (let i = 0; i < lis.length; i++) {
      const li = lis[i];
      let anchor = null;
      let span = null;
      let nestedList = null;

      const children = Array.from(li.children);
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        const tag = child.tagName.toLowerCase();
        if (tag === 'a' && !anchor) {
          anchor = child;
        } else if (tag === 'span' && !span && !anchor) {
          span = child;
        } else if ((tag === 'ol' || tag === 'ul') && !nestedList) {
          nestedList = child;
        }
      }

      // Check for wrapped elements e.g. <li><div><a href="...">Title</a></div></li>
      if (!anchor && !span) {
        for (let j = 0; j < children.length; j++) {
          const child = children[j];
          if (child !== nestedList) {
            const foundA = child.querySelector('a');
            if (foundA) { anchor = foundA; break; }
            const foundSpan = child.querySelector('span');
            if (foundSpan && !span) { span = foundSpan; }
          }
        }
      }

      // Extract title
      let title = '';
      if (anchor) {
        title = cleanTitle(anchor.textContent);
        if (!title) title = anchor.getAttribute('title') || anchor.getAttribute('aria-label') || '';
      } else if (span) {
        title = cleanTitle(span.textContent);
        if (!title) title = span.getAttribute('title') || span.getAttribute('aria-label') || '';
      }

      // Fallback: li direct text excluding nested list
      if (!title) {
        const clone = li.cloneNode(true);
        const nestedInClone = clone.querySelector('ol, ul');
        if (nestedInClone) nestedInClone.remove();
        title = cleanTitle(clone.textContent);
      }

      // Extract href, fullPath, hash
      let rawHref = '';
      let resolvedFullPath = '';
      let hash = '';

      if (anchor) {
        rawHref = (anchor.getAttribute('href') || '').trim();
        const split = splitHrefAnchor(rawHref);
        hash = split.hash;
        if (split.pathPart) {
          resolvedFullPath = resolvePath(navFullPath, split.pathPart);
        } else if (hash) {
          resolvedFullPath = navFullPath; // In-page anchor
        }
      }

      if (!title) {
        if (rawHref) {
          const filename = rawHref.split('/').pop().split('#')[0];
          title = filename || 'Untitled Section';
        } else {
          title = 'Untitled Section';
        }
      }

      const id = li.getAttribute('id') || anchor?.getAttribute('id') || nextId();

      const itemChildren = nestedList
        ? TocParser._parseNavList(nestedList, navFullPath, depth + 1, visited, nextId, resolvePath)
        : [];

      items.push({
        id,
        title,
        href: rawHref,
        fullPath: resolvedFullPath,
        hash,
        children: itemChildren
      });
    }

    return items;
  }

  /**
   * Parses an EPUB 2 NCX Document (XML).
   *
   * @param {string} xmlContent
   * @param {string} ncxFullPath
   * @param {object} [options]
   * @returns {Array<object>}
   */
  static parseNcxDocument(xmlContent, ncxFullPath, options = {}) {
    const resolvePath = options.resolvePath || ((base, rel) => PathResolver.resolvePath(base, rel));
    if (!xmlContent || typeof xmlContent !== 'string') return [];

    const sanitized = sanitizeXmlEntities(xmlContent);
    const parser = new DOMParser();
    let doc = null;

    try {
      doc = parser.parseFromString(sanitized, 'application/xml');
      if (doc.querySelector('parsererror')) {
        doc = parser.parseFromString(sanitized, 'text/xml');
      }
    } catch {
      doc = parser.parseFromString(sanitized, 'text/xml');
    }

    if (!doc || doc.querySelector('parsererror')) {
      // Secondary fallback: permissive HTML parser
      doc = parser.parseFromString(sanitized, 'text/html');
    }

    if (!doc) return [];

    // Locate <navMap> element (handles ncx:navMap, navMap, navmap)
    const root = doc.documentElement;
    let navMap = findChildElementsByLocalName(root, 'navmap')[0];
    if (!navMap) {
      const allEls = Array.from(doc.getElementsByTagNameNS('*', 'navMap'));
      navMap = allEls[0] || doc.querySelector('navMap, navmap');
    }

    if (!navMap) return [];

    let idCounter = 1;
    const visited = new Set();
    const topNavPoints = findChildElementsByLocalName(navMap, 'navpoint');

    return TocParser._parseNavPoints(topNavPoints, ncxFullPath, 1, visited, () => `ncx-item-${idCounter++}`, resolvePath);
  }

  /**
   * Recursively parses <navPoint> elements in an NCX Document into TocItem[].
   */
  static _parseNavPoints(navPoints, ncxFullPath, depth, visited, nextId, resolvePath) {
    if (!navPoints || navPoints.length === 0 || depth > MAX_RECURSION_DEPTH) return [];

    const items = [];

    for (let i = 0; i < navPoints.length; i++) {
      const navPoint = navPoints[i];
      if (visited.has(navPoint)) continue;
      visited.add(navPoint);

      const id = navPoint.getAttribute('id') || nextId();
      const rawPlayOrder = navPoint.getAttribute('playOrder');
      const playOrder = rawPlayOrder !== null ? parseInt(rawPlayOrder, 10) : undefined;

      // Find direct child <navLabel>
      const labelEls = findChildElementsByLocalName(navPoint, 'navlabel');
      let title = '';
      if (labelEls.length > 0) {
        const textEls = findChildElementsByLocalName(labelEls[0], 'text');
        if (textEls.length > 0) {
          title = cleanTitle(textEls[0].textContent);
        } else {
          title = cleanTitle(labelEls[0].textContent);
        }
      }

      if (!title) {
        title = navPoint.getAttribute('id') || 'Untitled Chapter';
      }

      // Find direct child <content>
      const contentEls = findChildElementsByLocalName(navPoint, 'content');
      let rawSrc = '';
      let resolvedFullPath = '';
      let hash = '';

      if (contentEls.length > 0) {
        rawSrc = (contentEls[0].getAttribute('src') || '').trim();
        const split = splitHrefAnchor(rawSrc);
        hash = split.hash;
        if (split.pathPart) {
          resolvedFullPath = resolvePath(ncxFullPath, split.pathPart);
        } else if (hash) {
          resolvedFullPath = ncxFullPath;
        }
      }

      // Direct child <navPoint> elements
      const childNavPoints = findChildElementsByLocalName(navPoint, 'navpoint');
      const children = TocParser._parseNavPoints(childNavPoints, ncxFullPath, depth + 1, visited, nextId, resolvePath);

      items.push({
        id,
        title,
        href: rawSrc,
        fullPath: resolvedFullPath,
        hash,
        ...(playOrder !== undefined && !isNaN(playOrder) ? { playOrder } : {}),
        children
      });
    }

    return items;
  }

  /**
   * Generates a clean linear TOC from OPF <spine> items when neither Nav Doc nor NCX exist.
   *
   * @param {Array<object>} spine
   * @param {object} [zip]
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  static async buildSpineFallbackToc(spine, zip, options = {}) {
    if (!Array.isArray(spine) || spine.length === 0) return [];
    const resolvePath = options.resolvePath || ((base, rel) => PathResolver.resolvePath(base, rel));
    const opfPath = options.opfPath || 'OEBPS/content.opf';

    const items = [];

    for (let i = 0; i < spine.length; i++) {
      const item = spine[i];
      const id = item.id || item.idref || `spine-toc-${i + 1}`;
      const href = item.href || '';
      const fullPath = item.fullPath || resolvePath(opfPath, href);

      let title = `Chapter ${i + 1}`;

      // If zip is available, peek into chapter markup to extract heading
      if (zip && fullPath) {
        const fileEntry = PathResolver.findZipEntry(zip, fullPath);
        if (fileEntry) {
          try {
            // Read first chunk to locate title/heading quickly without loading huge files
            const fullText = await fileEntry.async('string');
            const previewText = fullText.slice(0, 8192);

            const parser = new DOMParser();
            const doc = parser.parseFromString(previewText, 'text/html');

            const heading = doc.querySelector('h1, h2, h3, h4');
            const docTitle = doc.querySelector('title');

            if (heading && cleanTitle(heading.textContent)) {
              title = cleanTitle(heading.textContent);
            } else if (docTitle && cleanTitle(docTitle.textContent)) {
              title = cleanTitle(docTitle.textContent);
            } else if (item.id) {
              title = item.id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }
          } catch {
            // Silently retain fallback title
          }
        }
      }

      items.push({
        id,
        title,
        href,
        fullPath,
        hash: '',
        children: []
      });
    }

    return items;
  }

  /**
   * Utility helper to flatten a hierarchical TOC tree into a linear list with depth tags.
   *
   * @param {Array<object>} items
   * @param {number} [depth=0]
   * @returns {Array<object>}
   */
  static flatten(items, depth = 0) {
    if (!Array.isArray(items)) return [];
    const result = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      result.push({ ...item, depth });
      if (item.children && item.children.length > 0) {
        result.push(...TocParser.flatten(item.children, depth + 1));
      }
    }
    return result;
  }

  /**
   * Finds the active TocItem matching either a predicate function OR a fullPath and optional hash.
   *
   * @param {Array<object>} items
   * @param {Function|string} predicateOrPath
   * @param {string} [hash]
   * @returns {object|null}
   */
  static findItem(items, predicateOrPath, hash) {
    if (!Array.isArray(items)) return null;

    if (typeof predicateOrPath === 'function') {
      function searchFn(list) {
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          if (predicateOrPath(item)) return item;
          if (item.children && item.children.length > 0) {
            const found = searchFn(item.children);
            if (found) return found;
          }
        }
        return null;
      }
      return searchFn(items);
    }

    const fullPath = predicateOrPath;
    if (!fullPath || typeof fullPath !== 'string') return null;

    let bestMatch = null;

    function searchPath(list) {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.fullPath === fullPath) {
          if (hash && item.hash === hash) {
            return item; // Exact match on path and hash
          }
          if (!bestMatch) {
            bestMatch = item; // Match on file path
          }
        }
        if (item.children && item.children.length > 0) {
          const found = searchPath(item.children);
          if (found) return found;
        }
      }
      return null;
    }

    const exact = searchPath(items);
    return exact || bestMatch;
  }
}

export default TocParser;
