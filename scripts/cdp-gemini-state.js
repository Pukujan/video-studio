const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);
const PORT = process.argv[2] || '9223';

(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('google.com')) || ctx.pages()[0];

  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    const avatar = document.querySelector('a[aria-label*="Google Account"], img[alt*="Profile"], button[aria-label*="Google Account"]');
    return {
      url: location.href,
      signedIn: !/^Sign in$/m.test(t),
      avatar: avatar ? (avatar.getAttribute('aria-label') || avatar.getAttribute('alt')) : null,
      head: t.replace(/\n{2,}/g, '\n').slice(0, 300),
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
