/**
 * js/parser/asset-extractor.js
 * EPUB Asset Extractor, Blob URL Manager, CSS Rewriter & Security Sanitizer
 * Conforms to EPUB 3.3 / EPUB 2.0.1 OCF / OPF specifications.
 */

import { PathResolver } from './path-resolver.js';

/**
 * MIME type detection map and helper.
 */
export const MIME_MAP = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  // Fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  otf: 'font/otf',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  // Stylesheets
  css: 'text/css',
  // Documents
  xhtml: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  // Media
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg'
};

/**
 * Normalizes or infers MIME type from declared media-type and file path.
 * @param {string} filePath
 * @param {string} [declaredType]
 * @returns {string}
 */
export function resolveMimeType(filePath, declaredType) {
  if (declaredType && declaredType.trim() && declaredType !== 'application/octet-stream') {
    const dt = declaredType.trim().toLowerCase();
    // Normalize legacy font types
    if (dt === 'application/font-woff' || dt === 'application/x-font-woff') return 'font/woff';
    if (dt === 'application/font-woff2') return 'font/woff2';
    if (dt === 'application/x-font-opentype' || dt === 'application/vnd.ms-opentype') return 'font/otf';
    if (dt === 'application/x-font-ttf' || dt === 'application/x-font-truetype') return 'font/ttf';
    if (dt === 'text/xml+svg') return 'image/svg+xml';
    return dt;
  }

  const clean = filePath.split('#')[0].split('?')[0];
  const extMatch = clean.match(/\.([a-zA-Z0-9]+)$/);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    if (MIME_MAP[ext]) {
      return MIME_MAP[ext];
    }
  }
  return 'application/octet-stream';
}

/**
 * DOM Sanitizer (Security Defense Layer 1)
 */
export class DOMSanitizer {
  /**
   * Recursively sanitizes a DOM Document or Element in-place.
   * Strips scripts, inline event handlers (on*), meta refresh, dangerous URIs, and dangerous embeds.
   * @param {Document|Element} root
   * @returns {Document|Element}
   */
  static sanitize(root) {
    if (!root) return root;

    // 1. Remove all <script> elements
    const scripts = root.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      scripts[i].remove();
    }

    // 2. Remove dangerous elements (meta refresh, object, embed, applet, base, iframe, frame, frameset)
    const dangerousTags = root.querySelectorAll('meta[http-equiv="refresh" i], object, embed, applet, base, iframe, frame, frameset');
    for (let i = 0; i < dangerousTags.length; i++) {
      dangerousTags[i].remove();
    }

    // 3. Neutralize <form> elements and form submission controls
    const forms = root.querySelectorAll('form');
    for (let i = 0; i < forms.length; i++) {
      forms[i].removeAttribute('action');
      forms[i].removeAttribute('method');
      forms[i].removeAttribute('target');
    }
    const formControls = root.querySelectorAll('button[formaction], input[formaction]');
    for (let i = 0; i < formControls.length; i++) {
      formControls[i].removeAttribute('formaction');
      formControls[i].removeAttribute('formmethod');
      formControls[i].removeAttribute('formtarget');
    }

    // 4. Strip inline event handlers (on*) and dangerous URI schemes
    const dangerousAttrs = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster'];
    const allElements = root.querySelectorAll('*');

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const attrs = Array.from(el.attributes);

      for (let j = 0; j < attrs.length; j++) {
        const attr = attrs[j];
        const name = attr.name.toLowerCase();

        // Strip inline on* event listeners
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }

        // Check executable/dangerous URI schemes on relevant attributes
        if (dangerousAttrs.includes(name) || name.endsWith(':href')) {
          const val = attr.value || '';
          // Strip ASCII control characters and whitespace for inspection
          const sanitizedVal = val.replace(/[\u0000-\u001F\s]/g, '').toLowerCase();

          if (
            sanitizedVal.startsWith('javascript:') ||
            sanitizedVal.startsWith('vbscript:') ||
            sanitizedVal.startsWith('data:text/html') ||
            sanitizedVal.startsWith('data:application/xhtml+xml')
          ) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }

    return root;
  }
}

/**
 * AssetExtractor: Manages ZIP asset extraction, in-memory Blob URL generation,
 * CSS url rewriting, chapter DOM preparation, and memory lifecycle cleanup.
 */
export class AssetExtractor {
  /**
   * @param {object} zip - JSZip instance
   * @param {Map<string, object>|Array<object>} [manifest] - OPF manifest items
   * @param {object} [options] - Configuration options
   */
  constructor(zip, manifest = new Map(), options = {}) {
    if (!zip) {
      throw new Error('AssetExtractor requires a valid JSZip archive instance.');
    }
    this.zip = zip;
    this.manifest = manifest;
    this.pathResolver = options.pathResolver || PathResolver;

    /**
     * Internal map: zipPath -> blobUrl
     * @type {Map<string, string>}
     */
    this.assetMap = new Map();

    /**
     * Set of all created Blob URLs for explicit lifecycle revocation
     * @type {Set<string>}
     */
    this.blobUrls = new Set();

    /**
     * Map of manifest items keyed by normalized full zip path
     * @type {Map<string, object>}
     */
    this.manifestByPath = new Map();
    this._indexManifest(manifest);

    this.isCleanedUp = false;
  }

  /**
   * Indexes manifest items by normalized zip path for instant O(1) lookup.
   * @private
   */
  _indexManifest(manifest) {
    if (!manifest) return;
    const items = manifest instanceof Map
      ? manifest.values()
      : Array.isArray(manifest)
      ? manifest
      : Object.values(manifest);

    for (const item of items) {
      if (item && item.fullPath) {
        const norm = PathResolver.normalizePath(item.fullPath);
        this.manifestByPath.set(norm, item);
      }
    }
  }

  /**
   * Finds a file entry in the ZIP, supporting exact match, percent-decoded,
   * or case-insensitive matching.
   * @param {string} zipPath
   * @returns {object|null} JSZip file entry
   */
  findZipEntry(zipPath) {
    if (!zipPath || this.isCleanedUp) return null;
    return PathResolver.findZipEntry(this.zip, zipPath);
  }

  /**
   * Extracts a binary asset from the ZIP, creates a Blob URL, and caches it in assetMap.
   * @param {string} zipPath - Normalized path in ZIP
   * @param {string} [mediaType] - Optional declared MIME type
   * @returns {Promise<string|null>} Blob URL or null if asset not found
   */
  async extractAsset(zipPath, mediaType) {
    if (this.isCleanedUp) return null;
    const cleanPath = PathResolver.normalizePath(zipPath);

    // Check cache
    if (this.assetMap.has(cleanPath)) {
      return this.assetMap.get(cleanPath);
    }

    const entry = this.findZipEntry(cleanPath);
    if (!entry) {
      console.warn(`[AssetExtractor] Asset not found in ZIP: ${cleanPath}`);
      return null;
    }

    // Infer MIME type if not provided
    let mime = mediaType;
    if (!mime) {
      const manifestItem = this.manifestByPath.get(cleanPath);
      mime = manifestItem?.mediaType || resolveMimeType(cleanPath);
    } else {
      mime = resolveMimeType(cleanPath, mime);
    }

    const uint8Array = await entry.async('uint8array');
    const blob = new Blob([uint8Array], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    this.assetMap.set(cleanPath, blobUrl);
    this.blobUrls.add(blobUrl);

    return blobUrl;
  }

  /**
   * Alias for extractAsset conforming to Explorer 1 blueprint.
   * @param {string} zipPath
   * @param {string} [mediaType]
   * @returns {Promise<string|null>}
   */
  async extractAssetBlobUrl(zipPath, mediaType) {
    return this.extractAsset(zipPath, mediaType);
  }

  /**
   * Pre-extracts all images, fonts, and stylesheets in the manifest.
   * Stylesheets are rewritten and converted to Blob URLs immediately.
   * @returns {Promise<Map<string, string>>}
   */
  async extractAllManifestAssets() {
    if (this.isCleanedUp) return this.assetMap;

    // 1. Extract images and fonts first
    const stylesheetItems = [];

    for (const [path, item] of this.manifestByPath.entries()) {
      const mime = resolveMimeType(path, item.mediaType);

      if (mime === 'text/css') {
        stylesheetItems.push({ path, item });
      } else if (
        mime.startsWith('image/') ||
        mime.startsWith('font/') ||
        mime.startsWith('audio/') ||
        mime.startsWith('video/')
      ) {
        try {
          await this.extractAsset(path, mime);
        } catch (err) {
          console.warn(`[AssetExtractor] Failed pre-extracting ${path}:`, err);
        }
      }
    }

    // 2. Process stylesheets (rewriting url(...) to blob URLs)
    for (let i = 0; i < stylesheetItems.length; i++) {
      const { path } = stylesheetItems[i];
      try {
        await this.processStylesheet(path);
      } catch (err) {
        console.warn(`[AssetExtractor] Failed processing stylesheet ${path}:`, err);
      }
    }

    return this.assetMap;
  }

  /**
   * Fetches, rewrites, and creates a Blob URL for a CSS stylesheet.
   * @param {string} cssZipPath
   * @param {Set<string>} [visitedSet] - For recursive @import cycle prevention
   * @returns {Promise<string|null>} Blob URL of rewritten CSS
   */
  async processStylesheet(cssZipPath, visitedSet = new Set()) {
    if (this.isCleanedUp) return null;
    const cleanPath = PathResolver.normalizePath(cssZipPath);

    if (this.assetMap.has(cleanPath)) {
      return this.assetMap.get(cleanPath);
    }

    const entry = this.findZipEntry(cleanPath);
    if (!entry) {
      console.warn(`[AssetExtractor] Stylesheet not found: ${cleanPath}`);
      return null;
    }

    const rawCss = await entry.async('string');
    const rewrittenCss = await this.rewriteCss(rawCss, cleanPath, visitedSet);

    const blob = new Blob([rewrittenCss], { type: 'text/css' });
    const blobUrl = URL.createObjectURL(blob);

    this.assetMap.set(cleanPath, blobUrl);
    this.blobUrls.add(blobUrl);

    return blobUrl;
  }

  /**
   * Rewrites relative @import and url(...) references within CSS text.
   * @param {string} cssText - Original CSS string
   * @param {string} baseCssZipPath - Full ZIP path of the stylesheet
   * @param {Set<string>} [visitedSet] - Tracks imported paths to prevent circular recursion
   * @returns {Promise<string>} Rewritten CSS string
   */
  async rewriteCss(cssText, baseCssZipPath, visitedSet = new Set()) {
    if (!cssText) return '';
    visitedSet.add(baseCssZipPath);

    // Step 1: Protect CSS comments from regex tokenization
    const comments = [];
    const cssWithoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => {
      comments.push(m);
      return `/*__COMMENT_${comments.length - 1}__*/`;
    });

    // Step 2: Rewrite / inline @import statements
    // Matches @import "style.css"; or @import url("style.css") screen;
    const importRegex = /@import\s+(?:url\s*\(\s*)?['"]?([^'"()]+)['"]?\s*\)?\s*([^;]*);/gi;
    let cssAfterImports = cssWithoutComments;
    const importMatches = Array.from(cssWithoutComments.matchAll(importRegex));

    for (let i = 0; i < importMatches.length; i++) {
      const match = importMatches[i];
      const fullStatement = match[0];
      const importPath = (match[1] || '').trim();
      const mediaQuery = (match[2] || '').trim();

      // Skip external imports
      if (!importPath || /^(https?:|\/\/|data:)/i.test(importPath)) {
        continue;
      }

      const resolvedImportPath = PathResolver.resolvePath(baseCssZipPath, importPath);

      // Prevent circular @import loops
      if (visitedSet.has(resolvedImportPath)) {
        cssAfterImports = cssAfterImports.replace(fullStatement, '/* Circular @import omitted */');
        continue;
      }

      const importedEntry = this.findZipEntry(resolvedImportPath);
      if (importedEntry) {
        const rawImportedCss = await importedEntry.async('string');
        const rewrittenImportedCss = await this.rewriteCss(rawImportedCss, resolvedImportPath, new Set(visitedSet));
        const replacement = mediaQuery ? `@media ${mediaQuery} {\n${rewrittenImportedCss}\n}` : rewrittenImportedCss;
        cssAfterImports = cssAfterImports.replace(fullStatement, replacement);
      } else {
        cssAfterImports = cssAfterImports.replace(fullStatement, `/* Failed to import: ${importPath} */`);
      }
    }

    // Step 3: Rewrite url(...) references (images, fonts, SVG filters)
    // Matches url("..."), url('...'), or url(...)
    const urlRegex = /url\(\s*(?:(['"])(.*?)\1|([^'"\s)]+))\s*\)/gi;
    const urlMatches = Array.from(cssAfterImports.matchAll(urlRegex));

    let finalCss = cssAfterImports;
    for (let i = 0; i < urlMatches.length; i++) {
      const match = urlMatches[i];
      const fullUrlMatch = match[0];
      const rawUrl = (match[2] !== undefined ? match[2] : match[3] || '').trim();

      // Skip empty, data:, absolute, or pure SVG hash references
      if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('#') || /^(https?:|\/\/|blob:)/i.test(rawUrl)) {
        continue;
      }

      const { path: cleanTarget, hash } = PathResolver.splitUri(rawUrl);
      if (!cleanTarget) continue;

      const resolvedAssetPath = PathResolver.resolvePath(baseCssZipPath, cleanTarget);
      let blobUrl = this.assetMap.get(resolvedAssetPath);

      if (!blobUrl) {
        blobUrl = await this.extractAsset(resolvedAssetPath);
      }

      if (blobUrl) {
        const rewrittenTarget = hash ? `${blobUrl}#${hash}` : blobUrl;
        finalCss = finalCss.replace(fullUrlMatch, `url("${rewrittenTarget}")`);
      }
    }

    // Step 4: Restore comments
    finalCss = finalCss.replace(/\/\*__COMMENT_(\d+)__\*\//g, (_, idx) => comments[Number(idx)] || '');

    return finalCss;
  }

  /**
   * Fetches, parses, sanitizes, and prepares a chapter Document for rendering.
   * Rewrites images, SVGs, media, stylesheets, and cross-chapter anchor links.
   * @param {string} fullPath - Normalized chapter path in ZIP (e.g. 'OEBPS/text/ch01.xhtml')
   * @returns {Promise<Document>} Ready-to-render DOM Document
   */
  async getChapterDocument(fullPath) {
    if (this.isCleanedUp) {
      throw new Error('AssetExtractor has been cleaned up. Cannot load chapter.');
    }

    const cleanPath = PathResolver.normalizePath(fullPath);
    const entry = this.findZipEntry(cleanPath);
    if (!entry) {
      throw new Error(`Chapter file not found in EPUB: ${cleanPath}`);
    }

    const rawContent = await entry.async('string');

    // Step 1: Parse Document with DOMParser (XHTML strict with HTML fallback)
    const parser = new DOMParser();
    let doc = parser.parseFromString(rawContent, 'application/xhtml+xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn(`[AssetExtractor] XHTML parse error in ${cleanPath}, falling back to text/html:`, parserError.textContent);
      doc = parser.parseFromString(rawContent, 'text/html');
    }

    // Step 2: Defense Layer 1 - Sanitize DOM
    DOMSanitizer.sanitize(doc);

    // Step 3: Rewrite <img> elements (src and srcset)
    const images = doc.querySelectorAll('img');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = img.getAttribute('src');

      if (src && !/^(https?:|\/\/|data:|blob:)/i.test(src)) {
        const resolved = PathResolver.resolvePath(cleanPath, src);
        let blobUrl = this.assetMap.get(resolved) || (await this.extractAsset(resolved));
        if (blobUrl) {
          img.setAttribute('src', blobUrl);
        }
      }

      // Handle srcset
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const candidates = srcset.split(',');
        const rewrittenCandidates = [];

        for (let j = 0; j < candidates.length; j++) {
          const candidate = candidates[j];
          const parts = candidate.trim().split(/\s+/);
          const candidateUrl = parts[0];
          const descriptor = parts.slice(1).join(' ');

          if (candidateUrl && !/^(https?:|\/\/|data:|blob:)/i.test(candidateUrl)) {
            const resolved = PathResolver.resolvePath(cleanPath, candidateUrl);
            let blobUrl = this.assetMap.get(resolved) || (await this.extractAsset(resolved));
            rewrittenCandidates.push(blobUrl ? `${blobUrl} ${descriptor}`.trim() : candidate.trim());
          } else {
            rewrittenCandidates.push(candidate.trim());
          }
        }
        img.setAttribute('srcset', rewrittenCandidates.join(', '));
      }
    }

    // Step 4: Rewrite SVG <image> and <use> elements
    const svgImages = doc.querySelectorAll('image');
    for (let i = 0; i < svgImages.length; i++) {
      const el = svgImages[i];
      const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || el.getAttribute('xlink:href');

      if (href && !/^(https?:|\/\/|data:|blob:)/i.test(href)) {
        const resolved = PathResolver.resolvePath(cleanPath, href);
        let blobUrl = this.assetMap.get(resolved) || (await this.extractAsset(resolved));
        if (blobUrl) {
          el.setAttribute('href', blobUrl);
          if (el.hasAttribute('xlink:href')) {
            el.setAttribute('xlink:href', blobUrl);
          }
        }
      }
    }

    const svgUses = doc.querySelectorAll('use');
    for (let i = 0; i < svgUses.length; i++) {
      const el = svgUses[i];
      const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || el.getAttribute('xlink:href');

      // If external SVG file reference (e.g. "icons.svg#star")
      if (href && !href.startsWith('#') && !/^(https?:|\/\/|data:|blob:)/i.test(href)) {
        const { path: svgFile, hash } = PathResolver.splitUri(href);
        if (svgFile) {
          const resolved = PathResolver.resolvePath(cleanPath, svgFile);
          let blobUrl = this.assetMap.get(resolved) || (await this.extractAsset(resolved));
          if (blobUrl) {
            const finalHref = hash ? `${blobUrl}#${hash}` : blobUrl;
            el.setAttribute('href', finalHref);
            if (el.hasAttribute('xlink:href')) {
              el.setAttribute('xlink:href', finalHref);
            }
          }
        }
      }
    }

    // Step 5: Rewrite <link rel="stylesheet">
    const stylesheets = doc.querySelectorAll('link[rel~="stylesheet"]');
    for (let i = 0; i < stylesheets.length; i++) {
      const link = stylesheets[i];
      const href = link.getAttribute('href');

      if (href && !/^(https?:|\/\/|data:|blob:)/i.test(href)) {
        const resolved = PathResolver.resolvePath(cleanPath, href);
        let cssBlobUrl = this.assetMap.get(resolved);

        if (!cssBlobUrl) {
          cssBlobUrl = await this.processStylesheet(resolved);
        }

        if (cssBlobUrl) {
          link.setAttribute('href', cssBlobUrl);
        }
      }
    }

    // Step 6: Rewrite <audio>, <video>, and <source> elements
    const mediaElements = doc.querySelectorAll('audio, video, source');
    for (let i = 0; i < mediaElements.length; i++) {
      const media = mediaElements[i];
      const src = media.getAttribute('src');

      if (src && !/^(https?:|\/\/|data:|blob:)/i.test(src)) {
        const resolved = PathResolver.resolvePath(cleanPath, src);
        let blobUrl = this.assetMap.get(resolved) || (await this.extractAsset(resolved));
        if (blobUrl) {
          media.setAttribute('src', blobUrl);
        }
      }

      // Video poster image
      if (media.tagName.toLowerCase() === 'video') {
        const poster = media.getAttribute('poster');
        if (poster && !/^(https?:|\/\/|data:|blob:)/i.test(poster)) {
          const resolvedPoster = PathResolver.resolvePath(cleanPath, poster);
          let posterBlobUrl = this.assetMap.get(resolvedPoster) || (await this.extractAsset(resolvedPoster));
          if (posterBlobUrl) {
            media.setAttribute('poster', posterBlobUrl);
          }
        }
      }
    }

    // Step 7: Rewrite inline <style> elements and style="" attributes
    const inlineStyles = doc.querySelectorAll('style');
    for (let i = 0; i < inlineStyles.length; i++) {
      const styleEl = inlineStyles[i];
      if (styleEl.textContent) {
        styleEl.textContent = await this.rewriteCss(styleEl.textContent, cleanPath);
      }
    }

    const styledElements = doc.querySelectorAll('[style]');
    for (let i = 0; i < styledElements.length; i++) {
      const el = styledElements[i];
      const styleVal = el.getAttribute('style');
      if (styleVal && styleVal.includes('url(')) {
        const rewritten = await this.rewriteCss(styleVal, cleanPath);
        el.setAttribute('style', rewritten);
      }
    }

    // Step 8: Transform internal cross-chapter anchor links <a>
    const anchors = doc.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const href = a.getAttribute('href').trim();

      if (!href) continue;

      // External web links: secure with target="_blank" and rel="noopener noreferrer"
      if (/^(https?:|\/\/|mailto:|tel:)/i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        continue;
      }

      // Intra-chapter anchor: starts with #
      if (href.startsWith('#')) {
        const anchorId = href.slice(1);
        a.setAttribute('data-internal-anchor', anchorId);
        continue;
      }

      // Cross-chapter relative link: e.g. "ch02.xhtml" or "../text/ch02.xhtml#section-1"
      const { path: targetFile, hash } = PathResolver.splitUri(href);
      const resolvedChapter = PathResolver.resolvePath(cleanPath, targetFile);

      a.setAttribute('data-epub-href', resolvedChapter);
      if (hash) {
        a.setAttribute('data-epub-hash', hash);
      }
      a.setAttribute('data-chapter-link', 'true');
      // Neutralize native browser link navigation in the iframe
      a.setAttribute('href', `#reader-jump:${resolvedChapter}${hash ? '#' + hash : ''}`);
    }

    return doc;
  }

  /**
   * Revokes all created in-memory Blob URLs and clears the asset map.
   * Must be called when closing a book, opening another book, or deleting a book.
   */
  cleanup() {
    if (this.isCleanedUp) return;

    for (const blobUrl of this.blobUrls) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (_) {
        // Safe ignore
      }
    }

    this.assetMap.clear();
    this.blobUrls.clear();
    this.manifestByPath.clear();
    this.isCleanedUp = true;
  }
}

export default AssetExtractor;
