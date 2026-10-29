// Mirror the ledger and the finished clips into the user's Octo workspace ("Music video"), so any
// machine or agent sees the same pass rates and can fetch the files. One-way, single writer:
// the local ledger.jsonl is the source, push replaces the table contents.
//
//   node flow/octo.mjs push              ledger rows -> table flow_gens (+ uploads clips not yet uploaded)
//   node flow/octo.mjs upload <file> [note]   upload any file (e.g. a finished video) into the workspace
//   node flow/octo.mjs files             list files in the workspace
//   node flow/octo.mjs stats             pass rate per template, read back from Octo
//
// Only the tables flow_gens and flow_files are touched; the workspace's other tables are not.
// Credentials: env vars octo_db_music_video (key) and octo_db_music_video_workspace (id), read from
// the environment or ~/Documents/projects/.env. Files stay private; publishing a public URL is a
// separate, deliberate step (POST /api/files/<id>/publish) and is not done here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rows } from './ledger.mjs';

function env(name) {
  if (process.env[name]) return process.env[name];
  const f = path.join(os.homedir(), 'Documents/projects/.env');
  for (const l of fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : []) {
    if (l.startsWith(name + '=')) return l.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  throw new Error(`${name} not set (environment or ~/Documents/projects/.env)`);
}
const BASE = process.env.OCTO_URL || 'https://octodb.design-bakery.com/api';
const KEY = () => env('octo_db_music_video');
const WS = () => env('octo_db_music_video_workspace');

async function api(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j).slice(0, 300)}`);
  return j;
}
export const query = (sql, params = []) => api('POST', `/workspaces/${WS()}/query`, { sql, params, rowLimit: 1000 });

const SCHEMA = [
  `create table if not exists flow_gens (
    id int primary key, created text, project text, label text, template text, prompt text,
    start_image text, model text, credits int, status text, edit_id text, clip_file_id text,
    qc text, verdict text, verdict_note text)`,
  // Own table: the workspace already has an unrelated `assets` table (the music-video project's).
  `create table if not exists flow_files (
    file_id text primary key, name text, note text, uploaded_at timestamptz default now())`,
];

export async function files() { return api('GET', `/files?workspaceId=${WS()}`); }

export async function upload(file, note = '') {
  const name = path.basename(file);
  const ext = path.extname(name).toLowerCase();
  const mimeType = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.jsonl': 'application/x-ndjson' }[ext] || 'application/octet-stream';
  const r = await api('POST', '/files/upload', { workspaceId: WS(), name, mimeType, data: fs.readFileSync(file).toString('base64'), dataEncoding: 'base64' });
  await query('insert into flow_files (file_id,name,note) values ($1,$2,$3) on conflict (file_id) do nothing', [r.id, name, note]);
  return r;
}

async function push() {
  for (const s of SCHEMA) await query(s);
  const have = new Map((await query('select name, file_id from flow_files')).rows?.map(r => [r.name, r.file_id]) ?? []);
  const all = rows();
  for (const r of all) {
    if (r.clip && fs.existsSync(r.clip) && !have.has(path.basename(r.clip))) {
      const f = await upload(r.clip, `ledger #${r.id} ${r.label} (${r.template})`);
      have.set(path.basename(r.clip), f.id);
      console.log('uploaded', path.basename(r.clip), f.id);
    }
  }
  await query('delete from flow_gens');
  for (const r of all) {
    await query(`insert into flow_gens (id,created,project,label,template,prompt,start_image,model,credits,status,edit_id,clip_file_id,qc,verdict,verdict_note)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [r.id, r.created, r.project, r.label, r.template, r.prompt, r.start_image, r.model, r.credits, r.status, r.edit_id,
        r.clip ? have.get(path.basename(r.clip)) ?? null : null, r.qc, r.verdict, r.verdict_note]);
  }
  console.log(`pushed ${all.length} ledger rows`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'push') await push();
    else if (cmd === 'upload') console.log(await upload(path.resolve(a), b));
    else if (cmd === 'files') console.table((await files()).map?.(f => ({ id: f.id, name: f.name, size: f.sizeBytes, published: !!f.publishedUrl })) ?? await files());
    else if (cmd === 'stats') console.table((await query(`select template, count(*) n, sum((verdict='pass')::int) pass, sum((verdict='fail')::int) fail, sum((status='failed')::int) errors from flow_gens group by 1 order by 1`)).rows);
    else console.log('usage: push | upload <file> [note] | files | stats');
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
}
