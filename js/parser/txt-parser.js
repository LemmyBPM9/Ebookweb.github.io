/**
 * js/parser/txt-parser.js
 * Pure Client-Side Plain Text (.txt) Parser.
 *
 * Capabilities:
 * - Validates UTF-8 text and rejects binary payloads containing null bytes
 * - Detects chapter boundaries (`Chapter 1...`, `Part I...`, `Prologue`, `Epilogue`, `# Heading`)
 * - Converts blank-line-separated blocks into semantic `<p>` elements
 * - Generates hierarchical/flat TOC from detected chapter headings
 * - Sanitizes generated DOM via DOMSanitizer
 */

import { DOMSanitizer } from './asset-extractor.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CHAPTER_HEADING_RE = /^(?:(?:chapter|part|book|section|act)\s+[0-9IVXLCDMivxlcdm]+(?:\s*[:.\-—]\s*.*)?|prologue(?:\s*[:.\-—]\s*.*)?|epilogue(?:\s*[:.\-—]\s*.*)?|#{1,3}\s+.+)$/i;

export class TxtParser {
  /**
   * Parses a Plain Text File, Blob, ArrayBuffer, or string into a unified ParsedBook object.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array|string} input
   * @param {string} [filename]
   * @returns {Promise<object>} ParsedBook
   */
  static async parse(input, filename = 'document.txt') {
    let rawText = '';

    if (typeof input === 'string') {
      rawText = input;
    } else {
      let buffer;
      if (input instanceof ArrayBuffer) {
        buffer = input;
      } else if (ArrayBuffer.isView(input)) {
        buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
      } else if (input && typeof input.arrayBuffer === 'function') {
        buffer = await input.arrayBuffer();
        if (input.name && filename === 'document.txt') {
          filename = input.name;
        }
      } else {
        throw new Error('Invalid TXT input: Expected File, Blob, ArrayBuffer, or string.');
      }

      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Empty plain text file.');
      }

      const bytes = new Uint8Array(buffer);
      let nullCount = 0;
      for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
        if (bytes[i] === 0x00) {
          nullCount++;
          if (nullCount > 2) {
            throw new Error('Not a valid plain text file: Binary data detected.');
          }
        }
      }

      rawText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    const normalized = rawText.replace(/\r\n?/g, '\n');
    const blocks = normalized
      .split(/\n{2,}/)
      .map(b => b.trim())
      .filter(Boolean);

    const fallbackTitle = (filename || 'Text Document')
      .replace(/\.txt$/i, '')
      .trim() || 'Text Document';

    // Split blocks into chapters whenever a block matches CHAPTER_HEADING_RE
    const chapters = [];
    let currentChapter = null;

    for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const firstLine = lines[0] || '';

      if (lines.length === 1 && CHAPTER_HEADING_RE.test(firstLine)) {
        const cleanHeading = firstLine.replace(/^#{1,3}\s+/, '').trim();
        currentChapter = {
          title: cleanHeading,
          paragraphs: []
        };
        chapters.push(currentChapter);
      } else if (lines.length > 1 && CHAPTER_HEADING_RE.test(firstLine)) {
        const cleanHeading = firstLine.replace(/^#{1,3}\s+/, '').trim();
        currentChapter = {
          title: cleanHeading,
          paragraphs: [lines.slice(1).join(' ')]
        };
        chapters.push(currentChapter);
      } else {
        if (!currentChapter) {
          currentChapter = {
            title: 'Chapter 1',
            paragraphs: []
          };
          chapters.push(currentChapter);
        }
        currentChapter.paragraphs.push(lines.join(' '));
      }
    }

    if (chapters.length === 0) {
      chapters.push({
        title: 'Chapter 1',
        paragraphs: [normalized.trim() || fallbackTitle]
      });
    }

    const bookTitle = fallbackTitle !== 'empty-title' && fallbackTitle !== 'Untitled'
      ? fallbackTitle
      : (chapters[0].title !== 'Chapter 1' ? chapters[0].title : fallbackTitle);

    const spine = [];
    const toc = [];
    const chapterHtmlMap = new Map();
    const domParser = new DOMParser();

    for (let idx = 0; idx < chapters.length; idx++) {
      const ch = chapters[idx];
      const fullPath = `txt-ch-${idx + 1}.html`;
      const chTitle = ch.title || `Chapter ${idx + 1}`;

      spine.push({
        id: `txt-ch-${idx + 1}`,
        href: fullPath,
        fullPath,
        mediaType: 'text/html',
        isLinear: true,
        title: chTitle
      });

      toc.push({
        id: `toc-txt-${idx + 1}`,
        title: chTitle,
        label: chTitle,
        href: fullPath,
        fullPath,
        hash: '',
        spineIndex: idx,
        children: []
      });

      const pTags = ch.paragraphs
        .map(p => `<p>${escapeHtml(p)}</p>`)
        .join('\n    ');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(chTitle)}</title>
</head>
<body>
  <article class="txt-chapter">
    <h1 id="ch-heading-${idx + 1}">${escapeHtml(chTitle)}</h1>
    ${pTags}
  </article>
</body>
</html>`;

      chapterHtmlMap.set(fullPath, html);
    }

    return {
      format: 'txt',
      metadata: {
        title: bookTitle || 'Untitled Document',
        author: 'Unknown Author',
        language: 'en',
        identifier: `txt-${filename}`,
        description: ''
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

export default TxtParser;
