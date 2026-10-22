// Open Flow composer Settings and dump the panel's clickable DOM. Reloads first.
const { context } = require('./cdp.js');

const PORT = process.argv[2] || '9222';

(async () => {
  const { ctx } = await context(PORT);
  const page = ctx.pages().find(p => p.url().includes('flow.google.com/project')) || ctx.pages()[0];
  await page.bringToFront();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);

  const box = page.locator('flow-base-prompt-box');
  await box.waitFor({ state: 'visible', timeout: 30000 });
  await box.getByRole('button', { name: 'Settings' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('mat-dialog-container,[role="dialog"],.cdk-overlay-pane')]
      .filter(el => el.offsetParent !== null || el.querySelector('button'));
    const panel = panels[panels.length - 1];
    if (!panel) return { err: 'no panel', body: document.body.innerText.slice(-1500) };
    const nodes = [...panel.querySelectorAll('button,[role="button"],[role="combobox"],[role="option"],[role="radio"],[role="switch"],mat-select,mat-radio-button')]
      .map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        txt: (el.innerText || '').trim().replace(/\n+/g, ' | ').slice(0, 70),
        cls: (el.className || '').toString().slice(0, 110),
        checked: el.getAttribute('aria-checked') || el.getAttribute('aria-selected'),
      }));
    return { panelCls: (panel.className || '').toString(), nodes };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: 'output/flow-settings-panel.png' });
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
