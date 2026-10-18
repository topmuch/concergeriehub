// v5.0 — REBRAND « Conciergerie Hub » → « RoomScan »
// Remplace uniquement la MARQUE composée. Ne touche pas :
//  - au mot générique « conciergerie » (copy FR légitime),
//  - au repo GitHub topmuch/concergeriehub (.gh-sync.mjs exclu),
//  - au worklog.md (historique).
const fs = require('fs');
const path = require('path');
const cwd = '/home/z/my-project';
const roots = ['src', 'public'];
const extraFiles = ['README.md', '.env.example'];
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.webmanifest', '.xml', '.txt', '.md', '.svg']);

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'tool-results') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (exts.has(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

let all = [];
for (const r of roots) all = all.concat(walk(path.join(cwd, r), []));
for (const f of extraFiles) {
  const p = path.join(cwd, f);
  if (fs.existsSync(p)) all.push(p);
}

const REPS = [
  [/Conciergerie Hub/g, 'RoomScan'],
  [/ConciergerieHub/g, 'RoomScan'],
  [/Concergerie Hub/g, 'RoomScan'],
  [/ConcergerieHub/g, 'RoomScan'],
  [/CONCIERGERIE HUB/g, 'ROOMSCAN'],
  [/conciergeriehub\.com/g, 'roomscan.pro'],
  [/conciergeriehub\.fr/g, 'roomscan.pro'],
];

let changed = 0;
for (const f of all) {
  let s;
  try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const orig = s;
  for (const [re, to] of REPS) s = s.replace(re, to);
  if (s !== orig) {
    fs.writeFileSync(f, s);
    changed++;
    console.log('MODIFIÉ:', path.relative(cwd, f));
  }
}
console.log('--- Total fichiers modifiés:', changed);
