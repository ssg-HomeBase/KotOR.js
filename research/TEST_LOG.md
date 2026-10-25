# Test log: KOTOR III (fan) opening scene

Date: 2026-10-24, on Cam's Windows 11 PC. Copied from `C:\dev\kotor3\test-artifacts\run10\e2e-steps.log`. Screenshots (they show game assets) stay in `C:\dev\kotor3\test-artifacts\` on this PC and are not in this repository.

## Result

**PASS (run 10, 21:06 to 21:07 EDT).** The "KOTOR III (fan)" launcher entry started the game against KOTOR II files, the mod's two files loaded, Seren Vaux stood in the Citadel Station docks area (`201tel`) with a body model 3.03 m from the player, and her dialogue ran three times to the end. Together the three runs visited all 14 nodes: 7 entries (E0 to E6) and 7 replies (R0 to R6), including both choices.

## How it was tested

- **Surface:** the KotOR.js Electron app (`npm run start` equivalent: Electron 41.1.1 from the repo's own dependencies, Node 24.22.1), driven by `scripts/kotor3/e2e-electron.mjs` over the Chrome DevTools Protocol. The brief's first choice, Playwright in Chrome, was not available: Playwright is not in the repo and installing it was not approved, and Chrome's folder picker is a native dialog that cannot be scripted without it. The brief's next option, the Electron app, was used. The web build in Chrome is covered by Cam's click test (docs/FEASIBILITY.md, checklist), so fallback F2 applies to the Chrome folder-picker step only.
- **Game files:** runs 1 to 4 pointed at the real KOTOR II folder. Run 4 showed that KotOR.js creates a `gameinprogress` folder inside the chosen game folder (see "Incident" below), so runs 5 to 10 used a stand-in folder, `C:\dev\kotor3\test-artifacts\gamedir-view`: its data folders are links to the real game's folders (read only), and its root is a separate writable folder. The real game folder's file list was compared before and after: unchanged since 20:45.
- **Test-only shortcuts** (each stands in for one human action; the rest is the real app):
  1. The launcher's LOCATE button opens a native Windows folder dialog. The test answered that one dialog with the game folder through Electron's main-process debugger; the launcher's own code then checked and saved the folder.
  2. The KotOR.js in-app disclaimer was marked as seen in a throwaway test profile (`test-artifacts\runN\electron-profile`). Cam sees and accepts it himself in Chrome.
  3. The game's own intro movies were skipped.
  4. The test warped to `201tel` (the same call as the in-game `warp` cheat) instead of making a character. The mod's start area (`startModule` in the manifest) was read and matched `201tel`.
  5. KOTOR II's own arrival conversation for this area starts on a fresh entry; the test ended it before talking to Seren.
  6. Conversations were started with the engine's conversation call (what clicking an NPC does), and replies were chosen through the reply list's own click handler (`InGameDialog.LB_REPLIES.onSelected`), because KotOR.js leaves the number keys for replies unbound (`src/controls/KeyMapper.ts:511`).

## Run 10 step log

```
[0.0s] starting Electron (profile C:\dev\kotor3\test-artifacts\run10\electron-profile)
[0.6s] folder dialog answered by test
[0.6s] launcher shows entry: "KOTOR III (fan)"
[1.4s] clicking LOCATE
[1.9s] screenshot: 01_launcher_kotor3_ready.png
[1.9s] clicking launcher button "PLAY"
[2.0s] game window opened: dist/game/index.html?gameChoice=2&key=kotor3
[3.0s] mod loaded: k3_seren.utc, k3_seren.dlg
[3.0s] engine game key: TSL; directory: C:\dev\kotor3\test-artifacts\gamedir-view
[26.6s] screenshot: 02_main_menu.png
[26.6s] mod start area from manifest: 201tel
[26.6s] warping to 201tel
[33.4s] area loaded; auto conversation: ended an area conversation
[33.4s] NPC in area: {"name":"Seren","tag":"k3_seren","appearance":185,"x":-11.9,"y":9,"z":13.14,"hasModel":true,"conversation":"k3_seren","distanceToPlayer":3.03}
[33.7s] screenshot: 03_area_with_npc.png
[33.7s] dialogue run: accept path
[33.8s]   Seren (E0): Hold a moment. Everyone on this dock walks past me, but you slowed down. I have been carrying a message for three years, and I think it was meant for you.
[35.3s] screenshot: 04_dialog_accept_path_E0.png
[36.8s]   player picks 1 of 2 (R0): A message? From whom?
[36.8s]   Seren (E1): From a ship that left Telos after the Sith Lords fell. It carried a Jedi past the edge of every star chart, chasing someone who had gone ahead.
[38.3s] screenshot: 05_dialog_accept_path_E1.png
[39.9s]   player picks 1 of 1 (R2): The Exile. You are talking about the Exile.
[39.9s]   Seren (E2): No one on this station says that name out loud anymore. The recording came back on an automated drone, with a set of coordinates and a warning.
[41.4s] screenshot: 06_dialog_accept_path_E2.png
[43.0s]   player picks 1 of 1 (R3): What was the warning?
[43.0s]   Seren (E3): That the Sith we fought were only the outer edge of something larger. An empire, old and patient, waiting in the dark beyond the charts. And that it is almost ready to come home.
[44.5s] screenshot: 07_dialog_accept_path_E3.png
[46.1s]   player picks 1 of 1 (R4): Why bring this to me?
[46.1s]   Seren (E4): Because the recording is sealed with the Force. It opens only for someone who carries it the way she did. When you walked past, the seal lit up in my hands.
[47.6s] screenshot: 08_dialog_accept_path_E4.png
[49.2s]   player picks 1 of 2 (R5): Then I will go. Tell me where.
[49.2s]   Seren (E5): Meet me at the docking ring when you are ready. Bring a ship that can make the long jump, and friends who will not turn back when the stars run out.
[50.7s] screenshot: 09_dialog_accept_path_E5.png
[52.3s]   run ended (11 steps)
[52.3s] dialogue run: refuse at start
[52.3s]   Seren (E0): Hold a moment. Everyone on this dock walks past me, but you slowed down. I have been carrying a message for three years, and I think it was meant for you.
[53.8s] screenshot: 10_dialog_refuse_at_start_E0.png
[55.4s]   player picks 2 of 2 (R1): Not interested. Find someone else.
[55.4s]   Seren (E6): Suit yourself. The message is not going anywhere, and neither am I. But whatever she found out there will not wait forever.
[56.9s] screenshot: 11_dialog_refuse_at_start_E6.png
[58.5s]   run ended (3 steps)
[58.5s] dialogue run: think it over
[58.5s]   Seren (E0): Hold a moment. Everyone on this dock walks past me, but you slowed down. I have been carrying a message for three years, and I think it was meant for you.
[60.1s] screenshot: 12_dialog_think_it_over_E0.png
[61.6s]   player picks 1 of 2 (R0): A message? From whom?
[61.7s]   Seren (E1): From a ship that left Telos after the Sith Lords fell. It carried a Jedi past the edge of every star chart, chasing someone who had gone ahead.
[63.2s] screenshot: 13_dialog_think_it_over_E1.png
[64.8s]   player picks 1 of 1 (R2): The Exile. You are talking about the Exile.
[64.8s]   Seren (E2): No one on this station says that name out loud anymore. The recording came back on an automated drone, with a set of coordinates and a warning.
[66.3s] screenshot: 14_dialog_think_it_over_E2.png
[67.9s]   player picks 1 of 1 (R3): What was the warning?
[67.9s]   Seren (E3): That the Sith we fought were only the outer edge of something larger. An empire, old and patient, waiting in the dark beyond the charts. And that it is almost ready to come home.
[69.4s] screenshot: 15_dialog_think_it_over_E3.png
[71.0s]   player picks 1 of 1 (R4): Why bring this to me?
[71.0s]   Seren (E4): Because the recording is sealed with the Force. It opens only for someone who carries it the way she did. When you walked past, the seal lit up in my hands.
[72.6s] screenshot: 16_dialog_think_it_over_E4.png
[74.1s]   player picks 2 of 2 (R6): I need time to think about this.
[74.1s]   Seren (E6): Suit yourself. The message is not going anywhere, and neither am I. But whatever she found out there will not wait forever.
[75.7s] screenshot: 17_dialog_think_it_over_E6.png
[77.2s]   run ended (11 steps)
[77.2s] coverage: entries E0,E1,E2,E3,E4,E5,E6 | replies R0,R1,R2,R3,R4,R5,R6
[77.2s] RESULT: PASS
```

## Earlier runs (what failed, what was fixed)

| Run | Time (EDT) | Outcome | Cause | Fix |
|---|---|---|---|---|
| 1 | 20:30 | Game window never opened | Test clicked the first launch button on the page, which belonged to KotOR Forge | Click only the visible button of the selected entry |
| 2, 3 | 20:33, 20:34 | Game folder setting did not stick | The running launcher writes its in-memory settings over outside changes | Answer the launcher's own folder dialog instead (shortcut 1) |
| 4 | 20:37 to 20:42 | Mod loaded, NPC placed, area wait timed out | Intro movies were still queued and played during the area load; also created `gameinprogress` in the real game folder | Skip movies; switch to the stand-in game folder |
| 5, 6 | 20:46 to 20:56 | Area wait timed out | The area's own arrival conversation put the engine in dialogue mode, which the test did not accept | Accept dialogue mode, then end that conversation |
| 7, 8 | 20:57, 20:59 | First reply not taken | The engine numbers live nodes -1; number keys are unbound; replies open only after a 3-second line timer | Track nodes by text, use the reply list's click handler, wait for the choice to open |
| 9 | 21:00 to 21:05 | First conversation passed; repeats stalled | **Engine bug:** a line shown a second time got a delay of 3,000 seconds (ms multiplied by 1000 again) and its clock was not reset | Fixed in `src/managers/CutsceneManager.ts` and `src/resource/DLGNode.ts` (keep the file's delay as `baseDelay`, restart the clock) |
| 10 | 21:06 to 21:07 | **PASS** | | |

## Incident: a folder was created inside the game folder

At 20:37:42 the KotOR.js game window of run 4 created an empty folder, `gameinprogress`, in `C:\Program Files (x86)\Steam\steamapps\common\Knights of the Old Republic II`. KotOR.js deletes and re-creates that folder in the chosen game folder every time it starts (`src/engine/CurrentGame.ts:70` and `:78`; in the browser, `:98` and `:104`). It did not exist when the folder was first listed at 19:57, so nothing was deleted. No other file in the game folder changed (file list compared at 20:45 and 21:07). The folder was left in place, because deleting inside the game folder is also outside this run's limits; Cam decides.

## Parse-back of the mod files

`node scripts/kotor3/run.mjs verify-mod` (KotOR.js's GFF reader, the format layer KotOR Forge uses):

```
k3_seren.utc: UTC, TemplateResRef k3_seren, Conversation k3_seren, name "Seren Vaux", appearance row 185
k3_seren.dlg: DLG, 7 entries + 7 replies = 14 nodes, 2 choice points, 1 starting link
verify-mod: PASS (2 game-format files parsed, manifest OK)
```

## Guard scan

- Branch tree: `node scripts/scan-no-game-files.mjs --game-dir <KOTOR II>`: PASS (about 1,840 files against 18,579 game files and 68,462 resources inside game archives).
- Local web build output: `--no-git --dir dist`: PASS (138 files).
- Negative checks on test copies in the session's scratch folder: a renamed game file, a resource cut from a RIM, a resource cut from a BIF, and a blocked file type were all caught (exit 1).

## Web build check (dev server, about 21:12 to 21:15 EDT)

`npm run dev` (also what `scripts/kotor3/start-local.cmd` runs) served the web build at `http://localhost:8080`:

```
200 /launcher/
200 /game/index.html?key=kotor3
200 /game/mods/kotor3/manifest.json (340 bytes)
200 /game/mods/kotor3/k3_seren.dlg (18265 bytes)
404 /game/mods/kotor3/src/k3_seren.dialogue.json   (authoring sources are not served)
```

In the Claude desktop app's built-in browser (Chromium): the web launcher listed "KOTOR III (fan)"; selecting it showed the PLAY button; PLAY opened the game page for the kotor3 profile (page title "KOTOR III fan sequel prototype (requires your own KOTOR II)"), which stopped at the KotOR.js disclaimer (CANCEL / OK). The disclaimer and the folder picker after it were left for Cam.

## Not covered by this test

- The Chrome web build with the real folder picker (Cam's click test). Chrome refuses folders under `C:\Program Files (x86)`, where this PC's KOTOR II is installed (Chromium source `chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc:501` to `:506`, read 2026-10-24), so Cam's checklist copies the game folder to `C:\Games` first.
- Quick character creation leading to `201tel` (code path in `src/game/tsl/menu/CharGenQuickPanel.ts`; Cam's click test).
- What KOTOR II's own arrival scene in `201tel` does if played through instead of ended (Cam's click test; see FEASIBILITY "What broke").
