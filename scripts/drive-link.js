const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-id]')];
    const hit = rows.find(r => /precedent-demo/i.test(r.innerText || ''));
    if (!hit) return null;
    return {
      id: hit.getAttribute('data-id'),
      text: (hit.innerText || '').trim().slice(0, 200),
      size: (hit.innerText || '').match(/[\d.]+\s*(KB|MB|GB)/i)?.[0] || null,
    };
  });
  console.log('row:', JSON.stringify(info, null, 2));
  if (info?.id) {
    console.log('LINK: https://drive.google.com/file/d/' + info.id + '/view');
  }
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
