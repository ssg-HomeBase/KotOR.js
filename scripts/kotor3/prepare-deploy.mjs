#!/usr/bin/env node
/**
 * prepare-deploy.mjs (KOTOR III fan, M1.7)
 *
 * Prepares the exact folder that gets deployed as a static Vercel preview:
 *   1. runs `npm run webpack:prod` (skip with --skip-build);
 *   2. empties the deploy folder of everything except its .vercel folder (the project link);
 *   3. copies the parts of dist/ the web app needs into it:
 *        index.html, favicon.ico and the root bundles (KotOR.js, three.min.js, bink-worker.js),
 *        launcher/, game/ (with game/mods/kotor3/, the mod files), debugger/ (opened by the game),
 *        webfonts/ (used by the launcher), and forge/ only with --with-forge;
 *      and leaves out:
 *        electron/ and assets/ (desktop app only), forge/ by default, root files no page loads
 *        (server.js stub, three.module.js), any package.json (so Vercel serves static files),
 *        source maps (*.map), design files (*.psd), and the upstream game screenshots that
 *        scan-no-game-files.mjs blocks from deploys;
 *   4. writes a root index.html that redirects to the launcher if the build has none;
 *   5. runs scan-no-game-files.mjs --no-git --dir <deploy folder> and fails unless it passes.
 *      On a failed scan the deploy folder is emptied again so nothing unsafe is left to deploy.
 *
 * Usage:
 *   node scripts/kotor3/prepare-deploy.mjs [--skip-build] [--out <folder>] [--game-dir <KOTOR II folder>] [--with-forge]
 *   --out       deploy folder (default C:\dev\kotor3\phase2\deploy); must hold .vercel\project.json,
 *               must not be a drive root and must not be inside the repo (or contain it)
 *   --game-dir  KOTOR II folder for the scan, only read (default: KOTOR2_DIR, else the Steam path)
 *
 * Exit codes: 0 ready to deploy (scan PASS), 1 build, copy or scan failure, 2 usage or refusal.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(REPO, 'dist');
const SCAN = path.join(REPO, 'scripts', 'scan-no-game-files.mjs');
const DEFAULT_OUT = 'C:\\dev\\kotor3\\phase2\\deploy';
const DEFAULT_GAME_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Knights of the Old Republic II';
const PASS_LINE = 'PASS: no game files and no copies of game data.';

// Vercel docs (vercel.com/docs/limits, updated 2026-09-16): CLI static uploads up to 100 MB on
// Hobby (1 GB on Pro) and at most 15,000 source files. Only used for a warning.
const VERCEL_HOBBY_BYTES = 100 * 1024 * 1024;
const VERCEL_MAX_FILES = 15000;

// Same list as DEPLOY_BLOCKED in scan-no-game-files.mjs: upstream screenshots of the games.
const BLOCKED_SCREENSHOTS = [
  /^forge_screen_0[1-3]\.jpg$/i,
  /^kotor_forge\.jpg$/i,
  /^screens\.psd$/i,
  /^k1-screen-.*\.jpg$/i,
  /^k2-screen-.*\.jpg$/i,
];

// ---------- arguments ----------
function usage(msg) {
  if (msg) console.error(`prepare-deploy: ${msg}`);
  console.error('Usage: node scripts/kotor3/prepare-deploy.mjs [--skip-build] [--out <folder>] [--game-dir <KOTOR II folder>] [--with-forge]');
  process.exit(2);
}

const argv = process.argv.slice(2);
const opts = { build: true, out: DEFAULT_OUT, gameDir: process.env.KOTOR2_DIR || DEFAULT_GAME_DIR, forge: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const value = () => { const v = argv[++i]; if (!v) usage(`${a} needs a value`); return v; };
  if (a === '--skip-build') opts.build = false;
  else if (a === '--out') opts.out = value();
  else if (a === '--game-dir') opts.gameDir = value();
  else if (a === '--with-forge') opts.forge = true;
  else if (a === '--help' || a === '-h') usage();
  else usage(`unknown argument: ${a}`);
}

// ---------- the deploy folder: refuse anything that is not clearly a deploy folder ----------
const real = (p) => fs.realpathSync.native(p);
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

if (!fs.existsSync(opts.out) || !fs.statSync(opts.out).isDirectory()) usage(`--out is not an existing folder: ${opts.out}`);
const OUT = real(path.resolve(opts.out));
const REPO_REAL = real(REPO);
if (path.dirname(OUT) === OUT) usage(`refusing: --out is a drive root: ${OUT}`);
if (isInside(OUT, REPO_REAL)) usage(`refusing: --out is inside the repo: ${OUT}`);
if (isInside(REPO_REAL, OUT)) usage(`refusing: --out contains the repo: ${OUT}`);
if (fs.existsSync(opts.gameDir)) {
  const GAME_REAL = real(path.resolve(opts.gameDir));
  if (isInside(OUT, GAME_REAL) || isInside(GAME_REAL, OUT)) usage(`refusing: --out overlaps the game folder: ${OUT}`);
}
const projectJson = path.join(OUT, '.vercel', 'project.json');
if (!fs.existsSync(projectJson) || !fs.statSync(projectJson).isFile()) {
  usage(`refusing: ${OUT} has no .vercel\\project.json, so it is not a linked deploy folder`);
}

// Never follow links while emptying: refuse if anything outside .vercel is a symlink or junction.
function findLinks(dir, found = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) found.push(full);
    else if (ent.isDirectory()) findLinks(full, found);
  }
  return found;
}
function topEntriesToClear() {
  return fs.readdirSync(OUT, { withFileTypes: true }).filter((e) => e.name !== '.vercel');
}
function emptyDeployFolder() {
  const links = [];
  for (const ent of topEntriesToClear()) {
    const full = path.join(OUT, ent.name);
    if (ent.isSymbolicLink()) links.push(full);
    else if (ent.isDirectory()) findLinks(full, links);
  }
  if (links.length) {
    console.error('prepare-deploy: refusing to empty the deploy folder, it contains links:');
    for (const l of links) console.error(`  - ${l}`);
    process.exit(2);
  }
  for (const ent of topEntriesToClear()) fs.rmSync(path.join(OUT, ent.name), { recursive: true, force: true });
}

// ---------- 1. build ----------
if (opts.build) {
  // Start from an empty dist/ (git-ignored build output), so files from another branch's build cannot ride along.
  // Keep dist/electron: the desktop app's main process (npm run electron:compile), never deployed, not rebuilt here.
  if (path.resolve(DIST) === path.join(path.resolve(REPO), 'dist') && fs.existsSync(DIST)) {
    for (const ent of fs.readdirSync(DIST)) if (ent !== 'electron') fs.rmSync(path.join(DIST, ent), { recursive: true, force: true });
  }
  console.log('prepare-deploy: npm run webpack:prod (dist/ emptied first, except dist/electron)');
  const r = spawnSync('npm', ['run', 'webpack:prod'], { cwd: REPO, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`prepare-deploy: build failed (exit ${r.status ?? r.signal}).`); process.exit(1); }
} else {
  console.log('prepare-deploy: --skip-build, using the dist/ that is already there.');
}

for (const need of ['launcher/index.html', 'game/index.html', 'KotOR.js', 'three.min.js']) {
  if (!fs.existsSync(path.join(DIST, need))) { console.error(`prepare-deploy: dist/${need} is missing; build first.`); process.exit(1); }
}
if (!fs.existsSync(path.join(DIST, 'game', 'mods', 'kotor3'))) {
  console.error('prepare-deploy: dist/game/mods/kotor3/ (the mod files) is missing; build first.');
  process.exit(1);
}

// ---------- 2. empty the deploy folder (except .vercel) ----------
emptyDeployFolder();

// ---------- 3. copy ----------
const APP_DIRS = new Set(['launcher', 'game', 'debugger', 'webfonts', ...(opts.forge ? ['forge'] : [])]);
const DIR_REASONS = {
  electron: 'desktop app (Electron) only',
  assets: 'desktop app icons and splash screens only (no web page loads them)',
  forge: 'Forge modding tool, not needed to play (add --with-forge to include it)',
};
const ROOT_FILE_REASONS = {
  'server.js': 'server worker stub, loaded by no page',
  'three.module.js': 'loaded by no page (pages use three.min.js)',
};

/** Why a file is left out, or null to copy it. rel uses forward slashes. */
function leaveOutReason(rel) {
  const base = rel.split('/').pop();
  const lower = base.toLowerCase();
  if (BLOCKED_SCREENSHOTS.some((re) => re.test(base))) return 'upstream game screenshot (blocked from deploys)';
  if (lower === 'package.json') return 'package.json (keeps the deploy a static site)';
  if (lower.endsWith('.map')) return 'source map, not needed to run';
  if (lower.endsWith('.psd')) return 'design file, never loaded';
  if (!rel.includes('/') && ROOT_FILE_REASONS[base]) return ROOT_FILE_REASONS[base];
  return null;
}

const fmt = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);
let copiedFiles = 0, copiedBytes = 0;
const leftOutFiles = []; // { rel, size, reason }
const leftOutDirs = [];  // { rel, files, bytes, reason }
const skippedLinks = [];

function dirStats(dir) {
  let files = 0, bytes = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) { const s = dirStats(full); files += s.files; bytes += s.bytes; }
    else if (ent.isFile()) { files++; bytes += fs.statSync(full).size; }
  }
  return { files, bytes };
}

function copyTree(srcDir, relDir) {
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, ent.name);
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isSymbolicLink()) { skippedLinks.push(rel); continue; }
    if (ent.isDirectory()) {
      if (!relDir && !APP_DIRS.has(ent.name)) {
        leftOutDirs.push({ rel: `${rel}/`, ...dirStats(src), reason: DIR_REASONS[ent.name] || 'not part of the web app' });
        continue;
      }
      copyTree(src, rel);
      continue;
    }
    if (!ent.isFile()) continue;
    const size = fs.statSync(src).size;
    const reason = leaveOutReason(rel);
    if (reason) { leftOutFiles.push({ rel, size, reason }); continue; }
    const dest = path.join(OUT, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copiedFiles++;
    copiedBytes += size;
  }
}

try {
  copyTree(DIST, '');
} catch (e) {
  console.error(`prepare-deploy: copy failed: ${e.message}`);
  process.exit(1);
}

// ---------- 4. a root page ----------
let authoredIndex = false;
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  // The launcher opens the game at /game/index.html?key=..., so the site must be served from /.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=/launcher/">
  <title>KOTOR III (fan) - Redirecting...</title>
  <script>window.location.replace('/launcher/');</script>
</head>
<body>
  <p>If you are not redirected automatically, <a href="/launcher/">open the launcher</a>.</p>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  copiedFiles++;
  copiedBytes += Buffer.byteLength(html);
  authoredIndex = true;
}

// ---------- summary ----------
console.log('');
console.log(`prepare-deploy: deploy folder ${OUT}`);
console.log(`  copied: ${copiedFiles} files, ${copiedBytes} bytes (${fmt(copiedBytes)})${authoredIndex ? ', including an authored root index.html' : ''}`);
console.log(`  apps: ${[...APP_DIRS].join(', ')}; mod files: game/mods/kotor3/ (${fs.readdirSync(path.join(OUT, 'game', 'mods', 'kotor3')).join(', ')})`);
console.log(`  left out (${leftOutDirs.length} folders, ${leftOutFiles.length} files):`);
for (const d of leftOutDirs) console.log(`    - ${d.rel} (${d.files} files, ${fmt(d.bytes)}): ${d.reason}`);
for (const f of leftOutFiles) console.log(`    - ${f.rel} (${fmt(f.size)}): ${f.reason}`);
for (const l of skippedLinks) console.log(`    - ${l}: symbolic link, not followed`);
if (copiedBytes > VERCEL_HOBBY_BYTES || copiedFiles > VERCEL_MAX_FILES) {
  console.log(`  WARNING: over Vercel's documented CLI upload limits for Hobby (100 MB, 15,000 files); Pro allows 1 GB.`);
} else {
  console.log(`  within Vercel's documented CLI upload limits (Hobby 100 MB, 15,000 files).`);
}

// ---------- 5. scan ----------
console.log('');
console.log(`prepare-deploy: node scripts/scan-no-game-files.mjs --no-git --dir "${OUT}" --game-dir "${opts.gameDir}"`);
const scan = spawnSync(process.execPath, [SCAN, '--no-git', '--dir', OUT, '--game-dir', opts.gameDir], {
  cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
if (scan.stdout) process.stdout.write(scan.stdout);
if (scan.stderr) process.stderr.write(scan.stderr);
const passed = scan.status === 0 && (scan.stdout || '').includes(PASS_LINE);
if (!passed) {
  emptyDeployFolder();
  console.error(`prepare-deploy: FAILED, the scan did not pass (exit ${scan.status ?? scan.signal}). The deploy folder was emptied again (except .vercel); do not deploy.`);
  process.exit(1);
}
console.log(`prepare-deploy: READY. ${copiedFiles} files, ${fmt(copiedBytes)} in ${OUT}`);
