#!/usr/bin/env node
/**
 * e2e-web-read-fail.mjs: KOTOR III Phase 2 (finding 29), a game folder the browser cannot fully read.
 *
 * Cam played from a Google Drive folder whose files were not downloaded; a file the browser cannot read made the game
 * hang on a black or loading screen with no word why. This test serves a prepared web build (the deploy folder) on
 * 127.0.0.1, opens it in Electron's Chromium as a plain web page, grants the game folder with the older picker, and
 * makes chosen game files unreadable the way a cloud-only file is (NotReadableError), inside the page only:
 *   r1  every read of the first area's files fails once, then works: New Game still reaches the first area;
 *   r2  the Nar Shaddaa files never read: after Seren and Senn, the trip stops with a message that names the file,
 *       says what to do, and has a Reload button (not a silent black or loading screen);
 *   r3  the page keeps answering; r4  the game folder is unchanged.
 * Nothing on disk is made unreadable; the failures are simulated in the page's Blob reads.
 *
 * Usage: node scripts/kotor3/e2e-web-read-fail.mjs --site "<deploy folder>" --game-dir "<KOTOR II copy, e.g. C:\Games\...>"
 *   --out "<artifacts folder outside the repo>"
 * Never the game folder under Program Files (refused). Exit 0 only when every check passes.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { KEEP_RUNNING_SWITCHES, parseArgs, makeLog, sleep, cdp, evaluate, waitFor, listTree, diffLists, clickGui, inAreaExpr } from './e2e-lib.mjs';

const { arg } = parseArgs();
const SITE = arg('--site'), GAME_DIR = arg('--game-dir'), OUT = arg('--out');
const PORT = parseInt(arg('--port') || '8097', 10), CDP_PORT = 9267;
if (!SITE || !GAME_DIR || !OUT) { console.error('need --site, --game-dir and --out'); process.exit(2); }
if (/program files/i.test(GAME_DIR)) { console.error('tests never use the game folder under Program Files'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const log = makeLog();
const { note } = log;
const checks = {};
const pass = (k, ok, detail) => { checks[k] = { pass: !!ok, detail }; note(`CHECK ${k}: ${ok ? 'PASS' : 'FAIL'} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const MM = 'KotOR.GameState.MenuManager';

const root = path.resolve(SITE);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || file.includes(`${path.sep}.vercel`)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
}).listen(PORT, '127.0.0.1');
const mainJs = path.join(OUT, 'web-main.js');
fs.writeFileSync(mainJs, `const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1280, height: 720, webPreferences: { contextIsolation: true, sandbox: true } });
  w.webContents.setBackgroundThrottling(false); w.loadURL('http://127.0.0.1:${PORT}/game/index.html?key=kotor3'); });`);
const electronExe = path.join(REPO, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const folderBefore = listTree(GAME_DIR);
const child = spawn(electronExe, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(OUT, 'chromium-profile')}`, ...KEEP_RUNNING_SWITCHES, mainJs], { stdio: 'ignore' });
let page;
let frozen = null;
try {
  let target;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.includes('/game/')); } catch { /* starting */ } await sleep(500); }
  if (!target) throw new Error('page did not open');
  page = await cdp(target.webSocketDebuggerUrl);
  page.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') log.consoleLines.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 600));
    if (m.method === 'Runtime.exceptionThrown') log.consoleLines.push(`[exception] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`.slice(0, 800));
  });
  await page.send('Runtime.enable'); await page.send('DOM.enable'); await page.send('Page.enable');
  const ev = (e) => evaluate(page, e);
  const wait = (e, what, ms, every) => waitFor(page, e, what, ms, every);
  const evT = async (expr, what) => {
    const r = await Promise.race([ev(expr), sleep(10000).then(() => '__NO_ANSWER__')]);
    if (r === '__NO_ANSWER__') { frozen = frozen || what || 'page'; throw new Error(`page did not answer for 10 s (${what || 'evaluate'})`); }
    return r;
  };
  const screenshot = async (name) => { const r = await Promise.race([page.send('Page.captureScreenshot', { format: 'png' }), sleep(10000).then(() => null)]); if (r) { fs.writeFileSync(path.join(OUT, `rf_${name}.png`), Buffer.from(r.data, 'base64')); note(`screenshot: rf_${name}.png`); } };
  const key = async (k) => { const vk = 48 + +k; await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: `Digit${k}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: k }); await sleep(80); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: `Digit${k}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
  const skipMovies = async (tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const playing = await evT(`KotOR.GameState.Mode === 5 || KotOR.GameState.VideoManager.isMoviePlaying() || KotOR.GameState.VideoManager.movieQueue.length > 0`, 'movie check').catch((e) => { if (frozen) throw e; return false; });
      if (!playing) return;
      await ev(`(() => { const v = KotOR.GameState.VideoManager; v.stopMovie(); v.playNextMovie(); return true; })()`).catch(() => {});
      await sleep(800);
    }
  };
  /** Makes reads of game files whose name matches `pattern` fail like a cloud-only file: `times` times per file (0 = always). */
  const setUnreadable = (pattern, times) => evT(`(() => { const S = window.__k3unreadable || (window.__k3unreadable = { hits: 0 });
    S.re = ${pattern ? `new RegExp(${JSON.stringify(pattern)}, 'i')` : 'null'}; S.times = ${times}; S.counts = {};
    if (!S.patched) { S.patched = true;
      const oSlice = File.prototype.slice; File.prototype.slice = function (...a) { const b = oSlice.apply(this, a); try { b.__k3name = this.name; } catch (e) {} return b; };
      const oAB = Blob.prototype.arrayBuffer; Blob.prototype.arrayBuffer = async function () { const n = this.__k3name || this.name || '';
        if (S.re && S.re.test(n) && (!S.times || (S.counts[n] = (S.counts[n] || 0) + 1) <= S.times)) { S.hits++; throw new DOMException('simulated cloud-only file', 'NotReadableError'); }
        return oAB.call(this); }; }
    return true; })()`, 'set unreadable files');
  const hits = () => evT(`window.__k3unreadable ? window.__k3unreadable.hits : 0`, 'unreadable count');
  const talk = async (tag) => {
    await wait(`!KotOR.CutsceneManager.active && KotOR.GameState.Mode === 1`, `in game before ${tag}`, 60000);
    await evT(`(() => { const G = KotOR.GameState; const c = G.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(tag)}); G.CursorManager.selectedObject = c; c.onClick(G.getCurrentPlayer()); return true; })()`, `click ${tag}`);
    let started = false, last = '';
    for (let i = 0; i < 300; i++) {
      const s = await evT(`(() => { const M = KotOR.CutsceneManager; return { a: !!M.active, r: M.currentEntry ? '' : (M.currentReplies || []).map(r => r.text).join('|'), loading: KotOR.GameState.Mode === -1 || !!KotOR.GameState.loadingModule }; })()`, `talking to ${tag}`);
      if (s.a) started = true;
      if (s.loading) return 'travel started';
      if (started && !s.a) return 'ended';
      if (s.a && s.r && s.r !== last) { await sleep(300); await key('1'); last = s.r; }
      await sleep(300);
    }
    return 'did not end';
  };

  // ---- Grant Access with the older folder picker, then New Game with the first area's files failing once ----
  await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'OK') || !!document.querySelector('.grant-access-modal')`, 'disclaimer or Grant Access', 60000);
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK'); if (b) b.click(); return true; })()`);
  await wait(`!!document.querySelector('.grant-access-modal')`, 'Grant Access box', 30000);
  const { root: docRoot } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: docRoot.nodeId, selector: '.grant-access-older-picker input[type=file]' });
  if (!nodeId) throw new Error('older picker input not found');
  await page.send('DOM.setFileInputFiles', { nodeId, files: [GAME_DIR] });
  await wait(`!document.querySelector('.grant-access-modal')`, 'Grant Access to close', 120000);
  for (let i = 0; i < 20; i++) { if (await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /begin/i.test(b.textContent)); if (b) { b.click(); return true; } return false; })()`)) break; await sleep(500); }
  await wait(`KotOR.GameState.Mode === 0 && !!${MM} && !!${MM}.MainMenu`, 'main menu', 240000, 1000);
  await skipMovies();
  await sleep(3000);
  await setUnreadable('^201tel', 1);
  await ev(clickGui(`${MM}.MainMenu.BTN_NEWGAME`));
  await wait(`${MM}.CharGenClass.isVisible()`, 'class selection', 60000); await sleep(1500);
  await ev(clickGui(`${MM}.CharGenClass.BTN_SEL1`));
  await wait(`${MM}.CharGenQuickOrCustom.isVisible()`, 'quick or custom', 60000); await sleep(1000);
  await ev(clickGui(`${MM}.CharGenQuickOrCustom.QUICK_CHAR_BTN`));
  await wait(`${MM}.CharGenQuickPanel.isVisible()`, 'quick character panel', 60000); await sleep(1000);
  await ev(clickGui(`${MM}.CharGenQuickPanel.BTN_STEPNAME3`));
  let arrived = false;
  for (let i = 0; i < 160 && !arrived; i++) { arrived = await evT(`(${inAreaExpr('201tel')}) || false`, 'waiting for 201tel').catch((e) => { if (frozen) throw e; return false; }); if (!arrived) { await skipMovies(3); await sleep(1500); } }
  const firstHits = await hits();
  const messageEarly = await evT(`!!document.querySelector('.k3-read-failure')`, 'message after first area');
  pass('r1_reads_that_fail_once_are_tried_again', arrived && firstHits > 0 && !messageEarly, { reachedFirstArea: arrived, failedReads: firstHits, messageShown: messageEarly });
  try { await ev(`KotOR.AudioEngine.Mute(), true`); } catch { /* optional */ }
  await sleep(3000);

  // ---- The Nar Shaddaa files never read: Seren, then Senn up to the trip ----
  await setUnreadable('^301nar', 0);
  const seren = await talk('k3_seren');
  const senn = await talk('k3_senn');
  let message = null;
  for (let i = 0; i < 60 && !message; i++) {
    message = await evT(`(() => { const b = document.querySelector('.k3-read-failure'); if (!b) return null; const r = b.getBoundingClientRect();
      return { text: b.innerText, button: [...b.querySelectorAll('button')].map(x => x.textContent.trim()), onScreen: r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none' }; })()`, 'message');
    if (!message) await sleep(1000);
  }
  await screenshot('message');
  const t = message?.text || '';
  pass('r2_unreadable_file_shows_message', !!message && message.onScreen && /301NAR/i.test(t) && /Google Drive/.test(t) && /available offline/.test(t) && /pick the folder again/.test(t) && message.button.includes('Reload'),
    { seren, senn, failedReads: await hits(), message: message ? { ...message, text: t.slice(0, 300) } : null });
} catch (e) {
  note(`ERROR: ${e.message}`);
} finally {
  pass('r3_no_freeze', !frozen, frozen ? `the page stopped answering: ${frozen}` : 'the page answered every check within 10 s');
  try { page?.close(); } catch { /* ignore */ }
  child.kill(); server.close();
  await sleep(2000);
  const d = diffLists(folderBefore, listTree(GAME_DIR));
  pass('r4_no_write_game_folder', !d.added.length && !d.removed.length, d);
  const expected = ['r1_reads_that_fail_once_are_tried_again', 'r2_unreadable_file_shows_message', 'r3_no_freeze', 'r4_no_write_game_folder'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  fs.writeFileSync(path.join(OUT, 'e2e-web-read-fail-result.json'), JSON.stringify({ passed, checks }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-web-read-fail-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-web-read-fail-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
