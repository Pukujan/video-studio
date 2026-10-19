const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('design-bakery')) || await ctx.newPage();
  await page.goto('https://arize.design-bakery.com/slides', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const out = [];
  for (let i = 1; i <= 9; i++) {
    const txt = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText.replace(/\n{3,}/g, '\n\n').trim();
    });
    out.push(`===== SLIDE ${i} =====\n${txt}`);
    if (i < 9) {
      await page.getByRole('button', { name: /next slide/i }).click();
      await page.waitForTimeout(600);
    }
  }
  fs.writeFileSync('output/slides-text.txt', out.join('\n\n'), 'utf8');
  console.log(out.join('\n\n'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
