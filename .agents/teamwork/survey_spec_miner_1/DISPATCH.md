## 2026-10-17T02:30:53Z

You are a specification investigator (spec miner).
Your working directory is: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_spec_miner_1/

MANDATORY: Read the original user request first:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md

Objective:
Investigate and document all technical specifications, requirements, data formats, and edge cases for parsing and rendering EPUB 2 and EPUB 3 files entirely client-side using pure HTML/CSS/vanilla JS with zero build steps.

Investigate:
1. EPUB Container & Package structure: META-INF/container.xml parsing, rootfile path resolution, OPF package document (metadata: title, creator/author, identifier, language, cover-image meta or manifest item; manifest: id, href, media-type; spine: itemref idref reading order, linear yes/no).
2. Table of Contents formats: EPUB 2 NCX (toc.ncx navMap, navPoint, navLabel/text, content src) AND EPUB 3 Navigation Document (HTML5 <nav epub:type="toc"> / <nav role="doc-toc">, nested <ol>/<li>/<a>).
3. Client-side decompression: Pure client-side zip handling in modern browser with zero build step (e.g. lightweight standalone vanilla JSZip vendor script or browser native DecompressionStream / zip parser), extracting text, XML/HTML, CSS, and binary images (converting to blob URLs / data URLs for inline rendering).
4. Chapter content extraction & sanitization: XHTML parsing, relative path resolution for images/CSS (hrefs relative to OPF or chapter file), isolation or scoped styling to avoid polluting the host reader shell, preventing script injection while preserving markup formatting.
5. Provide a detailed feature requirement checklist and edge-case handling list.

Write your comprehensive findings to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_spec_miner_1/handoff.md
Update your progress.md regularly. When finished, send a completion message with your report path.
