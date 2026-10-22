// Probe the Flow project composer: model picker, duration, aspect ratio. Read-only.
const { context } = require('./cdp.js');

const PORT = process.argv[2] || '9222';

async function snap(page, label) {
  const s = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)]
      .map(el => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '')
        .trim().replace(/\n+/g, ' | '))
      .filter(Boolean);
    return {
      url: location.href,
      text: document.body.innerText.slice(0, 2000),
      buttons: [...new Set(pick('button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="combobox"]'))].slice(0, 100),
      selected: [...new Set(pick('[aria-checked="true"],[aria-selected="true"],[data-selected="true"]'))].slice(0, 20),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(s, null, 2));
  await page.screenshot({ path: `output/flow-${label.toLowerCase()}.png` });
}

(async () => {
  const { ctx } = await context(PORT);
  const page = ctx.pages().find(p => p.url().includes('flow.google.com/project'))
    || ctx.pages().find(p => p.url().includes('flow.google.com'))
    || await ctx.newPage();
  await page.bringToFront();
  if (!page.url().includes('/project/')) {
    await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /New project/i }).first().click();
    await page.waitForTimeout(9000);
  }
  await snap(page, 'COMPOSER');

  // The composer's mode/model controls usually live next to the prompt box.
  for (const name of [/Text to video/i, /Video/i, /model/i, /Veo/i, /Settings/i, /tune/i]) {
    const loc = page.getByRole('button', { name }).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.click({ timeout: 4000 });
        await page.waitForTimeout(2500);
        await snap(page, 'AFTER-' + String(name).replace(/[^a-z0-9]/gi, ''));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
      } catch (e) { console.log(`click ${name} failed: ${e.message.split('\n')[0]}`); }
    }
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
