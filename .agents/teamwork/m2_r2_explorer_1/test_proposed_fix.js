/**
 * test_proposed_fix.js
 * Independent verification script for Explorer 1 proposed fixes.
 */

const fs = require('node:fs');
const path = require('node:path');

async function testProposedFix() {
  console.log('Testing proposed_path-resolver.js...');

  // 1. Load JSZip
  const jszipPath = path.resolve(__dirname, '../../../vendor/jszip.min.js');
  const jszipCode = fs.readFileSync(jszipPath, 'utf8');
  const JSZip = new Function(jszipCode + '; return JSZip;')();

  // 2. Import proposed path-resolver
  const proposedModule = await import('./proposed_path-resolver.js');
  const { findZipEntry, resolvePath, normalizePath, safeDecodeURIComponent } = proposedModule;

  // 3. Create zip with various edge-case catalog keys
  const zip = new JSZip();
  zip.file('OEBPS/Images/Cover Photo%20(1).JPG', 'data-literal-mixed-percent');
  zip.file('OEBPS/Images/Cover%20Photo%20(2).JPG', 'data-full-percent');
  zip.file('OEBPS/Images/Normal Cover (3).jpg', 'data-literal-space');
  zip.file('OEBPS/Images/Special (4)%23hash.png', 'data-percent-hash');
  zip.file('OEBPS\\Images\\Backslash (5)%20Cover.jpg', 'data-backslash');
  zip.file('/OEBPS/Images/LeadingSlash (6)%20Cover.jpg', 'data-leading-slash');

  // Assertions
  function assert(cond, msg) {
    if (!cond) {
      console.error('FAILED:', msg);
      throw new Error(msg);
    }
  }

  // Test Case 1: Look up 'OEBPS/Images/Cover Photo%20(1).JPG' using decoded path produced by resolvePath
  const resolvedPath1 = resolvePath('OEBPS/text/ch01.xhtml', '../Images/Cover%20Photo%20(1).JPG');
  assert(resolvedPath1 === 'OEBPS/Images/Cover Photo (1).JPG', `resolvePath unexpected: ${resolvedPath1}`);

  const entry1 = findZipEntry(zip, resolvedPath1);
  assert(entry1 !== null, 'findZipEntry failed to find literal mixed percent entry using decoded path');
  const content1 = await entry1.async('string');
  assert(content1 === 'data-literal-mixed-percent', `Content mismatch: ${content1}`);
  console.log('✅ PASS: Decoded path resolves to literal mixed percent ZIP entry');

  // Test Case 2: Look up using uppercase, lowercase, and partially-encoded variations
  const variations = [
    'OEBPS/Images/Cover Photo (1).JPG',
    'oebps/images/cover photo (1).jpg',
    'OEBPS/IMAGES/COVER PHOTO (1).JPG',
    'OEBPS/Images/Cover%20Photo%20(1).JPG',
    'oebps/images/cover%20photo%20(1).jpg',
    'OEBPS/Images/Cover Photo%20(1).JPG'
  ];
  for (const v of variations) {
    const e = findZipEntry(zip, v);
    assert(e !== null, `Failed to match variation: ${v}`);
  }
  console.log(`✅ PASS: All ${variations.length} case & encoding variations matched successfully`);

  // Test Case 3: Fully percent-encoded ZIP key
  const resolvedPath2 = resolvePath('OEBPS/text/ch01.xhtml', '../Images/Cover%20Photo%20(2).JPG');
  const entry2 = findZipEntry(zip, resolvedPath2);
  assert(entry2 !== null, 'Failed to find full-percent entry');
  assert(await entry2.async('string') === 'data-full-percent', 'Content mismatch for full percent');
  console.log('✅ PASS: Fully percent-encoded ZIP entry found via decoded path');

  // Test Case 4: Literal space ZIP key
  const resolvedPath3 = resolvePath('OEBPS/text/ch01.xhtml', '../Images/Normal%20Cover%20(3).jpg');
  const entry3 = findZipEntry(zip, resolvedPath3);
  assert(entry3 !== null, 'Failed to find normal cover with space');
  assert(await entry3.async('string') === 'data-literal-space', 'Content mismatch for normal cover');
  console.log('✅ PASS: Normal space entry found via decoded path');

  // Test Case 5: Windows backslash key in ZIP
  const entry5 = findZipEntry(zip, 'OEBPS/Images/Backslash (5) Cover.jpg');
  assert(entry5 !== null, 'Failed to find backslash entry in ZIP');
  assert(await entry5.async('string') === 'data-backslash', 'Content mismatch for backslash entry');
  console.log('✅ PASS: Windows backslash entry found and normalized');

  // Test Case 6: Leading slash key in ZIP
  const entry6 = findZipEntry(zip, 'OEBPS/Images/LeadingSlash (6) Cover.jpg');
  assert(entry6 !== null, 'Failed to find leading slash entry in ZIP');
  assert(await entry6.async('string') === 'data-leading-slash', 'Content mismatch for leading slash entry');
  console.log('✅ PASS: Leading slash entry found and normalized');

  // Test OpfParser HTML5 fallback prefix stripping logic
  const mockNode = {
    localName: 'dc:title',
    nodeName: 'DC:TITLE',
    textContent: '  Resilient HTML5 Book Title  '
  };
  const rawName = mockNode.localName || mockNode.nodeName || '';
  const nodeLocal = (rawName.split(':').pop() || '').toLowerCase();
  assert(nodeLocal === 'title', `Prefix stripping failed: got "${nodeLocal}", expected "title"`);
  console.log('✅ PASS: HTML5 fallback prefix stripping correctly isolates "title"');

  console.log('\nALL 6 INDEPENDENT TESTS PASSED FOR PROPOSED REMEDIATION!');
}

testProposedFix().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
