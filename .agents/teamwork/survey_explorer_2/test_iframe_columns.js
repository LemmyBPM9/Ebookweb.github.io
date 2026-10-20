// test_iframe_columns.js: Test multi-column layout inside an iframe via headless Chrome
const { spawn } = require('child_process');

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9223',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for chrome')), 5000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/ws:\/\/127\.0\.0\.1:9223\/devtools\/browser\/[a-zA-Z0-9-]+/);
      if (match) {
        wsUrl = match[0];
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id)(msg);
      callbacks.delete(msg.id);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.result.targetId;
  const session = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = session.result.sessionId;

  function sendSession(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, sessionId, method, params }));
    });
  }

  await sendSession('Page.enable');
  await sendSession('Runtime.enable');

  // Outer host application document
  const hostHtml = `
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      body { margin: 0; padding: 0; background: #e0d8c3; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
      #header { height: 48px; background: #333; color: white; display: flex; align-items: center; padding: 0 16px; }
      #reader-stage {
        flex: 1;
        position: relative;
        overflow: hidden;
        display: flex;
        justify-content: center;
      }
      #book-frame {
        width: 100%;
        max-width: 800px;
        height: 100%;
        border: none;
        display: block;
      }
      #footer { height: 32px; background: #eee; font-size: 12px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; }
    </style>
    </head>
    <body>
      <div id="header"><span>Reader Header</span></div>
      <div id="reader-stage">
        <iframe id="book-frame" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>
      <div id="footer">
        <span id="chap-name">Chapter 1</span>
        <span id="page-info">Page 1 of ?</span>
      </div>
    </body>
    </html>
  `;

  const frameTree = await sendSession('Page.getFrameTree');
  await sendSession('Page.setDocumentContent', { frameId: frameTree.result.frameTree.frame.id, html: hostHtml });

  // Now populate the iframe with EPUB chapter content and reader engine CSS
  const evalSetup = await sendSession('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const iframe = document.getElementById('book-frame');
        const chapterHtml = \`
          <!DOCTYPE html>
          <html>
          <head>
            <style id="reader-engine-styles">
              html, body {
                margin: 0;
                padding: 0;
                height: 100%;
                overflow: hidden;
                background-color: transparent;
                box-sizing: border-box;
              }
              #content-columns {
                box-sizing: border-box;
                height: 100%;
                width: 100%;
                column-width: 100vw; /* or 100% of body */
                column-gap: 0px;
                column-fill: auto;
                overflow-x: hidden;
                overflow-y: hidden;
                padding: 24px 32px;
                font-family: Georgia, serif;
                font-size: 18px;
                line-height: 1.6;
                color: #2b2b2b;
              }
              p { margin-bottom: 1.2em; text-align: justify; }
              h1 { margin-bottom: 1em; font-size: 1.8em; break-after: avoid; }
            </style>
          </head>
          <body>
            <div id="content-columns">
              <h1>Chapter 1: The Secret Journey</h1>
              \${Array.from({length: 25}, (_, i) => \`<p>Paragraph \${i+1}: It was a bright cold day in April, and the clocks were striking thirteen. The reader flipped through the digital pages seamlessly using multi-column layout.</p>\`).join('')}
            </div>
          </body>
          </html>
        \`;

        iframe.srcdoc = chapterHtml;
        iframe.onload = () => {
          const doc = iframe.contentDocument;
          const cols = doc.getElementById('content-columns');
          const width = cols.clientWidth;
          const scrollWidth = cols.scrollWidth;
          const totalPages = Math.round(scrollWidth / width);

          // Test turning to page 2 (index 1)
          cols.scrollLeft = 1 * width;
          const scrolledLeft = cols.scrollLeft;

          // Test switching to scroll mode
          cols.style.columnWidth = 'auto';
          cols.style.columnGap = '0';
          cols.style.height = 'auto';
          cols.style.overflowY = 'auto';
          doc.body.style.overflowY = 'auto';
          doc.body.style.height = '100%';

          const scrollModeHeight = cols.scrollHeight;

          resolve({
            width,
            scrollWidth,
            totalPages,
            scrolledLeft,
            scrollModeHeight
          });
        };
      })
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('IFRAME TEST RESULT:', evalSetup.result.result.value);

  ws.close();
  chrome.kill();
}

run().catch(console.error);
