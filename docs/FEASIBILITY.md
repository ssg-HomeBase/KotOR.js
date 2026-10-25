# KOTOR III (fan): Phase 1 feasibility report

Date: 2026-10-24. Branch `kotor3-phase1` of ssg-HomeBase/KotOR.js (base commit `002dfe03`).

## Verdict

**Feasible.** A KOTOR III fan sequel can be built as a mod that runs on top of each player's own KOTOR II in KotOR.js, in the browser or the KotOR.js desktop app, without shipping any game file. Phase 1 proved the full path once: a "KOTOR III (fan)" entry loads the player's KOTOR II, adds the mod's own files, places a new NPC in an existing KOTOR II area, and plays a new 14-node branching dialogue to the end (research/TEST_LOG.md, run 12: PASS). The biggest costs of a full sequel are writing, quests and new areas, not the engine.

Not done in Phase 1:
- **No hosted preview (fallback F5).** The Vercel CLI login needs a click in the browser; three login codes (20:09, 20:21 and 20:41 EDT) expired without confirmation, so nothing was deployed. Cam plays it locally with a double-click instead (checklist below).
- **The web build's folder picker was not automated.** The automated test used the KotOR.js desktop app (Electron); the web page in Chrome was checked up to the disclaimer. Cam's checklist covers the rest (fallback F2 for that step).
- **In Chrome, the game folder must be outside `C:\Program Files`.** Chrome will not let any website open folders there, and that is where Steam puts KOTOR II by default ("What broke" item 11). The checklist copies the game folder to `C:\Games` first.

## What worked

| Item | Evidence |
|---|---|
| Launcher entry "KOTOR III (fan)": KOTOR II base game plus the kotor3 mod | `src/apps/launcher/profiles/kotor3.ts`; TEST_LOG run 12 (desktop app) and the web check (browser) |
| Mod loader: the mod's files load after the game's own Override folder and win name clashes | `src/managers/ModManager.ts`; TEST_LOG run 12 "mod loaded: k3_seren.utc, k3_seren.dlg" |
| New NPC placed in an existing KOTOR II area without editing any game file | `mods/kotor3/manifest.json` (area `201tel`); hook in `src/module/ModuleArea.ts`; run 12: Seren at (-11.9, 9.0, 13.14), body model loaded, 3.03 m from the player |
| New NPC and dialogue authored as game-format files | `mods/kotor3/k3_seren.utc`, `k3_seren.dlg`, built from readable JSON by `scripts/kotor3/build-mod.ts` with KotOR.js's own GFF writer |
| Dialogue: 7 entries + 7 replies = 14 nodes, 2 choices, every node played | `scripts/kotor3/verify-mod.ts` (parse-back, node count by script); run 12 coverage E0 to E6, R0 to R6 |
| Uses the player's own body models by reference only (appearance row 185) | `mods/kotor3/src/k3_seren.creature.json` |
| New game can start in the mod's area | `startModule` in the manifest; `src/game/tsl/menu/CharGenQuickPanel.ts` (not exercised by the automated test) |
| No game data in the repo or build | `scripts/scan-no-game-files.mjs`: PASS on the branch and on the web build output; negative checks caught copied and extracted game data |

## What broke in KotOR.js (file and line)

Line numbers are in upstream KotOR.js at commit `002dfe03` unless marked "branch".

| # | Problem | File and line | Status |
|---|---|---|---|
| 1 | KotOR.js deletes and re-creates a `gameinprogress` folder inside whichever game folder the player picks, every time the game starts, and the browser asks for edit permission on the game folder for this. During testing it created an empty `gameinprogress` folder in Cam's KOTOR II folder (20:37 EDT); nothing else changed. | `src/engine/CurrentGame.ts:70` (delete), `:78` (create), `:98` and `:104` (browser create); permission request `src/apps/game/states/AppState.ts:305` | **Open.** Phase 2 should keep in-progress state and saves out of the game folder (browser storage, or the app's data folder). |
| 2 | A dialogue line without voice-over stalls the second time it is shown: its delay is converted from seconds to milliseconds again (3 s becomes about 50 minutes) and its clock is not reset. Talking to the same NPC twice froze at the first choice. | `src/managers/CutsceneManager.ts:261`; `src/resource/DLGNode.ts:765` and `:295` | **Fixed on this branch** (keep the file's delay as `baseDelay`, restart the clock). Matters most for text-only fan content. |
| 3 | Number keys do not pick dialogue replies; the bindings are commented out, so players must click replies. | `src/controls/KeyMapper.ts:511` to `:520` | Open |
| 4 | The game page only accepts the profile keys `kotor` and `tsl`, so any new entry needs a code change. | `src/apps/game/states/AppState.ts:26` | Fixed for `kotor3` on this branch; a general fix is open |
| 5 | The launcher's profile repair keeps only the `kotor`, `tsl` and `forge` profiles and would drop the saved folder of any other profile. | `src/apps/launcher/context/Launcher.ts:62` to `:68` | Fixed for `kotor3` on this branch |
| 6 | KOTOR II's new game always starts in `001EBO`. | `src/game/tsl/menu/CharGenQuickPanel.ts:59` | Fixed on this branch (mod `startModule`) |
| 7 | There is no way for a mod to add an object to an existing area; it would have to ship an edited copy of the area's GIT (a game file). | `src/module/ModuleArea.ts:1103` to `:1109` | Fixed on this branch (manifest placements; skipped when a save already has the creature) |
| 8 | Files put in the game's Override folder after start-up are never seen: the on-demand Override lookup is commented out. | `src/loaders/ResourceLoader.ts:152` | Open (not needed by the mod loader) |
| 9 | Seen in the desktop app: the intro movies were still queued when the first area loaded and played inside the area load; one cannot be skipped, so a window in the background stayed in movie mode. | `src/GameState.ts:1065` (movie queue during module load); `src/managers/VideoManager.ts:271` (unskippable movies) | Open; may only affect background windows |
| 10 | A fresh start logs errors for a missing faction file and a missing item template for the generated default player. | `src/managers/FactionManager.ts:272`; `src/module/ModuleItem.ts:506` | Open; no visible effect in the test |
| 11 | **The browser version cannot open a game installed in the default Steam folder.** Chrome blocks websites from opening any folder under `C:\Program Files` or `C:\Program Files (x86)`, which is where Steam installs KOTOR II by default (it is there on this PC). KotOR.js's "Grant Access" box does not explain this. The desktop app is not affected. | Chrome: `chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc:501` to `:506` (https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc, read 2026-10-24); KotOR.js: `src/apps/game/components/modal-grant-access/modalGrantAccess.tsx:21` | **Open.** Workaround in the checklist: copy the game folder (4.6 GB) to `C:\Games`. Phase 2: explain it in the Grant Access box, or ship the desktop app. |
| 12 | The GFF writer stores an empty list as offset 0xFFFFFFFF. KOTOR II's own DLG and UTC files never do this: they point empty lists at a zero-count entry. KotOR.js reads both, but stricter readers and possibly other KOTOR tools reject the 0xFFFFFFFF form, so files written with KotOR.js (including this mod's first build) may not load outside KotOR.js. | `src/resource/GFFObject.ts:995` | **Fixed on this branch** (write an offset to a zero-count entry). The mod files were rebuilt (TEST_LOG run 12). |

## Design issue for the mod (not a KotOR.js bug)

When a new game starts on the Citadel Station docks (`201tel`), KOTOR II's own arrival conversation for that area starts too (TEST_LOG run 12, "ended an area conversation"). Phase 2 needs a way to switch off base-game plot scripts in areas the sequel reuses.

## Engine gaps for a full sequel

| Gap | Why it matters | Hours (in estimate (a)) |
|---|---|---|
| New areas from mod files (area models, walkmesh, layout, visibility) loaded from the mod instead of the player's game | 3 new planets need new areas | 200 |
| Script pipeline: compile NWScript headlessly with the in-tree compiler (`src/nwscript/compiler/NWScriptCompiler.ts`); let a mod replace or switch off base-game plot scripts per area | Quests, cutscenes, the arrival-scene clash above | 150 |
| Saves: mod state and mod placements in saves; saves and temporary state outside the game folder (item 1) | Players must be able to save, and the game folder must stay clean | 150 |
| NWScript function coverage for KOTOR II, checked against the scripts the sequel uses | KotOR.js is a work in progress; missing functions break quests | 300 |
| Dialogue: number keys (item 3), optional voice-over, cameras and animations for new scenes | Playability | 80 |
| Campaign data: journal entries, global variables, new 2DA rows and strings merged from the mod instead of edited game tables | A campaign needs its own plot state and items | 120 |
| Mod packaging: manifest versioning, several mods at once, a mod picker | Players install updates and other mods | 60 |
| Browser performance, load times and cross-browser checks (Chromium only today for the folder picker) | Playable on ordinary PCs | 140 |
| **Total** | | **1,200** |

## Effort estimates

Both figures are planning estimates in person-hours of skilled fan-modder time, built bottom-up from the parts below. They are assumptions, not measurements. The only measured figure from this run is Phase 1 itself: about 1 hour of build and test time (20:10 to 21:07 EDT) for one placed NPC and a 14-node dialogue, including writing the loader, tools and test from scratch. For scale, Revenge of Revan Episode 1, the largest released fan "KOTOR 3", gives about 3 hours of play (research/R9_LOG.md item 1).

### (a) Full KOTOR III campaign: about 8,500 person-hours

Scope assumed: the story bible's campaign (docs/STORY_BIBLE.md), about 12 to 15 hours of play, 6 planets (3 reusing KOTOR II areas, 3 new), 5 companions, text-only first release (no new voice acting).

| Part | Hours | Basis |
|---|---|---|
| Engine work in KotOR.js (gaps above) | 1,200 | 8 gaps, 60 to 300 hours each |
| Story and dialogue writing (about 150 conversations) | 1,500 | about 10 hours per conversation including revisions |
| Quests, scripting and NWScript (about 40 quests) | 1,800 | about 45 hours per quest |
| New areas: 9 areas on 3 new planets (model, walkmesh, lighting, placement) | 1,800 | about 200 hours per area |
| Reused areas: 9 KOTOR II areas (placement, spawns, triggers, switching off base-game scripts) | 360 | about 40 hours per area |
| New characters: 6 major (heads, textures, portraits) | 480 | about 80 hours each |
| UI, journal, items, table rows | 300 | |
| Testing and fixing (15 percent of the 7,440 above) | 1,120 | |
| **Total** | **about 8,500** (8,560) | about 4 person-years; 2 to 3 years for 3 part-time people |

Voice acting, if wanted later, is extra: about 6 main voices for about 1,500 lines adds roughly 600 to 1,000 hours plus actor costs.

### (b) Two-player co-op: about 1,400 person-hours

Scope assumed: two players online, each in their own browser with their own KOTOR II files, sharing one party in the same area; player 2 controls a companion; the host's game is the authority.

| Part | Hours | Basis |
|---|---|---|
| Networking: a direct browser-to-browser link (WebRTC data channel) plus a small matchmaking service | 200 | KotOR.js has no networking code today (no WebSocket or WebRTC use in `src/`) |
| Sync of objects, actions and animations from the host, reusing the debugger's binary message format | 500 | `src/server/ipc/IPCMessage.ts` is a starting point |
| Combat rounds and dice results from the host | 150 | |
| Player 2 controls a party member: camera, input and UI | 200 | |
| Shared dialogue and cutscenes (who chooses, what the other sees) | 120 | |
| Saving, loading and joining a game in progress | 150 | |
| Lag, disconnects and testing | 80 | |
| **Total** | **about 1,400** | about 8 months for one full-time developer |

Each player must own KOTOR II and run the same mod version; the co-op layer never sends game files between players.

## Recommended Phase 2 shape

**A playable 60-to-90-minute "Prologue and Act I opening" episode, text only, using only reused KOTOR II areas, plus a 2-week co-op spike.**

1. Engine first (about 300 hours): fix item 1 (keep saves and temporary state out of the game folder), explain item 11 in the Grant Access box (or ship the desktop app), number keys (item 3), a headless NWScript build step with the in-tree compiler, per-area switch-off of base-game plot scripts, and mod state in saves.
2. Content: Citadel Station prologue and the first Act I planet (Nar Shaddaa or Dantooine) from the story bible: about 10 conversations, 3 quests, 2 companions (Seren and Rhea), all in reused areas.
3. Hosting: the protected Vercel preview (needs Cam's one-time login click), so testers play by link. Deploy a production build (`npm run webpack:prod`), scan that output with the guard, and leave out the upstream launcher images that are game screenshots (`src/assets/launcher/images/forge_screen_01.jpg` to `_03.jpg`, `kotor_forge.jpg`, and `images/screenshots/K1-Screen-*.jpg`, `K2-Screen-*.jpg`, all from upstream KotOR.js, not from this branch). The guard's hash check cannot recognize screenshots, so this needs an explicit exclude list.
4. Co-op spike (2 weeks, separate branch): two browsers see each other walk around one area. Go or no-go on the full co-op estimate after it.
5. Same guard: the scan and pre-push hook stay on; every release is checked against the player's game folder.

## Cam's test checklist, Phase 1 (replaced by the Phase 2 checklist at the end of this file)

You do not need to type any commands. Allow about 20 minutes.

**A. Get KOTOR II (skip if it is already in your Steam Library; it is on this PC today)**
1. Open Chrome and go to `store.steampowered.com/app/208580`.
2. Click **Add to Cart**, then **Purchase for myself**, and finish the purchase.
3. Open the **Steam** app and click **Library** at the top.
4. Click **STAR WARS Knights of the Old Republic II: The Sith Lords** in the list on the left.
5. Click **Install**, keep the suggested folder, click **Next** or **Install**, and wait until the button says **Play**. You do not need to start the game in Steam.

**B. Start KOTOR III on this PC**
6. Open **File Explorer** (the folder icon on the taskbar).
7. Click the address bar at the top of the window, paste `C:\dev\kotor3\KotOR.js\scripts\kotor3`, and press **Enter**.
8. Double-click **start-local** (its type is "Windows Command Script").
9. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
10. A black window opens. Leave it open while you play. After about 30 seconds Chrome opens the KotOR.js launcher. The first time can take up to a minute; if Chrome shows "This site can't be reached", wait 20 seconds and click the reload arrow.

(If the hosted preview is deployed later, open its link instead of steps 6 to 10, sign in to Vercel if asked, and go on from step 11.)

Leave this Chrome tab open and do part C in File Explorer.

**C. Copy the game to a folder Chrome can open (once; Chrome blocks `C:\Program Files`)**
11. Open a second **File Explorer** window. Click its address bar, paste `C:\Program Files (x86)\Steam\steamapps\common`, and press **Enter**.
12. Right-click the **Knights of the Old Republic II** folder and click **Copy** (the two-pages icon at the top of the menu).
13. Click the address bar, paste `C:\`, and press **Enter**.
14. Right-click an empty spot, click **New**, then **Folder**, type `Games`, and press **Enter**. Double-click the new **Games** folder.
15. Right-click an empty spot and click **Paste** (the clipboard icon). Wait until the copy finishes (4.6 GB, a few minutes).

**D. Point the game at your KOTOR II copy and play the scene**
16. In the Chrome launcher's left list under **Games**, click **KOTOR III (fan)**.
17. Click **PLAY**. A new tab opens.
18. Read the disclaimer and click **OK**.
19. In the **Grant Access** box, click **GRANT ACCESS**.
20. In the folder window, click its address bar, paste `C:\Games`, press **Enter**, click **Knights of the Old Republic II** once, then click **Select Folder**.
21. Chrome asks whether the site may view files: click **View files**. If it then asks to save changes, click **Allow**. (KotOR.js keeps an empty `gameinprogress` folder in the copy; see "What broke" item 1. Your Steam install is not touched.)
22. If a **Click to Begin** box appears, click **BEGIN**.
23. The logo movies play. Press **Esc** to skip each one.
24. On the main menu, click **New Game**.
25. Click any character, then click the button to choose it.
26. Click **Quick Character**, then click the third button (**Play**). You should load onto the Citadel Station docks on Telos.
27. If a Telos officer starts talking to you first, click any reply until that conversation ends.
28. A woman named **Seren** stands a few steps in front of you. Click her to talk.
29. Wait about 3 seconds after each of her lines, then click a reply. (Number keys do not work for replies in KotOR.js.)
30. Play it once choosing **A message? From whom?** and then **Then I will go. Tell me where.**; then click Seren again and choose **Not interested. Find someone else.**
31. When you are done, close the Chrome tabs and the black window.

Tell Claude what you saw at each step that did not match, especially steps 20, 26 and 27: these were not covered by the automated test.


---

# Phase 2 (2026-10-25)

Branch `kotor3-phase2` (PR 2) and `kotor3-coop-spike` (PR 3), built on Phase 1 (PR 1). Plan: docs/PHASE2.md; episode design: docs/EPISODE1.md; tests: research/TEST_LOG_PHASE2.md; co-op: research/COOP_SPIKE.md.

## Verdict (Phase 2)

**The first episode is playable end to end, and the engine no longer touches the player's game folder.** "The Last Signal", Episode 1 (the Citadel Station prologue and the Nar Shaddaa opening, about 30 to 45 minutes, text only), plays from New Game to its last scene in the KotOR.js desktop app on the player's own KOTOR II files, with 10 conversations, 3 quests and two companions who join the party, and survives a save and a load in the middle (automated playthrough, 10 of 10 checks). It is deployed as a private Vercel preview behind Vercel login. Two game windows on one PC saw each other move over WebRTC (co-op spike: go, with conditions).

## What was fixed in Phase 2, and how it was tested

| Item | Fix (file) | Test (research/TEST_LOG_PHASE2.md) |
|---|---|---|
| Game folder writes (Phase 1 "What broke" item 1) | The game app never writes into the chosen folder: saves, `gameinprogress`, settings (`swkotor2.ini`, written at `src/engine/INIConfig.ts:150`) and screenshots go to the app's own storage, Electron `userData` or the browser's origin private file system (`src/utility/GameFileSystem.ts`, switched on in `src/apps/game/states/AppState.ts`; IPC `get-user-data-path` in `src/electron/WindowManager.ts:67`). The browser asks for read permission only. | M1 test: after a session with a save and a load, the stand-in folder's root and the real game folder (19,487 entries) are unchanged; the save files are in `electron-profile/game-data/kotor3/Saves`. Episode playthrough: same check, unchanged. Web check: browser storage write, read, list and remove |
| Chrome's Program Files block (item 11) | The Grant Access box says it in plain words and tells the player to copy the game to `C:\Games` (`src/apps/game/components/modal-grant-access/modalGrantAccess.tsx`) | Web check: the text shows in the box |
| Number keys (item 3) | Keys 1 to 9 pick replies (`src/controls/KeyMapper.ts`, after the key-table binding) | M1 test and the whole playthrough choose every reply with a real key press |
| Script pipeline (engine gap) | Mod `.nss` files compile at build time with the in-tree compiler; `verify-mod` checks every `.ncs` against a fresh compile (`scripts/kotor3/build-mod.ts`, `verify-mod.ts`) | M1 test: a compiled probe script gives exactly 77 credits in game; the episode runs 17 compiled scripts |
| Base-game plot in reused areas (design issue) | Manifest `switchOff` per area for triggers, creatures, scripts and conversations (`src/managers/ModSwitchOff.ts`, hooks in `src/module/ModuleArea.ts`, `src/nwscript/NWScript.ts`, `src/managers/CutsceneManager.ts`); manifest `onEnter` runs the mod's own area script (`src/module/ModuleArea.ts:2126`) | M1 test and playthrough: KOTOR II's arrival conversation in `201tel` never starts; no base-game conversation in the whole playthrough |
| Campaign data (engine gap) | The mod's globals, quests and plot rows come from `mods/kotor3/campaign.json` and are added in memory (`src/managers/ModManager.ts`); no game table is edited or shipped | Playthrough: 3 quests to their last stage; journal text, quest stages and party come back after a load |
| Deploys (Phase 1 grader note 1) | `scripts/scan-no-game-files.mjs` blocks the upstream game screenshots in deploy scans; `scripts/kotor3/prepare-deploy.mjs` builds, copies and scans | Negative test: a blocked file fails the scan (exit 1); preview file list: 0 blocked files |
| Hosting (Phase 1 used fallback F5) | Protected Vercel preview of project `kotor3-preview` (Vercel Authentication on all deployments, previews only) | READY; unauthenticated requests redirect to Vercel login; 0 production deployments |

## What broke in KotOR.js in Phase 2 (file and line, branch `kotor3-phase2`)

| # | Problem | File and line | Status |
|---|---|---|---|
| 13 | A brand-new journal quest was built but never added to the list, so new quests never appeared or saved. | `src/managers/JournalManager.ts:86` | Fixed |
| 14 | Boolean globals were saved lowest bit first while the loader (and the games) read highest bit first, and the last partial byte was cut off; every saved boolean came back scrambled. | `src/engine/SaveGame.ts:986`, `:995` | Fixed |
| 15 | `AddPartyMember` did not record the party slot, so a companion added by script was missing from saves. | `src/managers/PartyManager.ts:775` | Fixed |
| 16 | A loaded companion without a portrait was placed on the player's party slot (an empty portrait matched an empty saved slot). | `src/managers/PartyManager.ts:937` | Fixed |
| 17 | Journal text was looked up only in the game's string table, so a mod's own quest text was blank. | `src/engine/JournalEntry.ts:31` | Fixed |
| 18 | Base-game area files carry no tag for triggers; the tag lives in the trigger's template, so switching a trigger off by tag needs the template read. | `src/module/ModuleArea.ts:1060` | Handled |
| 19 | A conversation started by a script while another one is still on screen is silently dropped: the dialog action fails while the game is in dialogue mode. Mod scripts must wait until none is active. | `src/actions/ActionDialogObject.ts:55`; the mod waits in `mods/kotor3/src/k3_inc_main.nss:32` | Worked around |
| 20 | Settings were written into the game folder whenever options changed. | `src/engine/INIConfig.ts:150` | Fixed (now app storage) |
| 21 | With saves in the app's own storage, the game app no longer lists saves that live in the game folder's `Saves` folder (for example saves from the original KOTOR II). | `src/utility/GameFileSystem.ts:49` (`USER_DATA_DIRS`) | Open, by design for now |
| 22 | Found by Cam in Chrome on 2026-10-25 (checklist step 9): after picking `C:\Games\Knights of the Old Republic II`, nothing happened and GRANT ACCESS opened the picker again. First, errors from the picker and the permission request were never caught, so every refusal looked like nothing (fixed: the box now explains). Then, with messages on, Cam's Chrome showed that the newer folder access (`window.showDirectoryPicker`) refuses that folder with `AbortError` and then refuses at once; the cause sits in that Chrome profile (the run could not inspect it; the profile is not the one the Claude extension is connected to). Fix: a second way in, Chrome's older folder picker (`<input webkitdirectory>`), read through a read-only stand-in folder object. The older picker does not follow links (junctions), so it needs a folder with real files such as the `C:\Games` copy. | before: `src/apps/game/components/modal-grant-access/modalGrantAccess.tsx:21`, `:26` (Phase 1 lines); fix: same file `:48` (messages, CONTINUE), `:85` and `:90` (second picker), `:186` (button); `src/utility/FileListDirectory.ts:28`, `:71`; `src/utility/GameFileSystem.ts:261`; `src/apps/game/states/AppState.ts:241`, `:303`, `:317` | Fixed; browser path tested end to end; Cam to retry |
| 23 | Found by Cam in Chrome on 2026-10-25 (checklist step 21): the Save Game name box opened, but nothing in it worked and it stayed on screen even after leaving the menu. The KOTOR II name box skipped the setup that gives the edit box its keys and OK and Cancel their actions, and the KOTOR II save menu never saved: a new slot only logged the name, and overwriting did nothing. The same menu's Delete button had no action, and its character-name filter dropped the New Save slot once one save existed. Testing the fix found one more: overwriting the first save made a copy, because new saves were numbered from 1 (the autosave's number) while overwrite replaces only numbers 2 and up (this also affects KOTOR I). Fix: the KOTOR I save menu's behaviour in KOTOR II (name box, save, overwrite after a question, delete after a question), the New Save slot kept, new saves numbered from 2. | before (at `1870a27a`): `src/game/tsl/menu/MenuSaveName.ts:28`, `src/game/tsl/menu/MenuSaveLoad.ts:70`, `:72`, `:151`, `src/engine/SaveGame.ts:100`, `:861`; fix: `src/game/tsl/menu/MenuSaveName.ts:30`, `src/game/tsl/menu/MenuSaveLoad.ts:69`, `:80`, `:97`, `:179`, `src/engine/SaveGame.ts:100`, `:863` | Fixed; save, overwrite, delete and load tested through the menus in the desktop app and in the browser; Cam to retry |

Outside KotOR.js: Vercel always makes a project's first deployment a production deployment, even with `--target preview`, and treats the next deployment as the first again if every deployment is deleted (https://vercel.com/docs/deployments/environments, read 2026-10-25). The run's first placeholder became production and its production URL was public for 78 seconds (one line of placeholder text); protection was widened to all deployments and, with Cam's approval, the two production placeholders were deleted. Every later deploy passes `--environment preview`, and the run never deletes the project's last deployment.

## Measured run time (agent time on Cam's PC, 2026-10-25, waiting time excluded)

| Milestone | Box | Measured |
|---|---|---|
| First actions (checks, PR 2, placeholder deploy, playtest copy, baseline) | | about 0.5 h (plus about 1.6 h waiting for Cam's two Vercel answers) |
| M1 engine and preview | 5 h | about 0.6 h |
| M2 episode | 6 h | about 0.5 h |
| M3 co-op spike | 3 h | about 0.2 h (plus drafting while M2 tests ran) |
| Finish and grading | 2 h | recorded in the run's STATE file and grader report |

These are agent hours with helper agents working in parallel, not person-hours of a fan modder; the estimates below stay in person-hours.

## Revised estimates

### (a) Full KOTOR III campaign: about 8,200 person-hours

Phase 1 estimated about 8,500. Phase 2 closed part of the engine gaps; the content estimates are unchanged (Phase 2's 10 conversations, 147 lines and 2,325 words do not change the per-conversation figure for a human writing team).

| Engine gap (Phase 1 hours) | Left after Phase 2 | Why |
|---|---|---|
| New areas from mod files (200) | 200 | not started |
| Script pipeline and per-area switch-off (150) | 70 | compile, verify and switch-off done; deeper base-game plot interactions remain |
| Saves and mod state (150) | 30 | done in the desktop app; the browser path was checked from the console only |
| NWScript coverage (300) | 300 | the episode used about 20 routines, all present; the rest is unchecked |
| Dialogue: number keys, voice, cameras (80) | 50 | number keys done |
| Campaign data (120) | 40 | globals, quests and plot rows from mod data done; items and table rows remain |
| Mod packaging (60) | 60 | |
| Browser performance and cross-browser (140) | 140 | |
| **Engine total (1,200)** | **890** | |

Campaign total: 890 engine + 1,500 writing + 1,800 quests + 1,800 new areas + 360 reused areas + 480 characters + 300 UI and tables = 7,130, plus 15 percent testing (1,070) = about 8,200.

### (b) Two-player co-op: about 1,300 person-hours

Phase 1: about 1,400. The spike proved the transport and the avatar sync on one PC (research/COOP_SPIKE.md), so networking drops from 200 to 120 and object sync from 500 to 480; the rest is unchanged.

## Recommended Phase 3 shape

1. **Finish Act I in reused areas:** Dantooine (KOTOR II's own areas), Tamsin Rho and VX-9 join, the seal is tested (docs/STORY_BIBLE.md section 4). Same pipeline as Episode 1; about 10 more conversations and 3 quests.
2. **First new area:** load an area (model, walkmesh, layout) from mod files, starting with a small Nathema test room; the largest open engine gap (200 hours).
3. **Fewer Chrome workarounds for players:** a packaged desktop app (it reads `C:\Program Files` directly), and a decision on the upstream commercial fonts before any public link (Phase 1 grader note 2).
4. **Co-op:** only after 1 to 3; the next step is internet play (STUN/TURN and a hosted signaling service) between two PCs.
5. **Same guard:** the scan, the pre-push hook and the preview's protection stay on.

## Cam's Phase 2 test checklist (no terminal)

You do not need to type any commands. Allow about 45 minutes. Everything happens in Chrome, signed in to Vercel as your usual account (cctv75).

**Preview link (private, opens only for you after you sign in to Vercel):** https://kotor3-preview-ps1xbp6dd-itshot90210-9796s-projects.vercel.app

### A. Your game copy (already done)
1. The run already copied KOTOR II to `C:\Games\Knights of the Old Republic II` for you (Chrome cannot open folders under `C:\Program Files`). Nothing to do here. (If that folder is ever missing, open File Explorer, go to `C:\Program Files (x86)\Steam\steamapps\common`, right-click **Knights of the Old Republic II**, click **Copy**, go to `C:\Games`, right-click an empty spot and click **Paste**.)

### B. Open the preview
2. Open **Chrome** and click the preview link above (or paste it into the address bar and press **Enter**).
3. If Vercel asks you to sign in, click **Continue with** the same account you always use for Vercel, and finish signing in. The KotOR.js launcher opens.

### C. Start KOTOR III and point it at your copy
4. In the launcher's left list under **Games**, click **KOTOR III (fan)**.
5. Click **PLAY**. A new tab opens.
6. Read the disclaimer and click **OK**.
7. In the **Grant Access** box, read the note about Chrome and `C:\Games`, then click **GRANT ACCESS**.
8. In the folder window, click its address bar, paste `C:\Games`, press **Enter**, click **Knights of the Old Republic II** once, then click **Select Folder**.
9. If Chrome asks whether the site may view files, click **View files**. If the box shows a yellow message and the button says **CONTINUE**, click **CONTINUE**. **If nothing happens, or a yellow message says no folder was opened:** click **OPEN THE FOLDER ANOTHER WAY** (in the box), pick the same folder (`C:\Games`, click **Knights of the Old Republic II** once, then click **Upload** or **Select Folder**), and when Chrome asks "Upload ... files to this site?", click **Upload**. Nothing leaves your PC: the game only reads the files in this tab. (With this way you pick the folder again each time you reload the page.)
10. If a **Click to Begin** box appears, click **BEGIN**.
11. The logo movies play. Press **Esc** to skip each one.

### D. New game (the prologue on Citadel Station)
12. On the main menu, click **New Game**.
13. Click any character, then click the button to choose it.
14. Click **Quick Character**, then click the third button (**Play**). You load onto the Citadel Station docks. No Telos officer should start talking to you.
15. Click **Seren** (a woman a few steps away) to talk. This time, **press the number keys** on your keyboard to choose replies: **1** picks the first reply, **2** the second.
16. Keep pressing **1**: ask about the message, hear the warning, agree to go, and say you are ready to leave today. Seren joins you.
17. Click **Brannick** (an older man nearby) and talk to him (press **1** at each choice).
18. Click **Lieutenant Senn** (the security officer) and talk to her (press **1**). When she clears the shuttle, the game moves you to Nar Shaddaa.

### E. Nar Shaddaa
19. Seren starts talking on her own after you land. Press **1** at each choice.
20. Talk to **Kiri** (an old woman by some crates), then **Zell Okkar** (a Duros), then **Rhea Vex** (a Mandalorian in armour). Rhea joins you.
21. Save: press **Esc**, click **Save Game**, click the top row (the empty slot for a new save), click **Save**. A box asks for a name: type one (letters, numbers and spaces, up to 16 characters) and click **OK**. The box closes and your save appears in the list. Then click **Back** to return to the game.
22. Load it again: press **Esc**, click **Load Game**, pick the save you just made, click **Load**. Check that Seren and Rhea are still with you.
23. Press **L** (or open the menu and click **Journal** / **Quests**) and look for the three quests: The Last Signal, A Navigator Past the Charts, A Ship That Will Not Turn Back.
24. Talk to **Hesk Varo** (a Twi'lek), then **Corva** (a woman in grey), then **Hesk** again. The final scene starts on its own and ends the episode.
25. Close the tab when you are done.

### F. Backup if the preview does not open
26. Open **File Explorer**, click the address bar, paste `C:\dev\kotor3\KotOR.js\scripts\kotor3`, press **Enter**, and double-click **start-local**. If Windows warns you, click **More info**, then **Run anyway**. Leave the black window open; Chrome opens the launcher after about 30 seconds. Then go on from step 4.

### Tell Claude
Which steps did not match what you saw, especially steps 3, 9, 14, 15 and 22 (these could not be fully automated in Chrome).
