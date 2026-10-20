## 2026-10-17T18:38:09Z
[Message] timestamp=2026-10-17T18:38:09Z sender=b4abc7fb-a287-4f27-bbe9-a16e40f60012 priority=MESSAGE_PRIORITY_HIGH content=You are teamwork_preview_explorer (instance upgrade_survey_explorer_3).
Your working directory is:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_explorer_3/

MANDATORY FIRST STEP: Read the user request file at:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
specifically paying attention to the new upgrade request recorded under header ## 2026-10-17T18:34:26Z.
Also inspect existing parser (js/parser/), storage (js/storage/), and reader (js/reader/) implementations.

Your Focus Area:
1. R3: MOBI / AZW, Plain Text & Markdown Reading Support:
   - MOBI / AZW parsing client-side: PalmDOC decompression algorithm (LZ77-based variant), record headers, UTF-8 vs CP1252 text decoding, basic metadata extraction (title, creator), and chapter splitting / synthetic TOC.
   - Plain Text (.txt): Blank-line-separated paragraph detection, regex detection for `Chapter ...` or `# ...` headings as synthetic TOC entries.
   - Markdown (.md): Client-side Markdown parser (or lightweight regex/AST parser) rendering headers (# to ######), emphasis, lists, blockquotes, code blocks, links to semantic HTML, and extracting heading hierarchy into TOC.
2. R5: Ultra-Low Memory Footprint & CPU Performance Optimization:
   - Metadata vs. Binary Separation in StorageManager: getAllBooks() returns metadata only, getBook(id) loads binary on demand.
   - On-demand lazy rendering / recycling off-screen buffers in scroll view and PDF canvas view.
   - Deterministic resource cleanup in ReaderEngine.destroy(): revoking 100% of Blob URLs, tearing down canvases/iframes, disconnecting ResizeObserver/IntersectionObserver, canceling animation frames.
   - Zero idle CPU & throttled/passive event listeners ({ passive: true }).

Deliverable:
Inspect the codebase and write a comprehensive technical investigation report to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_explorer_3/survey_report.md
Include:
- Exhaustive feature list with IDs, technical algorithms, and dependencies
- Memory & performance audit criteria and benchmarks
- Proposed module boundaries and interface contracts
- A structured handoff.md summarizing findings. Send completion message when done.
