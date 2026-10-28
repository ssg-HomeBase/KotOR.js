#!/usr/bin/env node
/**
 * e2e-electron.mjs: end-to-end test of the KOTOR III fan scene in the KotOR.js Electron app.
 *
 * Starts the Electron app with a throwaway profile, picks "KOTOR III (fan)" in the launcher,
 * launches it against the player's own KOTOR II folder, warps to the scene's area, checks the
 * mod's NPC is there, then plays the dialogue three times with real number-key presses so every
 * node is visited. Driven over the Chrome DevTools Protocol with Node's built-in WebSocket.
 *
 * Usage: node scripts/kotor3/e2e-electron.mjs --game-dir "<KOTOR II folder>" --out "<artifacts folder>"
 * Screenshots and logs go to --out, which must be outside the repo (they show game assets).
 * Test-only setup inside the throwaway profile: the game folder is pre-set (the launcher's LOCATE
 * button opens a native folder dialog), the game window is not fullscreen, and the KotOR.js
 * in-app disclaimer is marked as seen.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const GAME_DIR = arg('--game-dir');
const OUT = arg('--out');
if (!GAME_DIR || !OUT) { console.error('need --game-dir and --out'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9223;
const AREA = '201tel';
const NPC_TAG = 'k3_seren';

const log = [];
const t0 = Date.now();
function note(msg) { const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`; log.push(line); console.log(line); }
const consoleLines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tiny CDP client ----------
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const handlers = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else handlers.forEach((h) => h(m));
  };
  return {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (h) => handlers.push(h),
    close: () => ws.close(),
  };
}
async function evaluate(c, expression) {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
  return r.result.value;
}
async function waitFor(c, expression, what, timeoutMs = 120000, every = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const v = await evaluate(c, expression); if (v) return v; } catch { /* page still loading */ }
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}`);
}
async function targets() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
async function waitTarget(pred, what, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { try { const t = (await targets()).find(pred); if (t) return t; } catch { /* not up yet */ } await sleep(500); }
  throw new Error(`timed out waiting for ${what}`);
}
let shot = 0;
async function screenshot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `${String(++shot).padStart(2, '0')}_${name}.png`);
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  note(`screenshot: ${path.basename(file)}`);
}
async function pressDigit(c, n) {
  const key = String(n);
  const base = { key, code: `Digit${key}`, windowsVirtualKeyCode: 48 + n, nativeVirtualKeyCode: 48 + n };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key });
  await sleep(80);
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// ---------- run ----------
const profileDir = path.join(OUT, 'electron-profile');
const electronExe = path.join(REPO, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
note(`starting Electron (profile ${profileDir})`);
const MAIN_PORT = PORT + 10;
const child = spawn(electronExe, [`--inspect=${MAIN_PORT}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, 'main.js'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (d) => consoleLines.push(`[main] ${d.toString().trim()}`));
child.stderr.on('data', (d) => consoleLines.push(`[main:err] ${d.toString().trim()}`));

const result = { passed: false, steps: {}, dialogue: [] };
let game;
try {
  const lt = await waitTarget((t) => t.type === 'page' && t.url.includes('launcher/index.html'), 'launcher window');
  const launcher = await cdp(lt.webSocketDebuggerUrl);
  await launcher.send('Runtime.enable');
  await waitFor(launcher, `document.readyState === 'complete' && !!document.querySelector('.launcher-option.kotor3')`, 'launcher load');
  await launcher.send('Page.enable');

  // Stand in for the native Windows folder dialog only: answer the launcher's "KotOR Game Install
  // Folder" dialog with the game folder, through Electron's main-process debugger. The launcher's own
  // LOCATE code then checks and saves the folder as it would for a person.
  const mainTarget = (await (await fetch(`http://127.0.0.1:${MAIN_PORT}/json/list`)).json())[0];
  const main = await cdp(mainTarget.webSocketDebuggerUrl);
  await main.send('Runtime.enable');
  const stub = await evaluate(main, `(() => { const { dialog } = process.mainModule.require('electron'); const orig = dialog.showOpenDialog.bind(dialog);
    dialog.showOpenDialog = async (...a) => { const o = a[a.length - 1] || {}; if (String(o.title || '').includes('Game Install Folder')) return { canceled: false, filePaths: [${JSON.stringify(GAME_DIR)}] }; return orig(...a); };
    return 'folder dialog answered by test'; })()`);
  note(stub);
  await evaluate(launcher, `localStorage.setItem('acceptEULA', JSON.stringify({ TSL: { key: 'TSL', version: '1.0.0', date: '2025-04-23', accepted: true } })), true`);

  const entryName = await waitFor(launcher, `(() => { const li = document.querySelector('.launcher-option.kotor3'); return li ? li.textContent.trim() || 'kotor3' : false; })()`, 'KOTOR III launcher entry', 60000);
  note(`launcher shows entry: "${entryName}"`);
  result.steps.launcherEntry = entryName;
  await evaluate(launcher, `document.querySelector('.launcher-option.kotor3').click(), true`);
  await sleep(800);
  // Each profile renders its own buttons; only the selected profile's are visible.
  const visibleBtn = `[...document.querySelectorAll('.btn-launch')].find(b => b.offsetParent !== null)`;
  const first = await evaluate(launcher, `(() => { const b = ${visibleBtn}; return b ? b.textContent.trim() : ''; })()`);
  if (/locate/i.test(first)) {
    note('clicking LOCATE');
    await evaluate(launcher, `${visibleBtn}.click(), true`);
  }
  const btn = await waitFor(launcher, `(() => { const b = ${visibleBtn}; return b && !b.classList.contains('locate') ? b.textContent.trim() : false; })()`, 'KOTOR III launch button (not LOCATE)', 30000);
  await screenshot(launcher, 'launcher_kotor3_ready');
  note(`clicking launcher button "${btn}"`);
  await evaluate(launcher, `${visibleBtn}.click(), true`);

  const gt = await waitTarget((t) => t.type === 'page' && t.url.includes('game/index.html') && t.url.includes('key=kotor3'), 'game window', 60000);
  note(`game window opened: ${gt.url.replace(/^.*\/dist\//, 'dist/')}`);
  await sleep(1000);
  // Windowed, so the test does not take over the whole screen.
  // Keep rendering even when the window is behind others (otherwise movies and timers stall).
  await evaluate(main, `(() => { process.mainModule.require('electron').BrowserWindow.getAllWindows().forEach(w => { if (w.isFullScreen()) w.setFullScreen(false); w.webContents.setBackgroundThrottling(false); }); return true; })()`);
  game = await cdp(gt.webSocketDebuggerUrl);
  game.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      consoleLines.push(`[${m.params.type}] ${text}`.slice(0, 400));
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleLines.push(`[exception] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`.slice(0, 600));
    }
  });
  await game.send('Runtime.enable');
  await game.send('Page.enable');

  const modFiles = await waitFor(game, `window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length ? KotOR.ModManager.loadedFiles : false`, 'mod files to load', 180000);
  note(`mod loaded: ${modFiles.join(', ')}`);
  result.steps.modFiles = modFiles;
  const gameKey = await evaluate(game, `KotOR.GameState.GameKey`);
  note(`engine game key: ${gameKey}; directory: ${await evaluate(game, `KotOR.ApplicationProfile.directory`)}`);
  await waitFor(game, `KotOR.GameState.Mode === 0 && !!KotOR.GameState.MenuManager`, 'GUI mode', 180000);
  // Intro movies play first; skip each with Escape, as a player would, until none is playing.
  const pressKey = async (key, code, vk) => {
    await game.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(60);
    await game.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const movieOver = `!KotOR.GameState.VideoManager.isMoviePlaying() && !KotOR.GameState.VideoManager.movieQueue.length`;
  for (let i = 0; i < 40 && !(await evaluate(game, movieOver)); i++) { await pressKey('Escape', 'Escape', 27); await sleep(1500); }
  await waitFor(game, movieOver, 'intro movies to end', 120000);
  await sleep(4000);
  await screenshot(game, 'main_menu');

  const startModule = await evaluate(game, `KotOR.ModManager.manifest.startModule`);
  note(`mod start area from manifest: ${startModule}`);
  note(`warping to ${AREA}`);
  await evaluate(game, `KotOR.GameState.LoadModule(${JSON.stringify(AREA)}), true`);
  // In-game (1) or in a conversation the area's own enter script started (3).
  const inArea = `(KotOR.GameState.Mode === 1 || KotOR.GameState.Mode === 3) && !!KotOR.GameState.module && !!KotOR.GameState.module.area && KotOR.GameState.module.area.name.toLowerCase() === ${JSON.stringify(AREA)}`;
  for (let i = 0; i < 200 && !(await evaluate(game, `(${inArea}) || false`).catch(() => false)); i++) {
    // Intro and area movies (from the player's own game) may play here; skip them, including unskippable ones.
    if (await evaluate(game, `KotOR.GameState.Mode === 5 || KotOR.GameState.VideoManager.isMoviePlaying()`).catch(() => false)) {
      await pressKey('Escape', 'Escape', 27);
      await evaluate(game, `(() => { const v = KotOR.GameState.VideoManager; v.stopMovie(); v.playNextMovie(); return true; })()`).catch(() => {});
      note('  skipped a movie');
    }
    await sleep(1500);
  }
  await waitFor(game, inArea, 'area to load', 10000, 1000);
  await sleep(4000);
  // Stop any conversation the area's own enter script may have started.
  const autoConv = await evaluate(game, `KotOR.CutsceneManager.active ? (KotOR.CutsceneManager.endConversation(true), 'ended an area conversation') : 'none'`);
  note(`area loaded; auto conversation: ${autoConv}`);
  try { await evaluate(game, `KotOR.AudioEngine.Mute(), true`); } catch { /* audio optional */ }

  const npc = await waitFor(game, `(() => {
    const c = KotOR.GameState.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(NPC_TAG)});
    if (!c || !c.model) return false;
    const p = KotOR.GameState.PartyManager.party[0];
    return { name: c.getName(), tag: c.getTag(), appearance: c.appearance, x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2),
             hasModel: !!c.model, conversation: c.conversation && c.conversation.resref,
             distanceToPlayer: p ? +c.position.distanceTo(p.position).toFixed(2) : null };
  })()`, 'mod NPC in the area', 60000);
  note(`NPC in area: ${JSON.stringify(npc)}`);
  result.steps.npc = npc;
  await screenshot(game, 'area_with_npc');

  // Map line text back to the node ids in the mod's source file (the engine numbers live nodes -1).
  const src = JSON.parse(fs.readFileSync(path.join(REPO, 'mods/kotor3/src/k3_seren.dialogue.json'), 'utf8'));
  const idOf = (text, list) => (list.find((n) => n.text.trim() === String(text || '').trim()) || {}).id || '?';
  // Three runs cover all 7 entries and 7 replies: the number is the reply's position in the list.
  const runs = [
    { name: 'accept path', keys: [1, 1, 1, 1, 1] },
    { name: 'refuse at start', keys: [2] },
    { name: 'think it over', keys: [1, 1, 1, 1, 2] },
  ];
  const seenEntries = new Set(), seenReplies = new Set();
  for (const run of runs) {
    note(`dialogue run: ${run.name}`);
    for (let i = 0; i < 20; i++) {
      const s = await evaluate(game, `(() => { const m = KotOR.CutsceneManager; if (m.active && m.conversation_name !== ${JSON.stringify(NPC_TAG)}) { m.endConversation(true); return 'ended:' + m.conversation_name; } return (!m.active && KotOR.GameState.Mode === 1) ? 'ready' : 'mode ' + KotOR.GameState.Mode; })()`);
      if (s === 'ready') break;
      if (s.startsWith('ended:')) note(`  ended the area's own conversation (${s.slice(6)})`);
      await sleep(500);
    }
    await waitFor(game, `!KotOR.CutsceneManager.active && KotOR.GameState.Mode === 1`, 'in-game mode before dialogue', 30000);
    await evaluate(game, `(() => { const c = KotOR.GameState.module.area.creatures.concat(KotOR.GameState.PartyManager.party.filter(Boolean)).find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(NPC_TAG)});
      KotOR.CutsceneManager.startConversation(c.conversation, c, KotOR.GameState.PartyManager.party[0]); return true; })()`);
    const steps = [];
    let keyIdx = 0, lastEntry = '', lastReplies = '';
    const end = Date.now() + 120000;
    while (Date.now() < end) {
      // The engine clears currentEntry while it shows the replies, so remember the last line spoken.
      // Replies open for choice once the line's timer ends (showReplies clears currentEntry).
      const st = await evaluate(game, `(() => { const m = KotOR.CutsceneManager; return { active: !!m.active,
        entry: m.currentEntry ? m.currentEntry.text : null, spoken: m.lastSpokenString || '',
        replies: m.currentEntry ? [] : (m.currentReplies || []).map(r => r.text) }; })()`);
      if (!st.active) break;
      const line = st.entry || st.spoken;
      if (line && line !== lastEntry && idOf(line, src.entries) !== '?') {
        lastEntry = line; const id = idOf(line, src.entries); seenEntries.add(id);
        steps.push({ node: id, speaker: 'Seren', text: line });
        note(`  Seren (${id}): ${line}`);
        await sleep(1200);
        await screenshot(game, `dialog_${run.name.replace(/\s+/g, '_')}_${id}`);
      }
      const replyKey = st.replies.join('|');
      if (st.replies.length && replyKey !== lastReplies) {
        const k = run.keys[keyIdx++] ?? 1;
        const chosen = st.replies[k - 1];
        if (!chosen) throw new Error(`no reply ${k} after ${lastEntry}`);
        const id = idOf(chosen, src.replies); seenReplies.add(id);
        steps.push({ node: id, speaker: 'player', choice: `${k} of ${st.replies.length}`, text: chosen });
        note(`  player picks ${k} of ${st.replies.length} (${id}): ${chosen}`);
        // Same handler a mouse click on the reply list calls (number keys are unbound upstream).
        await evaluate(game, `KotOR.GameState.MenuManager.InGameDialog.LB_REPLIES.onSelected(null, null, ${k - 1}), true`);
        lastReplies = replyKey;
        await waitFor(game, `(() => { const m = KotOR.CutsceneManager; return !m.active || (m.currentReplies || []).map(r => r.text).join('|') !== ${JSON.stringify(replyKey)}; })()`, 'next node', 20000, 200);
        continue;
      }
      await sleep(300);
    }
    const stillActive = await evaluate(game, `!!KotOR.CutsceneManager.active`);
    if (stillActive) {
      note('  final line shown; skipping to end of conversation');
      await evaluate(game, `KotOR.CutsceneManager.endConversation(false), true`);
    }
    note(`  run ended (${steps.length} steps)`);
    result.dialogue.push({ run: run.name, steps });
  }
  result.coverage = { entries: [...seenEntries].sort(), replies: [...seenReplies].sort() };
  note(`coverage: entries ${result.coverage.entries.join(',')} | replies ${result.coverage.replies.join(',')}`);
  // Phase 2 extended the scene (Seren now joins); Phase 1's 14 nodes must all still be played.
  const p1 = (k) => [0, 1, 2, 3, 4, 5, 6].every((i) => result.coverage[k].includes(`${k === 'entries' ? 'E' : 'R'}${i}`));
  result.passed = p1('entries') && p1('replies') && !!npc.hasModel;
  note(`RESULT: ${result.passed ? 'PASS' : 'FAIL'}`);
} catch (e) {
  note(`ERROR: ${e.message}`);
  if (game) { try { await screenshot(game, 'error'); } catch { /* ignore */ } }
} finally {
  fs.writeFileSync(path.join(OUT, 'e2e-result.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-steps.log'), log.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-console.log'), consoleLines.join('\n') + '\n');
  try { game?.close(); } catch { /* ignore */ }
  child.kill();
  process.exit(result.passed ? 0 : 1);
}
