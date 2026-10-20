// test_position_sync.js: Verify position sync between Paginated and Scroll modes
const { spawn } = require('child_process');

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9226',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for chrome')), 5000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/ws:\/\/127\.0\.0\.1:9226\/devtools\/browser\/[a-zA-Z0-9-]+/);
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
      body { margin: 0; padding: 0; }
      #viewport {
        box-sizing: border-box;
        width: var(--viewport-width);
        height: var(--viewport-height);
        padding: var(--margin-y) var(--margin-x);
        margin: 0 auto;
        position: relative;
      }
      #viewport.paginated {
        overflow: hidden;
      }
      #viewport.paginated #columns {
        height: 100%;
        column-width: calc(var(--viewport-width) - (2 * var(--margin-x)));
        column-gap: calc(2 * var(--margin-x));
        column-fill: auto;
      }
      #viewport.scroll {
        overflow-x: hidden;
        overflow-y: auto;
      }
      #viewport.scroll #columns {
        height: auto;
        column-width: auto;
        column-gap: 0;
      }
      p { font-size: 16px; line-height: 24px; margin-bottom: 16px; }
    </style>
    </head>
    <body>
      <div id="viewport" class="paginated">
        <div id="columns">
          ${Array.from({length: 40}, (_, i) => `<p id="p-${i+1}">Paragraph ${i+1}: Testing bidirectional reading position synchronization.</p>`).join('')}
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

        // Start on Page index 2 (the 3rd page out of 4)
        const totalPages = Math.ceil(vp.scrollWidth / vp.clientWidth);
        const currentPage = 2; // page 3
        vp.scrollLeft = currentPage * vp.clientWidth;

        // Ratio in paginated mode
        const progressRatio = currentPage / totalPages;

        // Switch to Scroll mode
        vp.className = 'scroll';
        vp.scrollLeft = 0;
        const maxScroll = vp.scrollHeight - vp.clientHeight;
        const targetScrollTop = Math.round(progressRatio * maxScroll);
        vp.scrollTop = targetScrollTop;

        const scrollRestoredTop = vp.scrollTop;
        const scrollRatio = scrollRestoredTop / maxScroll;

        // Switch back to Paginated mode
        vp.className = 'paginated';
        vp.scrollTop = 0;
        const newTotalPages = Math.ceil(vp.scrollWidth / vp.clientWidth);
        const restoredPageIndex = Math.min(newTotalPages - 1, Math.round(scrollRatio * newTotalPages));
        vp.scrollLeft = restoredPageIndex * vp.clientWidth;

        // Also test anchor jumping in paginated mode: e.g. jump to #p-25
        const targetElem = document.getElementById('p-25');
        // In multi-column layout, an element's offsetLeft relative to columns indicates its column!
        const elemOffsetLeft = targetElem.offsetLeft;
        const anchorPageIndex = Math.floor(elemOffsetLeft / vp.clientWidth);

        return {
          totalPages,
          currentPage,
          progressRatio,
          maxScroll,
          scrollRestoredTop,
          restoredPageIndex,
          targetElemId: 'p-25',
          elemOffsetLeft,
          anchorPageIndex
        };
      })()
    `,
    returnByValue: true
  });

  console.log('POSITION SYNC RESULT:', evalRes.result.result.value);

  ws.close();
  chrome.kill();
}

run().catch(console.error);
