const coreDir = 'C:/Users/pujan/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const { chromium } = require(coreDir);
const fs = require('fs');

const OUT = 'output/captures';
const BASE = 'https://arize.design-bakery.com';
const Q = 'Which Colorado counties apply the homestead exemption to mineral rights?';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('design-bakery')) || await ctx.newPage();

  await page.setViewportSize({ width: 1920, height: 1080 });

  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    await page.waitForTimeout(1200);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
    console.log('captured', name);
  };

  // Home
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await shot('01-home');

  // Ask a question
  const box = page.getByRole('textbox').first();
  await box.fill(Q);
  await page.getByRole('button', { name: 'Ask' }).click();

  try {
    await page.waitForFunction(
      () => /Short answer|No conclusion|could not/i.test(document.body.innerText),
      { timeout: 120000 }
    );
  } catch (e) { console.log('answer wait timed out, capturing anyway'); }
  await page.waitForTimeout(2500);
  await shot('02-answer');

  // Map
  await page.getByRole('link', { name: 'Map' }).click().catch(() => {});
  await page.waitForTimeout(4000);
  await shot('03-map');

  // Observability
  await page.goto(BASE + '/observability', { waitUntil: 'networkidle', timeout: 60000 });
  await shot('04-observability');

  // Slides 1, 5, 8
  await page.goto(BASE + '/slides', { waitUntil: 'networkidle', timeout: 60000 });
  await shot('05-slide1');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /next slide/i }).click();
    await page.waitForTimeout(700);
  }
  await shot('06-slide5');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /next slide/i }).click();
    await page.waitForTimeout(700);
  }
  await shot('07-slide8');

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
