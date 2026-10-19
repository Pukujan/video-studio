const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('design-bakery')) || ctx.pages()[0];

  await page.goto('https://arize.design-bakery.com/slides', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const slides = [];
  for (let i = 0; i < 12; i++) {
    const txt = await page.locator('main, body').first().innerText();
    const counter = txt.match(/(\d+)\s+of\s+(\d+)/);
    slides.push({ i, text: txt.replace(/\n{2,}/g, '\n').slice(0, 900), counter: counter ? counter[0] : null });
    const next = page.getByRole('button', { name: /next slide/i });
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(900);
  }
  console.log(JSON.stringify(slides, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
