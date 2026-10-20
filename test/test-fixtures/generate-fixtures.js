/**
 * Test Fixture Generator for WebReader E2E Tests.
 * Generates synthetic EPUB files for testing valid parsing, corrupted rejection,
 * and boundary/corner cases.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createZipArchive } = require('./zip-helper.js');
const {
  compressPalmDoc,
  decompressPalmDoc,
  generateValidSamplePdf,
  generateValidSampleMobi,
  generateValidSampleTxt,
  generateValidSampleMd,
  generateEmptyTitleTxt,
  generateCorruptedPdf,
  generateCorruptedMobi
} = require('./upgrade-fixtures.js');

const FIXTURES_DIR = __dirname;

function generateCoverSvg(title, author) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34495e"/>
      <stop offset="100%" stop-color="#1a252f"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#bg)"/>
  <rect x="30" y="30" width="540" height="740" fill="none" stroke="#e67e22" stroke-width="4"/>
  <text x="300" y="280" font-family="serif" font-size="34" font-weight="bold" fill="#ecf0f1" text-anchor="middle">${title}</text>
  <line x1="150" y1="330" x2="450" y2="330" stroke="#e67e22" stroke-width="2"/>
  <text x="300" y="390" font-family="sans-serif" font-size="22" fill="#bdc3c7" text-anchor="middle">By ${author}</text>
  <circle cx="300" cy="560" r="50" fill="#e67e22" opacity="0.8"/>
  <text x="300" y="570" font-family="sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">EPUB</text>
</svg>`;
}

function generateValidSampleEpub() {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.openpackage.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:webreader-test-sample-001</dc:identifier>
    <dc:title>The Art of Minimalist Reading</dc:title>
    <dc:creator>Arthur Pendelton</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>A curated multi-chapter test book for verifying reader pagination, scroll modes, themes, and bookmark persistence.</dc:description>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="ch3"/>
  </spine>
</package>`;

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:webreader-test-sample-001"/>
  </head>
  <docTitle><text>The Art of Minimalist Reading</text></docTitle>
  <navMap>
    <navPoint id="np-1" playOrder="1">
      <navLabel><text>Chapter 1: The Sanctuary of Words</text></navLabel>
      <content src="ch1.xhtml"/>
      <navPoint id="np-1-1" playOrder="2">
        <navLabel><text>1.1 The Quiet Mind</text></navLabel>
        <content src="ch1.xhtml#sec-1-1"/>
      </navPoint>
    </navPoint>
    <navPoint id="np-2" playOrder="3">
      <navLabel><text>Chapter 2: Eyes in Balance</text></navLabel>
      <content src="ch2.xhtml"/>
    </navPoint>
    <navPoint id="np-3" playOrder="4">
      <navLabel><text>Chapter 3: Typographic Harmony</text></navLabel>
      <content src="ch3.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li>
        <a href="ch1.xhtml">Chapter 1: The Sanctuary of Words</a>
        <ol>
          <li><a href="ch1.xhtml#sec-1-1">1.1 The Quiet Mind</a></li>
        </ol>
      </li>
      <li><a href="ch2.xhtml">Chapter 2: Eyes in Balance</a></li>
      <li><a href="ch3.xhtml">Chapter 3: Typographic Harmony</a></li>
    </ol>
  </nav>
</body>
</html>`;

  const styleCss = `
body {
  font-family: serif;
  line-height: 1.6;
  margin: 1.5em;
}
h1, h2 {
  color: #2c3e50;
  border-bottom: 1px solid #bdc3c7;
  padding-bottom: 0.3em;
}
p {
  margin-bottom: 1.2em;
  text-indent: 1.5em;
}
p.first {
  text-indent: 0;
}
.highlight-box {
  background: #ecf0f1;
  border-left: 4px solid #3498db;
  padding: 10px 16px;
  margin: 1em 0;
}
`;

  // Chapter 1 has 18 paragraphs so it naturally occupies multiple pages in paginated mode
  const ch1Paragraphs = [
    '<p class="first">Reading is an intimate dialogue between the mind of the author and the sanctuary of the reader’s consciousness. When we open a book, we step into a realm where the noise of the outside world recedes, leaving only the rhythm of thought and the architecture of language.</p>',
    '<p>In the digital age, this sanctuary is frequently compromised. The luminous screens of our computers and smartphones bombard our eyes with intense light, erratic contrast, and visual distraction. The physical book, with its unreflective cream paper and steady charcoal ink, remains the gold standard for effortless immersion.</p>',
    '<p>To read comfortably in the digital medium requires deliberate engineering. Contrast must not be harsh; pure white backgrounds against pitch-black typography produce optical halation—an uncomfortable glowing border where high-frequency light tires the retina.</p>',
    '<p>Instead, warm paper tones, soft charcoal inks, and gentle forest sage palettes harmonize with human biology. They reduce photopic stress and allow our pupil diameter to maintain an unstrained equilibrium over hours of deep literary immersion.</p>',
    '<h2 id="sec-1-1">1.1 The Quiet Mind</h2>',
    '<p>When the visual surface is calm, the mind follows. Typographic rhythm relies on three interconnected virtues: measure, leading, and proportional scale. The measure—the width of a reading column—should ideally accommodate between sixty and seventy-five characters per line.</p>',
    '<p>A column that is too wide forces the eye to make sweeping lateral saccades, inducing mechanical fatigue in the extraocular muscles. At the end of each line, the reader struggles to find the start of the next, causing cognitive friction and re-reading.</p>',
    '<p>Conversely, a column that is excessively narrow breaks the grammatical flow, scattering hyphenated words and fragmenting phrases into staccato bursts. Balance is the highest achievement of typographic craftsmanship.</p>',
    '<p>Leading—the vertical distance between successive baselines—must breathe with the typeface. Generous leading gives the eye a restful channel to travel across, while tight leading compresses the lines into a dark, impenetrable block.</p>',
    '<div class="highlight-box">True elegance in digital reading is not what you add, but what you remove. Every redundant toolbar button, intrusive scrollbar, and garish banner is an intrusion into the author’s voice.</div>',
    '<p>In our paginated view, content behaves like pages in a physical codex. There are no vertical scrollbars twitching in the peripheral vision. Instead, smooth horizontal page turns divide the narrative into discrete, manageable units of thought.</p>',
    '<p>When the reader turns a page, the transition is instant and clean. The eye rests at the top left, ready for the next passage without losing its bearings.</p>',
    '<p>Furthermore, keyboard shortcuts allow instantaneous navigation. A single tap of the space bar or the right arrow key advances the text, keeping the reader’s hands in a natural, relaxed posture.</p>',
    '<p>For those who prefer a flowing scroll, the continuous reading mode adapts effortlessly, maintaining clear chapter transitions and seamless progress indicators.</p>',
    '<p>Whether in bright daylight or in the quiet hours of midnight, the reader remains in total control of their typographic environment.</p>',
    '<p>The bookmarks system allows significant passages to be tagged with a single click, preserved persistently so that weeks later, the exact insight can be summoned without delay.</p>',
    '<p>And when you close the reader and return later, your place is preserved down to the precise paragraph and page, waiting faithfully for your return.</p>',
    '<p>Let us now turn our attention to the physical science of ocular comfort in the following chapter.</p>'
  ].join('\n    ');

  const ch1Xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>Chapter 1: The Sanctuary of Words</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>Chapter 1: The Sanctuary of Words</h1>
  <div class="chapter-content">
    ${ch1Paragraphs}
  </div>
</body>
</html>`;

  const ch2Xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>Chapter 2: Eyes in Balance</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>Chapter 2: Eyes in Balance</h1>
  <div class="chapter-content">
    <p class="first">The human eye evolved under the soft, dynamic light of the sun filtered through atmosphere and foliage. The blue sky provides ambient scattered illumination, while earthy surfaces reflect warm, subdued spectra.</p>
    <p>Modern emissive displays emit sharp, concentrated photons directly into the pupil. When a dark room is illuminated by a stark white browser window, the ciliary muscles remain clenched to restrict light influx, leading to tension headaches and dryness.</p>
    <p>Our four eye-comfort themes are meticulously calibrated to mitigate these effects:</p>
    <ul>
      <li><strong>Warm Paper (Sepia)</strong>: Emulates premium cream parchment, filtering high-frequency blue spectra with mellow amber warmth.</li>
      <li><strong>Soft Dark (Night)</strong>: Designed for nocturnal reading with dark charcoal slate backgrounds and muted grey text, completely avoiding black-hole halation.</li>
      <li><strong>Daylight</strong>: A crisp, balanced high-luminance theme with soft off-white surfaces for sunlit reading rooms.</li>
      <li><strong>Sage (Forest Calm)</strong>: Uses the soothing psychological and physiological qualities of pale botanical green, scientifically shown to relax ocular focus.</li>
    </ul>
    <p>Each palette exceeds WCAG AAA contrast guidelines with ratios exceeding 12:1, ensuring effortless legibility without photopic glare.</p>
  </div>
</body>
</html>`;

  const ch3Xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>Chapter 3: Typographic Harmony</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>Chapter 3: Typographic Harmony</h1>
  <div class="chapter-content">
    <p class="first">Typography is the clothing of thought. A serif font like Georgia or Merriweather provides subtle horizontal anchors along the baseline, aiding horizontal saccades across dense literary prose.</p>
    <p>Clean geometric sans-serif fonts offer modern clarity, ideal for technical monographs and fast skimming. For readers with dyslexia, weighted baselines and distinct letter shapes reduce visual crowding and mirror confusion.</p>
    <p>By empowering the reader to adjust font scale, line spacing, and margin width dynamically, WebReader ensures that readability adapts to the human, not the other way around.</p>
    <p>You have reached the conclusion of this foundational exploration. May every book you read bring clarity and delight.</p>
  </div>
</body>
</html>`;

  const files = [
    { name: 'mimetype', data: 'application/epub+zip', compress: false },
    { name: 'META-INF/container.xml', data: containerXml },
    { name: 'OEBPS/content.opf', data: contentOpf },
    { name: 'OEBPS/toc.ncx', data: tocNcx },
    { name: 'OEBPS/nav.xhtml', data: navXhtml },
    { name: 'OEBPS/style.css', data: styleCss },
    { name: 'OEBPS/cover.svg', data: generateCoverSvg('The Art of Minimalist Reading', 'Arthur Pendelton') },
    { name: 'OEBPS/ch1.xhtml', data: ch1Xhtml },
    { name: 'OEBPS/ch2.xhtml', data: ch2Xhtml },
    { name: 'OEBPS/ch3.xhtml', data: ch3Xhtml }
  ];

  return createZipArchive(files);
}

function generateEmptyTitleEpub() {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  // Notice: dc:title is completely empty string or whitespace
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.openpackage.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:webreader-test-empty-title</dc:identifier>
    <dc:title>   </dc:title>
    <dc:creator></dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

  const ch1Xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><title>No Title Book</title></head>
<body><p>Testing empty book title fallback handling.</p></body>
</html>`;

  const files = [
    { name: 'mimetype', data: 'application/epub+zip', compress: false },
    { name: 'META-INF/container.xml', data: containerXml },
    { name: 'OEBPS/content.opf', data: contentOpf },
    { name: 'OEBPS/ch1.xhtml', data: ch1Xhtml }
  ];

  return createZipArchive(files);
}

function generateCorruptedEpub() {
  // Invalid non-zip file starting with garbage bytes
  return Buffer.from('NOT_A_VALID_ZIP_ARCHIVE_CORRUPTED_BYTES_0123456789!@#$%^&*()', 'utf8');
}

function buildAllFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Baseline EPUB fixtures
  const validSample = generateValidSampleEpub();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-sample.epub'), validSample);
  console.log(`[fixture] Created valid-sample.epub (${validSample.length} bytes)`);

  const emptyTitle = generateEmptyTitleEpub();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'empty-title.epub'), emptyTitle);
  console.log(`[fixture] Created empty-title.epub (${emptyTitle.length} bytes)`);

  const corrupted = generateCorruptedEpub();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'corrupted.epub'), corrupted);
  console.log(`[fixture] Created corrupted.epub (${corrupted.length} bytes)`);

  // Multi-Format Upgrade fixtures
  const validPdf = generateValidSamplePdf();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-sample.pdf'), validPdf);
  console.log(`[fixture] Created valid-sample.pdf (${validPdf.length} bytes)`);

  const validMobi = generateValidSampleMobi();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-sample.mobi'), validMobi);
  console.log(`[fixture] Created valid-sample.mobi (${validMobi.length} bytes)`);

  // AZW format uses same mobi binary container
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-sample.azw'), validMobi);
  console.log(`[fixture] Created valid-sample.azw (${validMobi.length} bytes)`);

  const validTxt = generateValidSampleTxt();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-sample.txt'), validTxt);
  console.log(`[fixture] Created valid-sample.txt (${validTxt.length} bytes)`);

  const validMd = generateValidSampleMd();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'valid-sample.md'), validMd);
  console.log(`[fixture] Created valid-sample.md (${validMd.length} bytes)`);

  const emptyTitleTxt = generateEmptyTitleTxt();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'empty-title.txt'), emptyTitleTxt);
  console.log(`[fixture] Created empty-title.txt (${emptyTitleTxt.length} bytes)`);

  const corruptedPdf = generateCorruptedPdf();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'corrupted.pdf'), corruptedPdf);
  console.log(`[fixture] Created corrupted.pdf (${corruptedPdf.length} bytes)`);

  const corruptedMobi = generateCorruptedMobi();
  fs.writeFileSync(path.join(FIXTURES_DIR, 'corrupted.mobi'), corruptedMobi);
  console.log(`[fixture] Created corrupted.mobi (${corruptedMobi.length} bytes)`);
}

if (require.main === module) {
  buildAllFixtures();
}

module.exports = {
  buildAllFixtures,
  generateValidSampleEpub,
  generateEmptyTitleEpub,
  generateCorruptedEpub,
  compressPalmDoc,
  decompressPalmDoc,
  generateValidSamplePdf,
  generateValidSampleMobi,
  generateValidSampleTxt,
  generateValidSampleMd,
  generateEmptyTitleTxt,
  generateCorruptedPdf,
  generateCorruptedMobi
};
