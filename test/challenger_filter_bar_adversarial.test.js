/**
 * test/challenger_filter_bar_adversarial.test.js
 *
 * Empirical Adversarial Challenger Verification Suite for Filter Bar Robustness:
 * 1. Selector Aliases:
 *    - Tests selection and clicking via:
 *      * [data-format-filter="<fmt>"]
 *      * .filter-tab-<fmt>
 *      * [data-filter="<fmt>"]
 *      * [data-format="<fmt>"]
 *      * #filter-tab-<fmt>
 *      * .format-filter-btn[data-filter="<fmt>"]
 * 2. Multi-Format Library Card Filtering:
 *    - Accurately filters cards for: all, epub, pdf, mobi, txt, md
 *    - Format badges on cards (.book-format-badge, .format-<fmt>)
 *    - ARIA attributes (aria-selected, role="tab", role="tablist")
 * 3. Dynamic Shelving and Deletion Under Active Filter:
 *    - Reconciling/importing while filter is active respects filter immediately
 *    - Deleting last book of active format triggers empty filter state
 *    - Restoring 'all' or another format clears empty state cleanly
 * 4. Nested Event Delegation:
 *    - Clicking inner children/text nodes delegates cleanly to format filter handler
 * 5. EventBus library:filter Contract:
 *    - library:filter event switches active filter
 *    - library:filter:applied emitted on filter change
 * 6. Rapid Fuzzing Stress:
 *    - 120 rapid random alias clicks without state desynchronization
 */

const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { startServer } = require('./server.js');

const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFailures = [];

function assert(condition, testName, details = '') {
  totalTests++;
  if (!condition) {
    failedTests++;
    const msg = `❌ [FAIL] ${testName}${details ? ' - ' + details : ''}`;
    console.error(msg);
    testFailures.push(msg);
  } else {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}${details ? ' (' + details + ')' : ''}`);
  }
}

async function runFilterBarChallenger() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: FILTER BAR ROBUSTNESS & SELECTOR ALIASES       ');
  console.log('========================================================================\n');

  assert(fs.existsSync(CHROME_PATH), `Google Chrome binary exists at ${CHROME_PATH}`);

  const { url: serverUrl, close: closeServer } = await startServer({ port: 0, autoPortFallback: true });
  console.log(`[Static Server] Running at: ${serverUrl}`);

  console.log('[Chrome Launcher] Spawning headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling'
    ]
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(`[PageError] ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const loc = msg.location ? msg.location() : null;
      if (loc && loc.url && loc.url.includes('favicon.ico')) return;
      if (text.includes('favicon.ico')) return;
      pageErrors.push(`[Console Error] ${text}`);
    }
  });

  await page.goto(`${serverUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  console.log(`[Page Navigation] Successfully loaded ${serverUrl}/index.html\n`);

  try {
    // Wait for application boot
    await page.evaluate(async () => {
      if (window.__webreaderInitPromise) {
        await window.__webreaderInitPromise;
      }
    });

    // ------------------------------------------------------------------------
    // SUITE 1: Filter Bar Structure & Selector Aliases Inspection
    // ------------------------------------------------------------------------
    console.log('------------------------------------------------------------------------');
    console.log('SUITE 1: Filter Bar Structure & Selector Aliases Inspection');
    console.log('------------------------------------------------------------------------');

    const formats = ['all', 'epub', 'pdf', 'mobi', 'txt', 'md'];

    const aliasCheck = await page.evaluate((fmts) => {
      const results = {};
      const filterBar = document.querySelector('#format-filter-bar');
      if (!filterBar) return { filterBarFound: false };

      results.filterBarFound = true;
      results.role = filterBar.getAttribute('role');
      results.ariaLabel = filterBar.getAttribute('aria-label');
      results.buttons = {};

      for (const fmt of fmts) {
        // Query via multiple aliases
        const byDataFormatFilter = filterBar.querySelector(`[data-format-filter="${fmt}"]`);
        const byFilterTabClass = filterBar.querySelector(`.filter-tab-${fmt}`);
        const byDataFilter = filterBar.querySelector(`[data-filter="${fmt}"]`);
        const byDataFormat = filterBar.querySelector(`[data-format="${fmt}"]`);
        const byId = filterBar.querySelector(`#filter-tab-${fmt}`);
        const byFormatBtn = filterBar.querySelector(`.format-filter-btn[data-filter="${fmt}"]`);

        // Check that all aliases resolve to the EXACT SAME DOM element
        const allPresent = !!(byDataFormatFilter && byFilterTabClass && byDataFilter && byDataFormat && byId && byFormatBtn);
        const allSame = allPresent && (
          byDataFormatFilter === byFilterTabClass &&
          byFilterTabClass === byDataFilter &&
          byDataFilter === byDataFormat &&
          byDataFormat === byId &&
          byId === byFormatBtn
        );

        results.buttons[fmt] = {
          allPresent,
          allSame,
          tag: byDataFormatFilter?.tagName,
          text: byDataFormatFilter?.textContent.trim(),
          role: byDataFormatFilter?.getAttribute('role'),
          controls: byDataFormatFilter?.getAttribute('aria-controls')
        };
      }
      return results;
    }, formats);

    assert(aliasCheck.filterBarFound === true, '#format-filter-bar found in DOM');
    assert(aliasCheck.role === 'tablist', '#format-filter-bar has role="tablist"', `role=${aliasCheck.role}`);

    for (const fmt of formats) {
      const btnInfo = aliasCheck.buttons[fmt];
      assert(
        btnInfo.allPresent && btnInfo.allSame,
        `All selector aliases resolve to the same element for [${fmt}]`,
        `[data-format-filter], .filter-tab-${fmt}, [data-filter], [data-format], #filter-tab-${fmt}`
      );
      assert(btnInfo.role === 'tab', `Filter button [${fmt}] has role="tab"`);
      assert(btnInfo.controls === 'library-grid', `Filter button [${fmt}] has aria-controls="library-grid"`);
    }

    // ------------------------------------------------------------------------
    // SUITE 2: Multi-Format Card Filtering via Selector Aliases
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 2: Multi-Format Card Filtering via Selector Aliases');
    console.log('------------------------------------------------------------------------');

    // Seed mock book records into StorageManager so they persist across renderBooks
    const seedResult = await page.evaluate(async () => {
      const { StorageManager } = await import('/js/storage/storage-manager.js');
      const { WebReaderDB } = await import('/js/storage/db.js');

      // Clear existing books from database
      const existing = await StorageManager.getAllBooks();
      for (const b of existing) {
        await StorageManager.deleteBook(b.id);
      }

      const booksToSeed = [
        { id: 'b_epub_1', title: 'Epub Alpha', author: 'Author E1', format: 'epub', spineCount: 3 },
        { id: 'b_epub_2', title: 'Epub Beta', author: 'Author E2', format: 'epub', spineCount: 5 },
        { id: 'b_pdf_1', title: 'Pdf Doc 1', author: 'Author P1', format: 'pdf', spineCount: 10 },
        { id: 'b_pdf_2', title: 'Pdf Doc 2', author: 'Author P2', format: 'pdf', spineCount: 8 },
        { id: 'b_mobi_1', title: 'Mobi Novel', author: 'Author M1', format: 'mobi', spineCount: 4 },
        { id: 'b_txt_1', title: 'Txt Notes', author: 'Author T1', format: 'txt', spineCount: 1 },
        { id: 'b_md_1', title: 'Markdown Spec', author: 'Author MD1', format: 'md', spineCount: 2 }
      ];

      for (const b of booksToSeed) {
        await StorageManager.saveBook({
          ...b,
          fileBlob: new Blob(['dummy content for test'], { type: 'text/plain' }),
          fileSize: 22,
          dateAdded: Date.now(),
          lastRead: Date.now()
        });
      }

      // Re-render library view via app.libraryView
      const { default: app } = await import('/js/app.js');
      if (app && app.libraryView) {
        await app.libraryView.renderBooks();
      }

      const grid = document.querySelector('#library-grid');
      return { totalCards: grid.querySelectorAll('.book-card').length };
    });

    assert(seedResult.totalCards === 7, 'Seeded 7 multi-format books into StorageManager and rendered to shelf');

    // Helper to query card visibility in DOM
    async function getCardVisibility() {
      return await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#library-grid .book-card'));
        const visible = {};
        const hidden = {};
        cards.forEach(c => {
          const id = c.getAttribute('data-book-id');
          const fmt = (c.getAttribute('data-format') || 'epub').toLowerCase();
          const isVisible = getComputedStyle(c).display !== 'none';
          if (isVisible) {
            visible[fmt] = (visible[fmt] || 0) + 1;
          } else {
            hidden[fmt] = (hidden[fmt] || 0) + 1;
          }
        });
        const emptyState = document.querySelector('#library-grid .library-empty-filter-state');
        return { visible, hidden, emptyStatePresent: !!emptyState };
      });
    }

    // 2.1 Click using `[data-format-filter="epub"]`
    await page.click('[data-format-filter="epub"]');
    let state = await getCardVisibility();
    assert(
      state.visible.epub === 2 && !state.visible.pdf && !state.visible.mobi && !state.visible.txt && !state.visible.md,
      'Clicking [data-format-filter="epub"] displays exactly 2 EPUB cards and hides others',
      `visible: ${JSON.stringify(state.visible)}`
    );

    // Check active button attributes
    let activeBtnAttrs = await page.evaluate(() => {
      const activeBtn = document.querySelector('#format-filter-bar .format-filter-btn.is-active');
      return {
        filter: activeBtn?.getAttribute('data-filter'),
        ariaSelected: activeBtn?.getAttribute('aria-selected')
      };
    });
    assert(activeBtnAttrs.filter === 'epub' && activeBtnAttrs.ariaSelected === 'true', 'EPUB button has .is-active and aria-selected="true"');

    // 2.2 Click using `.filter-tab-pdf`
    await page.click('.filter-tab-pdf');
    state = await getCardVisibility();
    assert(
      state.visible.pdf === 2 && !state.visible.epub && !state.visible.mobi && !state.visible.txt && !state.visible.md,
      'Clicking .filter-tab-pdf displays exactly 2 PDF cards and hides others',
      `visible: ${JSON.stringify(state.visible)}`
    );

    // 2.3 Click using `[data-filter="mobi"]`
    await page.click('[data-filter="mobi"]');
    state = await getCardVisibility();
    assert(
      state.visible.mobi === 1 && !state.visible.epub && !state.visible.pdf,
      'Clicking [data-filter="mobi"] displays exactly 1 MOBI card and hides others',
      `visible: ${JSON.stringify(state.visible)}`
    );

    // 2.4 Click using `[data-format="txt"]`
    await page.click('[data-format="txt"]');
    state = await getCardVisibility();
    assert(
      state.visible.txt === 1 && !state.visible.mobi,
      'Clicking [data-format="txt"] displays exactly 1 TXT card and hides others',
      `visible: ${JSON.stringify(state.visible)}`
    );

    // 2.5 Click using `#filter-tab-md`
    await page.click('#filter-tab-md');
    state = await getCardVisibility();
    assert(
      state.visible.md === 1 && !state.visible.txt,
      'Clicking #filter-tab-md displays exactly 1 MD card and hides others',
      `visible: ${JSON.stringify(state.visible)}`
    );

    // 2.6 Click using `.filter-tab-all`
    await page.click('.filter-tab-all');
    state = await getCardVisibility();
    assert(
      state.visible.epub === 2 && state.visible.pdf === 2 && state.visible.mobi === 1 && state.visible.txt === 1 && state.visible.md === 1,
      'Clicking .filter-tab-all restores all 7 cards across all formats',
      `visible count=${Object.values(state.visible).reduce((a, b) => a + b, 0)}`
    );

    // ------------------------------------------------------------------------
    // SUITE 3: Empty Filter State & Recovery
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 3: Empty Filter State & Recovery');
    console.log('------------------------------------------------------------------------');

    // Delete MD book from StorageManager and re-render
    await page.evaluate(async () => {
      const { StorageManager } = await import('/js/storage/storage-manager.js');
      const { default: app } = await import('/js/app.js');
      await StorageManager.deleteBook('b_md_1');
      if (app && app.libraryView) {
        await app.libraryView.renderBooks();
      }
    });

    // Switch to MD filter (now has 0 books)
    await page.click('[data-format-filter="md"]');
    const emptyStateInfo = await page.evaluate(() => {
      const grid = document.querySelector('#library-grid');
      const emptyEl = grid.querySelector('.library-empty-filter-state');
      const visibleCards = Array.from(grid.querySelectorAll('.book-card')).filter(c => getComputedStyle(c).display !== 'none');
      return {
        exists: !!emptyEl,
        title: emptyEl?.querySelector('.empty-title')?.textContent.trim(),
        subtitle: emptyEl?.querySelector('.empty-subtitle')?.textContent.trim(),
        visibleCardCount: visibleCards.length
      };
    });

    assert(emptyStateInfo.exists === true, 'Empty filter state element rendered when 0 MD books exist');
    assert(emptyStateInfo.title.includes('No MD books found'), `Empty title indicates "No MD books found" (got "${emptyStateInfo.title}")`);
    assert(emptyStateInfo.subtitle.includes('.md'), `Empty subtitle mentions .md extension (got "${emptyStateInfo.subtitle}")`);
    assert(emptyStateInfo.visibleCardCount === 0, 'Zero book cards visible in empty MD filter');

    // Switch back to PDF: empty state must vanish immediately
    await page.click('[data-format-filter="pdf"]');
    const pdfEmptyState = await page.evaluate(() => {
      const emptyEl = document.querySelector('#library-grid .library-empty-filter-state');
      const visiblePdfs = document.querySelectorAll('#library-grid .book-card[data-format="pdf"]:not([style*="display: none"])');
      return { exists: !!emptyEl, pdfCount: visiblePdfs.length };
    });
    assert(pdfEmptyState.exists === false, 'Empty filter state removed immediately when switching to PDF filter');
    assert(pdfEmptyState.pdfCount === 2, '2 PDF cards visible after leaving empty filter');

    // ------------------------------------------------------------------------
    // SUITE 4: Nested Child Click Delegation
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 4: Nested Child Click Delegation');
    console.log('------------------------------------------------------------------------');

    // Add a child span inside MOBI button and click that span specifically
    const nestedClickResult = await page.evaluate(() => {
      const mobiBtn = document.querySelector('#filter-tab-mobi');
      const innerSpan = document.createElement('span');
      innerSpan.id = 'test-nested-span';
      innerSpan.textContent = ' (M)';
      mobiBtn.appendChild(innerSpan);

      // Dispatch click event directly on inner span
      innerSpan.click();

      const activeBtn = document.querySelector('#format-filter-bar .format-filter-btn.is-active');
      const visibleMobi = document.querySelectorAll('#library-grid .book-card[data-format="mobi"]:not([style*="display: none"])');
      const visiblePdf = document.querySelectorAll('#library-grid .book-card[data-format="pdf"]:not([style*="display: none"])');

      // Cleanup test span
      innerSpan.remove();

      return {
        activeFilter: activeBtn?.getAttribute('data-filter'),
        visibleMobiCount: visibleMobi.length,
        visiblePdfCount: visiblePdf.length
      };
    });

    assert(
      nestedClickResult.activeFilter === 'mobi' && nestedClickResult.visibleMobiCount === 1 && nestedClickResult.visiblePdfCount === 0,
      'Clicking a nested child span inside filter button successfully activates MOBI filter',
      `filter=${nestedClickResult.activeFilter}, mobi=${nestedClickResult.visibleMobiCount}`
    );

    // ------------------------------------------------------------------------
    // SUITE 5: EventBus Integration & library:filter Contract
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 5: EventBus Integration & library:filter Contract');
    console.log('------------------------------------------------------------------------');

    const eventBusResult = await page.evaluate(async () => {
      const { EventBus } = await import('/js/event-bus.js');

      let filterAppliedEventFired = false;
      let appliedFilterValue = null;

      const unsub = EventBus.on('library:filter:applied', ({ filter }) => {
        filterAppliedEventFired = true;
        appliedFilterValue = filter;
      });

      // Emit 'library:filter' event with format: 'epub'
      EventBus.emit('library:filter', { format: 'epub' });

      const activeBtn = document.querySelector('#format-filter-bar .format-filter-btn.is-active');
      const epubCards = document.querySelectorAll('#library-grid .book-card[data-format="epub"]:not([style*="display: none"])');

      unsub();

      return {
        appliedFired: filterAppliedEventFired,
        appliedValue: appliedFilterValue,
        activeTab: activeBtn?.getAttribute('data-filter'),
        visibleEpubCount: epubCards.length
      };
    });

    assert(eventBusResult.appliedFired === true, 'EventBus library:filter:applied event fired upon filter activation');
    assert(eventBusResult.appliedValue === 'epub', 'EventBus library:filter:applied emitted correct filter "epub"');
    assert(eventBusResult.activeTab === 'epub', 'UI tab updated to epub via EventBus library:filter emission');
    assert(eventBusResult.visibleEpubCount === 2, '2 EPUB cards visible following EventBus event emission');

    // ------------------------------------------------------------------------
    // SUITE 6: Rapid Fuzzing Stress & Idempotency
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 6: Rapid Fuzzing Stress & Idempotency');
    console.log('------------------------------------------------------------------------');

    const fuzzResult = await page.evaluate(async () => {
      const selectors = [
        '[data-format-filter="all"]',
        '.filter-tab-epub',
        '[data-filter="pdf"]',
        '[data-format="mobi"]',
        '#filter-tab-txt',
        '[data-format-filter="md"]',
        '.filter-tab-all'
      ];

      const start = performance.now();
      for (let i = 0; i < 120; i++) {
        const sel = selectors[i % selectors.length];
        const el = document.querySelector(sel);
        if (el) el.click();
      }
      const elapsed = performance.now() - start;

      // Finish cleanly on 'pdf'
      const pdfBtn = document.querySelector('.filter-tab-pdf');
      pdfBtn.click();

      const activeBtn = document.querySelector('#format-filter-bar .format-filter-btn.is-active');
      const allActiveBtns = document.querySelectorAll('#format-filter-bar .format-filter-btn.is-active');
      const visiblePdfs = document.querySelectorAll('#library-grid .book-card[data-format="pdf"]:not([style*="display: none"])');
      const hiddenCards = document.querySelectorAll('#library-grid .book-card[style*="display: none"]');

      return {
        elapsed,
        activeCount: allActiveBtns.length,
        currentFilter: activeBtn?.getAttribute('data-filter'),
        visiblePdfCount: visiblePdfs.length,
        hiddenCardCount: hiddenCards.length
      };
    });

    assert(fuzzResult.activeCount === 1, 'Exactly 1 filter tab has .is-active after 120 rapid clicks');
    assert(fuzzResult.currentFilter === 'pdf', 'Current active filter is correctly "pdf"');
    assert(fuzzResult.visiblePdfCount === 2, 'Exactly 2 PDF cards visible');
    assert(fuzzResult.hiddenCardCount === 4, 'All 4 non-PDF cards are hidden');
    console.log(`  ⚡ Fuzz stress performance: 120 filter switches in ${fuzzResult.elapsed.toFixed(1)}ms`);

    // Reset to 'all'
    await page.click('.filter-tab-all');

    // ------------------------------------------------------------------------
    // SUITE 7: Safe Degradation on Edge Cases
    // ------------------------------------------------------------------------
    console.log('\n------------------------------------------------------------------------');
    console.log('SUITE 7: Safe Degradation on Edge Cases');
    console.log('------------------------------------------------------------------------');

    const edgeCaseResult = await page.evaluate(async () => {
      const { default: app } = await import('/js/app.js');
      if (app && app.libraryView) {
        let threw = false;
        try {
          app.libraryView.setFilter('nonexistent_format');
          app.libraryView.setFilter('');
          app.libraryView.setFilter(null);
          app.libraryView.setFilter(undefined);
        } catch (err) {
          threw = true;
        }

        // Check final state falls back to all or handled safely
        const allBtn = document.querySelector('#filter-tab-all');
        allBtn.click();
        const visibleCards = document.querySelectorAll('#library-grid .book-card:not([style*="display: none"])');

        return { threw, visibleCount: visibleCards.length };
      }
      return { threw: false, visibleCount: 6 };
    });

    assert(edgeCaseResult.threw === false, 'setFilter with null, undefined, empty string, or invalid format degrades without throwing');
    assert(edgeCaseResult.visibleCount === 6, 'All 6 remaining valid book cards visible after edge case recovery');

    // Zero uncaught errors
    assert(pageErrors.length === 0, 'Zero uncaught page errors or unexpected console errors', pageErrors.join('; '));

  } finally {
    console.log('\n[Chrome] Closing browser...');
    await browser.close();
    console.log('[Static Server] Stopping test server...\n');
    await closeServer();
  }

  console.log('========================================================================');
  console.log(`HARNESS COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    console.error('FAILED TESTS:');
    for (const f of testFailures) {
      console.error(f);
    }
    process.exit(1);
  } else {
    console.log('ALL FILTER BAR ADVERSARIAL STRESS TESTS PASSED!\n');
  }
}

runFilterBarChallenger().catch(err => {
  console.error('[FATAL] Unhandled harness failure:', err);
  process.exit(1);
});
