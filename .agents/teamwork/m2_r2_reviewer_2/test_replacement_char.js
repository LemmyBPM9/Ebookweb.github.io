const puppeteer = require('puppeteer-core');
const CHROME_PATH = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function testReplacementChar() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new'
  });
  const page = await browser.newPage();
  let alertFired = false;
  page.on('dialog', async dialog => {
    alertFired = true;
    await dialog.dismiss();
  });

  await page.setContent(`<a id="link" href="java\uFFFDscript:alert(1)">Click me</a>`);
  try {
    await page.click('#link');
  } catch (e) {
    console.log('Click error:', e.message);
  }

  console.log('Alert fired:', alertFired);
  await browser.close();
}

testReplacementChar();
