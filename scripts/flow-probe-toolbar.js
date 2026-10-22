// Open the composer Settings panel and report the model / duration / aspect controls.
const { context } = require('./cdp.js');

const PORT = process.argv[2] || '9222';

async function snap(page, label) {
  const s = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)]
      .map(el => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '')
        .trim().replace(/\n+/g, ' | ')).filter(Boolean);
    const checked = [...document.querySelectorAll('[aria-checked="true"],[aria-selected="true"],.selected,[class*="selected"]')]
      .map(el => (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\n+/g, ' | ').slice(0, 60))
      .filter(Boolean);
    return {
      text: document.body.innerText.slice(-2500),
      buttons: [...new Set(pick('button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="radio"],[role="combobox"]'))].slice(0, 120),
      checked: [...new Set(checked)].slice(0, 30),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(s, null, 2));
  await page.screenshot({ path: `output/flow-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}.png` });
}

(async () => {
  const { ctx } = await context(PORT);
  const page = ctx.pages().find(p => p.url().includes('flow.google.com/project')) || ctx.pages()[0];
  await page.bringToFront();
  await page.waitForTimeout(1000);

  const box = page.locator('flow-base-prompt-box');
  const settings = box.getByRole('button', { name: 'Settings' }).first();
  await settings.click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  await snap(page, 'SETTINGS');

  const add = box.getByRole('button', { name: /Add ingredients/i }).first();
  if (await add.count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await add.click({ timeout: 8000 });
    await page.waitForTimeout(2500);
    await snap(page, 'ADD-MENU');
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
