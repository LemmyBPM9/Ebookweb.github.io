/**
 * Lightweight, standalone static HTTP server for WebReader.
 * Uses only Node.js built-in modules (node:http, node:fs, node:path, node:url).
 *
 * Usage:
 *   CLI: node test/server.js [--port 3000]
 *   API: const { startServer } = require('./server.js');
 *        const { server, port, url, close } = await startServer({ port: 3000 });
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const PROJECT_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xhtml': 'application/xhtml+xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw': 'application/vnd.amazon.ebook',
  '.azw3': 'application/vnd.amazon.ebook',
  '.xml': 'application/xml; charset=utf-8',
  '.ncx': 'application/x-dtbncx+xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/**
 * Creates the HTTP request handler for serving static files.
 * @param {string} rootDir
 * @returns {http.RequestListener}
 */
function createRequestHandler(rootDir = PROJECT_ROOT) {
  const normalizedRoot = path.resolve(rootDir);

  return (req, res) => {
    // Add CORS headers for testing flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    try {
      const parsedUrl = new url.URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let reqPath = decodeURIComponent(parsedUrl.pathname);

      // Default root path to index.html
      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }

      const filePath = path.resolve(normalizedRoot, '.' + reqPath);

      // Security check: Guard against path traversal outside root
      if (!filePath.startsWith(normalizedRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden: Path traversal prohibited');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`404 Not Found: ${reqPath}`);
          } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`500 Internal Server Error: ${err.message}`);
          }
          return;
        }

        // If directory, attempt to serve index.html within directory
        let finalPath = filePath;
        if (stats.isDirectory()) {
          finalPath = path.join(filePath, 'index.html');
          if (!fs.existsSync(finalPath)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Directory Listing Prohibited');
            return;
          }
        }

        const ext = path.extname(finalPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(finalPath, (readErr, data) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`500 Error reading file: ${readErr.message}`);
            return;
          }

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': data.length
          });

          if (req.method === 'HEAD') {
            res.end();
          } else {
            res.end(data);
          }
        });
      });
    } catch (parseError) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`400 Bad Request: ${parseError.message}`);
    }
  };
}

/**
 * Starts the static HTTP server.
 * @param {Object} options
 * @param {number} [options.port=3000]
 * @param {string} [options.host='127.0.0.1']
 * @param {string} [options.rootDir=PROJECT_ROOT]
 * @returns {Promise<{server: http.Server, port: number, host: string, url: string, close: () => Promise<void>}>}
 */
function startServer(options = {}) {
  const rootDir = options.rootDir || PROJECT_ROOT;
  const initialPort = parseInt(options.port || process.env.PORT || DEFAULT_PORT, 10);
  const host = options.host || DEFAULT_HOST;

  const handler = createRequestHandler(rootDir);
  const server = http.createServer(handler);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      // If port in use and autoPortFallback is allowed or 0 requested, try dynamic free port
      if (err.code === 'EADDRINUSE' && options.autoPortFallback) {
        console.warn(`[test/server] Port ${initialPort} in use, searching for free port...`);
        server.listen(0, host);
      } else {
        reject(err);
      }
    });

    server.listen(initialPort, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : initialPort;
      const serverUrl = `http://${host}:${actualPort}`;

      const close = () => {
        return new Promise((resolveClose) => {
          server.close(() => {
            resolveClose();
          });
        });
      };

      resolve({
        server,
        port: actualPort,
        host,
        url: serverUrl,
        close
      });
    });
  });
}

// If invoked directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i].startsWith('--port=')) {
      port = parseInt(args[i].split('=')[1], 10);
    }
  }

  startServer({ port, autoPortFallback: true })
    .then(({ url, port: activePort, close }) => {
      console.log(`[WebReader Server] Running at ${url}`);
      console.log(`[WebReader Server] Serving files from: ${PROJECT_ROOT}`);
      console.log(`[WebReader Server] Press Ctrl+C to terminate.`);

      const shutdown = () => {
        console.log('\n[WebReader Server] Gracefully stopping...');
        close().then(() => {
          console.log('[WebReader Server] Stopped.');
          process.exit(0);
        });
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[WebReader Server] Failed to start:', err);
      process.exit(1);
    });
}

module.exports = {
  startServer,
  createRequestHandler,
  MIME_TYPES,
  DEFAULT_PORT,
  DEFAULT_HOST,
  PROJECT_ROOT
};
