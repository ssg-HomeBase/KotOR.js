#!/usr/bin/env node
/**
 * scan-no-game-files.mjs
 *
 * KOTOR III guard: no KOTOR game file, and no copy of one, may be committed or deployed.
 *
 * Fails (exit 1) when any scanned file:
 *   1. has a game-file type (.bif .key .rim .erf .tpc .tga .mdl .mdx .wav .mp3 .wmv .bik, or is
 *      dialog.tlk) and is outside mods/kotor3/, or
 *   2. is byte-identical to a file in the game folder, or to a resource stored inside one of the
 *      game's archives (BIF, RIM, ERF/MOD), compared by SHA-256, or
 *   3. (--dir scans only) is one of the upstream KotOR.js images that are screenshots of the games.
 *      A hash check cannot recognise those, so they are blocked by base name, case-insensitive, in
 *      any subfolder: forge_screen_01.jpg .. forge_screen_03.jpg, kotor_forge.jpg, screens.psd
 *      (src/assets/launcher/images/, built into launcher/images/) and K1-Screen-*.jpg,
 *      K2-Screen-*.jpg (images/screenshots/). They are part of the upstream git tree, so git tree
 *      scans do not apply this rule; a --dir scan (what gets deployed) does.
 *
 * What it scans:
 *   - every file in the git tree being pushed (HEAD by default; the pushed commits in --hook mode)
 *   - every file under each --dir (for example the deploy folder made by
 *     scripts/kotor3/prepare-deploy.mjs)
 *
 * Usage:
 *   node scripts/scan-no-game-files.mjs --game-dir "<KOTOR II folder>" [--dir <folder>]... [--no-git] [--hook]
 *   The game folder can also come from the KOTOR2_DIR environment variable.
 *   The game folder is only read, never written.
 *
 * Exit codes: 0 pass, 1 problems found, 2 usage error.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BLOCKED_EXT = new Set(['bif', 'key', 'rim', 'erf', 'tpc', 'tga', 'mdl', 'mdx', 'wav', 'mp3', 'wmv', 'bik']);
const BLOCKED_NAMES = new Set(['dialog.tlk']);
const MOD_PATH = /(^|\/)mods\/kotor3\//i;
// Upstream screenshots of the games: never deployed (rule 3, --dir scans only).
const DEPLOY_BLOCKED = [
  /^forge_screen_0[1-3]\.jpg$/i,
  /^kotor_forge\.jpg$/i,
  /^screens\.psd$/i,
  /^k1-screen-.*\.jpg$/i,
  /^k2-screen-.*\.jpg$/i,
];

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opts = { gameDir: process.env.KOTOR2_DIR || '', dirs: [], git: true, hook: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--game-dir') opts.gameDir = argv[++i];
  else if (a === '--dir') opts.dirs.push(argv[++i]);
  else if (a === '--no-git') opts.git = false;
  else if (a === '--hook') opts.hook = true;
  else { console.error(`Unknown argument: ${a}`); process.exit(2); }
}
if (!opts.gameDir || !fs.existsSync(path.join(opts.gameDir, 'chitin.key'))) {
  console.error('scan-no-game-files: --game-dir (or KOTOR2_DIR) must point at a KOTOR II folder that has chitin.key.');
  process.exit(2);
}

const violations = [];
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const extOf = (p) => (p.includes('.') ? p.split('.').pop().toLowerCase() : '');
const baseOf = (p) => p.replace(/\\/g, '/').split('/').pop().toLowerCase();

// ---------- candidates: files we are about to publish ----------
/** @type {{label:string, size:number, read:()=>Buffer}[]} */
const candidates = [];

function addCandidate(label, size, read) {
  const norm = label.replace(/\\/g, '/');
  const inMod = MOD_PATH.test(norm);
  if (!inMod && (BLOCKED_EXT.has(extOf(norm)) || BLOCKED_NAMES.has(baseOf(norm)))) {
    violations.push(`game file type outside mods/kotor3/: ${norm}`);
  }
  if (size > 0) candidates.push({ label: norm, size, read });
}

function git(args, input) {
  return execFileSync('git', args, { encoding: 'buffer', maxBuffer: 1 << 30, input });
}

function addGitTree(rev) {
  const out = git(['ls-tree', '-r', '-l', '-z', rev]).toString('utf8');
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [, type, sha, size] = rec.slice(0, tab).split(/\s+/);
    if (type !== 'blob') continue;
    const file = rec.slice(tab + 1);
    addCandidate(`${rev.slice(0, 12)}:${file}`, Number(size), () => git(['cat-file', 'blob', sha]));
  }
}

if (opts.git) {
  const revs = new Set();
  if (opts.hook) {
    // pre-push gives "<local ref> <local sha> <remote ref> <remote sha>" lines on stdin
    const stdin = fs.readFileSync(0, 'utf8');
    for (const line of stdin.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && !/^0+$/.test(parts[1])) revs.add(parts[1]);
    }
  }
  if (!revs.size) revs.add(git(['rev-parse', 'HEAD']).toString().trim());
  for (const rev of revs) addGitTree(rev);
}

function walk(dir, onFile) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, onFile);
    else if (ent.isFile()) onFile(full);
  }
}

for (const d of opts.dirs) {
  const root = path.resolve(d);
  if (!fs.existsSync(root)) { violations.push(`--dir not found: ${d}`); continue; }
  walk(root, (full) => {
    const rel = path.relative(root, full);
    const label = `${d}/${rel}`.replace(/\\/g, '/');
    if (DEPLOY_BLOCKED.some((re) => re.test(baseOf(full)))) {
      violations.push(`upstream game screenshot, blocked from deploys: ${label}`);
    }
    addCandidate(label, fs.statSync(full).size, () => fs.readFileSync(full));
  });
}

// ---------- the game folder: loose files and archive entries, indexed by size ----------
/** @type {Map<number, {label:string, read:()=>Buffer}[]>} */
const gameBySize = new Map();
const candidateSizes = new Set(candidates.map((c) => c.size));
let gameLoose = 0, gameEntries = 0;

function addGameItem(size, label, read) {
  if (!candidateSizes.has(size)) return;
  if (!gameBySize.has(size)) gameBySize.set(size, []);
  gameBySize.get(size).push({ label, read });
}

function readAt(file, offset, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, offset);
    return buf;
  } finally { fs.closeSync(fd); }
}

function indexArchive(file, rel) {
  const head = readAt(file, 0, 32);
  const sig = head.toString('latin1', 0, 8);
  const entries = []; // [offset, size]
  if (sig === 'BIFFV1  ') {
    const varCount = head.readUInt32LE(8);
    const varOff = head.readUInt32LE(16);
    const table = readAt(file, varOff, varCount * 16);
    for (let i = 0; i < varCount; i++) entries.push([table.readUInt32LE(i * 16 + 4), table.readUInt32LE(i * 16 + 8)]);
  } else if (sig === 'RIM V1.0') {
    const count = head.readUInt32LE(12);
    const keyOff = head.readUInt32LE(16) || 120;
    const table = readAt(file, keyOff, count * 32);
    for (let i = 0; i < count; i++) entries.push([table.readUInt32LE(i * 32 + 24), table.readUInt32LE(i * 32 + 28)]);
  } else if (/^(ERF |MOD |SAV |HAK )V1\.0$/.test(sig)) {
    const count = head.readUInt32LE(16);
    const resOff = head.readUInt32LE(28);
    const table = readAt(file, resOff, count * 8);
    for (let i = 0; i < count; i++) entries.push([table.readUInt32LE(i * 8), table.readUInt32LE(i * 8 + 4)]);
  } else {
    return;
  }
  for (const [off, size] of entries) {
    gameEntries++;
    addGameItem(size, `${rel} @${off}`, () => readAt(file, off, size));
  }
}

const gameRoot = path.resolve(opts.gameDir);
walk(gameRoot, (full) => {
  const rel = path.relative(gameRoot, full).replace(/\\/g, '/');
  const size = fs.statSync(full).size;
  gameLoose++;
  addGameItem(size, rel, () => fs.readFileSync(full));
  if (['bif', 'rim', 'erf', 'mod', 'sav', 'hak'].includes(extOf(rel)) && size >= 32) {
    try { indexArchive(full, rel); } catch (e) { console.warn(`warn: could not index ${rel}: ${e.message}`); }
  }
});

// ---------- compare by hash, only where sizes collide ----------
const gameHashCache = new Map();
let hashed = 0;
for (const c of candidates) {
  const items = gameBySize.get(c.size);
  if (!items) continue;
  const h = sha256(c.read());
  hashed++;
  for (const item of items) {
    let gh = gameHashCache.get(item);
    if (!gh) { gh = sha256(item.read()); gameHashCache.set(item, gh); }
    if (gh === h) { violations.push(`identical to game data (${item.label}): ${c.label}`); break; }
  }
}

console.log(`scan-no-game-files: ${candidates.length} files scanned; game folder: ${gameLoose} files, ${gameEntries} archive entries; ${hashed} size matches hashed.`);
if (violations.length) {
  console.error(`FAIL: ${violations.length} problem(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('PASS: no game files and no copies of game data.');
