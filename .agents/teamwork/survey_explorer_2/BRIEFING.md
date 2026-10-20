# BRIEFING — 2026-10-17T02:37:30Z

## Mission
Investigate and design the architecture for the Paginated & Scrollable Reading Engine, user interaction, navigation, TOC drawer, bookmarks, and progress tracking for our minimal, modern, eye-friendly client-side EPUB reader.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, researcher, architect
- Working directory: /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/
- Original parent: bf9f892e-9f7c-4a5f-80d2-882b9b27b238 (orchestrator_1)
- Milestone: Phase 0 (Survey)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Pure HTML, CSS, vanilla JS with zero build step
- Clean modular design compatible with static file serving

## Current Parent
- Conversation ID: bf9f892e-9f7c-4a5f-80d2-882b9b27b238
- Updated: 2026-10-17T02:37:30Z

## Investigation State
- **Explored paths**:
  - CSS Multi-column layout geometry & subpixel column calculation in headless Chrome.
  - Iframe-based sandboxing vs host DOM containment.
  - Margin & column-gap matching equation: $W_{column} = W_{viewport} - 2P_{margin}$, $\text{gap} = 2P_{margin}$, giving step $S = W_{viewport}$.
  - Dynamic switching between Paginated mode and Continuous Scroll mode.
  - Bidirectional reading position synchronization (Ratio-based and DOM anchor-based).
  - Reader Chrome auto-toggle, 3-zone tap navigation, TOC drawer, and bookmark management.
  - Modular vanilla JS ES module decomposition with EventBus.
- **Key findings**:
  - Empirical verification via Node 25 WebSocket CDP to headless Chrome confirmed 100% viability of pure CSS multi-column pagination with zero build step or external libraries.
  - Sandboxed iframe with `srcdoc` provides total CSS isolation while allowing full parent event attachment and injected eye-comfort theme overrides.
  - Tap zones (Left 25%, Center 50%, Right 25%) smoothly integrate with keyboard shortcuts (`ArrowLeft`, `ArrowRight`, `Space`, `Escape`).
  - Anchor navigation in paginated view is calculated via `Math.floor(element.offsetLeft / viewport.clientWidth)`.
- **Unexplored areas**: None remaining for this scope; findings fully verified.

## Key Decisions Made
- Use isolated iframe with injected theme stylesheets to prevent EPUB CSS pollution.
- Use step = `viewport.clientWidth` with matching gap and viewport padding for zero-ghost-column pagination.
- Use pure ES Modules (`<script type="module">`) with a decoupled EventBus architecture.

## Artifact Index
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/DISPATCH.md — Dispatch log
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/BRIEFING.md — Working memory
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/progress.md — Liveness & progress tracking
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_cdp.js — Empirical CDP multi-column pagination test
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_iframe_columns.js — Iframe containment test
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_padding_math.js — Exact column geometry & gap math verification
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_mode_switch.js — Dual mode dynamic reformatting test
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_position_sync.js — Bidirectional position & anchor sync test
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/test_reader_chrome.js — Reader Chrome, tap zones, and TOC test
- /Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/survey_explorer_2/handoff.md — Comprehensive 5-component report
