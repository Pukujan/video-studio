// Wait for renders, download every clip not yet in the ledger, match each to its queued row by
// comparing its first frame with the row's start image, then run the automatic QC.
//
//   node flow/grab.mjs [--wait] [--res 720p]
//
// Clips land in output/flow/<edit id>.mp4 with a <edit id>.sheet.jpg frame grid next to them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { attach, openProject, pendingCount, sessionState, failedCards, listVideoIds, download, failShot, ffmpeg, OUT } from './lib.mjs';
import { rows, update } from './ledger.mjs';
import { qc } from './qc.mjs';

const a = process.argv.slice(2);
const res = a.includes('--res') ? a[a.indexOf('--res') + 1] : '720p';
const { browser, page } = await attach();
try {
  await openProject(page);
  if (a.includes('--wait')) {
    // Veo Fast is ~15 min, mostly queue. Poll the newest session every minute for up to an hour.
    for (let i = 0; i < 60; i++) {
      const st = await sessionState(page);
      if (st === 'done' || st === 'failed') { console.log('latest session:', st); break; }
      console.log(new Date().toISOString().slice(11, 19), st);
      await page.waitForTimeout(60000);
      await page.reload(); await page.waitForTimeout(6000);
    }
  }
  if (await pendingCount(page)) console.log('warning: some clips still rendering; grabbing the finished ones');
  for (const f of await failedCards(page)) console.log('Flow failure card:', f, '-> mark its row with: node flow/ledger.mjs error <id> "msg", then re-run gen.mjs');

  const known = new Set(rows('edit_id IS NOT NULL').map(r => r.edit_id));
  const fresh = (await listVideoIds(page)).filter(id => !known.has(id));
  console.log(`${fresh.length} new clip(s)`);

  const queued = rows(`status='queued' AND start_image IS NOT NULL`);
  const FF = ffmpeg();
  const thumb = f => execFileSync(FF, ['-loglevel', 'error', '-i', f, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-']);
  const mad = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };

  for (const id of fresh) {
    const dest = path.join(OUT, `${id}.mp4`);
    if (!fs.existsSync(dest)) await download(page, id, dest, res);
    const t = thumb(dest);
    let best = null;
    for (const r of queued) {
      if (r.edit_id || !fs.existsSync(r.start_image)) continue;
      const d = mad(t, thumb(r.start_image));
      if (!best || d < best.d) best = { r, d };
    }
    if (!best || best.d > 8) { console.log(`${id}: no queued row matches (best ${best?.d?.toFixed(1)}); saved unlinked`); continue; }
    best.r.edit_id = id;
    const q = qc(dest, best.r.start_image);
    update(best.r.id, { edit_id: id, clip: dest, qc: q, status: q.auto === 'pass' ? 'qc_pass' : 'qc_fail' });
    console.log(`#${best.r.id} ${best.r.label}: ${q.auto}${q.fails.length ? ' (' + q.fails.join('; ') + ')' : ''}  sheet ${q.sheet}`);
  }
  console.log('Next: review every sheet for objects appearing/disappearing, hair/clothes changes and camera jumps, then record it with node flow/ledger.mjs verdict <id> pass|fail "why".');
} catch (e) {
  console.error('ERR', e.message, '->', await failShot(page, 'grab'));
  process.exitCode = 1;
} finally { await browser.close().catch(() => {}); }
