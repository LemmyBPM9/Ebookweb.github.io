// test_reader_chrome.js: Prototype and verify Reader Chrome, Tap Zones, TOC Drawer, and Bookmarks
const { spawn } = require('child_process');

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9227',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for chrome')), 5000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/ws:\/\/127\.0\.0\.1:9227\/devtools\/browser\/[a-zA-Z0-9-]+/);
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

  const fullAppHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <style>
      :root {
        --bg: #f8f4ec;
        --text: #2d2a26;
        --chrome-bg: rgba(248, 244, 236, 0.95);
        --chrome-border: rgba(0, 0, 0, 0.08);
        --accent: #8b5a2b;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        user-select: none;
      }

      /* Reader Header */
      #reader-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 52px;
        background: var(--chrome-bg);
        border-bottom: 1px solid var(--chrome-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        z-index: 100;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      #reader-header.hidden {
        transform: translateY(-100%);
        opacity: 0;
        pointer-events: none;
      }

      /* Reader Footer */
      #reader-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 40px;
        background: var(--chrome-bg);
        border-top: 1px solid var(--chrome-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        font-size: 13px;
        z-index: 100;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      #reader-footer.hidden {
        transform: translateY(100%);
        opacity: 0;
        pointer-events: none;
      }

      /* Reader Viewport & Stage */
      #reader-stage {
        flex: 1;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
      }

      /* Tap Zones (Overlay on top of content) */
      .tap-zone {
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 20;
      }
      #tap-zone-prev { left: 0; width: 25%; cursor: pointer; }
      #tap-zone-center { left: 25%; width: 50%; cursor: default; }
      #tap-zone-next { right: 0; width: 25%; cursor: pointer; }

      /* Reader Content */
      #reader-viewport {
        position: absolute;
        inset: 52px 0 40px 0;
        margin: 0 auto;
        max-width: 800px;
        overflow: hidden;
        z-index: 10;
        padding: 24px 32px;
      }
      #reader-columns {
        height: 100%;
        column-width: calc(800px - 64px);
        column-gap: 64px;
        column-fill: auto;
      }
      p { font-size: 16px; line-height: 1.6; margin-bottom: 1.2em; }

      /* TOC Drawer */
      #toc-drawer {
        position: fixed;
        top: 0;
        left: 0;
        width: 320px;
        height: 100%;
        background: var(--bg);
        box-shadow: 2px 0 16px rgba(0,0,0,0.15);
        z-index: 200;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
        display: flex;
        flex-direction: column;
      }
      #toc-drawer.open {
        transform: translateX(0);
      }
      #drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.3);
        z-index: 190;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }
      #drawer-backdrop.open {
        opacity: 1;
        pointer-events: auto;
      }
      .toc-item {
        padding: 10px 16px;
        cursor: pointer;
        border-bottom: 1px solid var(--chrome-border);
      }
      .toc-item.active {
        background: rgba(139, 90, 43, 0.15);
        font-weight: bold;
        color: var(--accent);
      }
      .toc-level-1 { padding-left: 16px; }
      .toc-level-2 { padding-left: 36px; font-size: 14px; opacity: 0.9; }

      /* Bookmark button state */
      .bookmarked {
        color: var(--accent);
        font-weight: bold;
      }
    </style>
    </head>
    <body>
      <div id="drawer-backdrop"></div>
      
      <div id="toc-drawer">
        <div style="padding: 16px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--chrome-border);">
          <h3>Contents</h3>
          <button id="btn-close-toc">✕</button>
        </div>
        <div id="toc-list" style="overflow-y: auto; flex: 1;"></div>
      </div>

      <header id="reader-header">
        <button id="btn-toc">☰ Contents</button>
        <span id="book-title">Sample Book</span>
        <div>
          <button id="btn-bookmark">🔖 Bookmark</button>
          <button id="btn-mode">Dual Mode</button>
        </div>
      </header>

      <main id="reader-stage">
        <div id="reader-viewport">
          <div id="reader-columns">
            <h1 id="ch-1">Chapter 1: The Beginning</h1>
            ${Array.from({length: 25}, (_, i) => `<p>Paragraph ${i+1}: Testing reader engine tap zones, responsive navigation, and header auto-toggle.</p>`).join('')}
          </div>
        </div>

        <!-- Tap navigation overlays -->
        <div id="tap-zone-prev" class="tap-zone"></div>
        <div id="tap-zone-center" class="tap-zone"></div>
        <div id="tap-zone-next" class="tap-zone"></div>
      </main>

      <footer id="reader-footer">
        <span id="footer-chapter">Chapter 1</span>
        <span id="footer-page">Page 1 of 4</span>
        <span id="footer-progress">25%</span>
      </footer>

      <script>
        // Mini EventBus
        class EventBus {
          constructor() { this.listeners = {}; }
          on(event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); }
          emit(event, data) { (this.listeners[event] || []).forEach(cb => cb(data)); }
        }
        window.bus = new EventBus();

        // State
        window.readerState = {
          chapterIndex: 0,
          pageIndex: 0,
          totalPages: 4,
          chromeVisible: true,
          tocOpen: false,
          bookmarks: []
        };

        const vp = document.getElementById('reader-viewport');
        const header = document.getElementById('reader-header');
        const footer = document.getElementById('reader-footer');
        const tocDrawer = document.getElementById('toc-drawer');
        const backdrop = document.getElementById('drawer-backdrop');
        const bookmarkBtn = document.getElementById('btn-bookmark');

        // Functions
        function toggleChrome() {
          window.readerState.chromeVisible = !window.readerState.chromeVisible;
          header.classList.toggle('hidden', !window.readerState.chromeVisible);
          footer.classList.toggle('hidden', !window.readerState.chromeVisible);
        }

        function toggleTOC(open) {
          window.readerState.tocOpen = (open !== undefined) ? open : !window.readerState.tocOpen;
          tocDrawer.classList.toggle('open', window.readerState.tocOpen);
          backdrop.classList.toggle('open', window.readerState.tocOpen);
        }

        function nextPage() {
          if (window.readerState.pageIndex < window.readerState.totalPages - 1) {
            window.readerState.pageIndex++;
            vp.scrollLeft = window.readerState.pageIndex * vp.clientWidth;
            updateFooter();
          }
        }

        function prevPage() {
          if (window.readerState.pageIndex > 0) {
            window.readerState.pageIndex--;
            vp.scrollLeft = window.readerState.pageIndex * vp.clientWidth;
            updateFooter();
          }
        }

        function toggleBookmark() {
          const key = window.readerState.chapterIndex + ':' + window.readerState.pageIndex;
          const idx = window.readerState.bookmarks.indexOf(key);
          if (idx >= 0) {
            window.readerState.bookmarks.splice(idx, 1);
            bookmarkBtn.classList.remove('bookmarked');
          } else {
            window.readerState.bookmarks.push(key);
            bookmarkBtn.classList.add('bookmarked');
          }
        }

        function updateFooter() {
          document.getElementById('footer-page').textContent = 
            'Page ' + (window.readerState.pageIndex + 1) + ' of ' + window.readerState.totalPages;
          const pct = Math.round(((window.readerState.pageIndex + 1) / window.readerState.totalPages) * 100);
          document.getElementById('footer-progress').textContent = pct + '%';
        }

        // Event wiring
        document.getElementById('tap-zone-prev').addEventListener('click', prevPage);
        document.getElementById('tap-zone-next').addEventListener('click', nextPage);
        document.getElementById('tap-zone-center').addEventListener('click', toggleChrome);
        document.getElementById('btn-toc').addEventListener('click', () => toggleTOC(true));
        document.getElementById('btn-close-toc').addEventListener('click', () => toggleTOC(false));
        backdrop.addEventListener('click', () => toggleTOC(false));
        bookmarkBtn.addEventListener('click', toggleBookmark);

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === ' ') nextPage();
          else if (e.key === 'ArrowLeft') prevPage();
          else if (e.key === 'Escape') toggleTOC(false);
        });
      </script>
    </body>
    </html>
  `;

  const frameTree = await sendSession('Page.getFrameTree');
  await sendSession('Page.setDocumentContent', { frameId: frameTree.result.frameTree.frame.id, html: fullAppHtml });

  // Now perform automated UI interaction tests via CDP evaluation
  const evalResults = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const events = [];

        // 1. Initial State
        events.push({ step: 'init', state: { ...window.readerState } });

        // 2. Click center zone -> toggle chrome
        document.getElementById('tap-zone-center').click();
        events.push({ step: 'center_tap', chromeVisible: window.readerState.chromeVisible });

        // 3. Click center zone again -> show chrome
        document.getElementById('tap-zone-center').click();
        events.push({ step: 'center_tap_2', chromeVisible: window.readerState.chromeVisible });

        // 4. Click Next Page tap zone
        document.getElementById('tap-zone-next').click();
        events.push({ step: 'next_page_tap', pageIndex: window.readerState.pageIndex });

        // 5. Press ArrowRight key
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        events.push({ step: 'arrow_right_key', pageIndex: window.readerState.pageIndex });

        // 6. Press ArrowLeft key
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        events.push({ step: 'arrow_left_key', pageIndex: window.readerState.pageIndex });

        // 7. Toggle Bookmark
        document.getElementById('btn-bookmark').click();
        events.push({ step: 'bookmark_add', bookmarks: [...window.readerState.bookmarks] });

        // 8. Open TOC Drawer
        document.getElementById('btn-toc').click();
        events.push({ step: 'open_toc', tocOpen: window.readerState.tocOpen });

        // 9. Press Escape to close TOC
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        events.push({ step: 'escape_toc', tocOpen: window.readerState.tocOpen });

        return events;
      })()
    `,
    returnByValue: true
  });

  console.log('UI INTERACTION RESULTS:', JSON.stringify(evalResults.result.result.value, null, 2));

  ws.close();
  chrome.kill();
}

run().catch(console.error);
