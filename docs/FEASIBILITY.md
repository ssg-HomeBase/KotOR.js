# KOTOR III (fan): Phase 1 feasibility report

Date: 2026-10-24. Branch `kotor3-phase1` of ssg-HomeBase/KotOR.js (base commit `002dfe03`).

## Verdict

**Feasible.** A KOTOR III fan sequel can be built as a mod that runs on top of each player's own KOTOR II in KotOR.js, in the browser or the KotOR.js desktop app, without shipping any game file. Phase 1 proved the full path once: a "KOTOR III (fan)" entry loads the player's KOTOR II, adds the mod's own files, places a new NPC in an existing KOTOR II area, and plays a new 14-node branching dialogue to the end (research/TEST_LOG.md, run 10: PASS). The biggest costs of a full sequel are writing, quests and new areas, not the engine.

Not done in Phase 1:
- **No hosted preview (fallback F5).** The Vercel CLI login needs a click in the browser; three login codes (20:09, 20:21 and 20:41 EDT) expired without confirmation, so nothing was deployed. Cam plays it locally with a double-click instead (checklist below).
- **The web build's folder picker was not automated.** The automated test used the KotOR.js desktop app (Electron); the web page in Chrome was checked up to the disclaimer. Cam's checklist covers the rest (fallback F2 for that step).
- **In Chrome, the game folder must be outside `C:\Program Files`.** Chrome will not let any website open folders there, and that is where Steam puts KOTOR II by default ("What broke" item 11). The checklist copies the game folder to `C:\Games` first.

## What worked

| Item | Evidence |
|---|---|
| Launcher entry "KOTOR III (fan)": KOTOR II base game plus the kotor3 mod | `src/apps/launcher/profiles/kotor3.ts`; TEST_LOG run 10 (desktop app) and the web check (browser) |
| Mod loader: the mod's files load after the game's own Override folder and win name clashes | `src/managers/ModManager.ts`; TEST_LOG run 10 "mod loaded: k3_seren.utc, k3_seren.dlg" |
| New NPC placed in an existing KOTOR II area without editing any game file | `mods/kotor3/manifest.json` (area `201tel`); hook in `src/module/ModuleArea.ts`; run 10: Seren at (-11.9, 9.0, 13.14), body model loaded, 3.03 m from the player |
| New NPC and dialogue authored as game-format files | `mods/kotor3/k3_seren.utc`, `k3_seren.dlg`, built from readable JSON by `scripts/kotor3/build-mod.ts` with KotOR.js's own GFF writer |
| Dialogue: 7 entries + 7 replies = 14 nodes, 2 choices, every node played | `scripts/kotor3/verify-mod.ts` (parse-back, node count by script); run 10 coverage E0 to E6, R0 to R6 |
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

Not a KotOR.js bug, but a design issue for the mod: when a new game starts on the Citadel Station docks (`201tel`), KOTOR II's own arrival conversation for that area starts too (TEST_LOG run 10, "ended an area conversation"). Phase 2 needs a way to switch off base-game plot scripts in areas the sequel reuses.

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
3. Hosting: the protected Vercel preview (needs Cam's one-time login click), so testers play by link.
4. Co-op spike (2 weeks, separate branch): two browsers see each other walk around one area. Go or no-go on the full co-op estimate after it.
5. Same guard: the scan and pre-push hook stay on; every release is checked against the player's game folder.

## Cam's test checklist (no terminal)

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
