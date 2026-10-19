const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);
const PORT = process.argv[2] || '9222';

(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const { cookies } = await cdp.send('Network.getAllCookies');
  const g = cookies.filter(c => c.domain.endsWith('google.com'));
  const auth = g.filter(c => ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID'].includes(c.name));
  console.log(JSON.stringify({
    port: PORT,
    totalCookies: cookies.length,
    googleCookies: g.length,
    authCookies: auth.map(c => c.name),
    sessionCookieHasValue: auth.every(c => c.value && c.value.length > 10),
  }, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
