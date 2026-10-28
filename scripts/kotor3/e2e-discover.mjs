#!/usr/bin/env node
/**
 * e2e-discover.mjs: design helper for the KOTOR III episode. Loads each named KOTOR II area from the
 * player's own game (stand-in folder) and records, as identifiers and numbers only: the player's entry
 * point, walkable spots around it, which base-game conversations start and which triggers fire on entry,
 * the area's entry scripts, and its doors. Nothing from the game is written anywhere.
 *
 * Usage: node scripts/kotor3/e2e-discover.mjs --game-dir "<stand-in folder>" --out "<artifacts folder>" --areas 201tel,301nar
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, makeLog, sleep, launchKotor3, inAreaExpr } from './e2e-lib.mjs';

const { arg } = parseArgs();
const GAME_DIR = arg('--game-dir'), OUT = arg('--out');
const AREAS = (arg('--areas') || '201tel').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
if (!GAME_DIR || !OUT) { console.error('need --game-dir and --out'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const log = makeLog();
const { note } = log;
const report = {};
let app;
try {
  app = await launchKotor3({ repo: REPO, out: OUT, gameDir: GAME_DIR, log, screenshotTag: 'disc_' });
  const { ev, wait, skipMovies, screenshot } = app;
  await wait(`window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length`, 'mod', 180000);
  await wait(`KotOR.GameState.Mode === 0 && !!KotOR.GameState.MenuManager`, 'GUI', 180000);
  await skipMovies();
  if (arg('--appearance')) {
    // Row numbers and labels only, to pick body models by reference for new characters.
    const re = arg('--appearance');
    report.appearance = await ev(`(() => { const t = KotOR.TwoDAManager.datatables.get('appearance'); const re = new RegExp(${JSON.stringify(re)}, 'i');
      return Object.keys(t.rows).map(k => ({ row: +k, label: t.rows[k].label, model: t.rows[k].modeltype, race: t.rows[k].race })).filter(r => re.test(r.label || '')); })()`);
    note(`appearance rows matching ${re}: ${report.appearance.length}`);
  }
  for (const area of AREAS) {
    note(`loading ${area}`);
    const consoleStart = log.consoleLines.length;
    await ev(`KotOR.GameState.LoadModule(${JSON.stringify(area)}), true`);
    for (let i = 0; i < 200 && !(await ev(`(${inAreaExpr(area)}) || false`).catch(() => false)); i++) { await skipMovies(3); await sleep(1500); }
    await wait(inAreaExpr(area), `${area} to load`, 10000, 1000);
    const convs = new Set();
    for (let i = 0; i < 16; i++) { const c = await ev(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`).catch(() => ''); if (c) convs.add(c); await sleep(500); }
    if (await ev(`!!KotOR.CutsceneManager.active`)) await ev(`KotOR.CutsceneManager.endConversation(true), true`);
    await sleep(1000);
    const info = await ev(`(() => {
      const G = KotOR.GameState, A = G.module.area, p = G.PartyManager.party[0];
      const pos = p.position.clone();
      const ring = [];
      for (const r of [3, 5, 8]) for (let k = 0; k < 8; k++) {
        const t = k * Math.PI / 4; const v = pos.clone(); v.x += Math.cos(t) * r; v.y += Math.sin(t) * r;
        const ok = A.isPointWalkable(v); let z = null;
        if (ok) { const n = A.getNearestWalkablePoint(v); z = n ? +n.z.toFixed(2) : null; }
        ring.push({ r, deg: k * 45, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z, walkable: !!ok });
      }
      const sc = (o) => { try { return Object.fromEntries(Object.entries(o.scripts || {}).filter(([k, v]) => v && (v.name || typeof v === 'string')).map(([k, v]) => [k, v.name || v])); } catch { return {}; } };
      return {
        area: A.name, player: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), facing: +(p.getFacing ? p.getFacing() : 0).toFixed(2) },
        moduleScripts: sc(G.module), areaScripts: sc(A),
        triggers: A.triggers.map(t => ({ tag: t.getTag(), template: t.getTemplateResRef ? t.getTemplateResRef() : '', onEnter: t.scripts && t.scripts.onEnter ? (t.scripts.onEnter.name || '') : '' })),
        doors: A.doors.map(d => ({ tag: d.getTag(), linkedTo: d.linkedTo || '', linkedToModule: d.linkedToModule || '', x: +d.position.x.toFixed(2), y: +d.position.y.toFixed(2) })),
        creatures: A.creatures.length, creatureTags: [...new Set(A.creatures.map(c => c.getTag()))].slice(0, 60),
        ring };
    })()`);
    info.conversationsOnEntry = [...convs];
    info.triggersFired = log.consoleLines.slice(consoleStart).filter((l) => l.includes('ModuleTrigger.onEnter')).map((l) => l.replace(/^\[log\] /, ''));
    report[area] = info;
    note(`${area}: player ${JSON.stringify(info.player)}; conversations on entry ${JSON.stringify(info.conversationsOnEntry)}; walkable ring points ${info.ring.filter((r) => r.walkable).length}/24; doors ${info.doors.length}`);
    await screenshot(`${area}`);
  }
} catch (e) {
  note(`ERROR: ${e.message}`);
} finally {
  if (app) app.close();
  fs.writeFileSync(path.join(OUT, 'discover.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'discover-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'discover-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(0);
}
