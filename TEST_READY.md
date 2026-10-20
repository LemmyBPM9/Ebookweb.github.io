# TEST_READY: WebReader Multi-Format Upgrade Automated E2E Test Suite

**Published**: 2026-10-17T18:58:00Z  
**Author**: E2E Test Writer (`t2_e2e_test_writer_1`)  
**Status**: **READY & ARMED** (100% Infrastructure & Fixtures Verified; 20 Tests Defined Across Tiers 0–4)

---

## 1. Quick Start / Test Runner Commands

### Execute Multi-Format Upgrade Test Suite:
```bash
# Run full Multi-Format Upgrade test suite (Tiers 0 - 4)
node test/e2e_upgrade.test.js

# Verify test infrastructure and synthetic multi-format fixtures (Smoke Test)
node test/e2e_upgrade.test.js --tier=0

# Execute individual tiers
node test/e2e_upgrade.test.js --tier=1  # Multi-Format Import, Dual-Mode PDF, MOBI/TXT/MD, 10 Themes
node test/e2e_upgrade.test.js --tier=2  # Boundary & Corner Cases (Invalid formats, empty titles, page clamping)
node test/e2e_upgrade.test.js --tier=3  # Memory & Resource Stress (StorageManager V2, 10x book cycles, heap)
node test/e2e_upgrade.test.js --tier=4  # Full User Journey across formats and reload

# Filter tests by title or keyword
node test/e2e_upgrade.test.js --grep="PDF"
node test/e2e_upgrade.test.js --grep="Theme"
node test/e2e_upgrade.test.js --grep="MOBI"

# Run with visible browser window for visual inspection
node test/e2e_upgrade.test.js --headless=false
```

### Full Regression Suite:
```bash
# Baseline EPUB E2E Suite (Tiers 0 - 4)
node test/e2e.test.js

# Storage V2 & Cascade Delete Adversarial Challenger
node test/challenger_storage.test.js

# Security, Sanitization & Parser Adversarial Challenger
node test/challenger_m2_r2_adversarial.js
```

---

## 2. Infrastructure & Environment Readiness

| Component | Path | Status | Verification |
|-----------|------|--------|--------------|
| **Multi-Format Static Server** | `test/server.js` | **Verified** | Serves `.html`, `.css`, `.js`, `.epub`, `.pdf`, `.mobi`, `.azw`, `.txt`, `.md` with correct MIME types, CORS headers, and security boundaries |
| **Synthetic Fixture Engine** | `test/test-fixtures/` | **Verified** | Programmatic generators for valid `.pdf`, `.mobi`/`.azw` (PalmDOC LZ77 compressed), `.txt`, `.md`, plus boundary variants (`empty-title`, `corrupted`) |
| **PalmDOC Compression Engine** | `test/test-fixtures/upgrade-fixtures.js` | **Verified** | Standards-compliant PalmDOC LZ77 compressor & decompressor with roundtrip validation |
| **WCAG AAA Contrast Engine** | `test/e2e_upgrade.test.js` | **Verified** | Relative luminance calculation asserting >= 7.0:1 (AAA) body contrast across all 10 themes |
| **Memory & Resource Leak Tracker** | `test/e2e_upgrade.test.js` | **Verified** | Instruments `URL.createObjectURL`/`revokeObjectURL`, measures DOM nodes, detached iframes, and Chromium JS heap delta |
| **Browser Driver** | `puppeteer-core` | **Verified** | Automated control of Google Chrome 155+ |

---

## 3. Test Coverage Matrix (20 Tests across Tiers 0–4)

### Tier 0: Test Infrastructure & Multi-Format Fixtures Verification (4 Tests)
- [x] `0.1 Static HTTP Server Serves Multi-Format MIME Types & Security Boundaries` (.pdf, .mobi, .azw, .txt, .md)
- [x] `0.2 Synthetic Multi-Format Fixtures Built with Correct Binary Headers & Magic Bytes` (%PDF-, MOBI PDB, PK zip)
- [x] `0.3 PalmDOC LZ77 Compression and Decompression Roundtrip` (Lossless decompression)
- [x] `0.4 WCAG AAA Contrast Calculation Engine Baseline for All 10 Themes` (All 10 themes >= 7.0:1)

### Tier 1: Multi-Format Upgrade Feature Coverage (9 Tests)
- [ ] `1.1 Multi-Format File Picker Accept Attribute & Drag-and-Drop Handler` (Accepts .epub, .pdf, .mobi, .azw, .txt, .md)
- [ ] `1.2 Format Badges on Library Cards (EPUB, PDF, MOBI, TXT, MD)` (Distinct format badge on each card)
- [ ] `1.3 Header Format Filter Tab Functionality (All, EPUB, PDF, MOBI, TXT, MD)` (Filtering grid by format)
- [ ] `1.4 Dual-Mode PDF Reading: Reflowable Text Mode vs. Visual Page Mode Canvas Rendering & Toggle`
- [ ] `1.5 MOBI / AZW Reading & Chapter / TOC Navigation` (PalmDOC decompression & TOC extraction)
- [ ] `1.6 Plain Text (.txt) Paragraph Reading & Synthetic TOC` (Blank-line paragraphing & chapter TOC)
- [ ] `1.7 Markdown (.md) GFM Elements & TOC Navigation` (H1-H3, lists, blockquotes, code, tables)
- [ ] `1.8 All 10 Eye-Comfort Themes & WCAG AAA Contrast Assertions (>= 7.0:1)` (10 themes verified in DOM)
- [ ] `1.9 Zero-FOUC Theme Boot & Persistence Across Reload for 10 Themes` (Inline script & localStorage)

### Tier 2: Boundary & Corner Cases (3 Tests)
- [ ] `2.1 Corrupted / Invalid File Format Rejection with Non-Blocking Error Toast` (Corrupted PDF & MOBI rejection)
- [ ] `2.2 Empty / Whitespace Title Fallbacks across Formats` (Graceful fallback to filename or default title)
- [ ] `2.3 Boundary Page and Chapter Clamping Across Document Formats` (No negative or out-of-bounds page index)

### Tier 3: Memory & CPU Optimization Stress Test (3 Tests)
- [ ] `3.1 StorageManager Segregated Storage: getAllBooks() Returns Metadata Without Raw Binary Payloads in RAM`
- [ ] `3.2 10x Repeated Book Open and Close Cycles (Zero Leaked Blob URLs, Zero Detached Iframes, Bounded JS Heap)`
- [ ] `3.3 Zero-Idle CPU & Passive Event Listener Verification` (No runaway timers or blocking event loops)

### Tier 4: Complete Multi-Format User Journeys (1 Test)
- [ ] `4.1 Multi-Format User Journey: Import PDF/MOBI/MD -> Filter -> Read -> Theme -> Reload State Restoration`

---

## 4. Milestone Integration & Handoff

The test harness is armed and ready for the implementation tracks:
- **Milestone 1**: Multi-format library view, file input `accept`, format badges, format filter tabs, and Storage V2.
- **Milestone 2**: Expanded 10 eye-comfort themes, settings swatches, zero-FOUC head bootstrap.
- **Milestone 3**: Dual-mode PDF reading engine (reflowable text extraction & visual canvas rendering).
- **Milestone 4**: MOBI/AZW PalmDOC decompression, plain text paragraphing, and Markdown GFM rendering.
- **Milestone 5**: Memory footprint optimization, deterministic `ReaderEngine.destroy()`, Blob URL revocation, and canvas recycling.

As each milestone completes, running `node test/e2e_upgrade.test.js` progressively transitions tests from expected failures to full pass status.
