// Fill the Flow composer with a prompt and start one generation. Reports the resulting state.
// Usage: node scripts/flow-gen.js "<prompt>" [--dry]
const { context } = require('./cdp.js');

const PORT = process.env.CDP_PORT || '9222';
const prompt = process.argv[2];
const dry = process.argv.includes('--dry');
if (!prompt) { console.error('usage: node scripts/flow-gen.js "<prompt>" [--dry]'); process.exit(1); }

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

  const editor = page.locator('flow-base-prompt-box [contenteditable="true"]').first();
  await editor.waitFor({ state: 'visible', timeout: 30000 });
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(prompt);
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => {
    const ed = document.querySelector('flow-base-prompt-box [contenteditable="true"]');
    const gen = document.querySelector('flow-generate-icon-button button');
    return {
      prompt: (ed?.innerText || '').trim(),
      genDisabled: gen ? (gen.disabled ?? gen.getAttribute('aria-disabled')) : 'no-btn',
      genAria: gen?.getAttribute('aria-label'),
      url: location.href,
    };
  });
  console.log('BEFORE', JSON.stringify(state, null, 2));
  if (dry) { console.log('dry run — not generating'); process.exit(0); }

  await page.locator('flow-generate-icon-button button').first().click({ timeout: 15000 });
  console.log('clicked generate at', new Date().toISOString());
  await page.waitForTimeout(12000);

  const after = await page.evaluate(() => ({
    text: document.body.innerText.slice(-2000),
    busy: !!document.querySelector('[class*="loading"],[class*="progress"],[role="progressbar"]'),
    videos: [...document.querySelectorAll('video')].map(v => v.currentSrc || v.src).filter(Boolean),
    url: location.href,
  }));
  console.log('AFTER', JSON.stringify(after, null, 2));
  await page.screenshot({ path: 'output/flow-gen-after.png' });
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
