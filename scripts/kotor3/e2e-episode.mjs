#!/usr/bin/env node
/**
 * e2e-episode.mjs: plays KOTOR III Episode 1 ("The Last Signal", docs/EPISODE1.md) from New Game to the
 * end in the KotOR.js desktop app, on the stand-in game folder, choosing every reply with a real "1"
 * key press (the main path, by design). In the middle it saves, changes the mod state, loads the save and
 * checks quest stages, journal and party came back. It also checks that no base-game conversation starts,
 * and, after the session, that neither the stand-in folder's root nor the real game folder changed.
 *
 * Usage: node scripts/kotor3/e2e-episode.mjs --game-dir "<stand-in folder>" --out "<artifacts folder>"
 *          [--real-game-dir "<KOTOR II folder, only listed>"]
 * Writes e2e-episode-result.json, e2e-episode-steps.log, e2e-episode-console.log and TEST_LOG_PHASE2.md
 * (a step log with the mod's own dialogue text and no game assets) to --out. Exit 0 only on PASS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, makeLog, sleep, listRoot, listTree, diffLists, launchKotor3, clickGui, inAreaExpr, creatureCountsExpr, countDiff } from './e2e-lib.mjs';

const { arg } = parseArgs();
const GAME_DIR = arg('--game-dir');
const OUT = arg('--out');
const REAL_GAME_DIR = arg('--real-game-dir') || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Knights of the Old Republic II';
if (!GAME_DIR || !OUT) { console.error('need --game-dir and --out'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
if (path.resolve(GAME_DIR).toLowerCase() === path.resolve(REAL_GAME_DIR).toLowerCase()) { console.error('tests never run on the real game folder'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const SRC = path.join(REPO, 'mods/kotor3/src');
const dialogues = Object.fromEntries(fs.readdirSync(SRC).filter((f) => f.endsWith('.dialogue.json'))
  .map((f) => { const d = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); return [d.resref, d]; }));
const nodeId = (dlg, text, kind) => {
  const d = dialogues[dlg]; if (!d) return '?';
  const list = kind === 'entry' ? d.entries : d.replies;
  return (list.find((n) => n.text.trim() === String(text || '').trim()) || {}).id || '?';
};
const SAVE_NAME = 'K3 Episode mid';

const log = makeLog();
const { note } = log;
const checks = {};
const pass = (k, ok, detail) => { checks[k] = { pass: !!ok, detail }; note(`CHECK ${k}: ${ok ? 'PASS' : 'FAIL'} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const md = ['# Test log, Phase 2: Episode 1 automated playthrough', '', `Run: ${new Date().toISOString()} on the stand-in game folder (\`${GAME_DIR}\`), KotOR.js desktop app (Electron). Every reply was chosen with a real "1" key press. Screenshots stay outside the repo (they show game assets).`, ''];
const conversationsSeen = [];
const visited = {};

note(`listing before the session (real game folder read only)`);
const standInBefore = listRoot(GAME_DIR);
const realBefore = listTree(REAL_GAME_DIR);

let app;
try {
  app = await launchKotor3({ repo: REPO, out: OUT, gameDir: GAME_DIR, log, screenshotTag: 'ep_' });
  const { ev, wait, screenshot, pressDigit, skipMovies, profileDir } = app;
  const G = 'KotOR.GameState';
  const state = () => ev(`(() => { const G = ${G}; const q = (t) => G.JournalManager.GetJournalEntryState(t);
    return { area: G.module && G.module.area ? G.module.area.name : '', signal: q('k3_signal'), navigator: q('k3_navigator'), ship: q('k3_ship'),
      party: G.PartyManager.party.filter(Boolean).map(p => (p.getTag() || 'player').toLowerCase()), gold: G.PartyManager.Gold }; })()`);
  const waitArea = async (area, what) => {
    for (let i = 0; i < 200 && !(await ev(`(${inAreaExpr(area)}) || false`).catch(() => false)); i++) { await skipMovies(3); await sleep(1500); }
    await wait(inAreaExpr(area), what, 10000, 1000);
  };

  /** Plays the active conversation to its end, pressing 1 at every choice. */
  const playActive = async (label) => {
    const name = await ev(`KotOR.CutsceneManager.conversation_name`);
    conversationsSeen.push(name);
    visited[name] = visited[name] || new Set();
    md.push(`## ${label} (\`${name}\`)`, '');
    let lastEntry = '', lastReplies = '', steps = 0;
    const end = Date.now() + 180000;
    while (Date.now() < end) {
      const st = await ev(`(() => { const m = KotOR.CutsceneManager; return { active: !!m.active, name: m.conversation_name,
        entry: m.currentEntry ? m.currentEntry.text : null, spoken: m.lastSpokenString || '',
        replies: m.currentEntry ? [] : (m.currentReplies || []).map(r => r.text) }; })()`);
      if (!st.active || st.name !== name) break;
      const line = st.entry || st.spoken;
      if (line && line !== lastEntry) {
        lastEntry = line; const id = nodeId(name, line, 'entry'); visited[name].add(id);
        md.push(`- ${id} (line): ${line}`); note(`  [${name} ${id}] ${line.slice(0, 90)}`); steps++;
      }
      const replyKey = st.replies.join('|');
      if (st.replies.length && replyKey !== lastReplies) {
        await sleep(300);
        const chosen = st.replies[0]; const id = nodeId(name, chosen, 'reply'); visited[name].add(id);
        await pressDigit(1);
        md.push(`- ${id} (key 1 of ${st.replies.length}): ${chosen}`); note(`  [${name} ${id}] key 1: ${chosen.slice(0, 80)}`); steps++;
        lastReplies = replyKey;
        let moved = false;
        for (let w = 0; w < 50; w++) {
          if (await ev(`(() => { const m = KotOR.CutsceneManager; return !m.active || (m.currentReplies || []).map(r => r.text).join('|') !== ${JSON.stringify(replyKey)} || !!m.currentEntry; })()`)) { moved = true; break; }
          await sleep(200);
        }
        if (!moved) throw new Error(`key 1 did not pick a reply in ${name}`);
        continue;
      }
      await sleep(250);
    }
    if (await ev(`!!KotOR.CutsceneManager.active && KotOR.CutsceneManager.conversation_name === ${JSON.stringify(name)}`)) throw new Error(`conversation ${name} did not end`);
    const s = await state();
    md.push('', `State after: quests The Last Signal ${s.signal}, A Navigator ${s.navigator}, A Ship ${s.ship}; party: ${s.party.join(', ')}.`, '');
    note(`  ${name} ended after ${steps} steps; state ${JSON.stringify(s)}`);
    await sleep(800);
    return s;
  };
  /** Clicks a mod character to talk (what a mouse click on it does) and plays the conversation. */
  const talkTo = async (tag, label) => {
    await wait(`!KotOR.CutsceneManager.active && KotOR.GameState.Mode === 1`, `in-game before ${tag}`, 30000);
    const ok = await ev(`(() => { const G = ${G}; const c = G.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(tag)});
      if (!c) return false; KotOR.CutsceneManager.startConversation(c.conversation, c, G.PartyManager.party[0]); return true; })()`);
    if (!ok) throw new Error(`${tag} is not in the area`);
    await wait(`KotOR.CutsceneManager.active`, `${tag} conversation to start`, 15000, 200);
    return playActive(label);
  };
  /** Waits for a conversation a mod script starts by itself, and plays it. */
  const followAuto = async (name, label, timeoutMs = 30000) => {
    const started = await wait(`KotOR.CutsceneManager.active && KotOR.CutsceneManager.conversation_name === ${JSON.stringify(name)}`, `${name} to start by itself`, timeoutMs, 300).catch(() => false);
    pass(`auto_start_${name}`, !!started, started ? `${name} started by a mod script` : `${name} did not start`);
    if (!started) return null;
    return playActive(label);
  };

  await wait(`window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length`, 'mod files', 180000);
  note(`mod files: ${(await ev(`KotOR.ModManager.loadedFiles`)).length}`);
  await wait(`KotOR.GameState.Mode === 0 && !!KotOR.GameState.MenuManager && !!KotOR.GameState.MenuManager.MainMenu`, 'main menu', 180000);
  await skipMovies();
  await wait(`!KotOR.GameState.VideoManager.isMoviePlaying() && !KotOR.GameState.VideoManager.movieQueue.length`, 'intro movies', 120000);
  await sleep(3000);

  // New Game through the menus.
  note('New Game: main menu -> class -> Quick Character -> Play');
  await ev(clickGui('KotOR.GameState.MenuManager.MainMenu.BTN_NEWGAME'));
  await wait(`KotOR.GameState.MenuManager.CharGenClass && KotOR.GameState.MenuManager.CharGenClass.isVisible()`, 'class selection', 60000);
  await sleep(1500);
  await ev(clickGui('KotOR.GameState.MenuManager.CharGenClass.BTN_SEL1'));
  await wait(`KotOR.GameState.MenuManager.CharGenQuickOrCustom && KotOR.GameState.MenuManager.CharGenQuickOrCustom.isVisible()`, 'quick or custom', 60000);
  await sleep(1000);
  await ev(clickGui('KotOR.GameState.MenuManager.CharGenQuickOrCustom.QUICK_CHAR_BTN'));
  await wait(`KotOR.GameState.MenuManager.CharGenQuickPanel && KotOR.GameState.MenuManager.CharGenQuickPanel.isVisible()`, 'quick panel', 60000);
  await sleep(1000);
  await ev(clickGui('KotOR.GameState.MenuManager.CharGenQuickPanel.BTN_STEPNAME3'));
  await waitArea('201tel', 'new game in 201tel');
  try { await ev(`KotOR.AudioEngine.Mute(), true`); } catch { /* optional */ }
  md.push('## New Game', '', 'Main menu, New Game, first class, Quick Character, Play: the game starts on the Citadel Station docks (`201tel`).', '');
  await sleep(4000);
  const earlyConv = await ev(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`);
  if (earlyConv) conversationsSeen.push(earlyConv);
  await screenshot('201tel_start');

  // Prologue.
  await talkTo('k3_seren', 'Prologue 1: Seren Vaux');
  await talkTo('k3_brannick', 'Prologue 2: Brannick');
  await talkTo('k3_senn', 'Prologue 3: Lieutenant Senn');
  await waitArea('301nar', 'travel to Nar Shaddaa');
  md.push('## Travel', '', 'Lieutenant Senn\'s last line ran `k3_go_nar`: the game moved to Nar Shaddaa (`301nar`).', '');
  await screenshot('301nar_arrival');
  await followAuto('k3_sv_nar', 'Act I 1: Seren on arrival (started by the mod\'s area-enter script)');
  await talkTo('k3_kiri', 'Act I 2: Kiri');
  await talkTo('k3_zell', 'Act I 3: Zell Okkar');
  await talkTo('k3_rhea', 'Act I 4: Rhea Vex');
  await screenshot('rhea_joined');

  // Save, change, load.
  const beforeSave = await state();
  const countsBeforeSave = await ev(creatureCountsExpr);
  const journalBefore = await ev(`${G}.JournalManager.Entries.filter(e => e.plot_id.startsWith('k3_')).map(e => [e.plot_id, e.state, e.getEntryText().slice(0, 30)])`);
  note(`saving "${SAVE_NAME}": ${JSON.stringify(beforeSave)}`);
  await ev(`KotOR.SaveGame.SaveCurrentGame(${JSON.stringify(SAVE_NAME)}, 0).then(() => true)`);
  await wait(`KotOR.SaveGame.saves.some(s => s.SAVEGAMENAME === ${JSON.stringify(SAVE_NAME)})`, 'save in list', 60000);
  await ev(`(() => { const G = ${G}; ['k3_signal','k3_navigator','k3_ship'].forEach(t => G.JournalManager.RemoveJournalQuestEntry(t));
    G.GlobalVariableManager.SetGlobalBoolean('K3_RHEA_JOINED', false); return true; })()`);
  note(`changed after save: ${JSON.stringify(await state())}`);
  await ev(`(() => { KotOR.SaveGame.saves.find(s => s.SAVEGAMENAME === ${JSON.stringify(SAVE_NAME)}).load(); return true; })()`);
  await sleep(3000);
  await waitArea('301nar', 'save to load');
  await sleep(5000);
  const afterLoad = await state();
  const countsAfterLoad = await ev(creatureCountsExpr);
  const doubled = countDiff(countsBeforeSave, countsAfterLoad);
  pass('no_doubled_characters_after_load', !doubled.length, { differences: doubled, modCharactersAfterLoad: Object.fromEntries(Object.entries(countsAfterLoad).filter(([t]) => t.startsWith('k3_'))) });
  const journalAfter = await ev(`${G}.JournalManager.Entries.filter(e => e.plot_id.startsWith('k3_')).map(e => [e.plot_id, e.state, e.getEntryText().slice(0, 30)])`);
  const dupRhea = await ev(`${G}.module.area.creatures.filter(c => (c.getTag() || '').toLowerCase() === 'k3_rhea').length`);
  const convAfterLoad = await ev(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`);
  pass('save_load_mid_episode', afterLoad.signal === beforeSave.signal && afterLoad.navigator === beforeSave.navigator && afterLoad.ship === beforeSave.ship
    && afterLoad.party.includes('k3_seren') && afterLoad.party.includes('k3_rhea') && dupRhea === 0 && JSON.stringify(journalAfter) === JSON.stringify(journalBefore) && !convAfterLoad,
    { beforeSave, afterLoad, journalBefore, journalAfter, rheaAlsoInArea: dupRhea, conversationAfterLoad: convAfterLoad });
  md.push('## Save and load (middle of the episode)', '', `Saved as "${SAVE_NAME}" in the app's own storage, then removed the three quests and cleared a mod global, then loaded the save.`, '',
    `Before save: The Last Signal ${beforeSave.signal}, A Navigator ${beforeSave.navigator}, A Ship ${beforeSave.ship}; party ${beforeSave.party.join(', ')}.`,
    `After load: The Last Signal ${afterLoad.signal}, A Navigator ${afterLoad.navigator}, A Ship ${afterLoad.ship}; party ${afterLoad.party.join(', ')}; journal entries equal: ${JSON.stringify(journalAfter) === JSON.stringify(journalBefore)}.`, '');
  const saveDir = path.join(profileDir, 'game-data', 'kotor3', 'Saves');
  md.push(`Save folder: \`${saveDir}\` (${fs.existsSync(saveDir) ? fs.readdirSync(saveDir).join(', ') : 'missing'}).`, '');

  // Act I continues.
  await talkTo('k3_hesk', 'Act I 5: Hesk Varo (first visit)');
  await talkTo('k3_corva', 'Act I 6: Corva');
  await talkTo('k3_hesk', 'Act I 7: Hesk Varo (ship ready)');
  await followAuto('k3_end', 'Act I 8: the crew boards the Far Lantern (started by k3_ship_done)');
  await screenshot('episode_end');

  const fin = await state();
  const done = await ev(`${G}.GlobalVariableManager.GetGlobalBoolean('K3_EPISODE_DONE')`);
  pass('quests_completed', fin.signal === 50 && fin.navigator === 30 && fin.ship === 30, fin);
  pass('companions_joined', fin.party.includes('k3_seren') && fin.party.includes('k3_rhea'), fin.party);
  pass('episode_end_reached', !!done, { K3_EPISODE_DONE: done });
  const files = Object.keys(dialogues);
  pass('every_conversation_played', files.every((f) => conversationsSeen.includes(f)), { played: [...new Set(conversationsSeen)], files });
  pass('no_base_game_conversation', conversationsSeen.every((c) => String(c).toLowerCase().startsWith('k3_')), { seen: conversationsSeen });
} catch (e) {
  note(`ERROR: ${e.message}`);
  md.push('', `**Error:** ${e.message}`, '');
  if (app) { try { await app.screenshot('error'); } catch { /* ignore */ } }
} finally {
  if (app) app.close();
  await sleep(3000);
  const dStand = diffLists(standInBefore, listRoot(GAME_DIR));
  const realAfter = listTree(REAL_GAME_DIR);
  const dReal = diffLists(realBefore, realAfter);
  pass('no_write_stand_in_root', !dStand.added.length && !dStand.removed.length, dStand);
  pass('no_write_real_game_folder', !dReal.added.length && !dReal.removed.length, { entries: realAfter.length, ...dReal });
  const expected = ['auto_start_k3_sv_nar', 'auto_start_k3_end', 'save_load_mid_episode', 'no_doubled_characters_after_load', 'quests_completed', 'companions_joined', 'episode_end_reached', 'every_conversation_played', 'no_base_game_conversation', 'no_write_stand_in_root', 'no_write_real_game_folder'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  md.push('## Checks', '', '| Check | Result |', '|---|---|', ...expected.map((k) => `| ${k} | ${checks[k]?.pass ? 'PASS' : 'FAIL'} |`), '',
    `Nodes visited per conversation: ${Object.entries(visited).map(([k, v]) => `${k} ${v.size}`).join('; ')}.`, '', `RESULT: ${passed ? 'PASS' : 'FAIL'}`, '');
  fs.writeFileSync(path.join(OUT, 'TEST_LOG_PHASE2.md'), md.join('\n'));
  fs.writeFileSync(path.join(OUT, 'e2e-episode-result.json'), JSON.stringify({ passed, checks, visited: Object.fromEntries(Object.entries(visited).map(([k, v]) => [k, [...v]])) }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-episode-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-episode-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
