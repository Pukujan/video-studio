// SQLite ledger of every Flow generation: prompt, template, start image, cost, clip, QC and verdict.
// The committed source of truth is flow/ledger.jsonl (one row per line, diffable). ledger.db is a
// local cache rebuilt from it when missing; every write re-exports the jsonl.
// CLI:
//   node flow/ledger.mjs stats                      pass rate per template
//   node flow/ledger.mjs list [n]                   latest rows
//   node flow/ledger.mjs verdict <id> pass|fail "why"
//   node flow/ledger.mjs error <id> "message"       Flow refused or crashed; not counted against the prompt
//   node flow/ledger.mjs show <id>
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const DB_PATH = process.env.FLOW_DB || path.join(ROOT, 'flow', 'ledger.db');
export const JSONL_PATH = DB_PATH.replace(/\.db$/, '.jsonl');

const COLS = ['id', 'created', 'project', 'label', 'template', 'prompt', 'start_image', 'model', 'credits', 'status', 'edit_id', 'clip', 'qc', 'issues', 'verdict', 'verdict_note'];

export function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const fresh = !fs.existsSync(DB_PATH);
  const db = new DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS gens (
    id INTEGER PRIMARY KEY,
    created TEXT DEFAULT (datetime('now')),
    project TEXT, label TEXT, template TEXT, prompt TEXT,
    start_image TEXT, model TEXT, credits INTEGER,
    status TEXT DEFAULT 'queued',          -- queued | qc_pass | qc_fail | rejected (dry run) | failed (Flow error, no clip)
    edit_id TEXT, clip TEXT,
    qc TEXT,                               -- JSON from qc.mjs
    issues TEXT,                           -- JSON list of {t, kind, note} from the visual review
    verdict TEXT, verdict_note TEXT        -- human/agent final call: pass | fail
  )`);
  if (fresh && fs.existsSync(JSONL_PATH)) {
    const ins = db.prepare(`INSERT INTO gens (${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})`);
    for (const line of fs.readFileSync(JSONL_PATH, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line); ins.run(...COLS.map(c => r[c] ?? null));
    }
  }
  return db;
}

function exportJsonl(db) {
  const all = db.prepare('SELECT * FROM gens ORDER BY id').all();
  fs.writeFileSync(JSONL_PATH, all.map(r => JSON.stringify(Object.fromEntries(COLS.map(c => [c, r[c]])))).join('\n') + '\n');
}

export function add(row) {
  const db = open();
  const r = db.prepare(`INSERT INTO gens (project,label,template,prompt,start_image,model,credits)
    VALUES (?,?,?,?,?,?,?)`).run(row.project ?? null, row.label ?? null, row.template ?? null, row.prompt,
    row.start_image ?? null, row.model ?? null, row.credits ?? null);
  exportJsonl(db);
  return Number(r.lastInsertRowid);
}

export function update(id, fields) {
  const db = open();
  const keys = Object.keys(fields);
  const vals = keys.map(k => typeof fields[k] === 'object' && fields[k] !== null ? JSON.stringify(fields[k]) : fields[k]);
  db.prepare(`UPDATE gens SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...vals, id);
  exportJsonl(db);
}

export const rows = (where = '1=1', ...args) => open().prepare(`SELECT * FROM gens WHERE ${where} ORDER BY id`).all(...args);

export function stats() {
  return open().prepare(`SELECT COALESCE(template,'(none)') template, COUNT(*) n,
      SUM(verdict='pass') pass, SUM(verdict='fail') fail, SUM(status='failed') errors,
      SUM(verdict IS NULL AND status<>'failed') open,
      ROUND(100.0*SUM(verdict='pass')/NULLIF(SUM(verdict IS NOT NULL),0)) pass_pct,
      SUM(CASE WHEN status='failed' THEN 0 ELSE COALESCE(credits,0) END) credits
    FROM gens GROUP BY 1 ORDER BY pass_pct DESC`).all();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (cmd === 'stats') console.table(stats());
  else if (cmd === 'list') console.table(open().prepare(`SELECT id,created,label,template,status,verdict,edit_id FROM gens ORDER BY id DESC LIMIT ?`).all(+(a || 20)));
  else if (cmd === 'show') console.log(rows('id=?', +a)[0]);
  else if (cmd === 'error') { update(+a, { status: 'failed', verdict: null, verdict_note: b ?? null }); console.log('ok'); }
  else if (cmd === 'verdict') { update(+a, { verdict: b, verdict_note: c ?? null }); console.log('ok'); }
  else console.log('usage: stats | list [n] | show <id> | verdict <id> pass|fail "why" | error <id> "msg"');
}
