/**
 * js/parser/path-resolver.js
 * RFC 3986 relative path resolution, URI normalization, and Zip Slip defense
 * for EPUB container archives.
 */

/**
 * Normalizes an internal ZIP path:
 * - Converts backslashes to forward slashes.
 * - Strips leading slashes and trailing slashes.
 * - Resolves '.' and '..' segments.
 * - Enforces Zip Slip defense: bounds traversal at archive root.
 *
 * @param {string} path - Raw path
 * @returns {string} Normalized forward-slash path
 */
export function normalizePath(path) {
  if (!path || typeof path !== 'string') return '';

  // 1. Replace Windows backslashes with forward slashes
  let p = path.replace(/\\/g, '/');

  // 2. Strip leading slashes
  p = p.replace(/^\/+/, '');

  // 3. Process segments
  const segments = p.split('/');
  const stack = [];

  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      // Prevent escaping root directory
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(seg);
    }
  }

  return stack.join('/');
}

/**
 * Extracts the base directory from a file path.
 *
 * Examples:
 *   getBaseDir('OEBPS/content.opf') -> 'OEBPS'
 *   getBaseDir('OEBPS/text/ch01.xhtml') -> 'OEBPS/text'
 *   getBaseDir('content.opf') -> ''
 *   getBaseDir('') -> ''
 *
 * @param {string} filePath
 * @returns {string} Directory path without trailing slash
 */
export function getBaseDir(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastSlash = clean.lastIndexOf('/');
  return lastSlash === -1 ? '' : clean.slice(0, lastSlash);
}

/**
 * Safely decodes a URI component, catching URIError on malformed sequences.
 *
 * @param {string} str - e.g. "my%20file.xhtml" or "invalid%8.xhtml"
 * @returns {string} Decoded string or original if malformed
 */
export function safeDecodeURIComponent(str) {
  if (!str || typeof str !== 'string') return '';
  try {
    return decodeURIComponent(str);
  } catch (_) {
    return str;
  }
}

/**
 * Splits a URI into its path, query, and hash components.
 *
 * @param {string} uri - e.g. "text/ch01.xhtml?v=1#optical-mechanism"
 * @returns {{ path: string; query: string; hash: string }}
 */
export function splitUri(uri) {
  if (!uri || typeof uri !== 'string') {
    return { path: '', query: '', hash: '' };
  }

  let path = uri.trim();
  let hash = '';
  let query = '';

  const hashIdx = path.indexOf('#');
  if (hashIdx !== -1) {
    hash = path.slice(hashIdx + 1);
    path = path.slice(0, hashIdx);
  }

  const queryIdx = path.indexOf('?');
  if (queryIdx !== -1) {
    query = path.slice(queryIdx + 1);
    path = path.slice(0, queryIdx);
  }

  return { path, query, hash };
}

/**
 * Tests whether a URI is external or absolute (e.g. http://, https://, data:, blob:).
 *
 * @param {string} uri
 * @returns {boolean}
 */
export function isExternalUrl(uri) {
  if (!uri || typeof uri !== 'string') return false;
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(uri.trim());
}

/**
 * Joins a base directory and a relative path, normalizing the result.
 *
 * @param {string} baseDir - e.g. "OEBPS" or ""
 * @param {string} relativePath - e.g. "text/ch01.xhtml" or "../images/cover.jpg"
 * @returns {string} Normalized joined path
 */
export function joinPath(baseDir, relativePath) {
  if (!baseDir) return normalizePath(relativePath);
  if (!relativePath) return normalizePath(baseDir);
  return normalizePath(baseDir + '/' + relativePath);
}

/**
 * Resolves a relative href against a base file path or base directory.
 * URL-decodes the path and strips hash/query fragments.
 *
 * Examples:
 *   resolvePath('OEBPS/content.opf', 'text/ch01.xhtml') -> 'OEBPS/text/ch01.xhtml'
 *   resolvePath('OEBPS/text/ch01.xhtml', '../images/cover.jpg') -> 'OEBPS/images/cover.jpg'
 *   resolvePath('OEBPS', 'images/cover.svg', true) -> 'OEBPS/images/cover.svg'
 *
 * @param {string} baseFileOrDir - Full zip path of base file or directory
 * @param {string} relativeHref - Relative href from document
 * @param {boolean} [isDir=false] - True if baseFileOrDir is already a directory
 * @returns {string} Resolved normalized zip path
 */
export function resolvePath(baseFileOrDir, relativeHref, isDir = false) {
  if (!relativeHref) return '';

  // 1. Separate path from query and hash
  const { path: rawPath } = splitUri(relativeHref);

  // 2. Decode percent-encoded sequences
  const decoded = safeDecodeURIComponent(rawPath);

  // 3. Absolute zip paths (leading slash) resolve from archive root
  if (decoded.startsWith('/')) {
    return normalizePath(decoded);
  }

  // 4. Resolve relative to base directory
  const baseDir = isDir ? normalizePath(baseFileOrDir) : getBaseDir(baseFileOrDir);
  return joinPath(baseDir, decoded);
}

/**
 * Resolves a relative URI, preserving and decoding any hash/query fragments.
 *
 * @param {string} baseFileOrDir
 * @param {string} relativeUri
 * @param {boolean} [isDir=false]
 * @returns {{ fullPath: string; hash: string; query: string; originalUri: string }}
 */
export function resolveUri(baseFileOrDir, relativeUri, isDir = false) {
  if (!relativeUri) {
    return { fullPath: '', hash: '', query: '', originalUri: '' };
  }

  const { path: rawPath, query, hash } = splitUri(relativeUri);
  const fullPath = resolvePath(baseFileOrDir, rawPath, isDir);

  return {
    fullPath,
    hash: safeDecodeURIComponent(hash),
    query,
    originalUri: relativeUri
  };
}

/**
 * Looks up a file inside a JSZip instance with multi-stage fallback:
 * 1. Exact match
 * 2. Normalized path
 * 3. URL-decoded path
 * 4. URI-encoded path
 * 5. Case-insensitive and decoded scan across archive keys
 *
 * @param {any} zip - JSZip instance
 * @param {string} targetPath - Target path to locate
 * @returns {any|null} Matching JSZipObject or null
 */
export function findZipEntry(zip, targetPath) {
  if (!zip || !targetPath) return null;

  // 1. Direct lookup
  let entry = zip.file(targetPath);
  if (entry) return entry;

  // 2. Normalized lookup
  const norm = normalizePath(targetPath);
  entry = zip.file(norm);
  if (entry) return entry;

  // 3. Decoded lookup
  const decoded = safeDecodeURIComponent(norm);
  if (decoded !== norm) {
    entry = zip.file(decoded);
    if (entry) return entry;
  }

  // 4. URI-encoded lookup
  const encoded = encodeURI(decoded);
  if (encoded !== decoded && encoded !== norm) {
    entry = zip.file(encoded);
    if (entry) return entry;
  }

  // 5. Case-insensitive and percent-decoded lookup across archive keys
  const lowerNorm = norm.toLowerCase();
  const lowerDecoded = decoded.toLowerCase();
  const fileKeys = Object.keys(zip.files || {});

  for (let i = 0; i < fileKeys.length; i++) {
    const key = fileKeys[i];
    const lowerKey = key.toLowerCase();
    const lowerDecodedKey = safeDecodeURIComponent(key).toLowerCase();

    if (
      lowerKey === lowerNorm ||
      lowerKey === lowerDecoded ||
      lowerDecodedKey === lowerNorm ||
      lowerDecodedKey === lowerDecoded
    ) {
      return zip.files[key];
    }

    // Also support keys with Windows backslashes or leading slashes
    if (key.includes('\\') || key.startsWith('/') || key.startsWith('./')) {
      const normKey = normalizePath(key);
      const lowerNormKey = normKey.toLowerCase();
      const lowerDecodedNormKey = safeDecodeURIComponent(normKey).toLowerCase();
      if (
        lowerNormKey === lowerNorm ||
        lowerNormKey === lowerDecoded ||
        lowerDecodedNormKey === lowerNorm ||
        lowerDecodedNormKey === lowerDecoded
      ) {
        return zip.files[key];
      }
    }
  }

  return null;
}

// Aliases for cross-module compatibility
export const normalize = normalizePath;
export const getDirectory = getBaseDir;
export const resolve = resolvePath;
export const splitUrl = splitUri;

export const PathResolver = {
  normalizePath,
  normalize,
  getBaseDir,
  getDirectory,
  safeDecodeURIComponent,
  splitUri,
  splitUrl,
  isExternalUrl,
  joinPath,
  resolvePath,
  resolve,
  resolveUri,
  findZipEntry
};

export default PathResolver;
