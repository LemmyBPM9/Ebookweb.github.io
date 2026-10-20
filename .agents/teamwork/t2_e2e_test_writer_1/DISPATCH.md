## 2026-10-17T18:48:47Z

You are teamwork_preview_test_writer (instance t2_e2e_test_writer_1).
Your working directory is:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/t2_e2e_test_writer_1/

MANDATORY FIRST STEP: Read the user request file at:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/ORIGINAL_REQUEST.md
specifically paying attention to ## 2026-10-17T18:34:26Z.
Also read PROJECT.md at the project root:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/PROJECT.md
and inspect existing tests in `test/` (`test/server.js`, `test/e2e.test.js`, `test/challenger_storage.test.js`, `test/challenger_m2_r2_adversarial.js`).

Your Scope:
Design and implement the E2E Testing Track automated test infrastructure and test suites for the WebReader Multi-Format Upgrade:
1. Ensure `test/server.js` serves `.pdf`, `.mobi`, `.md`, `.txt` with proper MIME types.
2. Build synthetic test fixtures or generator functions for:
   - Valid sample `.pdf` file (or minimal PDF byte sequence)
   - Valid sample `.mobi` / `.azw` file (with PalmDOC compressed text)
   - Valid sample `.txt` file (with chapters and paragraphs)
   - Valid sample `.md` file (with Markdown headings, lists, code, emphasis)
3. Create `test/e2e_upgrade.test.js` covering:
   - Tier 1: Multi-format import verification (.epub, .pdf, .mobi, .txt, .md), format badge appearance, and header filter tab functionality.
   - Tier 1: Dual-mode PDF reading: Reflowable Text Mode text rendering vs. Visual Page Mode canvas rendering and mode toggle button.
   - Tier 1: MOBI, Plain Text, and Markdown reading and TOC navigation.
   - Tier 1: All 10 eye-comfort themes, WCAG AAA contrast ratio assertions (>= 7.0:1), and zero-FOUC persistence across reload.
   - Tier 2: Boundary & Corner Cases: invalid format rejection, empty title fallbacks, boundary page clamping.
   - Tier 3: Memory & CPU optimization stress test:
     - Verify `StorageManager.getAllBooks()` returns metadata without `fileBlob` in RAM.
     - 10x repeated book open and close cycles in Chromium verifying zero unrevoked Blob URLs, zero detached iframes, and bounded JS heap growth.
   - Tier 4: Complete user journeys across multiple formats and themes.
4. Run your test suite against the current server to verify test harness mechanics (asserting expected failures for unimplemented features until implementation milestones complete).
5. Publish `TEST_READY.md` at project root documenting test runner commands and coverage summary.
6. Write a comprehensive report to:
/Users/leminh/Library/CloudStorage/GoogleDrive-leminh2606bn@gmail.com/My Drive/Code/VSC/webreader/.agents/teamwork/t2_e2e_test_writer_1/test_infra_report.md
and handoff.md. Send completion message when done.
