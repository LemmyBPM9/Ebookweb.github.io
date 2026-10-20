/**
 * js/parser/epub-parser.js
 * Master EPUB Parser Coordinator.
 * Coordinates JSZip, OpfParser, TocParser, and AssetExtractor
 * to fulfill the ParsedEpub interface contract in PROJECT.md:88-99.
 */

import { PathResolver } from './path-resolver.js';
import { OpfParser } from './opf-parser.js';
import { TocParser } from './toc-parser.js';
import { AssetExtractor } from './asset-extractor.js';

/**
 * Accesses standalone JSZip from global window, globalThis, or environment.
 * @returns {typeof JSZip}
 */
export function getJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return window.JSZip;
  }
  if (typeof globalThis !== 'undefined' && globalThis.JSZip) {
    return globalThis.JSZip;
  }
  if (typeof global !== 'undefined' && global.JSZip) {
    return global.JSZip;
  }
  try {
    if (typeof require === 'function') {
      const jszip = require('../../vendor/jszip.min.js');
      if (jszip) return jszip;
    }
  } catch (_) {}
  throw new Error('JSZip is not loaded. Please ensure vendor/jszip.min.js is included.');
}

/**
 * Validates ZIP archive magic bytes (0x50, 0x4B / 'PK').
 * Throws a descriptive error immediately if the buffer is not a ZIP file.
 *
 * @param {Blob|File|ArrayBuffer|Uint8Array} fileOrBuffer
 * @returns {Promise<void>}
 */
export async function validateZipMagicBytes(fileOrBuffer) {
  let bytes;

  if (typeof Blob !== 'undefined' && fileOrBuffer instanceof Blob) {
    const slice = await fileOrBuffer.slice(0, 4).arrayBuffer();
    bytes = new Uint8Array(slice);
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(fileOrBuffer, 0, Math.min(4, fileOrBuffer.byteLength));
  } else if (fileOrBuffer instanceof Uint8Array) {
    bytes = fileOrBuffer.subarray(0, Math.min(4, fileOrBuffer.length));
  } else {
    throw new TypeError('EpubParser.parse: Expected Blob, File, ArrayBuffer, or Uint8Array.');
  }

  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
    throw new Error('Failed to open EPUB: The file is not a valid ZIP archive.');
  }
}

export class EpubParser {
  /**
   * Main entry point conforming to PROJECT.md:88-99.
   * Parses an EPUB file and returns a complete ParsedEpub instance.
   *
   * @param {Blob|File|ArrayBuffer|Uint8Array} fileOrBuffer
   * @returns {Promise<object>} ParsedEpub contract object
   */
  static async parse(fileOrBuffer) {
    if (!fileOrBuffer) {
      throw new TypeError('EpubParser.parse: fileOrBuffer must be provided.');
    }

    // 1. Fast magic-byte pre-validation
    await validateZipMagicBytes(fileOrBuffer);

    // 2. Open ZIP container with standalone JSZip
    const JSZip = getJSZip();
    let zip;
    try {
      zip = await JSZip.loadAsync(fileOrBuffer);
    } catch (err) {
      throw new Error(`Failed to open EPUB: ${err.message || 'Corrupted archive.'}`);
    }

    // 3. Locate and extract OPF package document
    const opfPath = await OpfParser.findOpfPath(zip);
    const opfEntry = PathResolver.findZipEntry(zip, opfPath);
    if (!opfEntry) {
      throw new Error(`Invalid EPUB: OPF file declared at "${opfPath}" not found in archive.`);
    }
    const opfXmlText = await opfEntry.async('string');

    // 4. Parse OPF package XML
    const opfData = OpfParser.parseOpf(opfXmlText, opfPath);

    // 5. Initialize AssetExtractor
    const assetExtractor = new AssetExtractor(zip, opfData.manifest);

    // 6. Extract Cover Image Blob URL
    let coverBlobUrl = null;
    if (opfData.coverItem) {
      try {
        coverBlobUrl = await assetExtractor.extractAsset(opfData.coverItem.fullPath);
      } catch (err) {
        console.warn('EpubParser: Cover extraction failed, continuing without cover:', err);
        coverBlobUrl = null;
      }
    }

    // 7. Parse Table of Contents (EPUB 3 Nav Doc -> EPUB 2 NCX -> Spine Fallback)
    let toc = [];
    try {
      toc = await TocParser.parse({
        zip,
        manifest: opfData.manifest,
        spine: opfData.spine,
        spineTocId: opfData.tocReferences.spineTocId,
        opfPath: opfData.opfPath,
        epubVersion: opfData.packageVersion,
        resolvePath: (base, rel) => PathResolver.resolvePath(base, rel)
      });
    } catch (err) {
      console.warn('EpubParser: TOC parsing failed, generating synthetic spine TOC:', err);
      toc = opfData.spine.map((s, idx) => ({
        id: s.id || `toc-${idx}`,
        title: `Chapter ${idx + 1}`,
        href: s.href,
        fullPath: s.fullPath,
        hash: '',
        children: []
      }));
    }

    // 8. Assemble and return conformant ParsedEpub object
    return {
      metadata: {
        title: opfData.metadata.title,
        author: opfData.metadata.author,
        language: opfData.metadata.language,
        identifier: opfData.metadata.identifier,
        description: opfData.metadata.description,
        publisher: opfData.metadata.publisher,
        date: opfData.metadata.date
      },
      coverBlobUrl,
      spine: opfData.spine.map(s => ({
        id: s.id,
        href: s.href,
        fullPath: s.fullPath,
        isLinear: s.isLinear
      })),
      toc,
      getChapterDocument: (fullPath) => assetExtractor.getChapterDocument(fullPath),
      assetMap: assetExtractor.assetMap,
      cleanup: () => {
        try {
          assetExtractor.cleanup();
        } catch (_) {}
        if (coverBlobUrl && !assetExtractor.assetMap.has(opfData.coverItem?.fullPath)) {
          try {
            URL.revokeObjectURL(coverBlobUrl);
          } catch (_) {}
        }
      }
    };
  }
}

export default EpubParser;
