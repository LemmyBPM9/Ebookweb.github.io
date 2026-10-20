/**
 * test/test-fixtures/upgrade-fixtures.js
 *
 * Synthetic fixture generators for Multi-Format WebReader Upgrade:
 * - PDF: 2-page valid PDF 1.4 document with Helvetica font, text streams & xref
 * - MOBI / AZW: Palm Database (PDB) + PalmDOC header + MOBI header + PalmDOC LZ77 compressed text
 * - TXT: Plain text file with multi-chapter structure and blank-line paragraphs
 * - MD: GitHub Flavored Markdown with headings, bold, italic, lists, code, table, blockquote
 * - Corrupted / Boundary variants for adversarial format rejection testing
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Compresses an input string or buffer using PalmDOC LZ77 compression.
 * @param {string|Buffer} input
 * @returns {Buffer}
 */
function compressPalmDoc(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  const out = [];
  let i = 0;

  while (i < buf.length) {
    // Optimization: Space followed by ASCII char 0x40..0x7F -> single byte (char ^ 0x80)
    if (buf[i] === 0x20 && i + 1 < buf.length && buf[i + 1] >= 0x40 && buf[i + 1] <= 0x7F) {
      out.push(buf[i + 1] ^ 0x80);
      i += 2;
      continue;
    }

    // LZ77 dictionary search in sliding window up to 2047 bytes
    let bestDist = 0;
    let bestLen = 0;
    const windowStart = Math.max(0, i - 2047);

    for (let j = windowStart; j < i; j++) {
      let len = 0;
      while (len < 10 && (i + len) < buf.length && buf[j + len] === buf[i + len]) {
        len++;
      }
      if (len >= 3 && len > bestLen) {
        bestLen = len;
        bestDist = i - j;
        if (len === 10) break;
      }
    }

    if (bestLen >= 3) {
      const pair = 0x8000 | ((bestDist & 0x7FF) << 3) | ((bestLen - 3) & 0x07);
      out.push((pair >> 8) & 0xFF, pair & 0xFF);
      i += bestLen;
      continue;
    }

    // Literal character
    const b = buf[i];
    if (b === 0x00 || (b >= 0x09 && b <= 0x7F)) {
      out.push(b);
      i++;
    } else {
      out.push(1, b);
      i++;
    }
  }

  return Buffer.from(out);
}

/**
 * Decompresses PalmDOC LZ77 compressed bytes back to UTF-8 string.
 * @param {Buffer} buf
 * @returns {string}
 */
function decompressPalmDoc(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const b = buf[i++];
    if (b === 0x00) {
      out.push(0x00);
    } else if (b >= 0x01 && b <= 0x08) {
      for (let k = 0; k < b; k++) out.push(buf[i++]);
    } else if (b >= 0x09 && b <= 0x7F) {
      out.push(b);
    } else if (b >= 0x80 && b <= 0xBF) {
      const b2 = buf[i++];
      const pair = (b << 8) | b2;
      const distance = (pair >> 3) & 0x7FF;
      const length = (pair & 0x07) + 3;
      const start = out.length - distance;
      for (let k = 0; k < length; k++) {
        out.push(out[start + k]);
      }
    } else if (b >= 0xC0) {
      out.push(0x20);
      out.push(b ^ 0x80);
    }
  }
  return Buffer.from(out).toString('utf8');
}

/**
 * Generates a valid multi-page PDF 1.4 byte buffer with Helvetica font and text streams.
 * @returns {Buffer}
 */
function generateValidSamplePdf() {
  const chunks = [];
  let byteOffset = 0;
  const offsets = [];

  function add(str) {
    const buf = Buffer.isBuffer(str) ? str : Buffer.from(str, 'latin1');
    chunks.push(buf);
    byteOffset += buf.length;
  }

  function addObject(objNum, content) {
    offsets[objNum] = byteOffset;
    add(`${objNum} 0 obj\n${content}\nendobj\n`);
  }

  // PDF Header with binary comment
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');

  // Object 2: Pages tree (2 pages)
  addObject(2, '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>');

  // Object 3: Page 1 (Reflowable / Visual Page 1)
  addObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>');

  // Object 4: Page 2 (Reflowable / Visual Page 2)
  addObject(4, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>');

  // Object 5: Content stream for Page 1
  const stream1 = `BT
/F1 22 Tf
72 710 Td
(Chapter 1: The Sanctuary of Words) Tj
/F1 12 Tf
0 -40 Td
(Reading is an intimate dialogue between author and reader.) Tj
0 -24 Td
(In the digital medium, low-glare palettes prevent ocular halation.) Tj
0 -24 Td
(This chapter verifies dual-mode PDF text reflow and visual rendering.) Tj
ET
`;
  addObject(5, `<< /Length ${Buffer.byteLength(stream1, 'latin1')} >>\nstream\n${stream1}\nendstream`);

  // Object 6: Content stream for Page 2
  const stream2 = `BT
/F1 22 Tf
72 710 Td
(Chapter 2: Dual Mode Reading Ergonomics) Tj
/F1 12 Tf
0 -40 Td
(Visual Mode renders original PDF pages onto HTML5 canvas elements.) Tj
0 -24 Td
(Theme tint filters adapt bright backgrounds for night and sepia reading.) Tj
0 -24 Td
(Reflowable Mode converts extracted text into dynamic responsive columns.) Tj
ET
`;
  addObject(6, `<< /Length ${Buffer.byteLength(stream2, 'latin1')} >>\nstream\n${stream2}\nendstream`);

  // Object 7: Standard Helvetica Font
  addObject(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Object 8: Document Information Dictionary
  addObject(8, '<< /Title (WebReader PDF Test Sample) /Author (Arthur Pendelton) >>');

  const startXref = byteOffset;
  const numObjects = 9; // objects 0..8
  let xref = `xref\n0 ${numObjects}\n0000000000 65535 f \r\n`;
  for (let i = 1; i < numObjects; i++) {
    const off = String(offsets[i]).padStart(10, '0');
    xref += `${off} 00000 n \r\n`;
  }
  add(xref);
  add(`trailer\n<< /Size ${numObjects} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

/**
 * Generates a valid MOBI / AZW file with PalmDOC compressed text and MOBI header.
 * @param {Object} [options]
 * @param {string} [options.title]
 * @param {string} [options.author]
 * @returns {Buffer}
 */
function generateValidSampleMobi(options = {}) {
  const bookTitle = options.title || 'The Minimalist Reader in MOBI';
  const authorName = options.author || 'Arthur Pendelton';

  const htmlContent = `<html><head><title>${bookTitle}</title></head><body>
<h1>Chapter 1: The Sanctuary of Words</h1>
<p>Reading is an intimate dialogue between the mind of the author and the reader.</p>
<p>In the digital age, this sanctuary is frequently compromised by high-glare displays and erratic contrast.</p>
<p>By Arthur Pendelton</p>
<mbp:pagebreak/>
<h1>Chapter 2: Eyes in Balance</h1>
<p>The human eye evolved under soft sunlight filtered through foliage and dynamic clouds.</p>
<p>Each palette in WebReader is calibrated to exceed WCAG AAA contrast standards (>= 7.0:1).</p>
<mbp:pagebreak/>
<h1>Chapter 3: Typographic Harmony</h1>
<p>Typography is the clothing of thought. Balanced line height and proportional font scale ensure comfort.</p>
<p>PalmDOC LZ77 decompression enables compact storage and rapid client-side rendering.</p>
</body></html>`;

  const textBuffer = Buffer.from(htmlContent, 'utf8');
  const compressedText = compressPalmDoc(textBuffer);
  const textRecords = [compressedText];

  // Record 0 Layout: PalmDOC Header (16) + MOBI Header (232) + Title
  const palmdocHeaderLen = 16;
  const mobiHeaderLen = 232;
  const titleBuf = Buffer.from(bookTitle, 'utf8');
  const fullNameOffset = palmdocHeaderLen + mobiHeaderLen;
  const record0Len = fullNameOffset + titleBuf.length;
  const record0 = Buffer.alloc(record0Len);

  // PalmDOC header
  record0.writeUInt16BE(2, 0); // 2 = PalmDOC compression
  record0.writeUInt16BE(0, 2); // Unused
  record0.writeUInt32BE(textBuffer.length, 4); // Uncompressed text length
  record0.writeUInt16BE(textRecords.length, 8); // Text record count
  record0.writeUInt16BE(4096, 10); // Record size (4096)
  record0.writeUInt32BE(0, 12); // Encryption type / current position (0 = none)

  // MOBI header
  record0.write('MOBI', 16, 4, 'ascii');
  record0.writeUInt32BE(mobiHeaderLen, 20); // Header length
  record0.writeUInt32BE(2, 24); // MOBI type (2 = Book)
  record0.writeUInt32BE(65001, 28); // Encoding (65001 = UTF-8)
  record0.writeUInt32BE(84729103, 32); // Unique ID
  record0.writeUInt32BE(6, 36); // File version

  // Full name offset & length
  record0.writeUInt32BE(fullNameOffset, 84);
  record0.writeUInt32BE(titleBuf.length, 88);
  record0.writeUInt32BE(0, 128); // Extra record flags

  // Copy title bytes
  titleBuf.copy(record0, fullNameOffset);

  // Boundary EOF record
  const eofRecord = Buffer.from('\xe9\x8e\r\n', 'ascii');
  const allRecords = [record0, ...textRecords, eofRecord];
  const numRecords = allRecords.length;

  // PDB Header (78 bytes)
  const pdbHeader = Buffer.alloc(78);
  pdbHeader.write('WebReader MOBI Book', 0, 32, 'ascii');
  pdbHeader.writeUInt16BE(0, 32); // Attributes
  pdbHeader.writeUInt16BE(0, 34); // Version
  const now = Math.floor(Date.now() / 1000);
  pdbHeader.writeUInt32BE(now, 36); // Created
  pdbHeader.writeUInt32BE(now, 40); // Modified
  pdbHeader.write('BOOK', 60, 4, 'ascii'); // Type
  pdbHeader.write('MOBI', 64, 4, 'ascii'); // Creator
  pdbHeader.writeUInt16BE(numRecords, 76);

  // Record list: 8 bytes per record + 2 bytes padding
  const recordListLen = numRecords * 8 + 2;
  const recordList = Buffer.alloc(recordListLen);
  let currentOffset = 78 + recordListLen;

  for (let r = 0; r < numRecords; r++) {
    recordList.writeUInt32BE(currentOffset, r * 8);
    recordList.writeUInt8(0, r * 8 + 4); // attributes
    recordList.writeUInt8(0, r * 8 + 5);
    recordList.writeUInt8(0, r * 8 + 6);
    recordList.writeUInt8(r * 2, r * 8 + 7);
    currentOffset += allRecords[r].length;
  }

  return Buffer.concat([pdbHeader, recordList, ...allRecords]);
}

/**
 * Generates a valid multi-chapter Plain Text (.txt) buffer.
 * @returns {Buffer}
 */
function generateValidSampleTxt() {
  const content = `Chapter 1: The Sanctuary of Words

Reading is an intimate dialogue between the mind of the author and the sanctuary of the reader’s consciousness. When we open a book, we step into a realm where the outside world recedes, leaving only the rhythm of thought and the architecture of language.

In the digital age, this sanctuary is frequently compromised. The luminous screens of computers and smartphones bombard our eyes with intense light, erratic contrast, and visual distraction. The physical book, with its unreflective cream paper and steady charcoal ink, remains the gold standard.

Chapter 2: Eyes in Balance

The human eye evolved under the soft, dynamic light of the sun filtered through atmosphere and foliage. The blue sky provides ambient scattered illumination, while earthy surfaces reflect warm, subdued spectra.

Modern emissive displays emit sharp, concentrated photons directly into the pupil. When a dark room is illuminated by a stark white window, the ciliary muscles remain clenched to restrict light influx, leading to ocular fatigue.

Chapter 3: Typographic Harmony

Typography is the clothing of thought. A serif font like Georgia or Merriweather provides subtle horizontal anchors along the baseline, aiding horizontal saccades across dense prose.

By empowering the reader to adjust font scale, line spacing, and margin width dynamically, WebReader ensures that readability adapts to the human, not the other way around.
`;

  return Buffer.from(content, 'utf8');
}

/**
 * Generates a valid multi-heading GitHub Flavored Markdown (.md) buffer.
 * @returns {Buffer}
 */
function generateValidSampleMd() {
  const content = `# The Art of Digital Reading

A curated exploration of eye-comfort interfaces and client-side document processing.

## Chapter 1: The Sanctuary of Words

Reading is an intimate dialogue between the mind of the author and the reader. When we open a book, we enter a realm where visual calm invites deep cognitive immersion.

Key challenges in digital reading:
- **Optical Halation**: High-frequency glare tiring the retina.
- *Visual Clutter*: Redundant UI elements distracting from prose.
- Inflexible Layouts: Rigid formatting conflicting with user needs.

> "Simplicity is about subtracting the obvious and adding the meaningful." — John Maeda

## Chapter 2: Eyes in Balance

The human eye evolved under dynamic natural light. High contrast without halation allows pupil relaxation over long sessions.

### Recommended Reading Themes
1. **Warm Paper**: Warm cream parchment with soft charcoal ink.
2. **Soft Dark**: Low-blue-light slate with amber accents.
3. **Nord**: Arctic night palette for peaceful reading.
4. **E-Ink**: High-contrast matte paper.

\`\`\`css
:root {
  --color-bg: #f8f1e3;
  --color-text: #2c2523;
  --contrast-ratio: 13.38;
}
\`\`\`

## Chapter 3: Typographic Harmony

Typography structures cognitive flow. When column width, leading, and font size harmonize, reading becomes effortless.

| Parameter | Recommended Value | Purpose |
| :--- | :--- | :--- |
| Font Size | 18px - 22px | Legibility without zooming |
| Line Height | 1.6 - 1.8 | Prevents line-slipping |
| Max Width | 65ch - 75ch | Restful horizontal saccades |

Visit the [WebReader Documentation](https://github.com/webreader/docs) for further insights.
`;

  return Buffer.from(content, 'utf8');
}

/**
 * Generates an empty title / whitespace title Plain Text (.txt) buffer.
 * @returns {Buffer}
 */
function generateEmptyTitleTxt() {
  const content = `   \n\nThis is a plain text file without an explicit Chapter heading or title on the first line.\n\nIt tests the fallback to filename or default title.`;
  return Buffer.from(content, 'utf8');
}

/**
 * Generates corrupted non-PDF bytes for invalid format rejection tests.
 * @returns {Buffer}
 */
function generateCorruptedPdf() {
  return Buffer.from('NOT_A_VALID_PDF_FILE_HEADER_%PDF-INVALID_1234567890!@#$%^&*()', 'utf8');
}

/**
 * Generates corrupted non-MOBI bytes for invalid format rejection tests.
 * @returns {Buffer}
 */
function generateCorruptedMobi() {
  return Buffer.from('NOT_A_VALID_MOBI_OR_PDB_DATABASE_BYTES_1234567890!@#$%^&*()', 'utf8');
}

module.exports = {
  compressPalmDoc,
  decompressPalmDoc,
  generateValidSamplePdf,
  generateValidSampleMobi,
  generateValidSampleTxt,
  generateValidSampleMd,
  generateEmptyTitleTxt,
  generateCorruptedPdf,
  generateCorruptedMobi
};
