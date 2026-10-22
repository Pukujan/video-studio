// Probe the Google Flow UI over the durable CDP session. Read-only: no generation.
// Usage: node scripts/flow-probe.js [port]
const { context } = require('./cdp.js');

const PORT = process.argv[2] || '9222';

async function dump(page, label) {
  const snap = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)]
      .map(el => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
        .trim().replace(/\n+/g, ' | '))
      .filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 3000),
      buttons: [...new Set(pick('button,[role="button"],[role="tab"],[role="option"],[role="menuitem"]'))].slice(0, 90),
      inputs: [...new Set(pick('textarea,input,[contenteditable="true"]'))].slice(0, 20),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(snap, null, 2));
  return snap;
}

(async () => {
  const { ctx } = await context(PORT);
  console.log('pages:\n  ' + ctx.pages().map(p => p.url()).join('\n  '));

  const page = ctx.pages().find(p => p.url().includes('flow.google.com')) || await ctx.newPage();
  await page.bringToFront();
  await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  await dump(page, 'HOME');
  await page.screenshot({ path: 'output/flow-home.png' });

  const before = page.url();
  await page.getByRole('button', { name: /New project/i }).first().click();
  await page.waitForTimeout(9000);
  console.log(`\nnavigated: ${before} -> ${page.url()}`);
  await dump(page, 'PROJECT');
  await page.screenshot({ path: 'output/flow-project.png' });

  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
