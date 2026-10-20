/**
 * js/parser/opf-parser.js
 * OCF container.xml and OPF package document parser.
 * Extracts Dublin Core metadata, manifest items, spine reading order,
 * and executes the 4-step cover image resolution cascade.
 *
 * Remediated in Milestone 2, Iteration 2:
 * Robust XML namespace prefix stripping across strict XML (application/xml),
 * XHTML, and HTML5 DOMParser fallback (text/html).
 */

import { PathResolver } from './path-resolver.js';

/**
 * Checks whether an item represents an image resource.
 *
 * @param {{ mediaType?: string; href?: string }} item
 * @returns {boolean}
 */
export function isImageItem(item) {
  if (!item) return false;
  const mt = (item.mediaType || '').toLowerCase();
  const href = (item.href || '').toLowerCase();
  return (
    mt.startsWith('image/') ||
    mt === 'application/svg+xml' ||
    mt === 'text/xml+svg' ||
    /\.(jpe?g|png|gif|svg|webp|avif|bmp)$/i.test(href)
  );
}

/**
 * Extracts normalized lowercase local element name, cleanly removing any XML namespace prefix.
 * Handles strict XML (node.localName is unprefixed), XHTML, and HTML5 DOMParser fallback
 * (where unknown prefixed elements like <dc:title> receive node.localName === 'dc:title').
 *
 * @param {Element|Node} node
 * @returns {string} Lowercase unprefixed local name (e.g. 'title')
 */
export function getNodeLocalName(node) {
  if (!node) return '';
  const rawName = node.localName || node.nodeName || '';
  return (rawName.split(':').pop() || '').toLowerCase();
}

/**
 * Locates the first descendant element matching the target localName (case-insensitive, prefix-tolerant).
 * Seamless across XML, XHTML, and HTML5 fallback documents.
 *
 * @param {Element|Document} root
 * @param {string} targetLocal
 * @returns {Element|null}
 */
export function findElementByLocal(root, targetLocal) {
  if (!root) return null;
  const target = (targetLocal || '').toLowerCase();

  // 1. Try native querySelector
  try {
    const el = root.querySelector(target);
    if (el) return el;
  } catch (_) {}

  // 2. Try getElementsByTagNameNS with wildcard namespace
  if (typeof root.getElementsByTagNameNS === 'function') {
    const els = root.getElementsByTagNameNS('*', target);
    if (els && els.length > 0) return els[0];
  }

  // 3. Fallback: inspect all elements with prefix splitting
  if (typeof root.getElementsByTagName === 'function') {
    const all = root.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (getNodeLocalName(all[i]) === target) {
        return all[i];
      }
    }
  }

  return null;
}

/**
 * Locates all descendant elements matching the target localName (case-insensitive, prefix-tolerant).
 *
 * @param {Element|Document} root
 * @param {string} targetLocal
 * @returns {Element[]}
 */
export function findElementsByLocal(root, targetLocal) {
  if (!root) return [];
  const target = (targetLocal || '').toLowerCase();

  // 1. If native querySelectorAll finds elements, return them
  try {
    const qsa = root.querySelectorAll(target);
    if (qsa && qsa.length > 0) {
      return Array.from(qsa);
    }
  } catch (_) {}

  // 2. If getElementsByTagNameNS finds elements, return them
  if (typeof root.getElementsByTagNameNS === 'function') {
    const els = root.getElementsByTagNameNS('*', target);
    if (els && els.length > 0) {
      return Array.from(els);
    }
  }

  // 3. Fallback: filter all elements with prefix splitting
  if (typeof root.getElementsByTagName === 'function') {
    const all = root.getElementsByTagName('*');
    const matched = [];
    for (let i = 0; i < all.length; i++) {
      if (getNodeLocalName(all[i]) === target) {
        matched.push(all[i]);
      }
    }
    return matched;
  }

  return [];
}

/**
 * Robust XML helper extracting trimmed text content from elements matching localName.
 * Seamless across strict XML documents (application/xml), XHTML, and HTML5 fallback (text/html).
 * Handles undeclared prefixes (e.g. <dc:title> when xmlns:dc is omitted).
 *
 * @param {Element|Document} parentNode
 * @param {string} localName - e.g. "title", "creator", "identifier"
 * @param {string} [fallback='']
 * @returns {string} Trimmed text content or fallback
 */
export function getMetaText(parentNode, localName, fallback = '') {
  if (!parentNode) return fallback;
  const target = (localName || '').toLowerCase();

  // 1. Try getElementsByTagNameNS with wildcard namespace (fast path for valid XML/XHTML)
  if (typeof parentNode.getElementsByTagNameNS === 'function') {
    const elements = parentNode.getElementsByTagNameNS('*', localName);
    for (let i = 0; i < elements.length; i++) {
      const text = elements[i].textContent ? elements[i].textContent.trim() : '';
      if (text) return text;
    }
  }

  // 2. Iterate child elements checking prefix-stripped localName
  const children = parentNode.children || parentNode.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 1) { // ELEMENT_NODE
      const nodeLocal = getNodeLocalName(node);
      if (nodeLocal === target) {
        const text = node.textContent ? node.textContent.trim() : '';
        if (text) return text;
      }
    }
  }

  // 3. Fallback: Search all descendants if not found in immediate children (for HTML5 fallback mode)
  if (typeof parentNode.getElementsByTagName === 'function') {
    const elements = parentNode.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const node = elements[i];
      const nodeLocal = getNodeLocalName(node);
      if (nodeLocal === target) {
        const text = node.textContent ? node.textContent.trim() : '';
        if (text) return text;
      }
    }
  }

  return fallback;
}

/**
 * Gathers all trimmed text values for elements matching localName (e.g. multiple creators).
 * Seamless across strict XML, XHTML, and HTML5 fallback documents.
 *
 * @param {Element|Document} parentNode
 * @param {string} localName
 * @returns {string[]} Array of non-empty strings
 */
export function getAllMetaText(parentNode, localName) {
  if (!parentNode) return [];
  const results = [];
  const target = (localName || '').toLowerCase();

  // 1. Try getElementsByTagNameNS with wildcard namespace (fast path for valid XML/XHTML)
  if (typeof parentNode.getElementsByTagNameNS === 'function') {
    const elements = parentNode.getElementsByTagNameNS('*', localName);
    for (let i = 0; i < elements.length; i++) {
      const text = elements[i].textContent ? elements[i].textContent.trim() : '';
      if (text && !results.includes(text)) {
        results.push(text);
      }
    }
  }

  // 2. Iterate child elements checking prefix-stripped localName
  if (results.length === 0) {
    const children = parentNode.children || parentNode.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeType === 1) {
        const nodeLocal = getNodeLocalName(node);
        if (nodeLocal === target) {
          const text = node.textContent ? node.textContent.trim() : '';
          if (text && !results.includes(text)) {
            results.push(text);
          }
        }
      }
    }
  }

  // 3. Fallback: Search all descendants if not found in immediate children
  if (results.length === 0 && typeof parentNode.getElementsByTagName === 'function') {
    const elements = parentNode.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const node = elements[i];
      const nodeLocal = getNodeLocalName(node);
      if (nodeLocal === target) {
        const text = node.textContent ? node.textContent.trim() : '';
        if (text && !results.includes(text)) {
          results.push(text);
        }
      }
    }
  }

  return results;
}

export class OpfParser {
  /**
   * Discovers and returns the full ZIP path of the OPF package document.
   * 1. Inspects META-INF/container.xml for <rootfile full-path="..." media-type="application/oebps-package+xml">
   * 2. Fallback: Scans archive for *.opf files (preferring content.opf or package.opf).
   *
   * @param {any} zip - JSZip instance
   * @returns {Promise<string>} Full zip path of OPF
   * @throws {Error} If no OPF package can be located
   */
  static async findOpfPath(zip) {
    if (!zip) throw new Error('OpfParser.findOpfPath: JSZip instance required.');

    // 1. Locate and parse META-INF/container.xml
    const containerEntry = PathResolver.findZipEntry(zip, 'META-INF/container.xml');
    if (containerEntry) {
      try {
        const xmlText = await containerEntry.async('string');
        const parser = new DOMParser();
        let doc = parser.parseFromString(xmlText, 'application/xml');

        if (doc.querySelector('parsererror')) {
          doc = parser.parseFromString(xmlText, 'text/html');
        }

        if (doc && !doc.querySelector('parsererror')) {
          const rootfiles = findElementsByLocal(doc, 'rootfile');
          // Prefer media-type="application/oebps-package+xml"
          for (let i = 0; i < rootfiles.length; i++) {
            const rf = rootfiles[i];
            const mediaType = rf.getAttribute('media-type');
            const fullPath = rf.getAttribute('full-path');
            if (fullPath && (!mediaType || mediaType === 'application/oebps-package+xml')) {
              const norm = PathResolver.normalizePath(fullPath);
              if (PathResolver.findZipEntry(zip, norm)) {
                return norm;
              }
            }
          }
          // Fallback to any rootfile with full-path
          for (let i = 0; i < rootfiles.length; i++) {
            const fullPath = rootfiles[i].getAttribute('full-path');
            if (fullPath) {
              const norm = PathResolver.normalizePath(fullPath);
              if (PathResolver.findZipEntry(zip, norm)) {
                return norm;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed parsing container.xml, falling back to .opf scan:', err);
      }
    }

    // 2. Fallback: Scan archive keys for .opf files
    const fileKeys = Object.keys(zip.files || {}).filter(
      k => /\.opf$/i.test(k) && !k.startsWith('__MACOSX') && !k.includes('/._')
    );

    if (fileKeys.length > 0) {
      // Prioritize standard package document names
      const preferred = fileKeys.find(
        k => /content\.opf$/i.test(k) || /package\.opf$/i.test(k)
      );
      return preferred || fileKeys[0];
    }

    throw new Error('Invalid EPUB: Unable to locate OPF package document.');
  }

  /**
   * Parses the OPF package document XML into structured metadata, manifest,
   * spine, cover, and TOC references.
   *
   * @param {string} xmlText - Raw OPF XML text
   * @param {string} opfPath - Full zip path of the OPF file
   * @returns {object} Parsed OPF package data
   */
  static parseOpf(xmlText, opfPath) {
    if (!xmlText || typeof xmlText !== 'string') {
      throw new Error('OpfParser.parseOpf: XML string content required.');
    }

    const parser = new DOMParser();
    let doc = parser.parseFromString(xmlText, 'application/xml');

    // Handle XML parse errors with entity cleanup fallback
    if (doc.querySelector('parsererror')) {
      const sanitized = xmlText
        .replace(/&nbsp;/g, '&#160;')
        .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[a-f0-9]+);)/gi, '&amp;');
      doc = parser.parseFromString(sanitized, 'application/xml');

      // Secondary fallback: parse as text/html if XML fails
      if (doc.querySelector('parsererror')) {
        doc = parser.parseFromString(xmlText, 'text/html');
      }
    }

    const opfDir = PathResolver.getBaseDir(opfPath);
    const packageEl = findElementByLocal(doc, 'package') || doc.documentElement;
    const packageVersion = packageEl ? packageEl.getAttribute('version') || '2.0' : '2.0';
    const metadataEl = findElementByLocal(doc, 'metadata') || packageEl;

    // 1. Dublin Core Metadata Extraction
    let rawTitle = getMetaText(metadataEl, 'title', '');
    const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : 'Untitled Book';

    const authors = getAllMetaText(metadataEl, 'creator');
    let author = authors.length > 0 ? authors.join(', ') : getMetaText(metadataEl, 'author', '');
    if (!author || !author.trim()) {
      author = 'Unknown Author';
    } else {
      author = author.trim();
    }

    const language = getMetaText(metadataEl, 'language', 'en');

    // Identifier: match unique-identifier attribute if possible
    let identifier = '';
    const uniqueIdAttr = packageEl ? packageEl.getAttribute('unique-identifier') : null;
    if (uniqueIdAttr && metadataEl) {
      const idElements = findElementsByLocal(metadataEl, 'identifier');
      for (let i = 0; i < idElements.length; i++) {
        if (idElements[i].getAttribute('id') === uniqueIdAttr) {
          identifier = idElements[i].textContent.trim();
          break;
        }
      }
    }
    if (!identifier) {
      identifier = getMetaText(metadataEl, 'identifier', '');
    }

    const description = getMetaText(metadataEl, 'description', '');
    const publisher = getMetaText(metadataEl, 'publisher', '');
    const date = getMetaText(metadataEl, 'date', '');

    // 2. Manifest Items Map
    const manifest = new Map();
    const manifestByPath = new Map();
    const manifestEl = findElementByLocal(doc, 'manifest');
    const itemElements = manifestEl
      ? findElementsByLocal(manifestEl, 'item')
      : findElementsByLocal(doc, 'item').filter(el => {
          let parent = el.parentElement;
          while (parent) {
            const pName = getNodeLocalName(parent);
            if (pName === 'metadata' || pName === 'spine') return false;
            parent = parent.parentElement;
          }
          return true;
        });

    for (let i = 0; i < itemElements.length; i++) {
      const itemEl = itemElements[i];

      const id = itemEl.getAttribute('id') || '';
      const href = itemEl.getAttribute('href') || '';
      const mediaType = itemEl.getAttribute('media-type') || '';
      const propertiesStr = itemEl.getAttribute('properties') || '';
      const properties = propertiesStr.trim().split(/\s+/).filter(Boolean);
      const fallback = itemEl.getAttribute('fallback') || null;

      const fullPath = PathResolver.joinPath(opfDir, PathResolver.safeDecodeURIComponent(href));

      const item = {
        id,
        href,
        fullPath,
        mediaType,
        properties,
        fallback
      };

      if (id) manifest.set(id, item);
      if (fullPath) manifestByPath.set(fullPath, item);
    }

    // 3. Spine Reading Order
    const spine = [];
    const spineEl = findElementByLocal(doc, 'spine');
    const spineTocId = spineEl ? spineEl.getAttribute('toc') || undefined : undefined;
    const itemrefElements = spineEl
      ? findElementsByLocal(spineEl, 'itemref')
      : findElementsByLocal(doc, 'itemref').filter(el => {
          let parent = el.parentElement;
          while (parent) {
            const pName = getNodeLocalName(parent);
            if (pName === 'metadata' || pName === 'manifest') return false;
            parent = parent.parentElement;
          }
          return true;
        });

    for (let i = 0; i < itemrefElements.length; i++) {
      const ir = itemrefElements[i];

      const idref = ir.getAttribute('idref');
      const linearAttr = ir.getAttribute('linear');
      // EPUB spec: linear defaults to 'yes'
      const isLinear = linearAttr !== 'no';

      let item = manifest.get(idref);

      // Handle fallback chain if item media-type is non-standard
      if (item && item.fallback && manifest.has(item.fallback)) {
        const fallbackItem = manifest.get(item.fallback);
        if (fallbackItem && fallbackItem.mediaType === 'application/xhtml+xml') {
          item = fallbackItem;
        }
      }

      if (item) {
        spine.push({
          id: item.id,
          idref,
          href: item.href,
          fullPath: item.fullPath,
          mediaType: item.mediaType,
          isLinear
        });
      }
    }

    // Fallback: If spine is empty, use all XHTML manifest items
    if (spine.length === 0) {
      for (const item of manifest.values()) {
        if (item.mediaType === 'application/xhtml+xml' || /\.x?html$/i.test(item.href)) {
          spine.push({
            id: item.id,
            idref: item.id,
            href: item.href,
            fullPath: item.fullPath,
            mediaType: item.mediaType,
            isLinear: true
          });
        }
      }
    }

    // 4. Cover Image Resolution Cascade (4-Step Specification)
    let coverItem = null;

    // Step 1: Manifest item with properties="cover-image" (EPUB 3)
    for (const item of manifest.values()) {
      if (item.properties && item.properties.includes('cover-image')) {
        if (isImageItem(item)) {
          coverItem = item;
          break;
        }
      }
    }

    // Step 2: <meta name="cover" content="id"> (EPUB 2)
    if (!coverItem && metadataEl) {
      const metaElements = findElementsByLocal(metadataEl, 'meta');
      for (let i = 0; i < metaElements.length; i++) {
        const m = metaElements[i];
        if (m.getAttribute('name') === 'cover') {
          const coverId = m.getAttribute('content');
          if (coverId && manifest.has(coverId)) {
            const candidate = manifest.get(coverId);
            if (isImageItem(candidate)) {
              coverItem = candidate;
              break;
            }
          }
        }
      }
    }

    // Step 3: Manifest item with id="cover-image" or id="cover"
    if (!coverItem) {
      if (manifest.has('cover-image') && isImageItem(manifest.get('cover-image'))) {
        coverItem = manifest.get('cover-image');
      } else if (manifest.has('cover') && isImageItem(manifest.get('cover'))) {
        coverItem = manifest.get('cover');
      }
    }

    // Step 4: First manifest image item containing 'cover' in href or id
    if (!coverItem) {
      for (const item of manifest.values()) {
        if (isImageItem(item)) {
          const lowerHref = (item.href || '').toLowerCase();
          const lowerId = (item.id || '').toLowerCase();
          if (lowerHref.includes('cover') || lowerId.includes('cover')) {
            coverItem = item;
            break;
          }
        }
      }
    }

    // 5. TOC Item References (for TocParser)
    let navItem = null;
    let ncxItem = null;

    for (const item of manifest.values()) {
      if (item.properties && item.properties.includes('nav')) {
        navItem = item;
      }
      if (item.mediaType === 'application/x-dtbncx+xml') {
        ncxItem = item;
      }
    }
    if (!ncxItem && spineTocId && manifest.has(spineTocId)) {
      ncxItem = manifest.get(spineTocId);
    }
    if (!ncxItem) {
      for (const item of manifest.values()) {
        if (/\.ncx$/i.test(item.href)) {
          ncxItem = item;
          break;
        }
      }
    }

    return {
      metadata: {
        title,
        author,
        language,
        identifier,
        description,
        publisher,
        date
      },
      manifest,
      manifestByPath,
      spine,
      coverItem,
      tocReferences: {
        navItem,
        ncxItem,
        spineTocId
      },
      opfDir,
      opfPath,
      packageVersion
    };
  }
}

export default OpfParser;
