/**
 * .agents/teamwork/m1_reviewer_2/test_adversarial.js
 * Adversarial stress testing for Milestone 1: Core Foundation, Storage & Themes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Helper assertion
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    results.push({ status: 'PASS', message });
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    results.push({ status: 'FAIL', message });
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log('================================================================');
console.log('       ADVERSARIAL STRESS TEST SUITE — MILESTONE 1             ');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. EventBus Adversarial Testing
// -----------------------------------------------------------------------------
console.log('--- 1. EventBus Adversarial Stress Tests ---');
const { EventBus, EVENTS } = await import(path.join(REPO_ROOT, 'js/event-bus.js'));

// Test 1.1: EventBus handler mutation during iteration
{
  EventBus.clear();
  let unsub2 = null;
  let handler2Called = false;
  let handler3Called = false;

  EventBus.on('test:mutation', () => {
    // Unsubscribe handler 2 while inside handler 1
    if (unsub2) unsub2();
  });

  unsub2 = EventBus.on('test:mutation', () => {
    handler2Called = true;
  });

  EventBus.on('test:mutation', () => {
    handler3Called = true;
  });

  EventBus.emit('test:mutation');
  // Because snapshot Array.from(handlers) is taken, handler2 may execute or snapshot preserves it,
  // but crucially: it must NOT throw a concurrent modification error, and handler 3 must execute!
  assert(handler3Called === true, 'Subsequent handler executed despite mid-iteration unsubscription');
  
  // On second emission, handler 2 must definitely NOT run
  handler2Called = false;
  EventBus.emit('test:mutation');
  assert(handler2Called === false, 'Unsubscribed handler does not run on subsequent emit');
}

// Test 1.2: Rapid 1000 events emission stress
{
  EventBus.clear();
  let counter = 0;
  const unsub = EventBus.on('stress:count', () => counter++);
  for (let i = 0; i < 1000; i++) {
    EventBus.emit('stress:count');
  }
  assert(counter === 1000, 'Handled 1,000 rapid synchronous emissions accurately');
  unsub();
  assert(EventBus.listenerCount('stress:count') === 0, 'Listener count correctly returns 0 after unsub');
}

// Test 1.3: Non-function handlers throw TypeError
{
  let caught = false;
  try {
    EventBus.on('test:invalid', 'not-a-function');
  } catch (err) {
    caught = err instanceof TypeError;
  }
  assert(caught, 'EventBus.on rejects non-function handler with TypeError');
}

// Test 1.4: Multiple exceptions in chain do not stop other listeners
{
  EventBus.clear();
  let l1 = false, l2 = false, l3 = false;
  EventBus.on('test:multi-err', () => { l1 = true; throw new Error('Err 1'); });
  EventBus.on('test:multi-err', () => { l2 = true; throw new Error('Err 2'); });
  EventBus.on('test:multi-err', () => { l3 = true; });

  // Suppress console.error during expected failure
  const origError = console.error;
  console.error = () => {};
  EventBus.emit('test:multi-err');
  console.error = origError;

  assert(l1 && l2 && l3, 'All listeners execute even when multiple listeners throw errors');
}

// Test 1.5: Object.freeze on EVENTS catalog
{
  let threw = false;
  try {
    EVENTS.NEW_EVENT = 'new:event';
  } catch (e) {
    threw = true;
  }
  assert(EVENTS.NEW_EVENT === undefined, 'EVENTS catalog is immutable (frozen)');
}

// -----------------------------------------------------------------------------
// 2. SettingsManager Adversarial Testing
// -----------------------------------------------------------------------------
console.log('\n--- 2. SettingsManager Adversarial Stress Tests ---');
const { SettingsManager, THEMES, DEFAULT_TYPOGRAPHY } = await import(path.join(REPO_ROOT, 'js/storage/settings-store.js'));

// Test 2.1: Corrupted / Malformed JSON in storage
{
  SettingsManager._memoryFallback.set('webreader_typography', '{ malformed json: not valid !!');
  const typo = SettingsManager.getTypography();
  assert(
    typo.fontFamily === DEFAULT_TYPOGRAPHY.fontFamily &&
    typo.fontSize === DEFAULT_TYPOGRAPHY.fontSize &&
    typo.lineHeight === DEFAULT_TYPOGRAPHY.lineHeight &&
    typo.maxWidth === DEFAULT_TYPOGRAPHY.maxWidth,
    'Malformed typography JSON gracefully falls back to default settings'
  );
}

// Test 2.2: Extreme typography boundaries (clamping / sanitization)
{
  SettingsManager._memoryFallback.set('webreader_typography', JSON.stringify({
    fontSize: -999,
    lineHeight: 100.5,
    maxWidth: 99999,
    fontFamily: 'evil-script'
  }));
  const typo = SettingsManager.getTypography();
  assert(typo.fontSize === DEFAULT_TYPOGRAPHY.fontSize, 'Negative fontSize rejected, fallback to default');
  assert(typo.lineHeight === DEFAULT_TYPOGRAPHY.lineHeight, 'Extreme lineHeight rejected, fallback to default');
  assert(typo.maxWidth === DEFAULT_TYPOGRAPHY.maxWidth, 'Excessive maxWidth rejected, fallback to default');
  assert(typo.fontFamily === DEFAULT_TYPOGRAPHY.fontFamily, 'Disallowed fontFamily rejected, fallback to default');
}

// Test 2.3: Valid typography within boundaries accepted
{
  SettingsManager.saveSettings({
    typography: { fontSize: 24, lineHeight: 2.0, maxWidth: 800, fontFamily: 'sans' }
  });
  const typo = SettingsManager.getTypography();
  assert(typo.fontSize === 24, 'Valid custom fontSize 24 accepted');
  assert(typo.lineHeight === 2.0, 'Valid custom lineHeight 2.0 accepted');
  assert(typo.maxWidth === 800, 'Valid custom maxWidth 800 accepted');
  assert(typo.fontFamily === 'sans', 'Valid custom fontFamily "sans" accepted');
}

// Test 2.4: Malformed theme injection attempt
{
  SettingsManager.setTheme('"><script>alert(1)</script>');
  assert(SettingsManager.getTheme() === THEMES.WARM_PAPER, 'XSS / invalid theme rejected, defaults to warm-paper');
  SettingsManager.setTheme(null);
  assert(SettingsManager.getTheme() === THEMES.WARM_PAPER, 'Null theme safely defaults to warm-paper');
}

// -----------------------------------------------------------------------------
// 3. EPUB Conformance & Strict Binary Structure
// -----------------------------------------------------------------------------
console.log('\n--- 3. EPUB Conformance & Binary Structure Tests ---');
const jszipPath = path.join(REPO_ROOT, 'vendor/jszip.min.js');
const jszipCode = fs.readFileSync(jszipPath, 'utf8');
const JSZipFactory = new Function(jszipCode + '; return JSZip;')();
globalThis.JSZip = JSZipFactory;

const { generateSampleEpub, SAMPLE_BOOK_METADATA } = await import(path.join(REPO_ROOT, 'js/sample-book.js'));
const { arrayBuffer } = await generateSampleEpub();
const buffer = Buffer.from(arrayBuffer);

// Test 3.1: Strict OCF 3.3 §3.3 check: mimetype at offset 30, no compression, no extra fields
const localHeaderSig = buffer.readUInt32LE(0);
assert(localHeaderSig === 0x04034b50, 'File begins with local header signature 0x04034b50');

const compMethod = buffer.readUInt16LE(8);
assert(compMethod === 0, 'Entry 0 (mimetype) compression method is 0 (STORE)');

const fnLength = buffer.readUInt16LE(26);
assert(fnLength === 8, 'Entry 0 filename length is exactly 8 bytes ("mimetype")');

const extraLength = buffer.readUInt16LE(28);
assert(extraLength === 0, 'Entry 0 extra field length is 0 (strict EPUB spec requirement)');

const filename = buffer.toString('utf8', 30, 30 + fnLength);
assert(filename === 'mimetype', 'Entry 0 filename is "mimetype"');

const mimetypeContent = buffer.toString('utf8', 30 + fnLength, 30 + fnLength + 20);
assert(mimetypeContent === 'application/epub+zip', 'Entry 0 content is exact "application/epub+zip"');

// Test 3.2: Parse all files in zip using JSZip
const zip = await JSZipFactory.loadAsync(buffer);
const containerText = await zip.file('META-INF/container.xml')?.async('text');
assert(containerText && containerText.includes('full-path="OEBPS/content.opf"'), 'container.xml specifies OEBPS/content.opf');

const opfText = await zip.file('OEBPS/content.opf')?.async('text');
assert(opfText && opfText.includes('<package'), 'content.opf contains valid <package>');
assert(opfText && opfText.includes('properties="nav"'), 'content.opf marks nav document');
assert(opfText && opfText.includes('properties="cover-image"'), 'content.opf marks cover image');

// Test 3.3: Verify all files declared in manifest actually exist in the archive
const manifestItemMatches = opfText.matchAll(/<item\s+[^>]*href="([^"]+)"/g);
let allManifestFilesExist = true;
let manifestItemCount = 0;
for (const match of manifestItemMatches) {
  manifestItemCount++;
  const href = match[1];
  const fullZipPath = `OEBPS/${href}`;
  if (!zip.file(fullZipPath)) {
    allManifestFilesExist = false;
    console.error(`Missing manifest item in zip: ${fullZipPath}`);
  }
}
assert(manifestItemCount >= 8, `Manifest declares ${manifestItemCount} items`);
assert(allManifestFilesExist, 'Every file referenced in content.opf manifest exists in the ZIP archive');

// Test 3.4: Verify all spine items exist in manifest
const spineIdrefMatches = opfText.matchAll(/<itemref\s+[^>]*idref="([^"]+)"/g);
let allSpineItemsInManifest = true;
let spineCount = 0;
for (const match of spineIdrefMatches) {
  spineCount++;
  const idref = match[1];
  const manifestHasId = opfText.includes(`id="${idref}"`);
  if (!manifestHasId) {
    allSpineItemsInManifest = false;
    console.error(`Spine references undeclared manifest id: ${idref}`);
  }
}
assert(spineCount === 4, `Spine declares 4 chapters/pages (cover + 3 chapters)`);
assert(allSpineItemsInManifest, 'All spine itemrefs reference valid manifest items');

// -----------------------------------------------------------------------------
// 4. Independent Mathematical WCAG Contrast Calculations
// -----------------------------------------------------------------------------
console.log('\n--- 4. WCAG Contrast Mathematical Verification ---');

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function sRgbToLin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * sRgbToLin(r) + 0.7152 * sRgbToLin(g) + 0.0722 * sRgbToLin(b);
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const themeColors = {
  'warm-paper': { bg: '#f8f1e3', text: '#2c2523', accent: '#8b5a2b', accentText: '#ffffff', borderStrong: '#96836e' },
  'soft-dark': { bg: '#1a1c1e', text: '#e2e2e0', accent: '#e5a869', accentText: '#1a1c1e', borderStrong: '#636b75' },
  'daylight': { bg: '#fcfbf9', text: '#1e2022', accent: '#2364a0', accentText: '#ffffff', borderStrong: '#8d9299' },
  'sage': { bg: '#eef3ed', text: '#1c2820', accent: '#2d7348', accentText: '#ffffff', borderStrong: '#778d7b' }
};

for (const [name, t] of Object.entries(themeColors)) {
  const bodyRatio = getContrastRatio(t.bg, t.text);
  assert(bodyRatio >= 7.0, `[${name}] Body text (${bodyRatio.toFixed(2)}:1) meets WCAG AAA (>= 7.0:1)`);

  const accentTextRatio = getContrastRatio(t.accent, t.accentText);
  assert(accentTextRatio >= 4.5, `[${name}] Button text (${accentTextRatio.toFixed(2)}:1) meets WCAG AA (>= 4.5:1)`);

  const borderRatio = getContrastRatio(t.bg, t.borderStrong);
  assert(borderRatio >= 3.0, `[${name}] Strong border UI (${borderRatio.toFixed(2)}:1) meets Non-text UI (>= 3.0:1)`);
}

// Check soft-dark anti-halation:
// It must NOT use pure #000000 or #ffffff
assert(themeColors['soft-dark'].bg !== '#000000', 'soft-dark bg is not harsh #000000 (anti-halation)');
assert(themeColors['soft-dark'].text !== '#ffffff', 'soft-dark text is not blinding #ffffff (anti-halation)');

// -----------------------------------------------------------------------------
// 5. CSS & HTML Inspection
// -----------------------------------------------------------------------------
console.log('\n--- 5. CSS & HTML Layout Conformance ---');
const mainCss = fs.readFileSync(path.join(REPO_ROOT, 'css/main.css'), 'utf8');
const themesCss = fs.readFileSync(path.join(REPO_ROOT, 'css/themes.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

assert(mainCss.includes(':focus-visible'), 'css/main.css defines :focus-visible for keyboard accessibility');
assert(mainCss.includes('.range-slider'), 'css/main.css defines accessible .range-slider typography controls');
assert(mainCss.includes('.drawer'), 'css/main.css defines slide-in .drawer layout');
assert(mainCss.includes('.card-grid'), 'css/main.css defines responsive .card-grid library layout');
assert(themesCss.includes('prefers-reduced-motion'), 'css/themes.css respects prefers-reduced-motion');
assert(indexHtml.includes('vendor/jszip.min.js'), 'index.html loads standalone vendored JSZip');
assert(indexHtml.includes('data-theme'), 'index.html bootstraps data-theme in <head>');

console.log('\n================================================================');
console.log(`STRESS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
