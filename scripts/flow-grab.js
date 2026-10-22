// Download the newest generated video from a Flow project.
// Usage: node scripts/flow-grab.js [outfile] [--res 720p|1080p|4K|270p]
const { context } = require('./cdp.js');
const path = require('path');
const fs = require('fs');

const PORT = process.env.CDP_PORT || '9222';
const args = process.argv.slice(2);
const resIdx = args.indexOf('--res');
const res = resIdx >= 0 ? args[resIdx + 1] : '720p';
const out = args.find((a, i) => !a.startsWith('--') && i !== resIdx + 1) || 'output/flow/clip.mp4';

(async () => {
  const { ctx } = await context(PORT);
  const page = ctx.pages().find(p => p.url().includes('flow.google.com/project'))
    || ctx.pages().find(p => p.url().includes('flow.google.com'));
  if (!page) throw new Error('no Flow project page open');
  await page.bringToFront();

  const tiles = page.locator('flow-video-tile');
  const n = await tiles.count();
  if (!n) throw new Error('no generated video tiles in this project');
  console.log(`${n} video tile(s); opening the newest`);

  await tiles.last().click({ timeout: 20000 });
  await page.waitForTimeout(4000);

  // "Download media" opens a menu; the menu holds the resolution options.
  await page.getByLabel('Download media').first().click({ timeout: 20000, force: true });
  await page.waitForTimeout(2000);

  const items = await page.evaluate(() => {
    const pane = [...document.querySelectorAll('.cdk-overlay-pane')].pop();
    return pane ? [...pane.querySelectorAll('button,[role="menuitem"]')]
      .map(b => (b.innerText || '').trim().replace(/\n+/g, ' | ')) : [];
  });
  console.log('download options:', items.join(', '));
  if (!items.length) throw new Error('download menu did not open');

  const target = page.locator('.cdk-overlay-pane button, .cdk-overlay-pane [role="menuitem"]')
    .filter({ hasText: new RegExp(res, 'i') }).first();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 240000 }),
    target.click({ timeout: 20000 }),
  ]);

  const dest = path.resolve(out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await download.saveAs(dest);
  console.log('saved', dest, fs.statSync(dest).size, 'bytes');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
