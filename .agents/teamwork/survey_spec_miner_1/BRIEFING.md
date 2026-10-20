# BRIEFING — 2026-10-17T02:36:30Z

## Mission
Investigate and document all technical specifications, standards, requirements, data formats, and edge cases for parsing and rendering EPUB 2 and EPUB 3 files entirely client-side using pure HTML/CSS/vanilla JS with zero build steps.

## 🔒 My Identity
- Archetype: specification-miner
- Roles: Teamwork specialist, external domain expert
- Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_spec_miner_1/
- Original parent: bf9f892e-9f7c-4a5f-80d2-882b9b27b238
- Milestone: EPUB 2/3 Specification & Client-Side Reader Architecture Discovery

## 🔒 Key Constraints
- Pure HTML, CSS, and vanilla JS with zero build steps (no npm build/bundling step required to run).
- Runs directly in modern browser over a static HTTP server or file system.
- Complete client-side parsing of EPUB 2 and EPUB 3 formats.
- Safe chapter content extraction & sanitization without script injection.
- Isolated/scoped styles to prevent breaking the reader UI.
- Read-only miner role: do NOT implement application code in project src, only discover and document.

## Current Parent
- Conversation ID: bf9f892e-9f7c-4a5f-80d2-882b9b27b238
- Updated: 2026-10-17T02:30:53Z

## Task Summary
- **What to build**: Comprehensive specification and architecture reference for EPUB 2 & EPUB 3 client-side reading engine.
- **Success criteria**: Detailed technical handoff covering container parsing, OPF schema, NCX & Nav Doc TOC, zip extraction options, XHTML sanitization, asset URL resolution, iframe vs Shadow DOM isolation, pagination vs scroll techniques, and edge cases.
- **Interface contracts**: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
- **Code layout**: All outputs in `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_spec_miner_1/`

## Key Decisions Made
- Divide investigation into 5 core domains: Container & Package Document, Navigation & TOC formats, Zip handling in browser, Chapter extraction/sanitization/isolation, and Edge Cases & Sample Generation.
- Recommending sandboxed `<iframe>` (without `allow-scripts`) as the rendering stage to ensure 100% CSS style isolation and browser-enforced script execution blocking.
- Recommending dual zip extraction strategy: standalone `vendor/jszip.min.js` alongside native `DecompressionStream('deflate-raw')`.
- Verified WCAG AA contrast for all 4 eye-comfort themes (Warm Paper, Soft Dark, Daylight, Sage) with contrast ratios exceeding 12:1.

## Artifact Index
- DISPATCH.md — Incoming assignment
- BRIEFING.md — Working memory and context
- progress.md — Activity and heartbeat
- handoff.md — Final comprehensive specification mining report
