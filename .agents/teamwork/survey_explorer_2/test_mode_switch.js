// test_mode_switch.js: Verify dynamic switching between Paginated and Scroll modes
const { spawn } = require('child_process');

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for chrome')), 5000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/ws:\/\/127\.0\.0\.1:9225\/devtools\/browser\/[a-zA-Z0-9-]+/);
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
      :root {
        --viewport-width: 800px;
        --viewport-height: 600px;
        --margin-x: 48px;
        --margin-y: 32px;
      }
      body { margin: 0; padding: 0; background: #f8f4ec; }
      #viewport {
        box-sizing: border-box;
        width: var(--viewport-width);
        height: var(--viewport-height);
        padding: var(--margin-y) var(--margin-x);
        margin: 0 auto;
        position: relative;
      }
      /* Mode: paginated */
      #viewport.paginated {
        overflow-x: hidden;
        overflow-y: hidden;
      }
      #viewport.paginated #columns {
        height: 100%;
        column-width: calc(var(--viewport-width) - (2 * var(--margin-x)));
        column-gap: calc(2 * var(--margin-x));
        column-fill: auto;
      }

      /* Mode: scroll */
      #viewport.scroll {
        overflow-x: hidden;
        overflow-y: auto;
      }
      #viewport.scroll #columns {
        height: auto;
        column-width: auto;
        column-gap: 0;
      }

      p { font-size: 16px; line-height: 1.6; margin-bottom: 1em; }
    </style>
    </head>
    <body>
      <div id="viewport" class="paginated">
        <div id="columns">
          ${Array.from({length: 30}, (_, i) => `<p id="p-${i+1}">Paragraph ${i+1}: Testing dual reading modes and switching smoothly between Paginated column view and Continuous Vertical Scroll view.</p>`).join('')}
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

        // 1. Initial Paginated state
        const paginatedPages = Math.ceil(vp.scrollWidth / vp.clientWidth);
        vp.scrollLeft = 1 * vp.clientWidth;
        const pageTurnLeft = vp.scrollLeft;

        // 2. Switch to Continuous Scroll mode
        vp.className = 'scroll';
        vp.scrollLeft = 0; // reset horizontal scroll
        const scrollMax = vp.scrollHeight - vp.clientHeight;
        vp.scrollTop = 250;
        const scrolledTop = vp.scrollTop;

        // 3. Switch back to Paginated mode
        vp.className = 'paginated';
        vp.scrollTop = 0;
        const paginatedRestoredPages = Math.ceil(vp.scrollWidth / vp.clientWidth);

        return {
          paginatedPages,
          pageTurnLeft,
          scrollMax,
          scrolledTop,
          paginatedRestoredPages
        };
      })()
    `,
    returnByValue: true
  });

  console.log('MODE SWITCH RESULT:', evalRes.result.result.value);

  ws.close();
  chrome.kill();
}

run().catch(console.error);
