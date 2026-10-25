#!/usr/bin/env node
/**
 * e2e-phase2.mjs: KOTOR III Phase 2 engine test (milestone M1) in the KotOR.js desktop app.
 *
 * One session on the stand-in game folder:
 *   1. lists the stand-in folder's root and the whole real game folder (read only) before the session;
 *   2. starts a real New Game through the menus (class, Quick Character, Play) into the mod's start area;
 *   3. checks KOTOR II's own arrival conversation does not start there (M1.5 switch-off);
 *   4. talks to Seren choosing every reply with real number-key presses (M1.3);
 *   5. checks the effect of a mod script compiled at build time by the in-tree compiler (M1.4);
 *   6. sets mod state (quest stage, journal entry, mod globals, Seren in the party), saves, changes it,
 *      loads the save and checks it all came back (M1.6), with the saves in the app's own storage (M1.1);
 *   7. after closing the app, lists both folders again: nothing may be added, removed or changed (M1.1).
 *
 * Usage: node scripts/kotor3/e2e-phase2.mjs --game-dir "<stand-in folder>" --out "<artifacts folder>"
 *          [--real-game-dir "<KOTOR II folder, only listed>"]
 * --out must be outside the repo (screenshots show game assets). Exit 0 only when every check passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, makeLog, sleep, listRoot, listTree, diffLists, launchKotor3, clickGui, inAreaExpr } from './e2e-lib.mjs';

const { arg } = parseArgs();
const GAME_DIR = arg('--game-dir');
const OUT = arg('--out');
const REAL_GAME_DIR = arg('--real-game-dir') || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Knights of the Old Republic II';
if (!GAME_DIR || !OUT) { console.error('need --game-dir and --out'); process.exit(2); }
const REPO = process.cwd();
if (path.resolve(OUT).toLowerCase().startsWith(REPO.toLowerCase())) { console.error('--out must be outside the repo'); process.exit(2); }
if (path.resolve(GAME_DIR).toLowerCase() === path.resolve(REAL_GAME_DIR).toLowerCase()) { console.error('tests never run on the real game folder; use the stand-in folder'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const AREA = '201tel';
const NPC_TAG = 'k3_seren';
const SEREN_SLOT = 4;       // party slot used by the test for Seren (the episode's own scripts pick theirs)
const SAVE_NAME = 'K3 M1 test';
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'mods/kotor3/manifest.json'), 'utf8'));
const probe = manifest.files.includes('k3_probe.ncs') ? { gold: 77 } : null;

const log = makeLog();
const { note } = log;
const checks = {};
const pass = (k, ok, detail) => { checks[k] = { pass: !!ok, detail }; note(`CHECK ${k}: ${ok ? 'PASS' : 'FAIL'} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

note(`listing before the session: stand-in root ${GAME_DIR}; real game folder ${REAL_GAME_DIR} (read only)`);
const standInBefore = listRoot(GAME_DIR);
const realBefore = listTree(REAL_GAME_DIR);
note(`  stand-in root: ${standInBefore.length} entries; real game folder: ${realBefore.length} entries`);

let app;
try {
  app = await launchKotor3({ repo: REPO, out: OUT, gameDir: GAME_DIR, log, screenshotTag: 'm1_' });
  const { ev, wait, screenshot, pressDigit, skipMovies, profileDir } = app;

  const modFiles = await wait(`window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length ? KotOR.ModManager.loadedFiles : false`, 'mod files to load', 180000);
  note(`mod loaded: ${modFiles.join(', ')}`);
  const storage = await ev(`KotOR.GameFileSystem.describeUserDataLocation()`);
  note(`app storage for saves: ${storage}; game folder read-only: ${await ev(`KotOR.GameFileSystem.gameFolderReadOnly`)}`);
  await wait(`KotOR.GameState.Mode === 0 && !!KotOR.GameState.MenuManager && !!KotOR.GameState.MenuManager.MainMenu`, 'main menu', 180000);
  await skipMovies();
  await wait(`!KotOR.GameState.VideoManager.isMoviePlaying() && !KotOR.GameState.VideoManager.movieQueue.length`, 'intro movies to end', 120000);
  await sleep(3000);
  await screenshot('main_menu');

  // ---- New Game through the menus, as a player would ----
  note('New Game: main menu -> class -> Quick Character -> Play');
  await ev(clickGui('KotOR.GameState.MenuManager.MainMenu.BTN_NEWGAME'));
  await wait(`KotOR.GameState.MenuManager.CharGenClass && KotOR.GameState.MenuManager.CharGenClass.isVisible()`, 'class selection', 60000);
  await sleep(1500);
  await ev(clickGui('KotOR.GameState.MenuManager.CharGenClass.BTN_SEL1'));
  await wait(`KotOR.GameState.MenuManager.CharGenQuickOrCustom && KotOR.GameState.MenuManager.CharGenQuickOrCustom.isVisible()`, 'quick or custom', 60000);
  await sleep(1000);
  await ev(clickGui('KotOR.GameState.MenuManager.CharGenQuickOrCustom.QUICK_CHAR_BTN'));
  await wait(`KotOR.GameState.MenuManager.CharGenQuickPanel && KotOR.GameState.MenuManager.CharGenQuickPanel.isVisible()`, 'quick character panel', 60000);
  await sleep(1000);
  await screenshot('quick_character');
  await ev(clickGui('KotOR.GameState.MenuManager.CharGenQuickPanel.BTN_STEPNAME3'));
  for (let i = 0; i < 200 && !(await ev(`(${inAreaExpr(AREA)}) || false`).catch(() => false)); i++) { await skipMovies(3); await sleep(1500); }
  await wait(inAreaExpr(AREA), `new game to load ${AREA}`, 10000, 1000);
  note(`new game started in ${await ev(`KotOR.GameState.module.area.name`)} (manifest startModule ${manifest.startModule})`);
  try { await ev(`KotOR.AudioEngine.Mute(), true`); } catch { /* audio optional */ }

  // ---- (e) the base game's arrival conversation must not start ----
  const seenConvs = new Set();
  for (let i = 0; i < 20; i++) {
    const c = await ev(`KotOR.CutsceneManager.active ? (KotOR.CutsceneManager.conversation_name || '?') : ''`).catch(() => '');
    if (c) seenConvs.add(c);
    await sleep(500);
  }
  const switchLog = await ev(`[...KotOR.ModSwitchOff.log.entries()]`);
  const triggerTags = await ev(`KotOR.GameState.module.area.triggers.map(t => (t.getTag() || '').toLowerCase())`);
  pass('e_no_arrival_conversation', seenConvs.size === 0 && switchLog.some(([k]) => k === 'triggers:201tel:201enter') && !triggerTags.includes('201enter'),
    { conversationsSeenIn10s: [...seenConvs], switchedOff: switchLog, areaTriggerTags: triggerTags.length });
  await screenshot('new_game_area');

  // ---- Seren, by number keys ----
  const npc = await wait(`(() => { const c = KotOR.GameState.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(NPC_TAG)});
    if (!c || !c.model) return false; const p = KotOR.GameState.PartyManager.party[0];
    return { name: c.getName(), x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), distanceToPlayer: p ? +c.position.distanceTo(p.position).toFixed(2) : null }; })()`, 'Seren in the area', 60000);
  note(`Seren in area: ${JSON.stringify(npc)}`);
  const goldBefore = await ev(`KotOR.GameState.PartyManager.Gold`);
  await ev(`(() => { const c = KotOR.GameState.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(NPC_TAG)});
    KotOR.CutsceneManager.startConversation(c.conversation, c, KotOR.GameState.PartyManager.party[0]); return true; })()`);
  const keyLog = [];
  let lastReplies = '', keysOk = true;
  const keys = [1, 1, 1, 1, 1];
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const st = await ev(`(() => { const m = KotOR.CutsceneManager; return { active: !!m.active, state: m.state,
      replies: m.currentEntry ? [] : (m.currentReplies || []).map(r => r.text) }; })()`);
    if (!st.active) break;
    const replyKey = st.replies.join('|');
    if (st.replies.length && replyKey !== lastReplies) {
      await sleep(400);
      const k = keys[keyLog.length] ?? 1;
      note(`  pressing number key ${k} for: ${st.replies[k - 1]}`);
      await pressDigit(k);
      let moved = false;
      for (let w = 0; w < 40; w++) {
        const now = await ev(`(() => { const m = KotOR.CutsceneManager; return !m.active || (m.currentReplies || []).map(r => r.text).join('|') !== ${JSON.stringify(replyKey)} || !!m.currentEntry; })()`);
        if (now) { moved = true; break; }
        await sleep(200);
      }
      keyLog.push({ key: k, reply: st.replies[k - 1], picked: moved });
      if (!moved) { keysOk = false; note('  the number key did not pick the reply'); break; }
      lastReplies = replyKey;
      continue;
    }
    await sleep(300);
  }
  if (await ev(`!!KotOR.CutsceneManager.active`)) await ev(`KotOR.CutsceneManager.endConversation(false), true`);
  pass('b_number_keys_pick_replies', keysOk && keyLog.length >= 4, keyLog);
  const goldAfter = await ev(`KotOR.GameState.PartyManager.Gold`);
  if (probe) {
    pass('d_compiled_script_effect', goldAfter - goldBefore === probe.gold, { goldBefore, goldAfter, expectedGain: probe.gold, script: 'k3_probe.ncs (compiled by build-mod from mods/kotor3/src/k3_probe.nss)' });
  } else {
    pass('d_compiled_script_effect', false, 'k3_probe.ncs is not in the manifest yet');
  }

  // ---- (f) mod state through a save and a load ----
  await ev(`(() => { const G = KotOR.GameState;
    G.JournalManager.AddJournalQuestEntry('k3_signal', 20);
    G.GlobalVariableManager.SetGlobalNumber('K3_SIGNAL_STAGE', 2);
    G.GlobalVariableManager.SetGlobalBoolean('K3_MET_SEREN', true);
    G.GlobalVariableManager.SetGlobalBoolean('K3_SEREN_JOINED', true);
    const c = G.module.area.creatures.find(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(NPC_TAG)});
    G.PartyManager.AddAvailableNPCByTemplate(${SEREN_SLOT}, 'k3_seren');
    G.PartyManager.AddCreatureToParty(${SEREN_SLOT}, c);
    return true; })()`);
  const stateOf = `(() => { const G = KotOR.GameState; return {
    quest: G.JournalManager.GetJournalEntryState('k3_signal'),
    journalText: (G.JournalManager.GeJournalEntryByTag('k3_signal') || { getEntryText(){ return ''; } }).getEntryText().slice(0, 40),
    stage: G.GlobalVariableManager.GetGlobalNumber('K3_SIGNAL_STAGE'),
    metSeren: G.GlobalVariableManager.GetGlobalBoolean('K3_MET_SEREN'),
    partyTags: G.PartyManager.party.map(p => (p.getTag() || '').toLowerCase()),
    serenInAreaCount: G.module.area.creatures.filter(c => (c.getTag() || '').toLowerCase() === ${JSON.stringify(NPC_TAG)}).length,
    gold: G.PartyManager.Gold, area: G.module.area.name }; })()`;
  const beforeSave = await ev(stateOf);
  note(`state before save: ${JSON.stringify(beforeSave)}`);
  await screenshot('seren_in_party');

  note(`saving "${SAVE_NAME}"`);
  await ev(`KotOR.SaveGame.SaveCurrentGame(${JSON.stringify(SAVE_NAME)}, 0).then(() => true)`);
  await wait(`KotOR.SaveGame.saves.some(s => s.SAVEGAMENAME === ${JSON.stringify(SAVE_NAME)})`, 'save to appear in the save list', 60000);
  const savesRoot = path.join(profileDir, 'game-data', 'kotor3', 'Saves');
  const saveDirs = fs.existsSync(savesRoot) ? fs.readdirSync(savesRoot) : [];
  const saveFiles = saveDirs.flatMap((d) => fs.readdirSync(path.join(savesRoot, d)).map((f) => `${d}/${f}`));
  pass('a2_saves_in_app_storage', saveFiles.some((f) => /SAVEGAME\.sav$/i.test(f)) && saveFiles.some((f) => /PARTYTABLE\.res$/i.test(f)) && saveFiles.some((f) => /GLOBALVARS\.res$/i.test(f)),
    { folder: savesRoot, files: saveFiles });

  // Change everything, then load the save.
  await ev(`(() => { const G = KotOR.GameState; G.JournalManager.RemoveJournalQuestEntry('k3_signal');
    G.GlobalVariableManager.SetGlobalNumber('K3_SIGNAL_STAGE', 9); G.GlobalVariableManager.SetGlobalBoolean('K3_MET_SEREN', false);
    G.PartyManager.AddGold(500); return true; })()`);
  note(`state changed after save: ${JSON.stringify(await ev(stateOf))}`);
  note('loading the save');
  await ev(`(() => { const s = KotOR.SaveGame.saves.find(s => s.SAVEGAMENAME === ${JSON.stringify(SAVE_NAME)}); s.load(); return true; })()`);
  await sleep(3000);
  for (let i = 0; i < 120 && !(await ev(`(${inAreaExpr(AREA)}) || false`).catch(() => false)); i++) { await skipMovies(3); await sleep(1000); }
  await wait(inAreaExpr(AREA), 'save to load', 10000, 1000);
  await sleep(5000);
  const afterLoad = await ev(stateOf);
  note(`party after load: ${JSON.stringify(await ev(`(() => { const P = KotOR.GameState.PartyManager; return { current: P.CurrentMembers, partyLen: P.party.length, party: P.party.map(p => p ? [p.getTag(), p.npcId, p.getPortraitResRef()] : null), portraitOrder: P.PortraitOrder, slot4: { available: P.NPCS[4].available, hasTemplate: !!P.NPCS[4].template } }; })()`))}`);
  note(`state after load: ${JSON.stringify(afterLoad)}`);
  const convAfterLoad = await ev(`KotOR.CutsceneManager.active ? KotOR.CutsceneManager.conversation_name : ''`);
  pass('f_mod_state_survives_save_load',
    afterLoad.quest === 20 && afterLoad.stage === 2 && afterLoad.metSeren === true && afterLoad.partyTags.includes(NPC_TAG) && afterLoad.serenInAreaCount === 0 && afterLoad.gold === beforeSave.gold && !!afterLoad.journalText && !convAfterLoad,
    { beforeSave, afterLoad, conversationAfterLoad: convAfterLoad });
  await screenshot('after_load');
} catch (e) {
  note(`ERROR: ${e.message}`);
  if (app) { try { await app.screenshot('error'); } catch { /* ignore */ } }
} finally {
  if (app) app.close();
  await sleep(3000);
  // ---- (a) nothing written to either folder ----
  const standInAfter = listRoot(GAME_DIR);
  const realAfter = listTree(REAL_GAME_DIR);
  const dStand = diffLists(standInBefore, standInAfter);
  const dReal = diffLists(realBefore, realAfter);
  pass('a1_no_write_to_stand_in_root', !dStand.added.length && !dStand.removed.length, dStand);
  pass('a1_no_write_to_real_game_folder', !dReal.added.length && !dReal.removed.length, { entries: realAfter.length, ...dReal });
  const expected = ['a1_no_write_to_stand_in_root', 'a1_no_write_to_real_game_folder', 'a2_saves_in_app_storage', 'b_number_keys_pick_replies', 'd_compiled_script_effect', 'e_no_arrival_conversation', 'f_mod_state_survives_save_load'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  fs.writeFileSync(path.join(OUT, 'e2e-phase2-result.json'), JSON.stringify({ passed, checks }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-phase2-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-phase2-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
