const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);
const fs = require('fs');

const OUT = 'output/captures';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('design-bakery')) || await ctx.newPage();

  await page.setViewportSize({ width: 1920, height: 1080 });
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    await page.waitForTimeout(900);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
    console.log('captured', name);
  };

  await page.goto('https://arize.design-bakery.com/slides', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  for (let i = 1; i <= 9; i++) {
    await shot(`slide${String(i).padStart(2, '0')}`);
    if (i < 9) {
      await page.getByRole('button', { name: /next slide/i }).click();
      await page.waitForTimeout(600);
    }
  }

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
