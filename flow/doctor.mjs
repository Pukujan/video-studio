// Credit-free health check: confirms the browser is up, Flow is signed in, and every control the
// kit clicks still exists. Opens menus and closes them; never submits a prompt.
//
//   node flow/doctor.mjs        exit 0 = all good, 1 = something moved (names it)
import { attach, openProject, projectUrl, loc, SEL, failShot, closeOverlays } from './lib.mjs';
import { rows } from './ledger.mjs';

const results = [];
const check = async (name, fn) => {
  if (page) await closeOverlays(page).catch(() => {});
  try { await fn(); results.push([name, 'ok']); }
  catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); }
};

let browser, page;
try { ({ browser, page } = await attach()); }
catch (e) { console.log(e.message); process.exit(1); }

await check('signed in / project page', async () => {
  await openProject(page);
  if (/accounts\.google\.com/.test(page.url())) throw new Error('redirected to Google sign-in: sign in in the Claude Chromium window');
});
await check('composer', () => loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 10000 }));
await check('generate button', () => loc(page, SEL.generate).waitFor({ timeout: 10000 }));
await check('add ingredients -> Upload media / Add to prompt', async () => {
  await loc(page, SEL.addIngredients).click({ timeout: 10000 });
  await loc(page, SEL.uploadMedia).first().waitFor({ timeout: 10000 });
  await loc(page, SEL.addToPrompt).last().waitFor({ timeout: 10000 });
  await closeOverlays(page);
});
await check('settings panel', async () => {
  await loc(page, SEL.agentSettings).first().click({ timeout: 10000 });
  await loc(page, SEL.settingsView).waitFor({ timeout: 10000 });
  await closeOverlays(page);
});
await check('Videos view', async () => {
  await loc(page, SEL.videosNav).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  await loc(page, SEL.allMediaNav).first().click({ timeout: 10000 });
});
await check('download menu (on a clip from the ledger, if any)', async () => {
  const proj = projectUrl(page);
  const row = rows('edit_id IS NOT NULL AND project=?', proj).pop();
  if (!row) { results.push(['  (no ledger clip in this project; download not checked)', 'skip']); return; }
  await page.goto(`${proj}/edit/${row.edit_id}`);
  await loc(page, SEL.downloadMedia).first().click({ timeout: 30000, force: true });
  await page.locator(SEL.downloadMenuItem).first().waitFor({ timeout: 10000 });
  const items = await page.locator(SEL.downloadMenuItem).allInnerTexts();
  if (!items.some(t => /720p/.test(t))) throw new Error('no 720p option in: ' + items.join(' / '));
  await closeOverlays(page);
  await openProject(page);
});

const bad = results.filter(r => r[1].startsWith('FAIL'));
for (const [n, s] of results) console.log(`${s.startsWith('FAIL') ? '✗' : '✓'} ${n}${s === 'ok' ? '' : ': ' + s}`);
if (bad.length) console.log('screenshot:', await failShot(page, 'doctor'));
await browser.close().catch(() => {});
process.exit(bad.length ? 1 : 0);
