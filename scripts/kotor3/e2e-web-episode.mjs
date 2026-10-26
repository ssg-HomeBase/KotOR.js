#!/usr/bin/env node
/**
 * e2e-web-episode.mjs: KOTOR III Phase 2, Cam's checklist played in the browser build, start to finish.
 *
 * Serves a prepared web build (the deploy folder) on 127.0.0.1 and opens it as a plain web page in Electron's
 * Chromium (no install). Like a player in Chrome: the Grant Access box's older folder picker gets the game folder
 * (DevTools DOM.setFileInputFiles stands in for the native folder dialog), New Game through the menus, every
 * conversation started by clicking the character (its own click handler, what a mouse click does) and replies
 * picked with real number-key presses, the Messages screen (L) and the journal (J, and from the top bar), a save and a load through the in-game menus
 * with a typed save name, and the episode's last scene. Fails if the page ever stops answering for 10 seconds.
 *
 * Usage: node scripts/kotor3/e2e-web-episode.mjs --site "<deploy folder>" --game-dir "<a KOTOR II copy with real
 *   folders, e.g. C:\Games\Knights of the Old Republic II>" --out "<artifacts folder outside the repo>"
 * Never the game folder under Program Files (refused); the folder is only read. Exit 0 only when every check passes.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { parseArgs, makeLog, sleep, cdp, evaluate, waitFor, listTree, diffLists, clickGui, inAreaExpr, saveMenuHelpers,
  creatureCountsExpr, countDiff, checkJournalScreen } from './e2e-lib.mjs';

const { arg } = parseArgs();
const SITE = arg('--site'), GAME_DIR = arg('--game-dir'), OUT = arg('--out');
const PORT = parseInt(arg('--port') || '8094', 10), CDP_PORT = 9264;
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
const SAVE_NAME = 'K3 Browser Run';

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

const mainJs = path.join(OUT, 'web-main.js');
fs.writeFileSync(mainJs, `const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1280, height: 720, webPreferences: { contextIsolation: true, sandbox: true } });
  w.webContents.setBackgroundThrottling(false); w.loadURL('http://127.0.0.1:${PORT}/game/index.html?key=kotor3'); });`);
const electronExe = path.join(REPO, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const folderBefore = listTree(GAME_DIR);
note(`game folder listed before: ${folderBefore.length} entries`);
const child = spawn(electronExe, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(OUT, 'chromium-profile')}`, mainJs], { stdio: 'ignore' });
let page;
let frozen = null;
const conversations = [];
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
  /** Evaluate with a time limit: a page that does not answer in 10 s counts as frozen. */
  const evT = async (expr, what) => {
    const r = await Promise.race([ev(expr), sleep(10000).then(() => '__NO_ANSWER__')]);
    if (r === '__NO_ANSWER__') { frozen = frozen || what || 'page'; throw new Error(`page did not answer for 10 s (${what || 'evaluate'})`); }
    return r;
  };
  let shot = 0;
  const screenshot = async (name) => { const r = await Promise.race([page.send('Page.captureScreenshot', { format: 'png' }), sleep(10000).then(() => null)]); if (r) { fs.writeFileSync(path.join(OUT, `we_${String(++shot).padStart(2, '0')}_${name}.png`), Buffer.from(r.data, 'base64')); note(`screenshot: we_${String(shot).padStart(2, '0')}_${name}.png`); } };
  const key = async (k, code, vk, text) => { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(text ? { text } : {}) }); await sleep(80); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
  const pressDigit = (n) => key(String(n), `Digit${n}`, 48 + n, String(n));
  const skipMovies = async (tries = 30) => {
    for (let i = 0; i < tries; i++) {
      const playing = await evT(`KotOR.GameState.Mode === 5 || KotOR.GameState.VideoManager.isMoviePlaying() || KotOR.GameState.VideoManager.movieQueue.length > 0`, 'movie check').catch((e) => { if (frozen) throw e; return false; });
      if (!playing) return;
      await key('Escape', 'Escape', 27);
      await ev(`(() => { const v = KotOR.GameState.VideoManager; v.stopMovie(); v.playNextMovie(); return true; })()`).catch(() => {});
      await sleep(800);
    }
  };
  const waitArea = async (area, what) => {
    for (let i = 0; i < 160 && !(await evT(`(${inAreaExpr(area)}) || false`, `waiting for ${area}`).catch((e) => { if (frozen) throw e; return false; })); i++) { await skipMovies(3); await sleep(1500); }
    await wait(inAreaExpr(area), what, 10000, 1000);
  };
  /** Plays the conversation on screen to its end, pressing 1 at every choice. */
  const playToEnd = async (label) => {
    const end = Date.now() + 180000; let last = '';
    while (Date.now() < end) {
      const st = await evT(`(() => { const m = KotOR.CutsceneManager; return { active: !!m.active, replies: m.currentEntry ? [] : (m.currentReplies || []).map(r => r.text) }; })()`, `conversation ${label}`);
      if (!st.active) return 'ended';
      const k = st.replies.join('|');
      if (st.replies.length && k !== last) { await sleep(300); await pressDigit(1); last = k; }
      await sleep(300);
    }
    return 'did not end in 180 s';
  };
  /** Clicks a character the way the mouse does (selects it, then its own click handler) and plays the conversation. */
  const clickTalk = async (tag) => {
    await wait(`!KotOR.CutsceneManager.active && KotOR.GameState.Mode === 1`, `in game before ${tag}`, 60000);
    const r = await evT(`(() => { const G = KotOR.GameState; const c = G.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(tag)});
      if (!c) return 'missing'; G.CursorManager.selectedObject = c; c.onClick(G.getCurrentPlayer()); return 'clicked'; })()`, `click ${tag}`);
    if (r !== 'clicked') return `${tag} ${r}`;
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      const conv = await evT(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`, `waiting for ${tag} to talk`);
      if (conv) break;
      await sleep(500);
    }
    const result = await playToEnd(tag);
    note(`  ${tag}: ${result}`);
    return result;
  };
  const conversationRecorder = `(() => { if (window.__k3conv) return true; window.__k3conv = []; const m = KotOR.CutsceneManager; const orig = m.startConversation.bind(m);
    m.startConversation = function (...a) { try { const d = a[0]; window.__k3conv.push(String((d && (d.resref || d.name)) || (typeof d === 'string' ? d : ''))); } catch (e) { /* ignore */ } return orig(...a); }; return true; })()`;
  const convSince = async (n) => (await evT(`(window.__k3conv || []).slice(${n})`, 'conversation list'));

  // ---- Grant Access with the older folder picker ----
  await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'OK') || !!document.querySelector('.grant-access-modal')`, 'disclaimer or Grant Access', 60000);
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK'); if (b) b.click(); return true; })()`);
  await wait(`!!document.querySelector('.grant-access-modal')`, 'Grant Access box', 30000);
  const { root: docRoot } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: docRoot.nodeId, selector: '.grant-access-older-picker input[type=file]' });
  if (!nodeId) throw new Error('older picker input not found');
  await page.send('DOM.setFileInputFiles', { nodeId, files: [GAME_DIR] });
  await wait(`!document.querySelector('.grant-access-modal')`, 'Grant Access to close', 120000);
  for (let i = 0; i < 20; i++) { if (await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /begin/i.test(b.textContent)); if (b) { b.click(); return true; } return false; })()`)) break; await sleep(500); }
  await wait(`window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length`, 'mod files', 240000, 1000);
  await wait(`KotOR.GameState.Mode === 0 && !!${MM} && !!${MM}.MainMenu`, 'main menu', 240000, 1000);
  const env = await ev(`({ env: KotOR.ApplicationProfile.ENV, olderPicker: !!(KotOR.ApplicationProfile.directoryHandle && KotOR.ApplicationProfile.directoryHandle.isFileListEntry) })`);
  pass('w1_browser_reads_game_folder', env.env === 'BROWSER' && env.olderPicker, env);
  await ev(conversationRecorder);
  await skipMovies();
  await sleep(3000);

  // ---- New Game through the menus ----
  await ev(clickGui(`${MM}.MainMenu.BTN_NEWGAME`));
  await wait(`${MM}.CharGenClass.isVisible()`, 'class selection', 60000); await sleep(1500);
  await ev(clickGui(`${MM}.CharGenClass.BTN_SEL1`));
  await wait(`${MM}.CharGenQuickOrCustom.isVisible()`, 'quick or custom', 60000); await sleep(1000);
  await ev(clickGui(`${MM}.CharGenQuickOrCustom.QUICK_CHAR_BTN`));
  await wait(`${MM}.CharGenQuickPanel.isVisible()`, 'quick character panel', 60000); await sleep(1000);
  await ev(clickGui(`${MM}.CharGenQuickPanel.BTN_STEPNAME3`));
  await waitArea('201tel', 'New Game in 201tel');
  try { await ev(`KotOR.AudioEngine.Mute(), true`); } catch { /* optional */ }
  await sleep(4000);
  const convAtStart = await convSince(0);
  pass('w2_new_game_no_base_game_conversation', !convAtStart.length, { conversations: convAtStart });
  await screenshot('201tel');

  // ---- Prologue by clicking (checklist 15 to 18) ----
  const prologue = [];
  for (const tag of ['k3_seren', 'k3_brannick', 'k3_senn']) prologue.push([tag, await clickTalk(tag)]);
  await waitArea('301nar', 'travel to Nar Shaddaa');
  pass('w3_prologue_by_click_and_travel', prologue.every(([, r]) => r === 'ended'), { prologue, area: '301nar' });

  // ---- Seren on arrival (checklist 19) ----
  const nAfterPrologue = 3;
  for (let i = 0; i < 30; i++) {
    const conv = await evT(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`, 'arrival conversation');
    if (conv) { note(`  arrival: ${conv} ${await playToEnd(conv)}`); break; }
    if ((await convSince(nAfterPrologue)).some((c) => /k3_sv_nar/i.test(c))) break;
    await sleep(1000);
  }
  const arrival = await convSince(nAfterPrologue);
  pass('w4_seren_talks_on_arrival', arrival.some((c) => /k3_sv_nar/i.test(c)), { conversations: arrival });
  await screenshot('301nar');

  // ---- Nar Shaddaa by clicking (checklist 20) ----
  const act1 = [];
  for (const tag of ['k3_kiri', 'k3_zell', 'k3_rhea']) act1.push([tag, await clickTalk(tag)]);
  const party = await evT(`KotOR.GameState.PartyManager.party.map(p => (p.getTag() || '').toLowerCase())`, 'party');
  pass('w5_nar_shaddaa_by_click_rhea_joins', act1.every(([, r]) => r === 'ended') && party.includes('k3_seren') && party.includes('k3_rhea'), { act1, party });

  // ---- Menus a player tries (checklist 23). KOTOR II's own key map: L opens Messages, J the journal. ----
  const inGame = `!KotOR.CutsceneManager.active && KotOR.GameState.Mode === 1`;
  await key('l', 'KeyL', 76, 'l'); await sleep(1500);
  const tour = { messagesWithL: await evT(`${MM}.MenuMessages.isVisible()`, 'messages screen') };
  await ev(clickGui(`${MM}.MenuMessages.BTN_EXIT`)); await sleep(1200);
  tour.closeReturnsToGame = await evT(inGame, 'after closing messages');
  await key('l', 'KeyL', 76, 'l'); await sleep(1500);
  await ev(clickGui(`${MM}.MenuTop.BTN_JOU`)); await sleep(1500);
  tour.journalFromTopBar = await evT(`${MM}.MenuJournal.isVisible()`, 'journal from the top bar');
  await ev(clickGui(`${MM}.MenuJournal.BTN_EXIT`)); await sleep(1200);
  tour.escPressesNeeded = 0;
  for (let i = 0; i < 3 && !(await evT(inGame, 'menus closed')); i++) { await key('Escape', 'Escape', 27); tour.escPressesNeeded++; await sleep(1000); }
  tour.backInGame = await evT(inGame, 'back in game');
  pass('w6a_messages_and_journal_menus_close', tour.messagesWithL && tour.closeReturnsToGame && tour.journalFromTopBar && tour.backInGame, tour);
  // ---- Journal with the J key (checklist 23) ----
  const journalMid = await checkJournalScreen(evT, { pressKey: () => key('j', 'KeyJ', 74, 'j'), keyLabel: 'J key' });
  pass('w6_journal_screen_mid_episode', journalMid.ok, journalMid);

  // ---- Save and load through the menus (checklist 21, 22) ----
  const { typeText, visible, savedNames, clickRow } = saveMenuHelpers({ send: (m, p) => page.send(m, p), ev: evT });
  const countsBefore = await evT(creatureCountsExpr, 'characters before save');
  await ev(clickGui(`${MM}.InGameOverlay.BTN_OPT`));
  await wait(visible('MenuOptions'), 'options menu', 20000); await sleep(800);
  await ev(clickGui(`${MM}.MenuOptions.BTN_SAVEGAME`));
  await wait(visible('MenuSaveLoad'), 'save menu', 20000); await sleep(1500);
  await clickRow('[New Save]');
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await wait(visible('MenuSaveName'), 'save name box', 10000); await sleep(500);
  await typeText(SAVE_NAME);
  await ev(clickGui(`${MM}.MenuSaveName.BTN_OK`));
  await wait(`${savedNames}.includes(${JSON.stringify(SAVE_NAME)}) && !${visible('LoadScreen')} && !${visible('MenuSaveName')}`, 'menu save', 60000);
  await sleep(1500);
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_BACK`)); await sleep(1000);
  if (!(await evT(visible('MenuOptions'), 'options'))) { await ev(clickGui(`${MM}.InGameOverlay.BTN_OPT`)); await wait(visible('MenuOptions'), 'options menu', 20000); }
  await sleep(800);
  await ev(clickGui(`${MM}.MenuOptions.BTN_LOADGAME`));
  await wait(visible('MenuSaveLoad'), 'load menu', 20000); await sleep(1500);
  await clickRow(SAVE_NAME);
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await sleep(3000);
  await waitArea('301nar', 'menu load');
  await sleep(5000);
  const countsAfter = await evT(creatureCountsExpr, 'characters after load');
  const partyAfter = await evT(`KotOR.GameState.PartyManager.party.map(p => (p.getTag() || '').toLowerCase())`, 'party after load');
  const doubled = countDiff(countsBefore, countsAfter);
  pass('w7_menu_save_and_load', !doubled.length && partyAfter.includes('k3_seren') && partyAfter.includes('k3_rhea'), { differences: doubled, party: partyAfter });

  // ---- The rest of the episode by clicking (checklist 24) ----
  const n24 = (await convSince(0)).length;
  const act2 = [];
  for (const tag of ['k3_hesk', 'k3_corva', 'k3_hesk']) act2.push([tag, await clickTalk(tag)]);
  for (let i = 0; i < 40; i++) {
    const conv = await evT(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`, 'last scene');
    if (conv) { note(`  last scene: ${conv} ${await playToEnd(conv)}`); break; }
    if ((await convSince(n24)).some((c) => /k3_end/i.test(c))) break;
    await sleep(1000);
  }
  const done = await evT(`KotOR.GameState.GlobalVariableManager.GetGlobalBoolean('K3_EPISODE_DONE')`, 'episode done');
  pass('w8_episode_end_by_click', act2.every(([, r]) => r === 'ended') && (await convSince(n24)).some((c) => /k3_end/i.test(c)) && done === true, { act2, conversations: await convSince(n24), K3_EPISODE_DONE: done });
  const journalEnd = await checkJournalScreen(evT);
  pass('w9_journal_screen_at_end', journalEnd.ok && journalEnd.completed.rows.length === 3 && journalEnd.active.rows.length === 0, journalEnd);
  await screenshot('episode_end');
} catch (e) {
  note(`ERROR: ${e.message}`);
} finally {
  pass('w10_no_freeze', !frozen, frozen ? `the page stopped answering: ${frozen}` : 'the page answered every check within 10 s');
  try { page?.close(); } catch { /* ignore */ }
  child.kill(); server.close();
  await sleep(2000);
  const folderAfter = listTree(GAME_DIR);
  const d = diffLists(folderBefore, folderAfter);
  pass('w11_no_write_game_folder', !d.added.length && !d.removed.length, { entries: folderAfter.length, ...d });
  const expected = ['w1_browser_reads_game_folder', 'w2_new_game_no_base_game_conversation', 'w3_prologue_by_click_and_travel', 'w4_seren_talks_on_arrival',
    'w5_nar_shaddaa_by_click_rhea_joins', 'w6a_messages_and_journal_menus_close', 'w6_journal_screen_mid_episode', 'w7_menu_save_and_load', 'w8_episode_end_by_click', 'w9_journal_screen_at_end',
    'w10_no_freeze', 'w11_no_write_game_folder'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  fs.writeFileSync(path.join(OUT, 'e2e-web-episode-result.json'), JSON.stringify({ passed, checks }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-web-episode-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-web-episode-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
