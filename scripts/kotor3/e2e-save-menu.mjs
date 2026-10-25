#!/usr/bin/env node
/**
 * e2e-save-menu.mjs: KOTOR III Phase 2 test of the KOTOR II save and load menus in the KotOR.js desktop app.
 *
 * Saves only through the menus, the way a player does (FEASIBILITY finding 23: the save name box used to
 * stay open and nothing was saved):
 *   1. New Game through the menus into the mod's start area;
 *   2. in-game Options -> Save Game -> the New Save slot -> SAVE: the name box opens;
 *   3. types a name with real key presses, clicks OK: the box closes and the save is in the app's storage;
 *   4. the New Save slot is still there and a second save works; Cancel closes the box without saving;
 *   5. an existing save: SAVE asks to overwrite, OK overwrites the same slot;
 *   6. Delete asks first, OK deletes that save only;
 *   7. Options -> Load Game loads the first save;
 *   8. after closing the app, the stand-in root and the real game folder are unchanged.
 * Controls are clicked through their own click listeners (what a mouse click on them does).
 *
 * Usage: node scripts/kotor3/e2e-save-menu.mjs --game-dir "<stand-in folder>" --out "<artifacts folder>"
 *          [--real-game-dir "<KOTOR II folder, only listed>"]
 * --out must be outside the repo (screenshots show game assets). Exit 0 only when every check passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, makeLog, sleep, listRoot, listTree, diffLists, launchKotor3, clickGui, inAreaExpr, saveMenuHelpers } from './e2e-lib.mjs';

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
const NAME1 = 'K3 Menu Save';
const NAME2 = 'K3 Second';
const MM = 'KotOR.GameState.MenuManager';

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
  app = await launchKotor3({ repo: REPO, out: OUT, gameDir: GAME_DIR, log, port: 9225, screenshotTag: 'sv_' });
  const { game, ev, wait, screenshot, skipMovies, profileDir } = app;
  const savesRoot = path.join(profileDir, 'game-data', 'kotor3', 'Saves');
  const saveFolders = () => (fs.existsSync(savesRoot) ? fs.readdirSync(savesRoot).filter((d) => fs.existsSync(path.join(savesRoot, d, 'SAVEGAME.sav'))) : []);

  const { typeText, visible, listNames, savedNames, clickRow } = saveMenuHelpers({ send: (m, p) => game.send(m, p), ev });

  await wait(`window.KotOR && KotOR.ModManager && KotOR.ModManager.loadedFiles.length`, 'mod files to load', 180000);
  await wait(`KotOR.GameState.Mode === 0 && !!${MM} && !!${MM}.MainMenu`, 'main menu', 180000);
  note(`app storage for saves: ${await ev(`KotOR.GameFileSystem.describeUserDataLocation()`)}; game folder read-only: ${await ev(`KotOR.GameFileSystem.gameFolderReadOnly`)}`);
  await skipMovies();
  await wait(`!KotOR.GameState.VideoManager.isMoviePlaying() && !KotOR.GameState.VideoManager.movieQueue.length`, 'intro movies to end', 120000);
  await sleep(3000);
  const savesAtStart = await ev(savedNames);
  note(`saves at start: ${JSON.stringify(savesAtStart)}`);

  // ---- New Game through the menus ----
  note('New Game: main menu -> class -> Quick Character -> Play');
  await ev(clickGui(`${MM}.MainMenu.BTN_NEWGAME`));
  await wait(visible('CharGenClass'), 'class selection', 60000);
  await sleep(1500);
  await ev(clickGui(`${MM}.CharGenClass.BTN_SEL1`));
  await wait(visible('CharGenQuickOrCustom'), 'quick or custom', 60000);
  await sleep(1000);
  await ev(clickGui(`${MM}.CharGenQuickOrCustom.QUICK_CHAR_BTN`));
  await wait(visible('CharGenQuickPanel'), 'quick character panel', 60000);
  await sleep(1000);
  await ev(clickGui(`${MM}.CharGenQuickPanel.BTN_STEPNAME3`));
  for (let i = 0; i < 200 && !(await ev(`(${inAreaExpr(AREA)}) || false`).catch(() => false)); i++) { await skipMovies(3); await sleep(1500); }
  await wait(inAreaExpr(AREA), `new game to load ${AREA}`, 10000, 1000);
  try { await ev(`KotOR.AudioEngine.Mute(), true`); } catch { /* optional */ }
  await wait(`!KotOR.CutsceneManager.active && KotOR.GameState.Mode === 1`, 'in game (no conversation)', 60000);
  await sleep(3000);

  // ---- Options -> Save Game -> New Save -> SAVE ----
  note('Options -> Save Game');
  await ev(clickGui(`${MM}.InGameOverlay.BTN_OPT`));
  await wait(visible('MenuOptions'), 'options menu', 20000);
  await sleep(800);
  await ev(clickGui(`${MM}.MenuOptions.BTN_SAVEGAME`));
  await wait(visible('MenuSaveLoad'), 'save menu', 20000);
  await sleep(1500);
  await screenshot('save_menu');
  const rowsAtOpen = await ev(listNames);
  note(`save menu rows: ${JSON.stringify(rowsAtOpen)}`);
  const sel1 = await clickRow('[New Save]');
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await wait(visible('MenuSaveName'), 'save name box', 10000).catch(() => false);
  await sleep(500);
  const box = await ev(`(() => { const m = ${MM}.MenuSaveName; return { visible: m.isVisible(), active: ${MM}.activeGUIElement === m.EDITBOX, editable: !!m.EDITBOX.editable, text: m.EDITBOX.getValue() }; })()`);
  pass('s1_name_box_opens', sel1 === '[New Save]' && box.visible && box.active && box.editable && box.text === '', { selected: sel1, ...box });

  // ---- type a name, OK ----
  await typeText(NAME1);
  await sleep(300);
  const typed = await ev(`${MM}.MenuSaveName.EDITBOX.getValue()`);
  await screenshot('name_typed');
  pass('s2_name_typed_with_keys', typed === NAME1, { typed, expected: NAME1 });
  const foldersBefore1 = saveFolders();
  await ev(clickGui(`${MM}.MenuSaveName.BTN_OK`));
  await sleep(500);
  const boxClosed = !(await ev(visible('MenuSaveName')));
  await wait(`${savedNames}.includes(${JSON.stringify(NAME1)}) && !${visible('LoadScreen')}`, 'first save to finish', 60000).catch(() => false);
  await sleep(1500);
  const after1 = { names: await ev(savedNames), rows: await ev(listNames), saveMenuOpen: await ev(visible('MenuSaveLoad')), loadScreenOpen: await ev(visible('LoadScreen')) };
  const foldersAfter1 = saveFolders();
  const newFolders1 = foldersAfter1.filter((f) => !foldersBefore1.includes(f));
  const save1Dir = await ev(`(() => { const s = KotOR.SaveGame.saves.find(s => s.getSaveName() === ${JSON.stringify(NAME1)}); return s ? s.directory : ''; })()`);
  const save1Folder = path.basename(String(save1Dir).replace(/\\/g, '/'));
  const save1Files = save1Folder && fs.existsSync(path.join(savesRoot, save1Folder)) ? fs.readdirSync(path.join(savesRoot, save1Folder)) : [];
  await screenshot('after_first_save');
  pass('s3_ok_saves_and_closes', boxClosed && after1.names.includes(NAME1) && !after1.loadScreenOpen && after1.rows.includes(NAME1) && newFolders1.length === 1 && newFolders1[0] === save1Folder
    && ['SAVEGAME.sav', 'savenfo.res', 'GLOBALVARS.res', 'PARTYTABLE.res'].every((f) => save1Files.some((x) => x.toLowerCase() === f.toLowerCase())),
    { boxClosed, ...after1, newFolders: newFolders1, folder: path.join(savesRoot, save1Folder), files: save1Files });

  // ---- the New Save slot is still there; a second save; Cancel ----
  const sel2 = await clickRow('[New Save]').catch((e) => `error: ${e.message}`);
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await wait(visible('MenuSaveName'), 'save name box (second save)', 10000).catch(() => false);
  await sleep(500);
  await typeText(NAME2);
  await ev(clickGui(`${MM}.MenuSaveName.BTN_OK`));
  await wait(`${savedNames}.includes(${JSON.stringify(NAME2)}) && !${visible('LoadScreen')} && !${visible('MenuSaveName')}`, 'second save to finish', 60000).catch(() => false);
  await sleep(1500);
  const after2 = { names: await ev(savedNames), rows: await ev(listNames), folders: saveFolders() };
  pass('s4_new_slot_kept_second_save', sel2 === '[New Save]' && after2.rows[0] === '[New Save]' && after2.names.includes(NAME1) && after2.names.includes(NAME2) && after2.folders.length === foldersAfter1.length + 1,
    { selectedSecond: sel2, ...after2 });

  await clickRow('[New Save]');
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await wait(visible('MenuSaveName'), 'save name box (cancel)', 10000).catch(() => false);
  await sleep(500);
  await typeText('x');
  await ev(clickGui(`${MM}.MenuSaveName.BTN_CANCEL`));
  await sleep(2000);
  const afterCancel = { boxOpen: await ev(visible('MenuSaveName')), names: await ev(savedNames), folders: saveFolders(), saveMenuOpen: await ev(visible('MenuSaveLoad')) };
  pass('s5_cancel_closes_without_saving', !afterCancel.boxOpen && afterCancel.saveMenuOpen && afterCancel.names.length === after2.names.length && afterCancel.folders.length === after2.folders.length, afterCancel);

  // ---- overwrite an existing save ----
  const sav1 = path.join(savesRoot, save1Folder, 'SAVEGAME.sav');
  const mtimeBefore = fs.existsSync(sav1) ? fs.statSync(sav1).mtimeMs : 0;
  const selOw = await clickRow(NAME1);
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await wait(visible('InGameConfirm'), 'overwrite question', 10000).catch(() => false);
  await sleep(500);
  const owAsk = { visible: await ev(visible('InGameConfirm')), asksOverwrite: await ev(`/overwrite/i.test(KotOR.GameState.TLKManager.GetStringById(1591).Value)`) };
  await screenshot('overwrite_question');
  await sleep(1200); // a newer file time
  await ev(clickGui(`${MM}.InGameConfirm.BTN_OK`));
  await sleep(1000);
  await wait(`!${visible('LoadScreen')} && !${visible('InGameConfirm')}`, 'overwrite to finish', 60000).catch(() => false);
  await sleep(1500);
  const afterOw = { names: await ev(savedNames), folders: saveFolders(), mtimeChanged: fs.existsSync(sav1) && fs.statSync(sav1).mtimeMs > mtimeBefore };
  pass('s6_overwrite_asks_then_saves_same_slot', selOw === NAME1 && owAsk.visible && owAsk.asksOverwrite && afterOw.mtimeChanged && afterOw.folders.length === after2.folders.length
    && afterOw.names.filter((n) => n === NAME1).length === 1, { selected: selOw, ...owAsk, ...afterOw });

  // ---- delete the second save ----
  const save2Dir = await ev(`(() => { const s = KotOR.SaveGame.saves.find(s => s.getSaveName() === ${JSON.stringify(NAME2)}); return s ? s.directory : ''; })()`);
  const save2Folder = path.basename(String(save2Dir).replace(/\\/g, '/'));
  const selDel = await clickRow(NAME2);
  const delShown = await ev(`${MM}.MenuSaveLoad.BTN_DELETE.isVisible ? ${MM}.MenuSaveLoad.BTN_DELETE.isVisible() : true`);
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_DELETE`));
  await wait(visible('InGameConfirm'), 'delete question', 10000).catch(() => false);
  await sleep(500);
  const delAsk = { visible: await ev(visible('InGameConfirm')), asksDelete: await ev(`/delete/i.test(KotOR.GameState.TLKManager.GetStringById(1592).Value)`) };
  await ev(clickGui(`${MM}.InGameConfirm.BTN_OK`));
  await sleep(3000);
  const afterDel = { names: await ev(savedNames), rows: await ev(listNames), folders: saveFolders() };
  pass('s7_delete_asks_then_deletes_that_save', selDel === NAME2 && delShown && delAsk.visible && delAsk.asksDelete && !afterDel.names.includes(NAME2) && afterDel.names.includes(NAME1)
    && !afterDel.folders.includes(save2Folder) && afterDel.folders.includes(save1Folder), { selected: selDel, deleteShown: delShown, ...delAsk, ...afterDel, deletedFolder: save2Folder });

  // ---- Load Game menu ----
  note('Back -> Options -> Load Game');
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_BACK`));
  await sleep(1000);
  if (!(await ev(visible('MenuOptions')))) { await ev(clickGui(`${MM}.InGameOverlay.BTN_OPT`)); await wait(visible('MenuOptions'), 'options menu', 20000); }
  await sleep(800);
  await ev(clickGui(`${MM}.MenuOptions.BTN_LOADGAME`));
  await wait(visible('MenuSaveLoad'), 'load menu', 20000);
  await sleep(1500);
  const loadRows = await ev(listNames);
  const selLoad = await clickRow(NAME1);
  await ev(clickGui(`${MM}.MenuSaveLoad.BTN_SAVELOAD`));
  await sleep(3000);
  for (let i = 0; i < 60 && !(await ev(`(${inAreaExpr(AREA)}) || false`).catch(() => false)); i++) { await skipMovies(3); await sleep(1500); }
  const loaded = await ev(`(${inAreaExpr(AREA)}) || false`).catch(() => false);
  await sleep(3000);
  await screenshot('after_load');
  pass('s8_load_menu_loads_save', !loadRows.includes('[New Save]') && selLoad === NAME1 && loaded && !(await ev(visible('MenuSaveLoad'))), { rows: loadRows, selected: selLoad, inArea: loaded });
} catch (e) {
  note(`ERROR: ${e.message}`);
  if (app) { try { await app.screenshot('error'); } catch { /* ignore */ } }
} finally {
  if (app) app.close();
  await sleep(3000);
  const standInAfter = listRoot(GAME_DIR);
  const realAfter = listTree(REAL_GAME_DIR);
  const dStand = diffLists(standInBefore, standInAfter);
  const dReal = diffLists(realBefore, realAfter);
  pass('s9_no_write_to_stand_in_root', !dStand.added.length && !dStand.removed.length, dStand);
  pass('s9_no_write_to_real_game_folder', !dReal.added.length && !dReal.removed.length, { entries: realAfter.length, ...dReal });
  const expected = ['s1_name_box_opens', 's2_name_typed_with_keys', 's3_ok_saves_and_closes', 's4_new_slot_kept_second_save', 's5_cancel_closes_without_saving',
    's6_overwrite_asks_then_saves_same_slot', 's7_delete_asks_then_deletes_that_save', 's8_load_menu_loads_save', 's9_no_write_to_stand_in_root', 's9_no_write_to_real_game_folder'];
  const passed = expected.every((k) => checks[k]?.pass);
  note(`RESULT: ${passed ? 'PASS' : 'FAIL'} (${expected.filter((k) => checks[k]?.pass).length} of ${expected.length} checks)`);
  fs.writeFileSync(path.join(OUT, 'e2e-save-menu-result.json'), JSON.stringify({ passed, checks }, null, 2));
  fs.writeFileSync(path.join(OUT, 'e2e-save-menu-steps.log'), log.lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'e2e-save-menu-console.log'), log.consoleLines.join('\n') + '\n');
  process.exit(passed ? 0 : 1);
}
