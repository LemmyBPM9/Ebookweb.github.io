/**
 * .agents/teamwork/m1_reviewer_2/test_browser_adversarial.js
 * Browser-based adversarial testing for IndexedDB concurrency, cascade delete integrity,
 * FOUC timing, and transition behavior.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let safePath = path.normalize(path.join(REPO_ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!safePath.startsWith(REPO_ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
    safePath = path.join(safePath, 'index.html');
  }
  if (!fs.existsSync(safePath)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(safePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
  fs.createReadStream(safePath).pipe(res);
});

await new Promise((resolve) => server.listen(3001, '127.0.0.1', resolve));

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('http://127.0.0.1:3001/index.html', { waitUntil: 'domcontentloaded' });

  console.log('--- Browser Adversarial Tests ---');

  // Test 1: Page errors on load
  assert(pageErrors.length === 0, `Zero page errors on index.html load (errors: ${pageErrors.length})`);

  // Test 2: Check FOUC data-theme attribute
  const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert(initialTheme === 'warm-paper', `Initial data-theme is ${initialTheme}`);

  // Test 3: Check no-theme-transition class presence
  const hasNoThemeTransition = await page.evaluate(() => document.documentElement.classList.contains('no-theme-transition'));
  console.log(`  ℹ️ INFO: documentElement has 'no-theme-transition': ${hasNoThemeTransition}`);

  // Test 4: IndexedDB Concurrency & Isolation via ES modules
  const idbResults = await page.evaluate(async () => {
    const { StorageManager } = await import('./js/storage/storage-manager.js');

    // 4.1 Concurrent writes of 10 books
    const bookPromises = [];
    for (let i = 0; i < 10; i++) {
      bookPromises.push(StorageManager.saveBook({
        id: `concurrent_book_${i}`,
        title: `Concurrent Volume ${i}`,
        author: `Author ${i}`,
        dateAdded: Date.now() + i
      }));
    }
    await Promise.all(bookPromises);

    const allBooks = await StorageManager.getAllBooks();
    const concurrentBookCount = allBooks.filter(b => b.id.startsWith('concurrent_book_')).length;

    // 4.2 Cascade deletion with multiple bookmarks
    // Book A has 20 bookmarks, Book B has 15 bookmarks
    const bmPromises = [];
    for (let i = 0; i < 20; i++) {
      bmPromises.push(StorageManager.addBookmark({
        id: `bm_a_${i}`,
        bookId: 'concurrent_book_0',
        cfi: `/6/2[ch01]!/4/2/10:${i}`,
        title: `Bookmark A ${i}`
      }));
    }
    for (let i = 0; i < 15; i++) {
      bmPromises.push(StorageManager.addBookmark({
        id: `bm_b_${i}`,
        bookId: 'concurrent_book_1',
        cfi: `/6/4[ch02]!/4/2/10:${i}`,
        title: `Bookmark B ${i}`
      }));
    }
    await Promise.all(bmPromises);

    const bmAInitial = await StorageManager.getBookmarks('concurrent_book_0');
    const bmBInitial = await StorageManager.getBookmarks('concurrent_book_1');

    // Save progress for Book A and Book B
    await StorageManager.saveProgress({
      bookId: 'concurrent_book_0',
      spineIndex: 2,
      pageIndex: 5,
      progressPercent: 42
    });
    await StorageManager.saveProgress({
      bookId: 'concurrent_book_1',
      spineIndex: 1,
      pageIndex: 1,
      progressPercent: 15
    });

    const progAInitial = await StorageManager.getProgress('concurrent_book_0');
    const progBInitial = await StorageManager.getProgress('concurrent_book_1');

    // Now atomically delete Book A
    await StorageManager.deleteBook('concurrent_book_0');

    // Check post-deletion state
    const bookAPost = await StorageManager.getBook('concurrent_book_0');
    const bookBPost = await StorageManager.getBook('concurrent_book_1');
    const bmAAfter = await StorageManager.getBookmarks('concurrent_book_0');
    const bmBAfter = await StorageManager.getBookmarks('concurrent_book_1');
    const progAAfter = await StorageManager.getProgress('concurrent_book_0');
    const progBAfter = await StorageManager.getProgress('concurrent_book_1');

    // Clean up remaining books
    for (let i = 1; i < 10; i++) {
      await StorageManager.deleteBook(`concurrent_book_${i}`);
    }

    return {
      concurrentBookCount,
      bmAInitialCount: bmAInitial.length,
      bmBInitialCount: bmBInitial.length,
      progAInitialExists: Boolean(progAInitial),
      progBInitialExists: Boolean(progBInitial),
      bookADeleted: bookAPost === null,
      bookBRemains: Boolean(bookBPost),
      bmAPurgedCount: bmAAfter.length,
      bmBIntactCount: bmBAfter.length,
      progAPurged: progAAfter === null,
      progBIntact: Boolean(progBAfter)
    };
  });

  assert(idbResults.concurrentBookCount === 10, 'Saved 10 books concurrently without race conditions');
  assert(idbResults.bmAInitialCount === 20 && idbResults.bmBInitialCount === 15, 'Created 20 bookmarks for Book A and 15 for Book B');
  assert(idbResults.bookADeleted, 'Book A record deleted from IndexedDB');
  assert(idbResults.bookBRemains, 'Book B record remains completely intact');
  assert(idbResults.bmAPurgedCount === 0, 'All 20 bookmarks for Book A purged atomically');
  assert(idbResults.bmBIntactCount === 15, 'All 15 bookmarks for Book B remain completely intact');
  assert(idbResults.progAPurged, 'Reading progress for Book A purged atomically');
  assert(idbResults.progBIntact, 'Reading progress for Book B remains completely intact');

  // Test 5: Storage Quota Info
  const quotaInfo = await page.evaluate(async () => {
    const { StorageManager } = await import('./js/storage/storage-manager.js');
    return StorageManager.getQuotaInfo();
  });
  assert(quotaInfo && typeof quotaInfo.quotaBytes === 'number', 'StorageManager.getQuotaInfo() returns valid quota metrics');

  console.log(`\n================================================================`);
  console.log(`BROWSER STRESS RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================`);

} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failed > 0) {
  process.exit(1);
}
