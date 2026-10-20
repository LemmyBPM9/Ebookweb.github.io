// test_cdp.js: Verify headless Chrome with native CDP in Node 25
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = '';
  // Wait for DevTools listening line
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for chrome')), 5000);
    chrome.stderr.on('data', (data) => {
      const str = data.toString();
      const match = str.match(/ws:\/\/127\.0\.0\.1:9222\/devtools\/browser\/[a-zA-Z0-9-]+/);
      if (match) {
        wsUrl = match[0];
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  console.log('Connected to browser ws:', wsUrl);

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

  // Create a new target/page
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.result.targetId;

  // Attach to target
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

  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      * { margin:0; padding:0; box-sizing: border-box; }
      body { width: 800px; height: 600px; overflow: hidden; }
      #viewport {
        width: 600px;
        height: 400px;
        overflow-x: hidden;
        overflow-y: hidden;
        border: 2px solid black;
        margin: 20px;
      }
      #columns {
        height: 100%;
        column-width: 600px;
        column-gap: 0px;
        column-fill: auto;
      }
      p { font-size: 16px; line-height: 24px; margin-bottom: 16px; }
    </style>
    </head>
    <body>
      <div id="viewport">
        <div id="columns">
          ${Array.from({length: 40}, (_, i) => `<p>Paragraph ${i+1}: EPUB reader paginated column text flow verification.</p>`).join('')}
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSession('Page.setDocumentContent', { frameId: (await sendSession('Page.getFrameTree')).result.frameTree.frame.id, html: testHtml });

  // Evaluate column dimensions and scroll navigation
  const evalRes = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const vp = document.getElementById('viewport');
        const cols = document.getElementById('columns');
        const width = vp.clientWidth;
        const scrollWidth = vp.scrollWidth;
        const totalPages = Math.round(scrollWidth / width);
        
        // Turn to page 2 (0-indexed page 1)
        vp.scrollLeft = 1 * width;
        const scrolledLeft = vp.scrollLeft;

        return {
          clientWidth: width,
          scrollWidth: scrollWidth,
          totalPages: totalPages,
          scrolledLeft: scrolledLeft
        };
      })()
    `,
    returnByValue: true
  });

  console.log('EVALUATION RESULT:', evalRes.result.result.value);

  ws.close();
  chrome.kill();
}

run().catch(console.error);
