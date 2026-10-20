/**
 * js/parser/markdown-parser.js
 * Pure Client-Side GitHub Flavored Markdown (.md) Parser.
 *
 * Capabilities:
 * - Converts GFM Markdown into semantic HTML:
 *   - Headings (# H1 .. ###### H6) with deterministic anchor IDs
 *   - Fenced code blocks (```lang ... ```) -> <pre><code class="language-...">
 *   - Tables (| col | col |) -> <table><thead><tbody>
 *   - Blockquotes (> quote) -> <blockquote><p>
 *   - Unordered (- / *) and Ordered (1.) lists -> <ul> / <ol>
 *   - Inline formatting (**bold**, *italic*, `code`, [link](url))
 * - Builds TOC entries from H1-H3 headings with section anchor navigation
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

function slugifyHeading(text, index) {
  const base = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `md-sec-${base || 'heading'}-${index}`;
}

/**
 * Formats inline Markdown syntax (**bold**, *italic*, `code`, [text](url)).
 * @param {string} raw
 * @returns {string}
 */
function renderInlineMarkdown(raw) {
  let text = escapeHtml(raw);

  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold + Italic: ***text***
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/\b_([^_\n]+)_\b/g, '<em>$1</em>');

  // Links: [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const cleanHref = href.trim();
    if (/^javascript:/i.test(cleanHref) || /^data:/i.test(cleanHref) || /^vbscript:/i.test(cleanHref)) {
      return label;
    }
    return `<a href="${cleanHref}">${label}</a>`;
  });

  return text;
}

/**
 * Parses GFM Markdown into semantic HTML and extracts heading metadata.
 * @param {string} markdown
 * @returns {{ html: string, headings: Array<{ level: number, text: string, id: string }> }}
 */
export function parseMarkdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const htmlBlocks = [];
  const headings = [];

  let i = 0;
  let headingCounter = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Fenced code block: ```lang ... ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      htmlBlocks.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 2. ATX Heading: # .. ######
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawHeadingText = headingMatch[2].replace(/\s+#+\s*$/, '').trim();
      headingCounter++;
      const id = slugifyHeading(rawHeadingText, headingCounter);
      headings.push({ level, text: rawHeadingText, id });
      htmlBlocks.push(`<h${level} id="${id}">${renderInlineMarkdown(rawHeadingText)}</h${level}>`);
      i++;
      continue;
    }

    // 3. Horizontal Rule: ---, ***, ___
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      htmlBlocks.push('<hr/>');
      i++;
      continue;
    }

    // 4. GFM Table: | col | col | followed by | --- | --- |
    if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const parseRow = (rowLine) =>
        rowLine
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(c => c.trim());

      const headers = parseRow(lines[i]);
      i += 2; // skip header and separator row
      const rows = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      const thead = `<thead><tr>${headers.map(h => `<th>${renderInlineMarkdown(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${renderInlineMarkdown(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      htmlBlocks.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // 5. Blockquote: > ...
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      htmlBlocks.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // 6. Unordered List: - item or * item
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      htmlBlocks.push(`<ul>${items.map(it => `<li>${renderInlineMarkdown(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // 7. Ordered List: 1. item
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      htmlBlocks.push(`<ol>${items.map(it => `<li>${renderInlineMarkdown(it)}</li>`).join('')}</ol>`);
      continue;
    }

    // 8. Paragraph: collect contiguous non-special lines
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      htmlBlocks.push(`<p>${renderInlineMarkdown(paraLines.join(' '))}</p>`);
    } else {
      i++;
    }
  }

  return {
    html: htmlBlocks.join('\n    '),
    headings
  };
}

export class MarkdownParser {
  /**
   * Parses a Markdown (.md) File, Blob, ArrayBuffer, or string into a unified ParsedBook object.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array|string} input
   * @param {string} [filename]
   * @returns {Promise<object>} ParsedBook
   */
  static async parse(input, filename = 'document.md') {
    let rawMarkdown = '';

    if (typeof input === 'string') {
      rawMarkdown = input;
    } else {
      let buffer;
      if (input instanceof ArrayBuffer) {
        buffer = input;
      } else if (ArrayBuffer.isView(input)) {
        buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
      } else if (input && typeof input.arrayBuffer === 'function') {
        buffer = await input.arrayBuffer();
        if (input.name && filename === 'document.md') {
          filename = input.name;
        }
      } else {
        throw new Error('Invalid Markdown input: Expected File, Blob, ArrayBuffer, or string.');
      }

      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Empty Markdown file.');
      }

      const bytes = new Uint8Array(buffer);
      rawMarkdown = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    const fallbackTitle = (filename || 'Markdown Document')
      .replace(/\.(md|markdown)$/i, '')
      .trim() || 'Markdown Document';

    const { html, headings } = parseMarkdownToHtml(rawMarkdown);

    const h1 = headings.find(h => h.level === 1);
    const bookTitle = (h1 && h1.text.trim()) ? h1.text.trim() : fallbackTitle;

    const fullPath = 'markdown-doc-1.html';
    const spine = [
      {
        id: 'md-ch-1',
        href: fullPath,
        fullPath,
        mediaType: 'text/html',
        isLinear: true,
        title: bookTitle
      }
    ];

    const toc = headings
      .filter(h => h.level <= 3)
      .map((h, idx) => ({
        id: `toc-md-${idx + 1}`,
        title: h.text,
        label: h.text,
        href: `${fullPath}#${h.id}`,
        fullPath,
        hash: h.id,
        spineIndex: 0,
        children: []
      }));

    if (toc.length === 0) {
      toc.push({
        id: 'toc-md-1',
        title: bookTitle,
        label: bookTitle,
        href: fullPath,
        fullPath,
        hash: '',
        spineIndex: 0,
        children: []
      });
    }

    let documentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(bookTitle)}</title>
</head>
<body>
  <article class="markdown-document">
    ${html}
  </article>
</body>
</html>`;

    const domParser = new DOMParser();

    return {
      format: 'md',
      metadata: {
        title: bookTitle,
        author: 'Unknown Author',
        language: 'en',
        identifier: `md-${filename}`,
        description: ''
      },
      coverBlobUrl: null,
      spine,
      toc,
      assetMap: new Map(),

      async getChapterDocument() {
        const doc = domParser.parseFromString(documentHtml, 'text/html');
        DOMSanitizer.sanitizeDocument(doc);
        return doc;
      },

      cleanup() {
        documentHtml = '';
      }
    };
  }
}

export default MarkdownParser;
