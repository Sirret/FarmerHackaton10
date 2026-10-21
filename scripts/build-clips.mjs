// Builds src/data/ivr/clips.json from docs/clips.csv (the master clip list).
// Usage: npm run clips:build
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'docs', 'clips.csv');
const OUT = join(root, 'src', 'data', 'ivr', 'clips.json');
const LANGS = ['mnk', 'wo', 'ff', 'dyo'];

// Small RFC 4180 parser: quoted fields, "" escapes, commas/newlines in quotes, CRLF or LF.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore; \n ends the row */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (inQuotes) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

const rows = parseCsv(readFileSync(SRC, 'utf8'));
const header = rows.shift().map((h) => h.trim());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`docs/clips.csv is missing column "${name}"`);
  return i;
};
const idx = Object.fromEntries(
  ['clip_id', 'group', 'english', 'priority', 'note', ...LANGS].map((n) => [n, col(n)]),
);

const seen = new Set();
const clips = rows.map((r, n) => {
  const get = (name) => (r[idx[name]] ?? '').trim();
  const line = n + 2;
  const id = get('clip_id');
  if (!id) throw new Error(`Row ${line}: empty clip_id`);
  if (seen.has(id)) throw new Error(`Row ${line}: duplicate clip_id "${id}"`);
  seen.add(id);
  const english = get('english');
  if (!english) throw new Error(`Row ${line} (${id}): empty english`);
  const pRaw = get('priority');
  const priority = Number(pRaw);
  if (pRaw === '' || !Number.isFinite(priority)) {
    throw new Error(`Row ${line} (${id}): priority "${pRaw}" is not a number`);
  }
  const scripts = {};
  for (const l of LANGS) if (get(l)) scripts[l] = get(l);
  return { id, group: get('group'), en_script: english, priority, scripts, note: get('note') };
});

writeFileSync(OUT, JSON.stringify(clips, null, 2) + '\n');
const byPrio = {};
for (const c of clips) byPrio[c.priority] = (byPrio[c.priority] || 0) + 1;
const withScripts = clips.filter((c) => Object.keys(c.scripts).length).length;
console.log(
  `clips:build: ${clips.length} clips -> src/data/ivr/clips.json (priority ${Object.entries(byPrio)
    .map(([p, n]) => `${p}:${n}`)
    .join(' ')}; ${withScripts} with translated scripts)`,
);
