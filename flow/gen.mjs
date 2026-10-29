// Queue one image-to-video generation and record it in the ledger.
//
//   node flow/gen.mjs --image start.jpg --template still-relief --vars '{"action":"..."}' --label mom --yes
//   node flow/gen.mjs --image start.jpg --prompt "full prompt text" --label mom --yes
//
// Without --yes it stops at Flow's "costing N credits?" prompt and does not approve.
// --max-credits N (default 20) refuses to approve anything pricier.
import fs from 'node:fs';
import path from 'node:path';
import { attach, openProject, newSession, attachImage, submitPrompt, approve, failShot } from './lib.mjs';
import { add, update } from './ledger.mjs';
import { render } from './templates.mjs';

const a = process.argv.slice(2);
const opt = k => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const image = opt('image'), label = opt('label'), template = opt('template');
const yes = a.includes('--yes');
const maxCredits = +(opt('max-credits') || 20);
let prompt = opt('prompt');
if (template) prompt = render(template, JSON.parse(opt('vars') || '{}'));
if (!prompt) { console.log('need --prompt or --template'); process.exit(2); }
if (image && !fs.existsSync(image)) { console.log('no such image', image); process.exit(2); }

const { browser, page } = await attach();
let id;
try {
  const project = await openProject(page);
  await newSession(page);
  if (image) await attachImage(page, path.resolve(image));
  await submitPrompt(page, prompt);
  const cost = await approve(page, { maxCredits, dryRun: !yes });
  id = add({ project, label, template, prompt, start_image: image && path.resolve(image), model: process.env.FLOW_MODEL || 'Veo 3.1 - Fast', credits: yes ? cost : 0 });
  if (!yes) update(id, { status: 'rejected', verdict_note: 'dry run: not approved' });
  console.log(JSON.stringify({ id, label, cost, approved: yes }));
} catch (e) {
  console.error('ERR', e.message, '->', await failShot(page, 'gen'));
  process.exitCode = 1;
} finally { await browser.close().catch(() => {}); }
