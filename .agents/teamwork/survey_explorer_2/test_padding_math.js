// test_padding_math.js: Verify exact column geometry when padding is on body/viewport vs columns
const { spawn } = require('child_process');

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9224',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for chrome')), 5000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/ws:\/\/127\.0\.0\.1:9224\/devtools\/browser\/[a-zA-Z0-9-]+/);
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

  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 800px;
        height: 600px;
        overflow: hidden;
      }
      /* Viewport provides the margins/gutters */
      #viewport {
        box-sizing: border-box;
        width: 800px;
        height: 600px;
        padding: 40px 60px; /* 40px top/bottom, 60px left/right */
        overflow: hidden;
        position: relative;
      }
      /* Columns container has ZERO padding, fills viewport content box exactly */
      #columns {
        box-sizing: border-box;
        width: 100%; /* 800 - 120 = 680px */
        height: 100%; /* 600 - 80 = 520px */
        column-width: 680px;
        column-gap: 120px; /* Notice: 120px gap matches 2 * 60px margin! */
        column-fill: auto;
        overflow: visible;
      }
      p { font-size: 16px; line-height: 24px; margin-bottom: 16px; }
    </style>
    </head>
    <body>
      <div id="viewport">
        <div id="columns">
          ${Array.from({length: 40}, (_, i) => `<p>Paragraph ${i+1}: Testing exact column geometry with matching gap.</p>`).join('')}
        </div>
      </div>
    </body>
    </html>
  `;

  const frameTree = await sendSession('Page.getFrameTree');
  await sendSession('Page.setDocumentContent', { frameId: frameTree.result.frameTree.frame.id, html: testHtml });

  const evalRes = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const vp = document.getElementById('viewport');
        const cols = document.getElementById('columns');
        const colWidth = cols.clientWidth; // 680
        const gap = 120;
        const step = colWidth + gap; // 800 (exactly viewport width!)
        const scrollWidth = vp.scrollWidth;
        
        // Total pages calculation:
        // scrollWidth = N * colWidth + (N - 1) * gap + 2 * padding = N * step
        const totalPages = Math.round((scrollWidth - 120) / step) + 1; // Or Math.round(vp.scrollWidth / 800)

        // Turn to page 2 (index 1)
        vp.scrollLeft = 1 * step;
        const page1ScrollLeft = vp.scrollLeft;

        // Turn to page 3 (index 2)
        vp.scrollLeft = 2 * step;
        const page2ScrollLeft = vp.scrollLeft;

        return {
          colWidth,
          step,
          scrollWidth: vp.scrollWidth,
          page1ScrollLeft,
          page2ScrollLeft,
          computedPages: Math.ceil(vp.scrollWidth / step)
        };
      })()
    `,
    returnByValue: true
  });

  console.log('PADDING MATH RESULT:', evalRes.result.result.value);

  ws.close();
  chrome.kill();
}

run().catch(console.error);
