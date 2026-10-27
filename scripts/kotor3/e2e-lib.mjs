/**
 * e2e-lib.mjs: shared helpers for the KOTOR III end-to-end tests in the KotOR.js desktop app (Electron).
 *
 * Drives Electron over the Chrome DevTools Protocol with Node's built-in WebSocket (no extra packages).
 * Screenshots, logs and the throwaway Electron profile (which holds the game's own saves, see
 * src/utility/GameFileSystem.ts) go to the --out folder, which must be outside the repo because
 * screenshots show game assets.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chromium switches for test windows: keep the game running at full speed when the window is covered or the screen is
// locked (Windows otherwise slows a covered window to about one frame a second, and quick key presses are lost).
export const KEEP_RUNNING_SWITCHES = ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion', '--disable-gpu-vsync', '--disable-frame-rate-limit'];

export function parseArgs(argv = process.argv.slice(2)) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  return { arg, has: (k) => argv.includes(k) };
}

/** Step log with elapsed seconds; also collects console lines from the app. */
export function makeLog() {
  const t0 = Date.now();
  const lines = [];
  const consoleLines = [];
  const note = (msg) => { const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`; lines.push(line); console.log(line); };
  return { note, lines, consoleLines };
}

// ---------- tiny CDP client ----------
export async function cdp(wsUrl) {
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
export async function evaluate(c, expression) {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
  return r.result.value;
}
export async function waitFor(c, expression, what, timeoutMs = 120000, every = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const v = await evaluate(c, expression); if (v) return v; } catch { /* page still loading */ }
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// ---------- file listings for the no-write checks ----------
/** Top level of a folder: name, kind, size, mtime (junctions are listed, never followed). */
export function listRoot(dir) {
  return fs.readdirSync(dir).sort().map((name) => {
    const st = fs.lstatSync(path.join(dir, name));
    return `${name}\t${st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file'}\t${st.isDirectory() ? 0 : st.size}\t${Math.round(st.mtimeMs)}`;
  });
}
/** Every entry under a folder (relative path, size, mtime), like the run's GAME_DIR snapshots. */
export function listTree(dir) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    for (const name of fs.readdirSync(abs)) {
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.lstatSync(path.join(abs, name));
      out.push(`${r}\t${st.isDirectory() ? 0 : st.size}\t${Math.round(st.mtimeMs)}`);
      if (st.isDirectory() && !st.isSymbolicLink()) walk(r);
    }
  };
  walk('');
  return out.sort();
}
export function diffLists(before, after) {
  const a = new Set(before), b = new Set(after);
  return { removed: before.filter((x) => !b.has(x)), added: after.filter((x) => !a.has(x)) };
}
export const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// ---------- the app ----------
/**
 * Starts the Electron app with a throwaway profile in OUT, answers the launcher's folder dialog with
 * gameDir (through Electron's main-process debugger; the native dialog cannot be driven), launches the
 * KOTOR III entry and returns CDP clients for the launcher, the main process and the game window.
 */
export async function launchKotor3({ repo, out, gameDir, log, port = 9223, screenshotTag = '', extraArgs = [] }) {
  const { note, consoleLines } = log;
  const targets = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const waitTarget = async (pred, what, timeoutMs = 120000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { try { const t = (await targets()).find(pred); if (t) return t; } catch { /* not up yet */ } await sleep(500); }
    throw new Error(`timed out waiting for ${what}`);
  };
  const profileDir = path.join(out, 'electron-profile');
  const electronExe = path.join(repo, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  note(`starting Electron (profile ${profileDir})`);
  const mainPort = port + 10;
  const child = spawn(electronExe, [`--inspect=${mainPort}`, `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, ...KEEP_RUNNING_SWITCHES, ...extraArgs, 'main.js'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => consoleLines.push(`[main] ${d.toString().trim()}`));
  child.stderr.on('data', (d) => consoleLines.push(`[main:err] ${d.toString().trim()}`));

  const lt = await waitTarget((t) => t.type === 'page' && t.url.includes('launcher/index.html'), 'launcher window');
  const launcher = await cdp(lt.webSocketDebuggerUrl);
  await launcher.send('Runtime.enable');
  await waitFor(launcher, `document.readyState === 'complete' && !!document.querySelector('.launcher-option.kotor3')`, 'launcher load');
  await launcher.send('Page.enable');

  const mainTarget = (await (await fetch(`http://127.0.0.1:${mainPort}/json/list`)).json())[0];
  const main = await cdp(mainTarget.webSocketDebuggerUrl);
  await main.send('Runtime.enable');
  note(await evaluate(main, `(() => { const { dialog } = process.mainModule.require('electron'); const orig = dialog.showOpenDialog.bind(dialog);
    dialog.showOpenDialog = async (...a) => { const o = a[a.length - 1] || {}; if (String(o.title || '').includes('Game Install Folder')) return { canceled: false, filePaths: [${JSON.stringify(gameDir)}] }; return orig(...a); };
    return 'folder dialog answered by test'; })()`));
  await evaluate(launcher, `localStorage.setItem('acceptEULA', JSON.stringify({ TSL: { key: 'TSL', version: '1.0.0', date: '2025-04-23', accepted: true } })), true`);
  await waitFor(launcher, `!!document.querySelector('.launcher-option.kotor3')`, 'KOTOR III launcher entry', 60000);
  await evaluate(launcher, `document.querySelector('.launcher-option.kotor3').click(), true`);
  await sleep(800);
  const visibleBtn = `[...document.querySelectorAll('.btn-launch')].find(b => b.offsetParent !== null)`;
  const first = await evaluate(launcher, `(() => { const b = ${visibleBtn}; return b ? b.textContent.trim() : ''; })()`);
  if (/locate/i.test(first)) { note('clicking LOCATE'); await evaluate(launcher, `${visibleBtn}.click(), true`); }
  const btn = await waitFor(launcher, `(() => { const b = ${visibleBtn}; return b && !b.classList.contains('locate') ? b.textContent.trim() : false; })()`, 'KOTOR III launch button', 30000);
  note(`clicking launcher button "${btn}"`);
  await evaluate(launcher, `${visibleBtn}.click(), true`);

  const gt = await waitTarget((t) => t.type === 'page' && t.url.includes('game/index.html') && t.url.includes('key=kotor3'), 'game window', 60000);
  note(`game window opened: ${gt.url.replace(/^.*\/dist\//, 'dist/')}`);
  await sleep(1000);
  await evaluate(main, `(() => { process.mainModule.require('electron').BrowserWindow.getAllWindows().forEach(w => { if (w.isFullScreen()) w.setFullScreen(false); w.webContents.setBackgroundThrottling(false); }); return true; })()`);
  const game = await cdp(gt.webSocketDebuggerUrl);
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

  let shot = 0;
  const screenshot = async (name) => {
    const r = await game.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(out, `${screenshotTag}${String(++shot).padStart(2, '0')}_${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    note(`screenshot: ${path.basename(file)}`);
  };
  const pressKey = async (key, code, vk) => {
    await game.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(60);
    await game.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  /** A real key press of the digit key (the same event a keyboard sends). */
  const pressDigit = async (n) => {
    const key = String(n);
    const base = { key, code: `Digit${key}`, windowsVirtualKeyCode: 48 + n, nativeVirtualKeyCode: 48 + n };
    await game.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key });
    await sleep(100);
    await game.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  };
  const ev = (expr) => evaluate(game, expr);
  const wait = (expr, what, ms, every) => waitFor(game, expr, what, ms, every);

  /** Skip queued and playing movies (the player's own intro and area movies). */
  const skipMovies = async (maxTries = 60) => {
    for (let i = 0; i < maxTries; i++) {
      const playing = await ev(`KotOR.GameState.Mode === 5 || KotOR.GameState.VideoManager.isMoviePlaying() || KotOR.GameState.VideoManager.movieQueue.length > 0`).catch(() => false);
      if (!playing) return;
      await pressKey('Escape', 'Escape', 27);
      await ev(`(() => { const v = KotOR.GameState.VideoManager; v.stopMovie(); v.playNextMovie(); return true; })()`).catch(() => {});
      await sleep(800);
    }
  };

  const close = () => { try { game.close(); } catch { /* ignore */ } try { launcher.close(); main.close(); } catch { /* ignore */ } child.kill(); };
  return { child, launcher, main, game, ev, wait, screenshot, pressKey, pressDigit, skipMovies, close, profileDir };
}

/** Clicks a KotOR GUI control through its own click listeners (what a mouse click on it does). */
export const clickGui = (expr) => `(() => { const c = ${expr}; if (!c) throw new Error('no control: ${expr.replace(/'/g, '')}'); c.processEventListener('click', [{ stopPropagation(){}, preventDefault(){} }]); return true; })()`;

/** Area-loaded check for a given area resref (in game or in a conversation). */
// Also waits out a save being loaded: the engine sets isLoadingSave as a load starts and clears it once the reloaded
// area is ready (before that, the old area can still look ready).
export const inAreaExpr = (area) => `(KotOR.GameState.Mode === 1 || KotOR.GameState.Mode === 3) && !!KotOR.GameState.module && !!KotOR.GameState.module.area && KotOR.GameState.module.area.name.toLowerCase() === ${JSON.stringify(area.toLowerCase())} && !KotOR.GameState.module.loading && !KotOR.GameState.isLoadingSave`;

/**
 * Helpers for the KOTOR II save and load menus (KOTOR III Phase 2, finding 23), shared by the desktop and
 * browser tests. send is a CDP send function for the game page, ev evaluates in it.
 */
export function saveMenuHelpers({ send, ev }) {
  const MM = 'KotOR.GameState.MenuManager';
  /** Real key presses for each character (Shift held for capitals): the events a keyboard sends. */
  const typeText = async (text) => {
    for (const ch of text) {
      let code, vk, modifiers = 0;
      if (ch === ' ') { code = 'Space'; vk = 32; }
      else if (/[0-9]/.test(ch)) { code = `Digit${ch}`; vk = ch.charCodeAt(0); }
      else if (/[A-Za-z]/.test(ch)) { code = `Key${ch.toUpperCase()}`; vk = ch.toUpperCase().charCodeAt(0); if (ch !== ch.toLowerCase()) modifiers = 8; }
      else throw new Error(`typeText: unsupported character ${ch}`);
      if (modifiers) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: ch, modifiers });
      await sleep(40);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
      if (modifiers) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
      await sleep(60);
    }
  };
  const visible = (menu) => `!!(${MM}.${menu} && ${MM}.${menu}.isVisible())`;
  const listNames = `${MM}.MenuSaveLoad.LB_GAMES.children.map(c => c.node ? (c.node.isNewSave ? '[New Save]' : c.node.getSaveName()) : '?')`;
  const savedNames = `KotOR.SaveGame.saves.map(s => s.getSaveName())`;
  /** Clicks the save list row with this name ('[New Save]' for the new slot); returns what is then selected. */
  const clickRow = async (name) => {
    const i = await ev(`${listNames}.indexOf(${JSON.stringify(name)})`);
    if (i < 0) throw new Error(`no row "${name}" in the save list: ${JSON.stringify(await ev(listNames))}`);
    await ev(clickGui(`${MM}.MenuSaveLoad.LB_GAMES.children[${i}]`));
    await sleep(500);
    return ev(`(() => { const s = ${MM}.MenuSaveLoad.selected; return s ? (s.isNewSave ? '[New Save]' : s.getSaveName()) : null; })()`);
  };
  return { MM, typeText, visible, listNames, savedNames, clickRow };
}

/**
 * Characters in the current area by tag (lower case) -> count. KOTOR III Phase 2, finding 24: after a load, every
 * mod character came back twice; tests compare these counts before a save and after loading it.
 */
export const creatureCountsExpr = `(() => { const m = {}; for (const c of KotOR.GameState.module.area.creatures) { const t = String(c.getTag() || '').toLowerCase(); m[t] = (m[t] || 0) + 1; } return m; })()`;
/** Tags whose count differs between two creatureCountsExpr results (empty when the same). */
export function countDiff(before, after) {
  const tags = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  return tags.filter((t) => (before?.[t] || 0) !== (after?.[t] || 0)).map((t) => ({ tag: t, before: before?.[t] || 0, after: after?.[t] || 0 }));
}

/**
 * Opens the journal from the in-game menu bar and checks what the screen shows (KOTOR III Phase 2, finding 25: the
 * journal drew no rows for the mod's quests, and Close did nothing). Active list, the first quest's text, the
 * completed list (completed/active button), then Close. ev evaluates in the game page. With pressKey (a function that
 * presses the journal key; KOTOR II binds J in its own key map), the journal is opened with the key instead of the
 * menu bar button.
 */
export async function checkJournalScreen(ev, { pressKey, keyLabel } = {}) {
  const MM = 'KotOR.GameState.MenuManager';
  const done = `(e => { const s = e.category && e.category.getEntryById(e.state); return !!(s && s.end); })`;
  const rowsExpr = `${MM}.MenuJournal.LB_ITEMS.children.map(c => String((c.text && c.text.text) || '').trim().toLowerCase()).sort()`;
  const expectExpr = (completed) => `KotOR.GameState.JournalManager.Entries.filter(e => ${done}(e) === ${completed}).map(e => e.getName().trim().toLowerCase()).sort()`;
  if (pressKey) await pressKey(); else await ev(clickGui(`${MM}.InGameOverlay.BTN_JOU`));
  await sleep(1500);
  const opened = await ev(`${MM}.MenuJournal.isVisible()`);
  const via = pressKey ? (keyLabel || "key") : "menu bar button";
  const active = { rows: await ev(rowsExpr), expected: await ev(expectExpr(false)) };
  let firstQuest = null;
  if (active.rows.length) {
    await ev(clickGui(`${MM}.MenuJournal.LB_ITEMS.children[0]`));
    await sleep(500);
    firstQuest = await ev(`(() => { const s = ${MM}.MenuJournal.selected; return s ? { name: s.getName(), text: s.getEntryText() } : null; })()`);
  }
  await ev(clickGui(`${MM}.MenuJournal.BTN_SWAPTEXT`));
  await sleep(800);
  const completed = { rows: await ev(rowsExpr), expected: await ev(expectExpr(true)) };
  await ev(clickGui(`${MM}.MenuJournal.BTN_SWAPTEXT`));
  await sleep(500);
  await ev(clickGui(`${MM}.MenuJournal.BTN_EXIT`));
  await sleep(1200);
  const closed = await ev(`!${MM}.MenuJournal.isVisible() && KotOR.GameState.Mode === 1`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok = opened && active.expected.length + completed.expected.length > 0 && same(active.rows, active.expected) && same(completed.rows, completed.expected)
    && (!active.rows.length || (!!firstQuest && !!firstQuest.text)) && closed;
  return { ok, via, opened, active, completed, firstQuest: firstQuest ? { name: firstQuest.name, hasText: !!firstQuest.text } : null, closed };
}
