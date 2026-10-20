/**
 * js/parser/book-parser.js
 * Master Polymorphic BookParser Factory.
 *
 * Routes files/blobs/buffers by format hint, filename extension, MIME type, or binary magic bytes
 * to the appropriate format parser (EpubParser, PdfParser, MobiParser, TxtParser, MarkdownParser),
 * returning a unified ParsedBook object.
 */

import { EpubParser } from './epub-parser.js';
import { PdfParser } from './pdf-parser.js';
import { MobiParser } from './mobi-parser.js';
import { TxtParser } from './txt-parser.js';
import { MarkdownParser } from './markdown-parser.js';

export class BookParser {
  /**
   * Detects the document format from formatHint, filename, MIME type, or magic bytes.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array} input
   * @param {string} [filenameOrFormat]
   * @returns {Promise<'epub'|'pdf'|'mobi'|'txt'|'md'>}
   */
  static async detectFormat(input, filenameOrFormat = '') {
    const hint = String(filenameOrFormat || '').toLowerCase().trim();
    if (['epub', 'pdf', 'mobi', 'txt', 'md'].includes(hint)) {
      return hint;
    }
    if (hint === 'azw' || hint === 'azw3') {
      return 'mobi';
    }
    if (hint === 'markdown') {
      return 'md';
    }

    // Check extension in filenameOrFormat or input.name
    const name = hint || (input && typeof input.name === 'string' ? input.name.toLowerCase() : '');
    if (name.endsWith('.epub')) return 'epub';
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.mobi') || name.endsWith('.azw') || name.endsWith('.azw3')) return 'mobi';
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
    if (name.endsWith('.txt')) return 'txt';

    // Check Blob MIME type
    const mime = (input && typeof input.type === 'string') ? input.type.toLowerCase() : '';
    if (mime.includes('epub')) return 'epub';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('mobi')) return 'mobi';
    if (mime.includes('markdown')) return 'md';
    if (mime.includes('text/plain')) return 'txt';

    // Inspect binary magic bytes (first 1024 bytes)
    let sliceBuf = null;
    if (input instanceof ArrayBuffer) {
      sliceBuf = input.slice(0, Math.min(1024, input.byteLength));
    } else if (ArrayBuffer.isView(input)) {
      sliceBuf = input.buffer.slice(input.byteOffset, input.byteOffset + Math.min(1024, input.byteLength));
    } else if (input && typeof input.slice === 'function') {
      sliceBuf = await input.slice(0, Math.min(1024, input.size || 1024)).arrayBuffer();
    }

    if (sliceBuf && sliceBuf.byteLength >= 4) {
      const bytes = new Uint8Array(sliceBuf);
      // ZIP / EPUB: PK\x03\x04
      if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
        return 'epub';
      }
      // PDF: %PDF
      const ascii = new TextDecoder('latin1').decode(bytes);
      if (ascii.includes('%PDF-')) {
        return 'pdf';
      }
      // MOBI / AZW: BOOKMOBI or TEXtREAd at 60..68
      if (bytes.length >= 68) {
        const sig = String.fromCharCode(...bytes.subarray(60, 68));
        if (sig === 'BOOKMOBI' || sig === 'TEXtREAd') {
          return 'mobi';
        }
      }
      if (/^#\s+/m.test(ascii)) {
        return 'md';
      }
    }

    return 'epub';
  }

  /**
   * Parses any supported book/document format and returns a unified ParsedBook contract.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array} fileOrBuffer
   * @param {string} [filenameOrFormat]
   * @returns {Promise<object>} ParsedBook
   */
  static async parse(fileOrBuffer, filenameOrFormat = '') {
    const format = await this.detectFormat(fileOrBuffer, filenameOrFormat);
    const filename = (fileOrBuffer && fileOrBuffer.name)
      ? fileOrBuffer.name
      : (filenameOrFormat || `document.${format}`);

    switch (format) {
      case 'pdf':
        return await PdfParser.parse(fileOrBuffer, filename);
      case 'mobi':
        return await MobiParser.parse(fileOrBuffer, filename);
      case 'txt':
        return await TxtParser.parse(fileOrBuffer, filename);
      case 'md':
        return await MarkdownParser.parse(fileOrBuffer, filename);
      case 'epub':
      default: {
        const parsed = await EpubParser.parse(fileOrBuffer);
        parsed.format = 'epub';
        return parsed;
      }
    }
  }
}

export default BookParser;
