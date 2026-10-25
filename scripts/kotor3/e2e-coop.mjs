#!/usr/bin/env node
/**
 * e2e-coop.mjs: KOTOR III co-op spike test (Phase 2, M3). Two KotOR.js desktop-app windows on this PC,
 * both on the stand-in game folder, both in KOTOR II's Citadel Station docks (201tel). A local signaling
 * relay (scripts/kotor3/coop-signal.mjs, 127.0.0.1) sets up a WebRTC data channel; each window then
 * sends its player's position, facing and animation about 10 times a second and shows the other player.
 * The test moves each player in turn and checks the other window saw it, logging updates both ways, and
 * checks that nothing but position updates crossed the link.
 *
 * Usage: node scripts/kotor3/e2e-coop.mjs --game-dir "<stand-in folder>" --out "<artifacts folder>"
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, makeLog, sleep, launchKotor3, inAreaExpr } from './e2e-lib.mjs';

const { arg } = parseArgs();
const GAME_DIR = arg('--game-dir'), OUT = arg('--out');
const SIGNAL_PORT = parseInt(arg('--signal-port') || '8765', 10);
if (!GAME_DIR || !OUT) { console.error('need --game-dir and --out'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const AREA = '201tel';
// Electron hides local addresses behind mDNS names by default; two windows on one PC connect directly without it.
const ELECTRON_FLAGS = process.argv.includes('--keep-mdns') ? [] : ['--disable-features=WebRtcHideLocalIpsWithMdns'];

const log = makeLog();
const { note } = log;
const checks = {};
const pass = (k, ok, detail) => { checks[k] = { pass: !!ok, detail }; note(`CHECK ${k}: ${ok ? 'PASS' : 'FAIL'} - ${JSON.stringify(detail)}`); };
const md = ['# Co-op spike test log', '', `Run: ${new Date().toISOString()}. Two KotOR.js desktop-app windows on one PC, stand-in game folder, area \`${AREA}\`. Signaling relay on ws://127.0.0.1:${SIGNAL_PORT} (\`scripts/kotor3/coop-signal.mjs\`).`, ''];

const signalLog = path.join(OUT, 'signal.log');
if (fs.existsSync(signalLog)) fs.unlinkSync(signalLog);
const signal = spawn(process.execPath, ['scripts/kotor3/coop-signal.mjs', '--port', String(SIGNAL_PORT), '--log', signalLog], { cwd: REPO, stdio: 'ignore' });
let A, B;
try {
  await sleep(800);
  const outA = path.join(OUT, 'window_a'), outB = path.join(OUT, 'window_b');
  fs.mkdirSync(outA, { recursive: true }); fs.mkdirSync(outB, { recursive: true });
  A = await launchKotor3({ repo: REPO, out: outA, gameDir: GAME_DIR, log, port: 9223, screenshotTag: 'A_', extraArgs: ELECTRON_FLAGS });
  B = await launchKotor3({ repo: REPO, out: outB, gameDir: GAME_DIR, log, port: 9243, screenshotTag: 'B_', extraArgs: ELECTRON_FLAGS });
  for (const [name, w] of [['A', A], ['B', B]]) {
    await w.wait(`window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length`, `${name} mod`, 180000);
    await w.wait(`KotOR.GameState.Mode === 0 && !!KotOR.GameState.MenuManager`, `${name} GUI`, 180000);
    await w.skipMovies();
    await w.ev(`KotOR.GameState.LoadModule(${JSON.stringify(AREA)}), true`);
  }
  for (const [name, w] of [['A', A], ['B', B]]) {
    for (let i = 0; i < 200 && !(await w.ev(`(${inAreaExpr(AREA)}) || false`).catch(() => false)); i++) { await w.skipMovies(3); await sleep(1500); }
    await w.wait(inAreaExpr(AREA), `${name} in ${AREA}`, 10000, 1000);
    await sleep(2000);
    await w.ev(`KotOR.CutsceneManager.active ? (KotOR.CutsceneManager.endConversation(true), true) : true`);
    try { await w.ev(`KotOR.AudioEngine.Mute(), true`); } catch { /* optional */ }
    note(`window ${name} in ${AREA}; player at ${JSON.stringify(await w.ev(`(() => { const p = KotOR.GameState.PartyManager.party[0].position; return [+p.x.toFixed(2), +p.y.toFixed(2)]; })()`))}`);
  }
  md.push('## Setup', '', `Both windows started KOTOR III and loaded \`${AREA}\` from the player's own KOTOR II files.`, '');

  await A.ev(`KotOR.CoopSession.start({ role: 'host', port: ${SIGNAL_PORT} }).then(() => true)`);
  await B.ev(`KotOR.CoopSession.start({ role: 'guest', port: ${SIGNAL_PORT} }).then(() => true)`);
  await A.wait(`KotOR.CoopSession.stats.open`, 'A data channel', 30000, 300);
  await B.wait(`KotOR.CoopSession.stats.open`, 'B data channel', 30000, 300);
  await A.wait(`KotOR.CoopSession.stats.received > 10 && !!KotOR.CoopSession.remote`, 'A to see B', 30000, 300);
  await B.wait(`KotOR.CoopSession.stats.received > 10 && !!KotOR.CoopSession.remote`, 'B to see A', 30000, 300);
  md.push('## Connection', '', `Host (window A) and guest (window B) exchanged offer, answer and ICE candidates through the relay; the data channel opened in both windows, and each window spawned the other player as \`k3_coop_peer\` (KOTOR II appearance row by reference).`, '');

  /** Moves one window's player along a line and checks the other window's copy follows. */
  const moveAndWatch = async (mover, moverName, watcher, watcherName, dx, dy) => {
    const start = await mover.ev(`(() => { const p = KotOR.GameState.PartyManager.party[0].position; return { x: p.x, y: p.y, z: p.z }; })()`);
    md.push(`## ${moverName} moves, ${watcherName} watches`, '');
    const samples = [];
    for (let i = 1; i <= 15; i++) {
      await mover.ev(`(() => { const p = KotOR.GameState.PartyManager.party[0]; p.position.set(${start.x} + ${dx} * ${i} / 15, ${start.y} + ${dy} * ${i} / 15, ${start.z}); p.setFacing(Math.atan2(${dy}, ${dx}), true); return true; })()`);
      await sleep(200);
      const seen = await watcher.ev(`(() => { const r = KotOR.CoopSession.remote; return r ? [+r.position.x.toFixed(2), +r.position.y.toFixed(2)] : null; })()`);
      samples.push(seen);
      if (i % 5 === 0) md.push(`- step ${i}: ${moverName} at (${(start.x + dx * i / 15).toFixed(2)}, ${(start.y + dy * i / 15).toFixed(2)}); ${watcherName} shows it at (${seen ? seen.join(', ') : 'none'})`);
    }
    await sleep(600);
    const target = { x: start.x + dx, y: start.y + dy };
    const seen = await watcher.ev(`(() => { const r = KotOR.CoopSession.remote; return r ? { x: r.position.x, y: r.position.y } : null; })()`);
    const err = seen ? Math.hypot(seen.x - target.x, seen.y - target.y) : null;
    const distinct = new Set(samples.filter(Boolean).map((s) => s.join(','))).size;
    md.push('', `${watcherName}'s copy ended ${err === null ? 'missing' : err.toFixed(2) + ' m'} from where ${moverName} stopped; ${distinct} distinct positions seen during the move.`, '');
    return { err, distinct, samples: samples.length };
  };
  const ab = await moveAndWatch(A, 'Window A (host)', B, 'window B', 3, 0);
  const ba = await moveAndWatch(B, 'Window B (guest)', A, 'window A', 0, 3);
  /** Holds W in one window (a real key press: the player walks and animates) and records what the other window shows. */
  const walkAndWatch = async (mover, moverName, watcher, watcherName) => {
    const before = await watcher.ev(`(() => { const r = KotOR.CoopSession.remote; return { x: r.position.x, y: r.position.y, anims: [...KotOR.CoopSession.stats.anims] }; })()`);
    await mover.game.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
    const seenAnims = new Set();
    for (let i = 0; i < 12; i++) { await sleep(200); seenAnims.add(await watcher.ev(`KotOR.CoopSession.lastAnim ?? (KotOR.CoopSession.stats.lastReceived || {}).a`)); }
    await mover.game.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
    await sleep(1000);
    const after = await watcher.ev(`(() => { const r = KotOR.CoopSession.remote; return { x: r.position.x, y: r.position.y, anims: [...KotOR.CoopSession.stats.anims] }; })()`);
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    md.push(`## ${moverName} walks (W key held 2.4 s), ${watcherName} watches`, '', `${watcherName}'s copy moved ${moved.toFixed(2)} m; animation states received during the walk: ${[...seenAnims].join(', ')}; all animation states received so far: ${after.anims.join(', ')}.`, '');
    return { moved: +moved.toFixed(2), animsDuringWalk: [...seenAnims], allAnims: after.anims };
  };
  const wab = await walkAndWatch(A, 'Window A (host)', B, 'window B');
  const wba = await walkAndWatch(B, 'Window B (guest)', A, 'window A');
  pass('b_sees_a_walk_and_animate', wab.moved > 0.5 && wab.allAnims.length >= 2, wab);
  pass('a_sees_b_walk_and_animate', wba.moved > 0.5 && wba.allAnims.length >= 2, wba);
  pass('b_sees_a_move', ab.err !== null && ab.err < 0.5 && ab.distinct >= 5, ab);
  pass('a_sees_b_move', ba.err !== null && ba.err < 0.5 && ba.distinct >= 5, ba);
  await A.screenshot('a_sees_b'); await B.screenshot('b_sees_a');

  const sa = await A.ev(`(() => { const s = KotOR.CoopSession.stats; return { sent: s.sent, received: s.received, bad: s.badMessages, keys: s.keys, lastSent: s.lastSent, lastReceived: s.lastReceived, events: s.events }; })()`);
  const sb = await B.ev(`(() => { const s = KotOR.CoopSession.stats; return { sent: s.sent, received: s.received, bad: s.badMessages, keys: s.keys, lastSent: s.lastSent, lastReceived: s.lastReceived, events: s.events }; })()`);
  pass('updates_logged_both_ways', sa.sent > 30 && sa.received > 30 && sb.sent > 30 && sb.received > 30, { A: { sent: sa.sent, received: sa.received }, B: { sent: sb.sent, received: sb.received } });
  pass('only_positions_and_actions', sa.bad === 0 && sb.bad === 0 && [...sa.keys, ...sb.keys].every((k) => k === 'a,f,k,s,x,y,z'), { A: { bad: sa.bad, keys: sa.keys }, B: { bad: sb.bad, keys: sb.keys } });
  md.push('## Messages', '', `Window A sent ${sa.sent} and received ${sa.received} updates; window B sent ${sb.sent} and received ${sb.received}. Every message had exactly the fields k, s, x, y, z, f, a (bad messages: A ${sa.bad}, B ${sb.bad}).`, '',
    `Example update A to B: \`${JSON.stringify(sa.lastSent)}\``, '', `Example update B to A: \`${JSON.stringify(sb.lastSent)}\``, '',
    'Window A events:', ...sa.events.map((e) => `- ${e}`), '', 'Window B events:', ...sb.events.map((e) => `- ${e}`), '');
} catch (e) {
  note(`ERROR: ${e.message}`);
  md.push('', `**Error:** ${e.message}`, '');
} finally {
  try { await A?.ev('KotOR.CoopSession.stop(), true'); } catch { /* ignore */ }
  try { await B?.ev('KotOR.CoopSession.stop(), true'); } catch { /* ignore */ }
  A?.close(); B?.close();
  await sleep(1500);
  signal.kill();
  const sig = fs.existsSync(signalLog) ? fs.readFileSync(signalLog, 'utf8').trim().split('\n') : [];
  md.push('## Signaling relay log', '', ...sig.map((l) => `- ${l.replace(/^\S+ /, '')}`), '');
  const expected = ['b_sees_a_move', 'a_sees_b_move', 'b_sees_a_walk_and_animate', 'a_sees_b_walk_and_animate', 'updates_logged_both_ways', 'only_positions_and_actions'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  md.push('## Checks', '', '| Check | Result |', '|---|---|', ...expected.map((k) => `| ${k} | ${checks[k]?.pass ? 'PASS' : 'FAIL'} |`), '', `RESULT: ${passed ? 'PASS' : 'FAIL'}`, '');
  fs.writeFileSync(path.join(OUT, 'COOP_TEST_LOG.md'), md.join('\n'));
  fs.writeFileSync(path.join(OUT, 'e2e-coop-result.json'), JSON.stringify({ passed, checks }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-coop-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-coop-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
