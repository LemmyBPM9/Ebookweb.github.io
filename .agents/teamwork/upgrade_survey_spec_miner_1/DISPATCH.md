# Dispatch: upgrade_survey_spec_miner_1

- Role: teamwork_preview_spec_miner
- Working Directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_spec_miner_1/
- Request file: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md (under ## 2026-10-17T18:34:26Z)
- Task: Survey specifications and existing codebase for R1 (Multi-Format Import, Format Badges, Filtering, XSS Sanitization, IndexedDB architecture) and R4 (10 Eye-Comfort Themes, WCAG AAA >=7.0:1 contrast ratios, FOUC-free inline styles).

## 2026-10-17T18:38:09Z
You are teamwork_preview_spec_miner (instance upgrade_survey_spec_miner_1).
Your working directory is:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_spec_miner_1/

MANDATORY FIRST STEP: Read the user request file at:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
specifically paying attention to the new upgrade request recorded under header ## 2026-10-17T18:34:26Z.
Also read PROJECT.md at the project root:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md

Your Focus Area:
1. R1: Multi-Format Import, Parsing & Unified Library Persistence:
   - File input accept formats (.epub, .pdf, .mobi, .azw, .txt, .md) and drag-and-drop handling
   - Library card presentation: format badges (EPUB, PDF, MOBI, TXT, MD), filter controls in library header
   - IndexedDB schema and operations (WebReaderDB): how books, metadata, covers, progress, and bookmarks are stored; separating metadata from binary blobs so listing books does NOT load full ArrayBuffers
   - XSS sanitization across all formats (window.__xssTriggered must stay falsy)
2. R4: Expanded Eye-Comfort Reading Themes:
   - 10 themes total (4 existing: warm-paper, soft-dark, daylight, sage; 6 new: solarized-light, solarized-dark, nord, oled-black, rose-pine, e-ink)
   - Contrast ratio requirements: WCAG AA/AAA >= 7.0:1 for body text
   - Zero FOUC inline head script and instant persistence in localStorage
   - Complete CSS variable mapping for host UI and iframe reader content

Deliverable:
Investigate existing code (index.html, css/, js/storage/, js/ui/, js/parser/) and write a comprehensive specification report to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/upgrade_survey_spec_miner_1/survey_report.md
Include:
- Exhaustive feature list with IDs, descriptions, and dependencies
- Exact file touches / architecture updates needed
- Acceptance criteria and edge cases to test
- A structured handoff.md summarizing findings. Send completion message when done.
