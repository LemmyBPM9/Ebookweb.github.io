/**
 * js/parser/mobi-parser.js
 * Pure Client-Side MOBI / AZW (PalmDOC / Mobipocket) Parser.
 *
 * Capabilities:
 * - Validates Palm Database (PDB) header and BOOKMOBI / TEXtREAd signature
 * - Parses Record 0 (PalmDOC header, MOBI header, EXTH metadata records)
 * - Decompresses PalmDOC LZ77 compressed text streams (handling trailing extra data flags)
 * - Decodes UTF-8 and Windows-1252 text encodings
 * - Splits chapters on <mbp:pagebreak> or <h1> boundaries and generates hierarchical TOC
 * - Sanitizes all extracted HTML through DOMSanitizer
 */

import { DOMSanitizer } from './asset-extractor.js';

/**
 * Decompresses a single PalmDOC LZ77 compressed record into a Uint8Array byte array.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function decompressPalmDocRecord(bytes) {
  const out = [];
  let i = 0;
  const len = bytes.length;

  while (i < len) {
    const b = bytes[i++];
    if (b === 0x00) {
      out.push(0x00);
    } else if (b >= 0x01 && b <= 0x08) {
      for (let k = 0; k < b && i < len; k++) {
        out.push(bytes[i++]);
      }
    } else if (b >= 0x09 && b <= 0x7F) {
      out.push(b);
    } else if (b >= 0x80 && b <= 0xBF) {
      if (i >= len) break;
      const b2 = bytes[i++];
      const pair = (b << 8) | b2;
      const distance = (pair >> 3) & 0x7FF;
      const copyLen = (pair & 0x07) + 3;
      const start = out.length - distance;
      for (let k = 0; k < copyLen; k++) {
        const srcIdx = start + k;
        out.push(srcIdx >= 0 && srcIdx < out.length ? out[srcIdx] : 0x20);
      }
    } else if (b >= 0xC0) {
      out.push(0x20);
      out.push(b ^ 0x80);
    }
  }

  return new Uint8Array(out);
}

/**
 * Strips trailing multibyte overlap and variable-width extra data entries from a MOBI text record.
 * @param {Uint8Array} record
 * @param {number} extraFlags
 * @returns {Uint8Array}
 */
function stripTrailingRecordBytes(record, extraFlags) {
  if (!extraFlags || record.length === 0) return record;
  let end = record.length;

  // Bits 1..15: variable-length trailing entries
  for (let bit = 15; bit >= 1; bit--) {
    if (extraFlags & (1 << bit)) {
      let size = 0;
      let shift = 0;
      let pos = end - 1;
      while (pos >= 0 && shift < 28) {
        const b = record[pos--];
        size |= (b & 0x7F) << shift;
        if (b & 0x80) break;
        shift += 7;
      }
      if (size > 0 && size <= end) {
        end -= size;
      }
    }
  }

  // Bit 0: multibyte character overlap bytes
  if (extraFlags & 1) {
    if (end > 0) {
      const overlap = (record[end - 1] & 0x03) + 1;
      if (overlap <= end) {
        end -= overlap;
      }
    }
  }

  return record.subarray(0, end);
}

export class MobiParser {
  /**
   * Parses a MOBI / AZW File, Blob, or ArrayBuffer into a unified ParsedBook contract.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array} input
   * @param {string} [filename]
   * @returns {Promise<object>} ParsedBook
   */
  static async parse(input, filename = 'book.mobi') {
    let buffer;
    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (ArrayBuffer.isView(input)) {
      buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    } else if (input && typeof input.arrayBuffer === 'function') {
      buffer = await input.arrayBuffer();
      if (input.name && filename === 'book.mobi') {
        filename = input.name;
      }
    } else {
      throw new Error('Invalid MOBI input: Expected File, Blob, or ArrayBuffer.');
    }

    if (!buffer || buffer.byteLength < 78) {
      throw new Error('Not a valid MOBI file: File is too small to contain a PDB header.');
    }

    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // 1. Validate PDB Type & Creator at offset 60..68 ('BOOKMOBI' or 'TEXtREAd')
    const typeCreator = String.fromCharCode(...bytes.subarray(60, 68));
    if (typeCreator !== 'BOOKMOBI' && typeCreator !== 'TEXtREAd') {
      throw new Error(`Not a valid MOBI/AZW file: Invalid PDB signature "${typeCreator}".`);
    }

    // Extract fallback PDB database name (bytes 0..31)
    let pdbTitle = '';
    for (let i = 0; i < 32 && bytes[i] !== 0; i++) {
      pdbTitle += String.fromCharCode(bytes[i]);
    }
    pdbTitle = pdbTitle.trim();

    const numRecords = view.getUint16(76, false);
    if (numRecords < 2 || 78 + numRecords * 8 > buffer.byteLength) {
      throw new Error('Corrupted MOBI file: Invalid PDB record count.');
    }

    const recordOffsets = [];
    for (let r = 0; r < numRecords; r++) {
      const offset = view.getUint32(78 + r * 8, false);
      if (offset >= buffer.byteLength) {
        throw new Error(`Corrupted MOBI file: Record ${r} offset exceeds file length.`);
      }
      recordOffsets.push(offset);
    }

    const getRecordBytes = (index) => {
      const start = recordOffsets[index];
      const end = index + 1 < numRecords ? recordOffsets[index + 1] : buffer.byteLength;
      if (end < start) return new Uint8Array(0);
      return bytes.subarray(start, end);
    };

    // 2. Parse Record 0 (PalmDOC Header + MOBI Header + EXTH Header)
    const rec0 = getRecordBytes(0);
    if (rec0.length < 16) {
      throw new Error('Corrupted MOBI file: Record 0 is truncated.');
    }
    const rec0View = new DataView(rec0.buffer, rec0.byteOffset, rec0.byteLength);

    const compression = rec0View.getUint16(0, false); // 1 = None, 2 = PalmDOC LZ77
    const textRecordCount = rec0View.getUint16(8, false);
    const encryptionType = rec0View.getUint16(12, false);

    if (encryptionType !== 0) {
      throw new Error('DRM-encrypted MOBI files are not supported.');
    }
    if (compression !== 1 && compression !== 2) {
      throw new Error(`Unsupported MOBI compression type: ${compression}.`);
    }

    let encoding = 65001; // Default UTF-8
    let fullName = '';
    let author = '';
    let description = '';
    let extraFlags = 0;

    if (rec0.length >= 24) {
      const mobiMagic = String.fromCharCode(...rec0.subarray(16, 20));
      if (mobiMagic === 'MOBI') {
        const mobiHeaderLen = rec0View.getUint32(20, false);
        if (rec0.length >= 32) {
          encoding = rec0View.getUint32(28, false);
        }
        if (rec0.length >= 92) {
          const fullNameOffset = rec0View.getUint32(84, false);
          const fullNameLength = rec0View.getUint32(88, false);
          if (fullNameOffset > 0 && fullNameLength > 0 && fullNameOffset + fullNameLength <= rec0.length) {
            const decoder = new TextDecoder(encoding === 1252 ? 'windows-1252' : 'utf-8', { fatal: false });
            fullName = decoder.decode(rec0.subarray(fullNameOffset, fullNameOffset + fullNameLength)).trim();
          }
        }
        if (mobiHeaderLen >= 242 && rec0.length >= 244) {
          extraFlags = rec0View.getUint16(242, false);
        }

        // Parse EXTH metadata if present (bit 6 of exthFlags at offset 128)
        if (rec0.length >= 132) {
          const exthFlags = rec0View.getUint32(128, false);
          const exthOffset = 16 + mobiHeaderLen;
          if ((exthFlags & 0x40) && exthOffset + 12 <= rec0.length) {
            const exthMagic = String.fromCharCode(...rec0.subarray(exthOffset, exthOffset + 4));
            if (exthMagic === 'EXTH') {
              const exthCount = rec0View.getUint32(exthOffset + 8, false);
              let pos = exthOffset + 12;
              const decoder = new TextDecoder(encoding === 1252 ? 'windows-1252' : 'utf-8', { fatal: false });
              for (let e = 0; e < exthCount && pos + 8 <= rec0.length; e++) {
                const recType = rec0View.getUint32(pos, false);
                const recLen = rec0View.getUint32(pos + 4, false);
                if (recLen < 8 || pos + recLen > rec0.length) break;
                const valBytes = rec0.subarray(pos + 8, pos + recLen);
                if (recType === 100 && !author) {
                  author = decoder.decode(valBytes).trim();
                } else if (recType === 503 && !fullName) {
                  fullName = decoder.decode(valBytes).trim();
                } else if (recType === 103 && !description) {
                  description = decoder.decode(valBytes).trim();
                }
                pos += recLen;
              }
            }
          }
        }
      }
    }

    // 3. Decompress Text Records (1 .. textRecordCount)
    const maxRecordIdx = Math.min(numRecords - 1, Math.max(1, textRecordCount));
    const decompressedChunks = [];
    let totalBytes = 0;

    for (let r = 1; r <= maxRecordIdx; r++) {
      let rawRecord = getRecordBytes(r);
      if (rawRecord.length === 0) continue;

      // Skip EOF magic record (\xe9\x8e\r\n) or FLIS/FCIS records
      if (rawRecord.length === 4 && rawRecord[0] === 0xE9 && rawRecord[1] === 0x8E) {
        break;
      }

      if (extraFlags > 0) {
        rawRecord = stripTrailingRecordBytes(rawRecord, extraFlags);
      }

      const chunk = compression === 2 ? decompressPalmDocRecord(rawRecord) : rawRecord;
      decompressedChunks.push(chunk);
      totalBytes += chunk.length;
    }

    const combinedBytes = new Uint8Array(totalBytes);
    let writeOffset = 0;
    for (const chunk of decompressedChunks) {
      combinedBytes.set(chunk, writeOffset);
      writeOffset += chunk.length;
    }

    const decoderLabel = encoding === 1252 ? 'windows-1252' : 'utf-8';
    const fullHtmlText = new TextDecoder(decoderLabel, { fatal: false }).decode(combinedBytes);

    if (!fullHtmlText || !fullHtmlText.trim()) {
      throw new Error('Corrupted MOBI file: Decompressed text stream is empty.');
    }

    // 4. Extract title & author from HTML if not in MOBI/EXTH headers
    const fallbackTitle = (filename || 'MOBI Book')
      .replace(/\.(mobi|azw|azw3)$/i, '')
      .trim() || 'MOBI Book';

    if (!fullName) {
      const htmlTitleMatch = fullHtmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (htmlTitleMatch && htmlTitleMatch[1].trim()) {
        fullName = htmlTitleMatch[1].trim();
      }
    }
    const cleanTitle = fullName || pdbTitle || fallbackTitle;

    if (!author) {
      const bylineMatch = fullHtmlText.match(/<p[^>]*>\s*By\s+([^<]+)<\/p>/i);
      if (bylineMatch && bylineMatch[1].trim()) {
        author = bylineMatch[1].trim();
      } else {
        author = 'Unknown Author';
      }
    }

    // Extract inner <body> content if present
    const bodyMatch = fullHtmlText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : fullHtmlText;

    // 5. Split chapters on <mbp:pagebreak/> or <h1> tags
    let rawChapters = bodyHtml
      .split(/<mbp:pagebreak\s*\/?>/i)
      .map(s => s.trim())
      .filter(Boolean);

    if (rawChapters.length === 1 && /<h1\b/i.test(rawChapters[0])) {
      const h1Split = rawChapters[0]
        .split(/(?=<h1\b)/i)
        .map(s => s.trim())
        .filter(Boolean);
      if (h1Split.length > 1) {
        rawChapters = h1Split;
      }
    }

    if (rawChapters.length === 0) {
      rawChapters = [bodyHtml];
    }

    const spine = [];
    const toc = [];
    const chapterHtmlMap = new Map();
    const domParser = new DOMParser();

    for (let idx = 0; idx < rawChapters.length; idx++) {
      const rawCh = rawChapters[idx];
      const fullPath = `mobi-ch-${idx + 1}.html`;

      const headingMatch = rawCh.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      const headingText = headingMatch
        ? headingMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';
      const chapterTitle = headingText || `Chapter ${idx + 1}`;

      spine.push({
        id: `mobi-ch-${idx + 1}`,
        href: fullPath,
        fullPath,
        mediaType: 'text/html',
        isLinear: true,
        title: chapterTitle
      });

      toc.push({
        id: `toc-mobi-${idx + 1}`,
        title: chapterTitle,
        label: chapterTitle,
        href: fullPath,
        fullPath,
        hash: '',
        spineIndex: idx,
        children: []
      });

      const wrappedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${chapterTitle}</title>
</head>
<body>
  <article class="mobi-chapter">
    ${rawCh}
  </article>
</body>
</html>`;

      chapterHtmlMap.set(fullPath, wrappedHtml);
    }

    return {
      format: 'mobi',
      metadata: {
        title: cleanTitle,
        author,
        language: 'en',
        identifier: `mobi-${filename}`,
        description
      },
      coverBlobUrl: null,
      spine,
      toc,
      assetMap: new Map(),

      async getChapterDocument(fullPath) {
        const rawHtml = chapterHtmlMap.get(fullPath) || chapterHtmlMap.values().next().value || '<html><body></body></html>';
        const doc = domParser.parseFromString(rawHtml, 'text/html');
        DOMSanitizer.sanitizeDocument(doc);
        return doc;
      },

      cleanup() {
        chapterHtmlMap.clear();
      }
    };
  }
}

export default MobiParser;
