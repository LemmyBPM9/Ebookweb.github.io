# Soft Handoff Report — Project Orchestrator 2 to Project Orchestrator 3

## 1. Milestone State

| Milestone | Description | Status | Key Outputs / Artifacts |
|---|---|---|---|
| **Phase 0** | Scope Survey via 3 Parallel Explorers / Spec Miners | **DONE** | Comprehensive survey reports for R1-R6 in `.agents/teamwork/upgrade_survey_spec_miner_1/`, `upgrade_survey_explorer_2/`, `upgrade_survey_explorer_3/` |
| **Phase 1** | Decomposition & Global Project Specification | **DONE** | Updated `PROJECT.md` at root with 63 features, 6 milestones, contracts, and architecture |
| **Track T2** | Multi-Format E2E Testing Track | **DONE** | `test/server.js` (MIME types), `test/test-fixtures/upgrade-fixtures.js`, `test/e2e_upgrade.test.js` (Tiers 0-4), `TEST_READY.md` published |
| **Milestone 1** | Multi-Format Library, Format Badges & Storage V2 | **IN-PROGRESS (Iteration 2 Remediation)** | Iteration 1 implemented by `m1_upgrade_worker_1`. Gate 1: Reviewer 1 (APPROVE), Reviewer 2 (APPROVE), Challenger 1 (APPROVE), Auditor (CLEAN), Challenger 2 (REQUEST_CHANGES on detached root DOMSanitizer). Remediation blueprints ready in `m1_r2_explorer_1`, `m1_r2_explorer_2`, `m1_r2_explorer_3` |
| **Milestone 2** | Expanded 10 Eye-Comfort Themes & Contrast Engine | **PLANNED** | Ready to dispatch after M1 gate passes |
| **Milestone 3** | Dual-Mode PDF Reading Engine (Reflowable & Visual) | **PLANNED** | Ready to dispatch after M1 & M2 |
| **Milestone 4** | MOBI/AZW, Plain Text & Markdown Reading Support | **PLANNED** | Ready to dispatch after M1 & M2 |
| **Milestone 5** | Ultra-Low Memory Footprint & Resource Cleanup | **PLANNED** | Scheduled for engine teardown & virtualization |
| **Milestone 6** | Final Verification, Adversarial Hardening & Docs | **PLANNED** | Final acceptance & documentation |

---

## 2. Active Subagents
- All 16 subagents from Orchestrator 2 generation have completed their assigned tasks and delivered their handoff reports.
- Current active subagent count: 0 running.

---

## 3. Pending Decisions & Technical Context for Successor

### Milestone 1 Iteration 2 Remediation (Immediate Next Step)
1. **The Flaw Identified by Challenger 2**:
   - File: `js/parser/asset-extractor.js:103-117` (`DOMSanitizer.sanitize(root)`)
   - Cause: When `root` is a detached dangerous element (e.g., `document.createElement('script')`, `parentNode === null`), `root.remove()` is a no-op under W3C specifications. Line 111 immediately returns `root`, leaving its text content and attributes unneutralized. If subsequently mounted, it executes!
   - Fix: In `DOMSanitizer.sanitize(root)`, when `root` is a dangerous tag (`script`, `iframe`, `object`, `embed`, `applet`, `base`, `frame`, `frameset`, `meta refresh`):
     - Call `root.remove()`
     - Set `root.textContent = ''`
     - While `root.firstChild`, `root.removeChild(root.firstChild)`
     - Clear all attributes (`Array.from(root.attributes).forEach(a => root.removeAttribute(a.name))`)
     - Return the inert element.
   - Reference: `.agents/teamwork/m1_r2_explorer_1/analysis.md` and proposed patch.

2. **UI Selector Multi-Attribute Aliases**:
   - File: `index.html:77-86` (`#format-filter-bar`)
   - Add selector aliases on `#format-filter-bar button`:
     - `data-filter="<format>"`
     - `data-format-filter="<format>"`
     - `class="segmented-option format-filter-btn filter-tab filter-tab-<format>"`
     - `role="tab"` and `aria-selected`
   - In `css/main.css`: add rules for `.library-filter-tabs, .filter-tabs, .filter-tab, .active`.
   - In `js/ui/library-view.js`: event delegation accepts `data-filter` or `data-format-filter`, and `setFilter` toggles both `.is-active` and `.active`.
   - Reference: `.agents/teamwork/m1_r2_explorer_2/analysis.md`.

3. **Synthesized Plan**:
   - Read `.agents/teamwork/m1_r2_explorer_3/analysis.md` for the unified Worker 2 blueprint.

---

## 4. Remaining Work (Concrete Next Steps for Successor)

1. **Step 1: Dispatch Milestone 1 Worker 2 (`m1_upgrade_worker_2`)**:
   - Give exclusive ownership: `js/parser/asset-extractor.js`, `index.html`, `css/main.css`, `js/ui/library-view.js`.
   - Provide blueprints from `m1_r2_explorer_1/analysis.md`, `m1_r2_explorer_2/analysis.md`, and `m1_r2_explorer_3/analysis.md`.
   - Implement the fixes.
   - Verify tests pass:
     - `node test/challenger_m1_adversarial.js` (Must pass 13/13)
     - `node test/challenger_storage_v2_adversarial.test.js` (Must pass 19/19)
     - `node test/challenger_storage.test.js` (Must pass 22/22)
     - `node test/challenger_m2_r2_adversarial.js` (Must pass 4/4)
     - `node test/e2e.test.js` (Must pass 21/21)
2. **Step 2: Verification Cycle for M1 Iteration 2**:
   - Spawn 2 Reviewers, 2 Challengers (specifically Challenger 2 to re-verify `challenger_m1_adversarial.js`), and 1 Forensic Auditor.
   - Evaluate Gate 1. When all approve and auditor is CLEAN, mark M1 **DONE**.
3. **Step 3: Advance to Milestone 2 (Expanded 10 Eye-Comfort Themes & Contrast Engine)**:
   - Implement 10 themes in `css/themes.css` with verified WCAG AAA (>= 7.0:1) contrast ratios, zero-FOUC head bootstrap in `index.html`, settings drawer 10 swatches in `index.html` & `js/ui/settings-panel.js`.
4. **Step 4: Milestones 3, 4, 5, 6**:
   - Continue downstream per `PROJECT.md`.

---

## 5. Key Artifacts
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md`
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/TEST_READY.md`
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md`
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/orchestrator_2/GATE_STATUS.md`
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_r2_explorer_1/analysis.md`
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_r2_explorer_2/analysis.md`
- `/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/m1_r2_explorer_3/analysis.md`
