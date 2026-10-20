// test_columns.js: Test multi-column layout and iframe pagination using headless Chrome
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 100vw; height: 100vh; overflow: hidden; background: #fdf6e2; }
  #reader-viewport {
    width: 600px;
    height: 400px;
    margin: 20px auto;
    overflow: hidden;
    position: relative;
    border: 1px solid #ccc;
  }
  #reader-columns {
    width: 100%;
    height: 100%;
    column-width: 600px;
    column-gap: 0px;
    column-fill: auto;
    overflow-x: hidden;
    overflow-y: hidden;
  }
  p {
    font-size: 16px;
    line-height: 1.6;
    margin-bottom: 1em;
  }
</style>
</head>
<body>
  <div id="reader-viewport">
    <div id="reader-columns">
      ${Array.from({length: 30}, (_, i) => `<p>Paragraph ${i+1}: The quick brown fox jumps over the lazy dog. Continuous multi-column layout allows smooth book pagination in modern web browsers.</p>`).join('')}
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      const vp = document.getElementById('reader-viewport');
      const cols = document.getElementById('reader-columns');
      const width = cols.clientWidth;
      const scrollWidth = cols.scrollWidth;
      const totalPages = Math.round(scrollWidth / width);
      window.testResult = {
        clientWidth: width,
        scrollWidth: scrollWidth,
        totalPages: totalPages
      };
      console.log('RESULT:' + JSON.stringify(window.testResult));
    });
  </script>
</body>
</html>
`;

const htmlPath = path.join(__dirname, 'test.html');
fs.writeFileSync(htmlPath, htmlContent);

try {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const output = execSync(`"${chromePath}" --headless --disable-gpu --dump-dom "file://${htmlPath}"`, { encoding: 'utf-8' });
  console.log('Chrome executed successfully.');
} catch (e) {
  console.error('Error running Chrome:', e.message);
}
