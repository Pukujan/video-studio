const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const candidates = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, div[role="button"], [role="button"]')) {
      const label = el.getAttribute('aria-label') || '';
      const txt = (el.innerText || '').trim();
      if (/new|upload/i.test(label) || /^New$/i.test(txt)) {
        const r = el.getBoundingClientRect();
        out.push({
          tag: el.tagName,
          label,
          text: txt.slice(0, 40),
          box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        });
      }
    }
    return out;
  });
  console.log('candidates:', JSON.stringify(candidates, null, 2));
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
