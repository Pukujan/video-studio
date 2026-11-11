// Credit-free health check: confirms the browser is up, Flow is on the pinned account
// (FLOW_ACCOUNT, see lib.mjs), and every control the kit clicks still exists. Opens menus and
// closes them; attaches an existing image to the draft prompt and removes it again; never
// uploads, submits a prompt or approves anything.
//
//   node flow/doctor.mjs        exit 0 = all good, 1 = wrong account or something moved (names it)
import { attach, openProject, projectUrl, gotoFlow, flowBase, ensureAccount, accountLabel, chipCount, addPickedAsset,
  agentMode, ACCOUNT, loc, SEL, failShot, closeOverlays, showVideos } from './lib.mjs';
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

// The account comes first: on the wrong one nothing else is worth checking.
try {
  const base = await flowBase(page);
  if (!page.url().startsWith(base + '/')) await gotoFlow(page, '/');
  console.log(`account: ${await ensureAccount(page)}  at ${base}/  (pinned: ${ACCOUNT})`);
} catch (e) {
  const on = await accountLabel(page, 3000).catch(() => '');
  console.log(`✗ pinned account ${ACCOUNT}: ${e.message.split('\n')[0]}`);
  console.log(`  this page: ${page.url()}  account: ${on || 'none shown'}`);
  await browser.close().catch(() => {});
  process.exit(1);
}

await check('pinned account / project page', async () => {
  console.log('project:', await openProject(page));
  await ensureAccount(page);
});
await check('Agent mode on (Flow asks the price before spending)', async () => {
  const mode = await agentMode(page); // openProject switched it on if it was off
  if (mode !== 'on') throw new Error(`composer mode is ${mode}`);
});
await check('composer', () => loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 10000 }));
await check('generate button', () => loc(page, SEL.generate).waitFor({ timeout: 10000 }));
await check('add ingredients -> Upload media', async () => {
  await loc(page, SEL.addIngredients).click({ timeout: 10000 });
  await page.locator(SEL.assetPicker).waitFor({ timeout: 10000 });
  await loc(page, SEL.uploadMedia).first().waitFor({ timeout: 10000 });
  await loc(page, SEL.assetSearch).first().waitFor({ timeout: 10000 });
  await closeOverlays(page);
});
// Both ways an asset reaches the prompt, on an image already in the project (no upload): preview
// it and press "Add to prompt", then click the row that is already previewed. Each must leave a
// chip in the composer, which is removed again.
await check('attach an existing image -> Add to prompt, chip, remove', async () => {
  const removeChips = async n => { while ((await chipCount(page)) > n) { await page.locator(SEL.promptChip).filter({ visible: true }).last().locator('button').first().click(); await page.waitForTimeout(700); } };
  const before = await chipCount(page);
  const openPicker = async () => {
    await loc(page, SEL.addIngredients).click({ timeout: 10000 });
    await page.locator(SEL.assetPicker).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);
    return page.locator(SEL.assetOption).filter({ hasText: /Image\s*$/ });
  };
  let images = await openPicker();
  if ((await images.count()) < 2) { results.push(['  (fewer than 2 images in this project; attach not checked)', 'skip']); return; }
  try {
    const isActive = l => l.evaluate((e, c) => e.classList.contains(c), SEL.assetActiveClass);
    const a = (await isActive(images.first())) ? images.nth(1) : images.first();
    await a.click();
    await page.waitForTimeout(800);
    if (!(await isActive(a))) throw new Error(`previewed row is not marked .${SEL.assetActiveClass}`);
    await loc(page, SEL.addToPrompt).last().waitFor({ timeout: 10000 });
    await addPickedAsset(page, a, before);            // preview -> "Add to prompt" -> chip
    await removeChips(before);
    images = await openPicker();
    const b = (await isActive(images.first())) ? images.nth(1) : images.first();
    await b.click();                                  // preview
    await page.waitForTimeout(800);
    await b.click();                                  // previewed row clicked again -> attached directly
    for (let i = 0; i < 20 && (await chipCount(page)) <= before; i++) await page.waitForTimeout(300);
    if ((await chipCount(page)) <= before) throw new Error('clicking the previewed row no longer attaches it');
  } finally { await closeOverlays(page); await removeChips(before); }
});
await check('settings panel', async () => {
  await loc(page, SEL.agentSettings).first().click({ timeout: 10000 });
  await loc(page, SEL.settingsView).waitFor({ timeout: 10000 });
  await closeOverlays(page);
});
await check('Videos view', async () => {
  await showVideos(page);
  await page.waitForTimeout(2000);
  await loc(page, SEL.filters).first().click({ timeout: 10000 });
  await loc(page, SEL.clearFilters).first().click({ timeout: 10000 });
  await closeOverlays(page);
});
await check('download menu (on a clip from the ledger, if any)', async () => {
  const proj = projectUrl(page);
  const row = rows('edit_id IS NOT NULL AND project=?', proj).pop();
  if (!row) { results.push(['  (no ledger clip in this project; download not checked)', 'skip']); return; }
  await gotoFlow(page, `${proj}/edit/${row.edit_id}`);
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
