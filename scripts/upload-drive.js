const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);
const { resolve, basename } = require('node:path');

const FILE = resolve('output/precedent-demo.mp4');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  console.log('page:', await page.title());

  // Click the real New button (top-left)
  await page.mouse.click(66, 99);
  await page.waitForTimeout(2000);

  const menu = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], li')) {
      const t = (el.innerText || '').trim().replace(/\n+/g, ' | ');
      if (t) out.push(t);
    }
    return out;
  });
  console.log('menu:', JSON.stringify(menu, null, 2));

  const chooserPromise = page.waitForEvent('filechooser', { timeout: 20000 });
  await page.getByRole('menuitem', { name: /file upload/i }).first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles(FILE);
  console.log('set file:', basename(FILE));

  await page.waitForFunction(
    () => /upload complete|uploads complete|1 upload/i.test(document.body.innerText),
    { timeout: 300000 }
  );
  console.log('upload complete');

  await page.waitForTimeout(4000);
  const url = page.url();
  const body = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('url:', url);
  console.log('body:', body);

  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
