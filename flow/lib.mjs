// Google Flow driver. Every selector the kit depends on lives in SEL; doctor.mjs checks them
// without spending credits. Nothing here clicks by screen coordinates.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const PORT = process.env.CDP_PORT || process.env.CLAUDE_CHROME_PORT || '9222';
export const OUT = process.env.FLOW_OUT || path.join(ROOT, 'output', 'flow');
// The only Google account the kit may use. The browser is signed in to several; a plain
// flow.google.com URL lands on the browser's default one, so every navigation goes through
// flowBase() / gotoFlow() and is checked with ensureAccount().
export const ACCOUNT = (process.env.FLOW_ACCOUNT || 'needfsw02@gmail.com').trim().toLowerCase();
export const ORIGIN = 'https://flow.google.com';

export const SEL = {
  // avatar link, aria-label "Google Account: <name> (<email>), Google membership"
  account: '[aria-label^="Google Account:"]',
  projectLink: 'a[href*="/project/"]',
  newProject: { role: 'button', name: /New project/ },
  composer: '[aria-label="What do you want to create?"]',
  addIngredients: { role: 'button', name: 'Add ingredients to the prompt box' },
  uploadMedia: { text: 'Upload media' },
  // 2026-11-11 picker: a list of assets with a preview pane. Clicking a row previews it and shows
  // "Add to prompt"; clicking the row that is already previewed (a fresh upload is) attaches it
  // at once and closes the picker, so that button never appears. attachImage handles both.
  assetPicker: 'flow-add-menu-popover-content',
  assetSearch: { label: 'Search assets' },
  assetOption: 'flow-add-menu-asset-list [role="option"]',
  assetActiveClass: 'asset-item-active',
  addToPrompt: { text: 'Add to prompt' },
  promptChip: 'flow-ingredient-chip',      // an attached image in the composer; its button removes it
  generate: { role: 'button', name: 'Start generation' },
  // The composer has two modes. In Agent mode (chip pressed) the agent states the price and waits
  // for Approve. With the chip off, "Start generation" spends at once (e.g. x2 outputs = 48
  // credits) with no prompt, so the kit never submits unless Agent mode is confirmed on.
  agentChip: 'flow-agent-mode-toggle-chip button',
  agentBox: 'flow-creative-agent-prompt-box, button[aria-label="Agent instructions"]',
  // two visible "Settings" buttons exist: the top bar's (grid view options) and the composer's
  // (generation defaults). Only the composer one opens flow-settings-view.
  agentSettings: 'flow-base-prompt-box button[aria-label="Settings"]',
  settingsView: 'flow-settings-view',
  newSession: { role: 'button', name: 'Start new session' },
  stop: { role: 'button', name: 'stop' },
  approve: { text: 'Approve' },            // a div[role=radio], not a button
  costLine: /costing (\d+) credits?\?/,
  // 2026-11-05: the Videos nav item moved into the Filters panel as a checkbox.
  filters: { role: 'button', name: 'Filtering and sorting options' },
  videosFilter: { role: 'checkbox', name: 'Videos' },
  clearFilters: { role: 'button', name: 'Clear all filters' },
  allMediaNav: { text: 'All media' },
  pendingTile: 'flow-pending-tile',
  videoTile: 'flow-video-tile',
  downloadMedia: { label: 'Download media' },
  downloadMenuItem: '.cdk-overlay-pane button, .cdk-overlay-pane [role="menuitem"]',
};

// Flow keeps hidden copies of many controls in the DOM, so text/role lookups only match visible ones.
export function loc(page, s) {
  if (typeof s === 'string') return page.locator(s);
  if (s.role) return page.getByRole(s.role, { name: s.name, exact: typeof s.name === 'string' }).filter({ visible: true });
  if (s.label) return page.getByLabel(s.label);
  return page.getByText(s.text, { exact: true }).filter({ visible: true });
}

// The asset picker ignores a single Escape sometimes; press until no overlay pane is visible.
export async function closeOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => [...document.querySelectorAll('.cdk-overlay-pane')].some(e => e.getBoundingClientRect().height > 0));
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
}

// "Failed" cards: Flow could not render (e.g. "Audio generation failed ... You will be refunded").
export const failedCards = page => page.evaluate(() =>
  [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && e.textContent.trim() === 'Failed' && e.getBoundingClientRect().height > 0)
    .map(e => (e.closest('[class]')?.parentElement?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)));

// ---- pinned account -------------------------------------------------------------------------

export class AccountError extends Error {}

const onFlow = url => url.startsWith(ORIGIN + '/');
const PROJECT_RE = /^https:\/\/flow\.google\.com(?:\/u\/\d+)?\/project\/([0-9a-f-]+)/;
// Index-free project URL. This is the form the ledger stores: the /u/<N> index can change.
export const canonicalProject = url => { const m = String(url || '').match(PROJECT_RE); return m ? `${ORIGIN}/project/${m[1]}` : undefined; };
export const projectUrl = page => canonicalProject(page.url());

// Label of the account the page is on, "" if the page shows none.
export async function accountLabel(page, ms = 20000) {
  const a = page.locator(SEL.account).first();
  await a.waitFor({ state: 'attached', timeout: ms }).catch(() => {});
  return ((await a.getAttribute('aria-label').catch(() => null)) || '').replace(/\s+/g, ' ').trim();
}
const isPinned = label => label.toLowerCase().includes(`(${ACCOUNT})`);

let base; // `${ORIGIN}/u/<N>` of the pinned account, found once per run

// Find which /u/<N>/ is the pinned account by loading each home page and reading its account
// label. Flow sends an index past the last signed-in account back to /u/0/. Throws when the
// account is not signed in; never falls back to another account.
export async function flowBase(page) {
  if (base) return base;
  const here = page.url().match(/^https:\/\/flow\.google\.com\/u\/(\d+)(?:\/|$)/);
  if (here && isPinned(await accountLabel(page, 3000))) return base = `${ORIGIN}/u/${here[1]}`;
  const seen = [];
  for (let n = 0; n <= 4; n++) {
    await page.goto(`${ORIGIN}/u/${n}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!onFlow(page.url())) throw new AccountError(`Flow sent the browser to ${new URL(page.url()).host}: sign in to ${ACCOUNT} in the Claude Chromium window. Nothing was generated.`);
    const label = await accountLabel(page);
    const landed = +(page.url().match(/\/u\/(\d+)(?:\/|$)/) || [, 0])[1];
    if (landed !== n) break;
    seen.push(`/u/${n}/ ${label || '(no account label)'}`);
    if (isPinned(label)) return base = `${ORIGIN}/u/${n}`;
  }
  throw new AccountError(`Flow account ${ACCOUNT} is not signed in in this browser (found: ${seen.join('; ') || 'none'}). ` +
    'Sign it in in the Claude Chromium window, or set FLOW_ACCOUNT. Nothing was generated.');
}

// Any Flow URL or path, with or without /u/<N>, as the same path under the pinned account.
export async function pinned(page, url = '/') {
  const b = await flowBase(page);
  const rest = String(url).replace(/^https:\/\/flow\.google\.com/, '').replace(/^\/u\/\d+(?=\/|$)/, '');
  if (/^[a-z]+:/i.test(rest)) throw new Error(`not a Flow URL: ${url}`);
  return b + (rest.startsWith('/') ? rest : '/' + rest);
}

// Stop unless the page is on the pinned account. Call after every navigation and before
// anything that can cost credits.
export async function ensureAccount(page) {
  const b = await flowBase(page);
  const label = await accountLabel(page);
  if (!page.url().startsWith(b + '/') || !isPinned(label)) {
    throw new AccountError(`wrong Flow account: ${page.url()} is on "${label || 'no account label'}", wanted ${ACCOUNT}. ` +
      'Stopped before generating or approving anything.');
  }
  return label;
}

// The only way the kit navigates to Flow.
export async function gotoFlow(page, url = '/') {
  await page.goto(await pinned(page, url), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await ensureAccount(page);
  return page.url();
}

export async function attach() {
  let browser;
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
  catch { throw new Error(`no browser on :${PORT}. Start it with ~/bin/claude-chrome https://flow.google.com/`); }
  const ctx = browser.contexts()[0];
  // Only ever reuse a tab that is already on Flow; other tabs are in use by other work.
  const page = ctx.pages().find(p => PROJECT_RE.test(p.url()))
    || ctx.pages().find(p => onFlow(p.url())) || await ctx.newPage();
  // The window stays hidden or minimized so it never steals focus; a narrow window makes Flow
  // switch to its mobile layout, so render the page at desktop size whatever the window is.
  await page.setViewportSize({ width: 1500, height: 950 });
  return { browser, ctx, page };
}

// Make sure a project page of the pinned account, with a visible composer, is open, and return
// its index-free URL. Pass a project URL (FLOW_PROJECT, or one from the ledger, with or without
// /u/<N>) to ask for that project, or "new" for a fresh one. Projects belong to one account: a
// project the pinned account does not own answers "Project not found", and then the pinned
// account's first listed project is used, or a new one is created. Never the other account's.
export async function openProject(page, url = process.env.FLOW_PROJECT) {
  const b = await flowBase(page); // may leave the page on a Flow home page
  const want = url === 'new' ? null : canonicalProject(url);
  if (url && url !== 'new' && !want) throw new Error(`FLOW_PROJECT is not a Flow project URL: ${url}`);
  const here = () => (page.url().startsWith(b + '/') ? projectUrl(page) : undefined);
  const missing = () => !here() || /\/404\b/.test(page.url());

  if (want && here() !== want) {
    await gotoFlow(page, want);
    // Flow answers a project the account does not own by routing to /u/<N>/404?reason=project.
    await Promise.race([
      loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 30000 }),
      page.waitForURL(/\/404\b/, { timeout: 30000 }),
    ]).catch(() => {});
  } else if (url !== 'new' && here() && /\/edit\//.test(page.url())) await gotoFlow(page, here());
  if (url === 'new' || missing()) {
    if (want) console.error(`note: ${want} is not a project of ${ACCOUNT}; using one of that account's own projects`);
    await gotoFlow(page, '/');
    await loc(page, SEL.newProject).first().waitFor({ timeout: 30000 });
    const first = url === 'new' ? null : await page.locator(SEL.projectLink).first().getAttribute('href', { timeout: 3000 }).catch(() => null);
    if (first) await gotoFlow(page, first);
    else {
      await loc(page, SEL.newProject).first().click({ timeout: 30000 });
      await page.waitForURL(/\/project\//, { timeout: 30000 });
    }
    if (missing()) throw new Error(`could not open a project of ${ACCOUNT} (at ${page.url()})`);
  }
  await loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
    await page.reload(); // stale Angular page: composer resolves but stays hidden
    await loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 30000 });
  });
  await ensureAccount(page);
  await ensureAgentMode(page);
  return projectUrl(page);
}

// 'on' | 'off' | 'unknown'. The session panel's composer has no chip but is always the agent's.
export const agentMode = page => page.evaluate(([chip, box]) => {
  const vis = e => e.getBoundingClientRect().height > 0;
  const c = [...document.querySelectorAll(chip)].find(vis);
  if (c) return c.getAttribute('aria-pressed') === 'true' ? 'on' : 'off';
  return [...document.querySelectorAll(box)].some(vis) ? 'on' : 'unknown';
}, [SEL.agentChip, SEL.agentBox]);

// Switch the composer to Agent mode if it is off, and stop unless it is confirmed on.
export async function ensureAgentMode(page) {
  // The composer re-renders for a moment after attach() resizes the viewport, so poll.
  const read = async () => { let m; for (let i = 0; i < 16 && (m = await agentMode(page)) === 'unknown'; i++) await page.waitForTimeout(500); return m; };
  if ((await read()) === 'off') {
    await page.locator(SEL.agentChip).filter({ visible: true }).first().click();
    await page.waitForTimeout(1500);
  }
  const mode = await read();
  if (mode !== 'on') throw new Error(`Flow composer is not in Agent mode (${mode}): outside it "Start generation" spends credits with no price prompt. Nothing was submitted.`);
}

// Show only videos in the project grid (Filters panel > Type > Videos), then close the panel.
export async function showVideos(page) {
  await loc(page, SEL.filters).first().click();
  const box = loc(page, SEL.videosFilter).first();
  await box.waitFor({ timeout: 10000 });
  if (!(await box.isChecked())) await box.check();
  await closeOverlays(page);
}

export async function waitAgentIdle(page, ms = 300000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!(await loc(page, SEL.stop).count())) return;
    await page.waitForTimeout(3000);
  }
  throw new Error('agent still busy');
}

// One session per clip, so the agent never mixes up references from an earlier request.
export async function newSession(page) {
  await waitAgentIdle(page);
  if (await loc(page, SEL.newSession).count()) {
    await loc(page, SEL.newSession).first().click();
    await page.waitForTimeout(1500);
  }
}

export const chipCount = page => page.locator(SEL.promptChip).filter({ visible: true }).count();

// Attach the asset in picker row `item` to the prompt and confirm a chip appeared in the composer.
// `before` is chipCount() from before the picker was used.
export async function addPickedAsset(page, item, before) {
  const attached = async () => (await chipCount(page)) > before;
  const settle = async ms => { for (const end = Date.now() + ms; Date.now() < end && !(await attached());) await page.waitForTimeout(300); return attached(); };
  if (!(await attached())) {
    const active = await item.evaluate((e, c) => e.classList.contains(c), SEL.assetActiveClass).catch(() => false);
    // Previews the row. If it was the previewed row after all, this click attaches it instead.
    if (!active) { await item.click(); await settle(1200); }
    if (!(await attached())) await loc(page, SEL.addToPrompt).last().click({ timeout: 10000 });
  }
  if (!(await settle(10000))) throw new Error('the image was not attached to the prompt (no chip in the composer)');
  await closeOverlays(page);
}

// Upload a local image (if it isn't in the project yet) and attach it to the prompt.
export async function attachImage(page, file) {
  const name = path.basename(file);
  const before = await chipCount(page);
  await loc(page, SEL.addIngredients).click();
  await page.locator(SEL.assetPicker).waitFor({ timeout: 15000 });
  // The list only mounts the rows in view, so look the file up through the search box.
  const search = loc(page, SEL.assetSearch).first();
  await search.fill(name);
  await page.waitForTimeout(1500);
  const item = page.locator(SEL.assetOption).filter({ hasText: name }).first();
  if (!(await item.count())) {
    await search.fill('');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), loc(page, SEL.uploadMedia).first().click()]);
    await chooser.setFiles(file);
    // Done when the upload shows as a row, or has already landed in the composer as a chip.
    for (const end = Date.now() + 120000; !(await item.count()) && (await chipCount(page)) <= before;) {
      if (Date.now() > end) throw new Error(`upload of ${name} did not show up in the asset picker within 2 minutes`);
      await page.waitForTimeout(1000);
    }
  }
  await addPickedAsset(page, item, before);
}

export async function submitPrompt(page, text) {
  await ensureAccount(page);
  await ensureAgentMode(page);
  await loc(page, SEL.composer).first().click();
  await page.keyboard.insertText(text); // keyboard.type mangles punctuation in ProseMirror
  await page.waitForTimeout(500);
  if ((await agentMode(page)) !== 'on') throw new Error('Flow composer left Agent mode; not submitted');
  await loc(page, SEL.generate).click();
}

// Wait for the "costing N credits?" prompt. Approves only if N <= maxCredits; returns N.
export async function approve(page, { maxCredits = 30, dryRun = false } = {}) {
  await ensureAccount(page);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    const tail = (await page.evaluate(() => document.body.innerText)).slice(-1200);
    const m = tail.match(SEL.costLine);
    if (m && /Approve/.test(tail.slice(tail.search(SEL.costLine)))) {
      const cost = +m[1];
      if (cost > maxCredits) throw new Error(`Flow asked for ${cost} credits, above the ${maxCredits} limit; not approved`);
      if (!dryRun) { await ensureAccount(page); await loc(page, SEL.approve).last().click(); await page.waitForTimeout(3000); }
      return cost;
    }
  }
  throw new Error('no credit prompt from the Flow agent within 3 minutes');
}

// The newest session's chat ends in a finished clip, a Failed card, or neither (queued/rendering).
// While queued there is no pending tile at all, so pendingCount alone can't tell "done" from "queued".
export const sessionState = page => page.evaluate(() => {
  const t = document.body.innerText;
  const last = Math.max(t.lastIndexOf('Approve'), 0);
  const tail = t.slice(last);
  if (document.querySelector('flow-pending-tile')) return 'rendering';
  if (/\bFailed\b/.test(tail)) return 'failed';
  if (/scheduled|queue/i.test(tail) && !document.querySelector('flow-video-tile img, flow-video-tile video')) return 'queued';
  return 'done';
});

export const pendingCount = page => page.evaluate(s => document.querySelectorAll(s).length, SEL.pendingTile);

// Open the Videos view and return every clip's edit id, scrolling so lazy tiles mount.
export async function listVideoIds(page) {
  const home = await openProject(page);
  await showVideos(page);
  await page.waitForTimeout(4000);
  const pick = () => page.evaluate(() => [...document.querySelectorAll('img,video')].filter(e => {
    const r = e.getBoundingClientRect(); return r.width > 150 && r.x + r.width / 2 < innerWidth * 0.68;
  }).length);
  const n = await pick();
  const ids = [];
  for (let i = 0; i < n; i++) {
    if (i) { await gotoFlow(page, home); await showVideos(page); await page.waitForTimeout(3000); }
    const c = await page.evaluate(i => {
      const e = [...document.querySelectorAll('img,video')].filter(e => {
        const r = e.getBoundingClientRect(); return r.width > 150 && r.x + r.width / 2 < innerWidth * 0.68;
      })[i];
      if (!e) return null; e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, i);
    if (!c) break;
    await page.waitForTimeout(800);
    await page.mouse.click(c.x, c.y);
    await page.waitForURL(/\/edit\//, { timeout: 20000 }).catch(() => {});
    const id = page.url().split('/edit/')[1];
    if (id) ids.push(id);
  }
  await gotoFlow(page, home);
  return ids;
}

// Download one clip by its edit id. res: 720p (original) | 1080p | 4K | 270p.
export async function download(page, id, dest, res = '720p') {
  await gotoFlow(page, `${projectUrl(page)}/edit/${id}`);
  await loc(page, SEL.downloadMedia).first().waitFor({ timeout: 30000 });
  await loc(page, SEL.downloadMedia).first().click({ force: true });
  await page.waitForTimeout(1500);
  const item = page.locator(SEL.downloadMenuItem).filter({ hasText: new RegExp(res, 'i') }).first();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), item.click()]);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await dl.saveAs(dest);
  await closeOverlays(page);
  return dest;
}

export function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch {}
  return require('ffmpeg-static');
}

// Save a screenshot when a step fails, so selector drift is quick to diagnose.
export async function failShot(page, tag) {
  const f = path.join(OUT, 'failures', `${new Date().toISOString().replace(/[:.]/g, '-')}-${tag}.png`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  await page.screenshot({ path: f }).catch(() => {});
  return f;
}
