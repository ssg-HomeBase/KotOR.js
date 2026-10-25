#!/usr/bin/env node
/**
 * e2e-web-folder.mjs: KOTOR III browser-path test. Serves a prepared web build (the deploy folder) on
 * 127.0.0.1, opens it in a Chromium window (Electron's, so no install), and drives the game page the way
 * a player does in Chrome, except for the native folder dialog: the Grant Access box's older folder picker
 * (<input webkitdirectory>) is given the stand-in game folder through DevTools (DOM.setFileInputFiles).
 * Then it checks the game reads the folder in the browser, reaches the main menu, loads 201tel with Seren,
 * saves into the browser's own storage, and that the stand-in folder's root did not change.
 *
 * Usage: node scripts/kotor3/e2e-web-folder.mjs --site "<deploy folder>" --game-dir "<a KOTOR II copy with real folders, e.g. C:\Games\Knights of the Old Republic II>" --out "<artifacts folder>"
 * Never the original game folder under Program Files (the test refuses it); the folder is only read.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { parseArgs, makeLog, sleep, cdp, evaluate, waitFor, listTree, diffLists } from './e2e-lib.mjs';

const { arg } = parseArgs();
const SITE = arg('--site'), GAME_DIR = arg('--game-dir'), OUT = arg('--out');
const PORT = parseInt(arg('--port') || '8093', 10), CDP_PORT = 9263;
if (!SITE || !GAME_DIR || !OUT) { console.error('need --site, --game-dir and --out'); process.exit(2); }
if (/program files/i.test(GAME_DIR)) { console.error('tests never use the game folder under Program Files'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const log = makeLog();
const { note } = log;
const checks = {};
const pass = (k, ok, detail) => { checks[k] = { pass: !!ok, detail }; note(`CHECK ${k}: ${ok ? 'PASS' : 'FAIL'} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

// Static server for the prepared site (read only).
const root = path.resolve(SITE);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || file.includes(`${path.sep}.vercel`)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
}).listen(PORT, '127.0.0.1');

// A minimal Electron app that only opens the page (no preload: the page runs as a plain browser page).
const mainJs = path.join(OUT, 'web-main.js');
fs.writeFileSync(mainJs, `const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1280, height: 720, webPreferences: { contextIsolation: true, sandbox: true } });
  w.webContents.setBackgroundThrottling(false); w.loadURL('http://127.0.0.1:${PORT}/game/index.html?key=kotor3'); });`);
const electronExe = path.join(REPO, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
// The whole folder is listed before and after (links are listed, not followed). The older picker does not
// follow links (junctions), so use a folder with real files, such as the C:\Games playtest copy.
const folderBefore = listTree(GAME_DIR);
note(`game folder listed before: ${folderBefore.length} entries`);
const child = spawn(electronExe, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(OUT, 'chromium-profile')}`, mainJs], { stdio: 'ignore' });
let page;
try {
  let target;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.includes('/game/')); } catch { /* starting */ } await sleep(500); }
  if (!target) throw new Error('page did not open');
  page = await cdp(target.webSocketDebuggerUrl);
  page.on((m) => { if (m.method === 'Runtime.consoleAPICalled') log.consoleLines.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 400)); if (m.method === 'Runtime.exceptionThrown') log.consoleLines.push(`[exception] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`.slice(0, 600)); });
  await page.send('Runtime.enable'); await page.send('DOM.enable'); await page.send('Page.enable');
  const ev = (e) => evaluate(page, e);
  note(`page: ${target.url}`);
  // The app's own disclaimer: click OK as a player would.
  await waitFor(page, `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'OK') || !!document.querySelector('.grant-access-modal')`, 'disclaimer or Grant Access', 60000);
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK'); if (b) b.click(); return true; })()`);
  await waitFor(page, `!!document.querySelector('.grant-access-modal')`, 'Grant Access box', 30000);
  const texts = await ev(`({ older: !!document.querySelector('.grant-access-older-button'), info: document.querySelector('.grant-access-info').innerText.slice(0, 400) })`);
  pass('grant_box_offers_older_picker', texts.older, texts.info.replace(/\s+/g, ' ').slice(0, 200));
  // Stand in for the native folder dialog only: give the older picker the stand-in folder.
  const { root: docRoot } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: docRoot.nodeId, selector: '.grant-access-older-picker input[type=file]' });
  if (!nodeId) throw new Error('older picker input not found');
  await page.send('DOM.setFileInputFiles', { nodeId, files: [GAME_DIR] });
  note(`older picker given the folder ${GAME_DIR}`);
  // Audio unlock box, if any (a click as a player would).
  const after = await waitFor(page, `(() => { if (document.querySelector('.grant-access-modal')) { const s = document.querySelector('.grant-access-status'); return s && s.textContent && !s.textContent.startsWith('Reading') ? 'status: ' + s.textContent : false; } return 'closed'; })()`, 'Grant Access to close', 120000, 500);
  pass('grant_box_closes_after_folder', after === 'closed', after);
  for (let i = 0; i < 20; i++) { const b = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /begin/i.test(b.textContent)); if (b) { b.click(); return true; } return false; })()`); if (b) { note('clicked BEGIN'); break; } await sleep(500); }
  const files = await waitFor(page, `window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length ? KotOR.ModManager.loadedFiles.length : false`, 'mod files', 240000, 1000);
  const menu = await waitFor(page, `KotOR.GameState.Mode === 0 && !!KotOR.GameState.MenuManager && !!KotOR.GameState.MenuManager.MainMenu`, 'main menu', 240000, 1000);
  const env = await ev(`({ env: KotOR.ApplicationProfile.ENV, storage: KotOR.GameFileSystem.describeUserDataLocation(), folder: KotOR.ApplicationProfile.directoryHandle && KotOR.ApplicationProfile.directoryHandle.name, olderPicker: !!(KotOR.ApplicationProfile.directoryHandle && KotOR.ApplicationProfile.directoryHandle.isFileListEntry) })`);
  pass('game_reads_folder_in_browser', !!menu && files > 0 && env.olderPicker && env.env === 'BROWSER', { modFiles: files, ...env });
  for (let i = 0; i < 30; i++) { const playing = await ev(`KotOR.GameState.VideoManager.isMoviePlaying() || KotOR.GameState.VideoManager.movieQueue.length > 0`).catch(() => false); if (!playing) break; await ev(`(() => { const v = KotOR.GameState.VideoManager; v.stopMovie(); v.playNextMovie(); return true; })()`).catch(() => {}); await sleep(800); }
  await ev(`KotOR.GameState.LoadModule('201tel'), true`);
  const inArea = `(KotOR.GameState.Mode === 1 || KotOR.GameState.Mode === 3) && !!KotOR.GameState.module && !!KotOR.GameState.module.area && KotOR.GameState.module.area.name.toLowerCase() === '201tel'`;
  for (let i = 0; i < 160 && !(await ev(`(${inArea}) || false`).catch(() => false)); i++) { await ev(`(() => { const v = KotOR.GameState.VideoManager; if (v.isMoviePlaying() || v.movieQueue.length) { v.stopMovie(); v.playNextMovie(); } return true; })()`).catch(() => {}); await sleep(1500); }
  await waitFor(page, inArea, '201tel', 10000, 1000);
  await sleep(4000);
  const seren = await ev(`!!KotOR.GameState.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === 'k3_seren')`);
  const conv = await ev(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`);
  pass('area_loads_with_mod_in_browser', seren && !conv, { seren, conversationOnEntry: conv });
  await ev(`KotOR.SaveGame.SaveCurrentGame('K3 web test', 0).then(() => true)`);
  await waitFor(page, `KotOR.SaveGame.saves.some(s => s.SAVEGAMENAME === 'K3 web test')`, 'save', 60000);
  const opfs = await ev(`(async () => { const r = await navigator.storage.getDirectory(); const top = await r.getDirectoryHandle('kotorjs-game-data'); const k = await top.getDirectoryHandle('kotor3'); const s = await k.getDirectoryHandle('Saves'); const out = []; for await (const d of s.values()) { if (d.kind !== 'directory') continue; for await (const f of d.values()) out.push(d.name + '/' + f.name); } return out; })()`);
  pass('save_in_browser_storage', opfs.some((f) => /SAVEGAME\.sav$/i.test(f)), opfs);
} catch (e) {
  note(`ERROR: ${e.message}`);
} finally {
  try { page?.close(); } catch { /* ignore */ }
  child.kill(); server.close();
  await sleep(2000);
  const folderAfter = listTree(GAME_DIR);
  const d = diffLists(folderBefore, folderAfter);
  pass('no_write_game_folder', !d.added.length && !d.removed.length, { entries: folderAfter.length, ...d });
  const expected = ['grant_box_offers_older_picker', 'grant_box_closes_after_folder', 'game_reads_folder_in_browser', 'area_loads_with_mod_in_browser', 'save_in_browser_storage', 'no_write_game_folder'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  fs.writeFileSync(path.join(OUT, 'e2e-web-folder-result.json'), JSON.stringify({ passed, checks }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-web-folder-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-web-folder-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
