// Attach to the CDP-enabled Chrome and report Google sign-in state.
const path = require('path');
const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const ctx = contexts[0];
  const pages = ctx.pages();
  let page = pages.find(p => p.url().includes('google.com')) || pages[0] || await ctx.newPage();

  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const text = await page.evaluate(() => document.body.innerText);
  const signedIn = !/^Sign in$/m.test(text.split('\n').filter(Boolean).slice(0, 40).join('\n'));

  // Look for account avatar / name
  const account = await page.evaluate(() => {
    const el = document.querySelector('a[aria-label*="Google Account"], img[alt*="profile"], button[aria-label*="Google Account"]');
    return el ? (el.getAttribute('aria-label') || el.getAttribute('alt')) : null;
  });

  console.log(JSON.stringify({
    url: page.url(),
    title: await page.title(),
    signedIn,
    account,
    snippet: text.replace(/\n{2,}/g, '\n').slice(0, 600),
  }, null, 2));

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
