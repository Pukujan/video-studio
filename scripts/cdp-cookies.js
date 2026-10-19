const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const { cookies } = await cdp.send('Network.getAllCookies');
  const google = cookies.filter(c => /(^|\.)google\.com$/.test(c.domain));
  const names = google.map(c => `${c.domain}${c.path}:${c.name}`);
  console.log('total cookies', cookies.length);
  console.log('google cookies', google.length);
  console.log(names.filter(n => /SID|HSID|SSID|APISID|SAPISID|__Secure|NID|SIDCC/.test(n)).join('\n'));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
