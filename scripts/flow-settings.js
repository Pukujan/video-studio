// Set Flow agent video-generation defaults: aspect ratio, variant count, model.
// Usage: node scripts/flow-settings.js [16:9|9:16] [x1..x4] ["Veo 3.1 - Fast"]
const { context } = require('./cdp.js');

const PORT = process.env.CDP_PORT || '9222';
const ratio = process.argv[2] || '16:9';
const variants = process.argv[3] || 'x1';
const model = process.argv[4] || 'Veo 3.1 - Fast';

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
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.locator('flow-base-prompt-box').getByRole('button', { name: 'Settings' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);

  const view = page.locator('flow-settings-view');
  // Sections: [0] confirm, [1] image, [2] video. Toggle groups are radio buttons by index.
  const video = view.locator('.settings-section').nth(2);
  const radios = video.locator('button[role="radio"]');
  const ratioIdx = ratio === '9:16' ? 1 : 0;
  const varIdx = { x1: 2, x2: 3, x3: 4, x4: 5 }[variants] ?? 2;
  await radios.nth(ratioIdx).click({ timeout: 10000 });
  await radios.nth(varIdx).click({ timeout: 10000 });

  await video.getByRole('button', { name: /Video generation default model/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.getByRole('menuitem', { name: model }).first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);

  const chosen = await video.evaluate(el => el.innerText.replace(/\n+/g, ' | '));
  console.log('video section now:', chosen);

  await view.getByRole('button', { name: 'Save' }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  console.log('saved');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
