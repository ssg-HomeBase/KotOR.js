# R9 log: adopt before build (KOTOR III fan sequel, Phase 1)

Date: 2026-10-24. Rule R9 (ssg-HomeBase/the-lab AGENTS.md section 2): search for an existing proven approach before designing or writing anything. Method: web searches with the search tool, pages read with `curl` (no web fetch tool), GitHub facts from the GitHub REST API, and code read on disk in this fork at commit `002dfe03`. Nothing was installed for this search.

URL status: **[200]** opened with curl, HTTP 200. **[403]** blocked to curl, facts from the search summary only. **[search]** appeared in search results, not opened. Wookieepedia article URLs return 403 to curl; their text was read through the Fandom API (`api.php?action=parse`, HTTP 200).

## Searches run

| # | Query or check | Tool | Date | Result |
|---|---|---|---|---|
| 1 | `KOTOR III fan sequel mod deadlystream` | search | 2026-10-24 | Deadlystream thread 7341 (Talyn82 concept), thread 5324 (The Jedi Masters), DSOGaming on Revenge of Revan Episode 1 |
| 2 | `"Knights of the Old Republic III" fan project mod nexusmods OR moddb` | search | 2026-10-24 | ModDB "KOTOR III: The Jedi Masters" (total conversion); no Nexus KOTOR III project |
| 3 | `reddit r/kotor fan made KOTOR 3 mod project` | search | 2026-10-24 | Reddit mirror pages only; nothing new |
| 4 | `PyKotor HoloPatcher Holocron Toolset github` | search | 2026-10-24 | OpenKotOR/PyKotor (current), NickHugi/PyKotor (older), Holocron Toolset (DS file 1982), HoloPatcher (DS topic 9807) |
| 5 | KotOR Forge editors on disk: `src/apps/forge` (DLG, UTC, Module/GIT editors, NWScript compiler) | grep, read | 2026-10-24 | Found; GUI only, no command-line export (item 2a) |
| 6 | `override` in `src/apps/game/GameInitializer.ts`, `src/loaders/ResourceLoader.ts`, `README.md`, `wiki/` | grep, read | 2026-10-24 | Override loader found (item 4); `wiki/` is empty; README does not document mods |
| 7 | GitHub API issue search `repo:KobaltBlu/KotOR.js override` | curl | 2026-10-24 | 3 hits, none about Override or mod support |
| 8 | GitHub API issue search `repo:KobaltBlu/KotOR.js mod`, `mod support`, `modding` | curl | 2026-10-24 | No issue or PR asks for a mod loader (PR 95 and PR 109 are unrelated) |
| 9 | GitHub API `repos/` for KobaltBlu/KotOR.js, ssg-HomeBase/KotOR.js, OpenKotOR/PyKotor, NickHugi/PyKotor, d07RiV/diabloweb, diasurgical/devilution(X) | curl | 2026-10-24 | Licenses and last-push dates (below) |
| 10 | `nwnnsscomp KotOR NWScript compiler github license` | search | 2026-10-24 | meaglyn/nwn-tools (NWN fork), knsscomp (DS file 2239), NWScript Workbench; no license for a KotOR nwnnsscomp |
| 11 | `"KotOR Scripting Tool" deadlystream` | search | 2026-10-24 | Forum mentions only; no file page |
| 12 | `TSLPatcher changes.ini GFFList add creature to module .git tutorial` | search | 2026-10-24 | DS topic 6914 (manual GIT edit, then TSLPatcher) |
| 13 | `KotOR modding spawn NPC script OnEnter CreateObject tutorial deadlystream` | search | 2026-10-24 | DS topics 3894 (CreateObject and GIT placement), 8509 (trigger-spawned merchant) |
| 14 | `KotOR Tool Fred Tetra download deadlystream` | search | 2026-10-24 | DS file 280 |
| 15 | `HoloPatcher changes.ini GFFList AddField Struct documentation PyKotor wiki` | search, curl | 2026-10-24 | PyKotor wiki page `TSLPatcher-GFFList-Syntax` |
| 16 | `PyKotor NCS compiler nss compile python built-in nwnnsscomp replacement` | search | 2026-10-24 | PyKotor `InbuiltNCSCompiler`; knsscomp; DeNCS |
| 17 | `TSLPatcher stoffe download deadlystream` | search | 2026-10-24 | Nexus mirror kotor/mods/2 |
| 18 | `DevilutionX web browser play diablo own DIABDAT.MPQ` | search | 2026-10-24 | PC Gamer article; d07RiV/diabloweb |
| 19 | `OpenMW web browser port play Morrowind in browser own data files` | search | 2026-10-24 | PC Gamer, 2026-07-28: openmw-web |
| 20 | `"Revenge of Revan" KOTOR 2 mod episode 2 status` | search | 2026-10-24 | DS file 2707; no Episode 2 release found |
| 21 | Engine code paths for this build: `src/module/ModuleArea.ts` (GIT creature load), `src/module/ModuleCreature.ts` (UTC fields), `src/resource/DLGObject.ts` and `DLGNode.ts` (DLG fields), `src/managers/CutsceneManager.ts` (conversation flow), `src/controls/IngameControls.ts` and `src/controls/KeyMapper.ts` (reply keys: the number-key bindings are commented out at KeyMapper.ts:511, so replies are clicked), `src/managers/CheatConsoleManager.ts` (warp) | read | 2026-10-24 | Used to design the mod loader and the test (item 4) |
| 22 | Lore queries for the story bible (Wookieepedia Meetra Surik, Revan, True Sith; Avellone KOTOR 3 interviews; Kotaku 2009) | search, curl | 2026-10-24 | Listed in docs/STORY_BIBLE.md sources; the 2009 Kotaku interview itself was not found |

## 1. Existing fan KOTOR III projects

| Project | Status | URL | License |
|---|---|---|---|
| Revenge of Revan | Episode 1 released: set 8 years after KOTOR II, about 3 hours of play, canon and non-canon modes, installed with HoloPatcher (about 1.98 GB). No Episode 2 found. | https://deadlystream.com/files/file/2707-revenge-of-revan [200] (v1.0.1, modified 2025-04-08); https://www.dsogaming.com/?p=187101 [200] | None stated (permissions list only) |
| KOTOR III: The Jedi Masters | Released total-conversion mod; players called it rough in 2017 | https://www.moddb.com/mods/knights-of-the-old-republic-iii-the-jedi-masters [403]; https://deadlystream.com/topic/5324-so-how-is-this-the-jedi-masters-mod-by-trex/ [200] | None stated |
| "Knights of the Old Republic III" (Talyn82) | 2019 concept thread, no release | https://deadlystream.com/topic/7341-knights-of-the-old-republic-iii [200] | None stated |

Verdict: **use for reference only.** None has an open license, and all are desktop installs that patch the player's game files. They show a realistic fan scope (about 3 hours per episode) and the canon/non-canon toggle idea. Their assets and writing are not reused.

## 2. Tools for authoring KOTOR II files

| Tool | DLG | UTC | GIT placement | NSS to NCS | Form | License | Verdict |
|---|---|---|---|---|---|---|---|
| **KotOR Forge** (in this repo, `src/apps/forge`) | yes: `states/tabs/TabDLGEditorState.tsx`, GFF I/O in `dlg/dlgGffIO.ts` | yes: `states/tabs/TabUTCEditorState.tsx` | yes: `states/tabs/TabModuleEditorState.tsx` (3D module editor, writes GIT) | yes: in-tree TypeScript compiler `src/nwscript/compiler/NWScriptCompiler.ts` | browser GUI; no command-line export | GPL-3.0 (https://api.github.com/repos/KobaltBlu/KotOR.js [200]) | **adopt as published** |
| PyKotor, HoloPatcher, Holocron Toolset (https://github.com/OpenKotOR/PyKotor [200]) | yes | yes | yes (Module Designer; HoloPatcher GFFList patches) | yes (`InbuiltNCSCompiler`) | Python library, CLI and GUI; needs pip/pipx | README says LGPL-3.0-or-later; no LICENSE file on master; API shows none. Older NickHugi/PyKotor: LGPL-3.0 | reference only: needs new software on this PC |
| nwnnsscomp, knsscomp (https://deadlystream.com/files/file/2239-knsscomp/ [200]) | no | no | no | yes | native executables | none stated | not usable here (install) |
| TSLPatcher (https://www.nexusmods.com/kotor/mods/2 [403]) | patches | patches | patches (`changes.ini`) | no | Windows installer | none stated (freeware) | not usable here; its `changes.ini` is the reference format |
| KotOR Tool (https://deadlystream.com/files/file/280-kotor-tool/ [200]) | K1 only | GFF editor | no | via external compiler | Windows GUI, 2013 | none stated | not usable here |

How the build uses KotOR Forge: Forge's editors are GUI-only, so the mod's files are written by a small script, `scripts/kotor3/build-mod.ts`, that calls the same KotOR.js format classes Forge uses (`src/resource/GFFObject.ts`, `getExportBuffer` at line 705). `scripts/kotor3/verify-mod.ts` parses every file back with the same reader. This is fallback F4 in spirit: there is no headless format tool, so KotOR.js's own TypeScript readers and writers are used, and the gap is recorded here and in docs/FEASIBILITY.md. Phase 1's dialogue uses no scripts, so no NCS was compiled; the in-tree compiler is the Phase 2 path.

## 3. How the community adds a new NPC to an existing area without shipping game files

1. Patch the module's GIT creature list at install time with a `changes.ini` `[GFFList]` AddField struct (TSLPatcher or HoloPatcher). Source: https://raw.githubusercontent.com/wiki/OpenKotOR/PyKotor/TSLPatcher-GFFList-Syntax.md [200]; manual version at https://deadlystream.com/topic/6914-creature-spawning/ [200].
2. Spawn by script with `CreateObject` from an OnEnter hook, a dialogue action or a trigger. Sources: https://deadlystream.com/topic/3894-module-npc-and-object-placement/ [200]; https://deadlystream.com/topic/8509-a-mandalorian-merchant-mod/ [200].
3. Caveat (topic 3894): GIT contents spawn only on the first visit to an area; after that the save wins, so script spawns cover saves that already visited the area.

Verdict: **adopt pattern 1's data shape, run it in the engine.** The mod lists each new creature as a GIT-style entry (template, X/Y/Z, facing) in `mods/kotor3/manifest.json`, and the engine adds it when the area's GIT loads (`src/module/ModuleArea.ts`, after the "Creatures" block). Nothing in the player's folder is patched. The caveat is handled one way: a save that already holds the creature does not get a second copy. Script spawns for old saves are Phase 2.

## 4. How KotOR.js loads Override and mod files (upstream, before this branch)

- `src/apps/game/GameInitializer.ts` line 255: `LoadOverride()` runs inside `LoadGameResources()`. Lines 344 to 366 read the top level of the game's `Override` folder and put each file in the OVERRIDE cache (line 359). Subfolders are not read.
- `src/loaders/ResourceLoader.ts` line 203: `getCache()` checks the OVERRIDE scope before module archives and chitin.key. Line 152: the call to `searchLocal()` (on-demand Override reads) is commented out, so files added after startup are not seen. Line 61: `InitOverrideCache()` only clears the cache.
- There is no mod loader, no mod folder and no way to add creatures to an area without editing game files. Upstream issues and README say nothing about mods; `wiki/` is empty.

Verdict: **adopt the OVERRIDE cache as published; add the smallest loader (fallback F3).** This branch adds `src/managers/ModManager.ts`: it reads `mods/<key>/manifest.json` from the web build, puts the listed files into the OVERRIDE cache after the game's own Override folder (so the mod wins), and hands creature placements to the area loader.

## 5. Browser games that make players supply their own game files

- DiabloWeb: the full game needs the player's own `DIABDAT.MPQ`. https://pcgamer.com/games/rpg/you-can-play-the-original-and-best-version-of-diablo-in-your-browser-again [200] (18 Aug 2024). Repo d07RiV/diabloweb: no license field in the API.
- openmw-web: Morrowind in the browser from the player's own data files. https://pcgamer.com/games/the-elder-scrolls/you-can-now-play-morrowind-entirely-in-your-browser-honestly-just-wanted-to-see-if-it-could-be-done [200] (28 Jul 2026).

Verdict: **reference only.** Both confirm the model this project uses: the page ships no game data and reads the player's own copy.

## Summary of what was adopted

| Need | Adopted | Source | License |
|---|---|---|---|
| File formats (GFF for UTC and DLG) | KotOR.js / KotOR Forge format classes, unmodified | `src/resource/GFFObject.ts` | GPL-3.0 |
| Resource priority | KotOR.js OVERRIDE cache scope | `src/loaders/ResourceLoader.ts:203` | GPL-3.0 |
| NPC placement data shape | GIT "Creature List" entry, as in TSLPatcher/HoloPatcher GFFList patches | PyKotor wiki TSLPatcher-GFFList-Syntax | format reference only |
| Bring-your-own-files model | KotOR.js folder picker (File System Access API) | upstream KotOR.js | GPL-3.0 |
