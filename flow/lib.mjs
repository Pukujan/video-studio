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

export const SEL = {
  newProject: { role: 'button', name: /New project/ },
  composer: '[aria-label="What do you want to create?"]',
  addIngredients: { role: 'button', name: 'Add ingredients to the prompt box' },
  uploadMedia: { text: 'Upload media' },
  addToPrompt: { text: 'Add to prompt' },
  generate: { role: 'button', name: 'Start generation' },
  // two visible "Settings" buttons exist: the top bar's (grid view options) and the composer's
  // (generation defaults). Only the composer one opens flow-settings-view.
  agentSettings: 'flow-base-prompt-box button[aria-label="Settings"]',
  settingsView: 'flow-settings-view',
  newSession: { role: 'button', name: 'Start new session' },
  stop: { role: 'button', name: 'stop' },
  approve: { text: 'Approve' },            // a div[role=radio], not a button
  costLine: /costing (\d+) credits?\?/,
  videosNav: { text: 'Videos' },
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

export async function attach() {
  let browser;
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
  catch { throw new Error(`no browser on :${PORT}. Start it with ~/bin/claude-chrome https://flow.google.com/`); }
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => /flow\.google\.com\/project/.test(p.url()))
    || ctx.pages().find(p => /flow\.google\.com/.test(p.url())) || await ctx.newPage();
  return { browser, ctx, page };
}

export const projectUrl = page => (page.url().match(/https:\/\/flow\.google\.com\/project\/[0-9a-f-]+/) || [])[0];

// Make sure a project page with a visible composer is open. Pass a project URL to pin one.
export async function openProject(page, url = process.env.FLOW_PROJECT) {
  if (url && projectUrl(page) !== url) await page.goto(url);
  else if (!projectUrl(page)) {
    await page.goto('https://flow.google.com/');
    await loc(page, SEL.newProject).first().click({ timeout: 30000 });
    await page.waitForURL(/\/project\//, { timeout: 30000 });
  } else if (/\/edit\//.test(page.url())) await page.goto(projectUrl(page));
  await loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 30000 }).catch(async () => {
    await page.reload(); // stale Angular page: composer resolves but stays hidden
    await loc(page, SEL.composer).first().waitFor({ state: 'visible', timeout: 30000 });
  });
  return projectUrl(page);
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

// Upload a local image (if it isn't in the project yet) and attach it to the prompt.
export async function attachImage(page, file) {
  const name = path.basename(file);
  await loc(page, SEL.addIngredients).click();
  await page.waitForTimeout(1500);
  let item = page.locator(`text=${name} >> visible=true`).first();
  if (!(await item.count())) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), loc(page, SEL.uploadMedia).first().click()]);
    await chooser.setFiles(file);
    await page.locator(`text=${name} >> visible=true`).first().waitFor({ timeout: 120000 });
    item = page.locator(`text=${name} >> visible=true`).first();
  }
  await item.click();
  await page.waitForTimeout(800);
  await loc(page, SEL.addToPrompt).last().click();
  await page.waitForTimeout(1500);
}

export async function submitPrompt(page, text) {
  await loc(page, SEL.composer).first().click();
  await page.keyboard.insertText(text); // keyboard.type mangles punctuation in ProseMirror
  await page.waitForTimeout(500);
  await loc(page, SEL.generate).click();
}

// Wait for the "costing N credits?" prompt. Approves only if N <= maxCredits; returns N.
export async function approve(page, { maxCredits = 20, dryRun = false } = {}) {
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    const tail = (await page.evaluate(() => document.body.innerText)).slice(-1200);
    const m = tail.match(SEL.costLine);
    if (m && /Approve/.test(tail.slice(tail.search(SEL.costLine)))) {
      const cost = +m[1];
      if (cost > maxCredits) throw new Error(`Flow asked for ${cost} credits, above the ${maxCredits} limit; not approved`);
      if (!dryRun) { await loc(page, SEL.approve).last().click(); await page.waitForTimeout(3000); }
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
  await loc(page, SEL.videosNav).first().click();
  await page.waitForTimeout(4000);
  const pick = () => page.evaluate(() => [...document.querySelectorAll('img,video')].filter(e => {
    const r = e.getBoundingClientRect(); return r.width > 150 && r.x + r.width / 2 < innerWidth * 0.68;
  }).length);
  const n = await pick();
  const ids = [];
  for (let i = 0; i < n; i++) {
    if (i) { await page.goto(home); await loc(page, SEL.videosNav).first().click(); await page.waitForTimeout(3000); }
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
  await page.goto(home);
  return ids;
}

// Download one clip by its edit id. res: 720p (original) | 1080p | 4K | 270p.
export async function download(page, id, dest, res = '720p') {
  await page.goto(`${projectUrl(page)}/edit/${id}`);
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
