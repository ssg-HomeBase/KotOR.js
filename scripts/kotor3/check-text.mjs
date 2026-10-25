#!/usr/bin/env node
/**
 * check-text.mjs: every line of new text in the KOTOR III mod must be original.
 *
 * Collects all text the mod adds (dialogue lines and replies in mods/kotor3/src/*.dialogue.json, quest
 * names and journal texts in mods/kotor3/campaign.json, character names in *.creature.json) and compares
 * it with every string in the player's own dialog.tlk, which is read into memory only (never copied,
 * written or printed). Fails on any exact match of a line, or any run of 6 or more words in common.
 *
 * Usage: node scripts/kotor3/check-text.mjs --game-dir "<KOTOR II folder>" [--min-words 6]
 * Exit 0 pass, 1 matches found, 2 usage error.
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const gameDir = arg('--game-dir') || process.env.KOTOR2_DIR;
const MIN = parseInt(arg('--min-words') || '6', 10);
const tlkPath = gameDir && path.join(gameDir, 'dialog.tlk');
if (!tlkPath || !fs.existsSync(tlkPath)) { console.error('check-text: --game-dir must point at a KOTOR II folder with dialog.tlk'); process.exit(2); }

// ---- the mod's text ----
const MOD = path.resolve('mods/kotor3');
const lines = [];
for (const f of fs.readdirSync(path.join(MOD, 'src'))) {
  const p = path.join(MOD, 'src', f);
  if (f.endsWith('.dialogue.json')) {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const n of [...d.entries, ...d.replies]) lines.push({ where: `${f} ${n.id}`, text: n.text });
  } else if (f.endsWith('.creature.json')) {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    lines.push({ where: `${f} name`, text: `${c.firstName || ''} ${c.lastName || ''}`.trim() });
  }
}
const campaign = JSON.parse(fs.readFileSync(path.join(MOD, 'campaign.json'), 'utf8'));
for (const q of campaign.quests || []) {
  lines.push({ where: `campaign.json ${q.tag} name`, text: q.name });
  for (const e of q.entries) lines.push({ where: `campaign.json ${q.tag} ${e.id}`, text: e.text });
}

// ---- dialog.tlk, in memory ----
const buf = fs.readFileSync(tlkPath);
if (buf.toString('latin1', 0, 8) !== 'TLK V3.0') { console.error('check-text: dialog.tlk is not a TLK V3.0 file'); process.exit(2); }
const count = buf.readUInt32LE(12), entriesStart = buf.readUInt32LE(16);
const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const exact = new Set();
const shingles = new Set();
for (let i = 0; i < count; i++) {
  const e = 20 + i * 40;
  const flags = buf.readUInt32LE(e);
  if (!(flags & 1)) continue;
  const off = buf.readUInt32LE(e + 28), size = buf.readUInt32LE(e + 32);
  if (!size) continue;
  const s = norm(buf.toString('latin1', entriesStart + off, entriesStart + off + size));
  if (!s) continue;
  exact.add(s);
  const w = s.split(' ');
  for (let k = 0; k + MIN <= w.length; k++) shingles.add(w.slice(k, k + MIN).join(' '));
}

// ---- compare ----
const problems = [];
let words = 0;
for (const l of lines) {
  const s = norm(l.text);
  if (!s) continue;
  const w = s.split(' ');
  words += w.length;
  if (exact.has(s) && w.length >= 3) problems.push(`${l.where}: the whole line matches a game string`);
  for (let k = 0; k + MIN <= w.length; k++) {
    if (shingles.has(w.slice(k, k + MIN).join(' '))) { problems.push(`${l.where}: shares a run of ${MIN} words with a game string (words ${k + 1} to ${k + MIN})`); break; }
  }
}
console.log(`check-text: ${lines.length} mod lines (${words} words) compared with ${exact.size} game strings (${shingles.size} ${MIN}-word runs), dialog.tlk read in memory only.`);
console.log(`check-text: exact matches ${problems.filter((p) => p.includes('whole line')).length}, ${MIN}-word matches ${problems.filter((p) => !p.includes('whole line')).length}`);
if (problems.length) { console.log('FAIL:'); for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
console.log('PASS: all new text is original (no exact line, no run of ' + MIN + ' words in common).');
