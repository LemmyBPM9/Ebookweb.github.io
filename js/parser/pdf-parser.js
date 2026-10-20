/**
 * js/parser/pdf-parser.js
 * Pure Client-Side PDF 1.4 - 1.7 Parser for Dual-Mode Reading (Reflowable Text & Visual Canvas).
 *
 * Capabilities:
 * - Validates PDF magic signature (%PDF-) and trailer (%%EOF)
 * - Extracts Document Info metadata (/Title, /Author, /Subject)
 * - Parses /Type /Page objects, /MediaBox dimensions, and /Contents streams
 * - Supports uncompressed and /FlateDecode streams (via native DecompressionStream)
 * - Parses BT...ET text blocks (Tf, Td, TD, Tm, T*, Tj, TJ, ', ") with coordinates & font scale
 * - Produces both semantic sanitized HTML chapters (Reflowable Mode) and layout items (Visual Mode)
 */

import { DOMSanitizer } from './asset-extractor.js';

/**
 * Decodes a PDF literal string (inside parentheses) handling escape sequences and octal codes.
 * @param {string} raw
 * @returns {string}
 */
function decodePdfLiteralString(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === 'n') { out += '\n'; i += 2; continue; }
      if (next === 'r') { out += '\r'; i += 2; continue; }
      if (next === 't') { out += '\t'; i += 2; continue; }
      if (next === 'b') { out += '\b'; i += 2; continue; }
      if (next === 'f') { out += '\f'; i += 2; continue; }
      if (next === '(' || next === ')' || next === '\\') { out += next; i += 2; continue; }
      if (next === '\r' || next === '\n') {
        i += (next === '\r' && raw[i + 2] === '\n') ? 3 : 2;
        continue;
      }
      if (next >= '0' && next <= '7') {
        let octal = next;
        let adv = 2;
        if (i + 2 < raw.length && raw[i + 2] >= '0' && raw[i + 2] <= '7') {
          octal += raw[i + 2];
          adv++;
          if (i + 3 < raw.length && raw[i + 3] >= '0' && raw[i + 3] <= '7') {
            octal += raw[i + 3];
            adv++;
          }
        }
        out += String.fromCharCode(parseInt(octal, 8));
        i += adv;
        continue;
      }
      out += next;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Decodes a PDF hex string `<48656C6C6F>`.
 * @param {string} hex
 * @returns {string}
 */
function decodePdfHexString(hex) {
  const clean = hex.replace(/\s+/g, '');
  const padded = clean.length % 2 === 1 ? clean + '0' : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.slice(i, i + 2), 16) || 0;
  }
  // Check UTF-16BE BOM (0xFE 0xFF)
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    let str = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      str += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return str;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * Decompresses FlateDecode bytes using browser DecompressionStream if available.
 * @param {Uint8Array} compressedBytes
 * @returns {Promise<string>}
 */
async function decompressFlateStream(compressedBytes) {
  if (typeof DecompressionStream === 'undefined') {
    return new TextDecoder('latin1').decode(compressedBytes);
  }
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      writer.write(compressedBytes);
      writer.close();
      const res = new Response(ds.readable);
      const buf = await res.arrayBuffer();
      return new TextDecoder('latin1').decode(new Uint8Array(buf));
    } catch (_) {
      // Try next format
    }
  }
  return new TextDecoder('latin1').decode(compressedBytes);
}

/**
 * Parses a PDF content stream (`BT ... ET`) into positioned text items.
 * @param {string} streamText
 * @param {number} pageHeight
 * @returns {Array<{ text: string, x: number, y: number, fontSize: number, isHeading: boolean }>}
 */
function parseContentStreamText(streamText, pageHeight = 792) {
  const items = [];
  const btBlocks = streamText.match(/BT[\s\S]*?ET/g) || [streamText];

  for (const block of btBlocks) {
    let curX = 72;
    let curY = pageHeight - 72;
    let fontSize = 12;
    let leading = 16;

    // Tokenize lines/commands within the BT..ET block
    const lines = block.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line === 'BT' || line === 'ET') continue;

      // Font size: /F1 22 Tf
      const tfMatch = line.match(/\/[A-Za-z0-9_.-]+\s+([+-]?\d+(?:\.\d+)?)\s+Tf/);
      if (tfMatch) {
        fontSize = Math.max(6, parseFloat(tfMatch[1]) || 12);
      }

      // Text leading: 24 TL
      const tlMatch = line.match(/([+-]?\d+(?:\.\d+)?)\s+TL/);
      if (tlMatch) {
        leading = Math.abs(parseFloat(tlMatch[1])) || 16;
      }

      // Text offset: tx ty Td or tx ty TD
      const tdMatch = line.match(/([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+T([dD])/);
      if (tdMatch) {
        const dx = parseFloat(tdMatch[1]) || 0;
        const dy = parseFloat(tdMatch[2]) || 0;
        curX += dx;
        curY += dy;
        if (tdMatch[3] === 'D' && dy !== 0) {
          leading = Math.abs(dy);
        }
      }

      // Text matrix: a b c d e f Tm
      const tmMatch = line.match(/([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+Tm/);
      if (tmMatch) {
        const scaleY = Math.abs(parseFloat(tmMatch[4])) || 1;
        if (scaleY > 1 && fontSize === 12) {
          fontSize = scaleY;
        }
        curX = parseFloat(tmMatch[5]) || 72;
        curY = parseFloat(tmMatch[6]) || (pageHeight - 72);
      }

      // Next line: T*
      if (/\bT\*/.test(line)) {
        curY -= leading;
      }

      // Extract text from Tj, ', " or TJ array
      let extractedText = '';

      // Array TJ: [(text) -20 (more)] TJ
      const tjArrayMatch = line.match(/\[([\s\S]*?)\]\s*TJ/);
      if (tjArrayMatch) {
        const inner = tjArrayMatch[1];
        const parts = [];
        const tokenRe = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>/g;
        let m;
        while ((m = tokenRe.exec(inner)) !== null) {
          if (m[0].startsWith('(')) {
            parts.push(decodePdfLiteralString(m[0].slice(1, -1)));
          } else if (m[1]) {
            parts.push(decodePdfHexString(m[1]));
          }
        }
        extractedText = parts.join('');
      } else {
        // Single string Tj or ' or "
        const tjSingleMatch = line.match(/\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/);
        if (tjSingleMatch) {
          extractedText = decodePdfLiteralString(tjSingleMatch[1]);
        } else {
          const tjHexMatch = line.match(/<([0-9A-Fa-f\s]+)>\s*Tj/);
          if (tjHexMatch) {
            extractedText = decodePdfHexString(tjHexMatch[1]);
          }
        }
      }

      const trimmed = extractedText.trim();
      if (trimmed) {
        items.push({
          text: trimmed,
          x: Math.max(24, Math.min(540, curX)),
          y: curY,
          fontSize,
          isHeading: fontSize >= 16 || /^(?:chapter|part|section)\s+\d+/i.test(trimmed)
        });
      }
    }
  }

  return items;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class PdfParser {
  /**
   * Parses a PDF File, Blob, or ArrayBuffer into a unified ParsedBook object.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array} input
   * @param {string} [filename]
   * @returns {Promise<object>} ParsedBook
   */
  static async parse(input, filename = 'document.pdf') {
    let buffer;
    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (ArrayBuffer.isView(input)) {
      buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    } else if (input && typeof input.arrayBuffer === 'function') {
      buffer = await input.arrayBuffer();
      if (input.name && filename === 'document.pdf') {
        filename = input.name;
      }
    } else {
      throw new Error('Invalid PDF input: Expected File, Blob, or ArrayBuffer.');
    }

    if (!buffer || buffer.byteLength < 16) {
      throw new Error('Corrupted or empty PDF file.');
    }

    const bytes = new Uint8Array(buffer);
    const rawLatin1 = new TextDecoder('latin1').decode(bytes);

    // 1. Validate PDF Header (%PDF- within first 1024 bytes, followed by version digit)
    const headerRegion = rawLatin1.slice(0, 1024);
    if (!/%PDF-\d\.\d/.test(headerRegion)) {
      throw new Error('Not a valid PDF document: Missing %PDF-1.x header.');
    }

    // Validate %%EOF marker
    if (!rawLatin1.includes('%%EOF')) {
      throw new Error('Corrupted PDF document: Missing %%EOF trailer.');
    }

    // 2. Parse indirect objects `N 0 obj ... endobj`
    const objects = new Map();
    const objRegex = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
    let match;
    while ((match = objRegex.exec(rawLatin1)) !== null) {
      const objNum = parseInt(match[1], 10);
      const body = match[3];
      const bodyStartOffset = match.index + match[0].indexOf(body);
      objects.set(objNum, { objNum, body, bodyStartOffset });
    }

    if (objects.size === 0) {
      throw new Error('Corrupted PDF document: No valid PDF objects found.');
    }

    // 3. Extract Metadata from /Info object or object dictionaries
    const fallbackTitle = (filename || 'PDF Document')
      .replace(/\.pdf$/i, '')
      .trim() || 'PDF Document';

    let title = '';
    let author = '';
    let description = '';

    for (const { body } of objects.values()) {
      if (!title) {
        const titleLiteral = body.match(/\/Title\s*\(((?:\\.|[^\\()])*)\)/);
        const titleHex = body.match(/\/Title\s*<([0-9A-Fa-f\s]+)>/);
        if (titleLiteral) title = decodePdfLiteralString(titleLiteral[1]).trim();
        else if (titleHex) title = decodePdfHexString(titleHex[1]).trim();
      }
      if (!author) {
        const authorLiteral = body.match(/\/Author\s*\(((?:\\.|[^\\()])*)\)/);
        const authorHex = body.match(/\/Author\s*<([0-9A-Fa-f\s]+)>/);
        if (authorLiteral) author = decodePdfLiteralString(authorLiteral[1]).trim();
        else if (authorHex) author = decodePdfHexString(authorHex[1]).trim();
      }
      if (!description) {
        const subjLiteral = body.match(/\/Subject\s*\(((?:\\.|[^\\()])*)\)/);
        if (subjLiteral) description = decodePdfLiteralString(subjLiteral[1]).trim();
      }
    }

    // Helper to extract decoded stream text from a stream object
    const extractStreamText = async (objNum) => {
      const obj = objects.get(objNum);
      if (!obj) return '';
      const streamMarkerIdx = obj.body.indexOf('stream');
      const endStreamIdx = obj.body.lastIndexOf('endstream');
      if (streamMarkerIdx === -1 || endStreamIdx === -1 || endStreamIdx <= streamMarkerIdx) {
        return '';
      }

      let dataStart = streamMarkerIdx + 6;
      if (obj.body[dataStart] === '\r' && obj.body[dataStart + 1] === '\n') {
        dataStart += 2;
      } else if (obj.body[dataStart] === '\n' || obj.body[dataStart] === '\r') {
        dataStart += 1;
      }

      let dataEnd = endStreamIdx;
      if (obj.body[dataEnd - 1] === '\n') dataEnd--;
      if (obj.body[dataEnd - 1] === '\r') dataEnd--;

      const dictPart = obj.body.slice(0, streamMarkerIdx);
      const isFlate = /\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dictPart);

      if (isFlate) {
        const absStart = obj.bodyStartOffset + dataStart;
        const absEnd = obj.bodyStartOffset + dataEnd;
        const slice = bytes.subarray(absStart, absEnd);
        return await decompressFlateStream(slice);
      }

      return obj.body.slice(dataStart, dataEnd);
    };

    // 4. Locate all /Type /Page objects (excluding /Type /Pages)
    const pageObjects = [];
    for (const [objNum, obj] of objects.entries()) {
      if (/\/Type\s*\/Page\b(?!s)/.test(obj.body)) {
        pageObjects.push({ objNum, body: obj.body });
      }
    }

    // Extract text items per page
    const pages = [];
    for (let i = 0; i < pageObjects.length; i++) {
      const pageObj = pageObjects[i];
      let width = 612;
      let height = 792;
      const mediaBoxMatch = pageObj.body.match(/\/MediaBox\s*\[\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\]/);
      if (mediaBoxMatch) {
        width = Math.abs((parseFloat(mediaBoxMatch[3]) || 612) - (parseFloat(mediaBoxMatch[1]) || 0));
        height = Math.abs((parseFloat(mediaBoxMatch[4]) || 792) - (parseFloat(mediaBoxMatch[2]) || 0));
      }

      // Resolve /Contents reference(s)
      const contentRefs = [];
      const arrayContentsMatch = pageObj.body.match(/\/Contents\s*\[([\s\S]*?)\]/);
      if (arrayContentsMatch) {
        const refRe = /(\d+)\s+\d+\s+R/g;
        let rm;
        while ((rm = refRe.exec(arrayContentsMatch[1])) !== null) {
          contentRefs.push(parseInt(rm[1], 10));
        }
      } else {
        const singleContentMatch = pageObj.body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
        if (singleContentMatch) {
          contentRefs.push(parseInt(singleContentMatch[1], 10));
        }
      }

      let combinedStream = '';
      for (const refNum of contentRefs) {
        combinedStream += (await extractStreamText(refNum)) + '\n';
      }

      const items = parseContentStreamText(combinedStream, height);
      pages.push({
        pageNumber: i + 1,
        width,
        height,
        items
      });
    }

    // Fallback: if no /Type /Page matched or streams were inline, scan all stream objects
    if (pages.length === 0) {
      let pageNum = 1;
      for (const [objNum, obj] of objects.entries()) {
        if (obj.body.includes('stream') && obj.body.includes('BT')) {
          const streamText = await extractStreamText(objNum);
          const items = parseContentStreamText(streamText, 792);
          if (items.length > 0) {
            pages.push({
              pageNumber: pageNum++,
              width: 612,
              height: 792,
              items
            });
          }
        }
      }
    }

    // Ensure at least 1 page exists if valid PDF structure had no text streams
    if (pages.length === 0) {
      pages.push({
        pageNumber: 1,
        width: 612,
        height: 792,
        items: [{ text: title || fallbackTitle, x: 72, y: 710, fontSize: 20, isHeading: true }]
      });
    }

    // Infer title from first page heading if /Info had no title
    if (!title) {
      const firstHeading = pages[0]?.items?.find(it => it.isHeading);
      title = firstHeading ? firstHeading.text : fallbackTitle;
    }
    if (!author) {
      author = 'Unknown Author';
    }

    // 5. Build spine chapters & TOC from pages
    const spine = [];
    const toc = [];
    const chapterHtmlMap = new Map();

    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      const fullPath = `pdf-page-${page.pageNumber}.html`;
      const headingItem = page.items.find(it => it.isHeading);
      const chapterTitle = headingItem ? headingItem.text : `Page ${page.pageNumber}`;

      spine.push({
        id: `pdf-page-${page.pageNumber}`,
        href: fullPath,
        fullPath,
        mediaType: 'text/html',
        isLinear: true,
        title: chapterTitle
      });

      toc.push({
        id: `toc-pdf-${page.pageNumber}`,
        title: chapterTitle,
        label: chapterTitle,
        href: fullPath,
        fullPath,
        hash: '',
        spineIndex: idx,
        children: []
      });

      const bodyParts = [];
      for (const item of page.items) {
        if (item.isHeading) {
          bodyParts.push(`<h1>${escapeHtml(item.text)}</h1>`);
        } else {
          bodyParts.push(`<p>${escapeHtml(item.text)}</p>`);
        }
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(chapterTitle)}</title>
</head>
<body>
  <article class="pdf-reflow-page" data-page-number="${page.pageNumber}">
    ${bodyParts.join('\n    ')}
  </article>
</body>
</html>`;

      chapterHtmlMap.set(fullPath, html);
    }

    const domParser = new DOMParser();

    return {
      format: 'pdf',
      metadata: {
        title: title || fallbackTitle,
        author: author || 'Unknown Author',
        language: 'en',
        identifier: `pdf-${filename}`,
        description
      },
      coverBlobUrl: null,
      spine,
      toc,
      pages,
      pageCount: pages.length,
      assetMap: new Map(),

      async getChapterDocument(fullPath) {
        const rawHtml = chapterHtmlMap.get(fullPath) || chapterHtmlMap.values().next().value || '<html><body></body></html>';
        const doc = domParser.parseFromString(rawHtml, 'text/html');
        DOMSanitizer.sanitizeDocument(doc);
        return doc;
      },

      cleanup() {
        chapterHtmlMap.clear();
        pages.length = 0;
      }
    };
  }
}

export default PdfParser;
