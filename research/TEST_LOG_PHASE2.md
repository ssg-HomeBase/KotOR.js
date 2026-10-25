# Test log, Phase 2 (KOTOR III fan)

All runs on 2026-10-25 in the KotOR.js desktop app (Electron) on the stand-in game folder `C:devkotor3	est-artifactsgamedir-view` (junctions to the player's own KOTOR II data, its own root). Tests never run on the real game folder; they only list it (read only) before and after. Screenshots and full logs stay in `C:devkotor3	est-artifactsphase2` outside the repo, because screenshots show game assets.

Tools: `scripts/kotor3/e2e-phase2.mjs` (M1 engine checks), `scripts/kotor3/e2e-episode.mjs` (M2 playthrough), `scripts/kotor3/e2e-electron.mjs` (Phase 1 scene, regression), `scripts/kotor3/check-text.mjs` (originality against dialog.tlk, in memory), `scripts/kotor3/check-dlg.mjs` (independent GFF reader), `node scripts/kotor3/run.mjs build-mod` / `verify-mod`.

## Baseline (before any Phase 2 change)

`npm run webpack:dev`, then `e2e-electron.mjs` on branch `kotor3-phase2` at `6b70a2dd`: RESULT: PASS (entries E0 to E6, replies R0 to R6).

## M1 engine test (`e2e-phase2.mjs`, run m1_run4 on the episode build)

One session: New Game through the menus (class, Quick Character, Play) into `201tel`; Seren's scene with real number-key presses; a save, a change of state, a load; then a listing of the stand-in folder's root and of the whole real game folder compared with the listing taken before the session.

| Check | Result | Evidence |
|---|---|---|
| e_no_arrival_conversation | PASS | {"conversationsSeenIn10s":[],"switchedOff":[["triggers:201tel:201enter",1]],"areaTriggerTags":8} |
| b_number_keys_pick_replies | PASS | [{"key":1,"reply":"A message? From whom?","picked":true},{"key":1,"reply":"The Exile. You are talking about the Exile.","picked":true},{"key":1,"reply":"What was the warning?","picked":true},{"key":1,"reply":"Why bring this to me?","picked":true},{"key":1,"reply":"Then I will go. Tell me where.","pi |
| d_compiled_script_effect | PASS | {"goldBefore":0,"goldAfter":77,"expectedGain":77,"script":"k3_probe.ncs (compiled by build-mod from mods/kotor3/src/k3_probe.nss)"} |
| a2_saves_in_app_storage | PASS | {"folder":"C:\\dev\\kotor3\\test-artifacts\\phase2\\m1_run4\\electron-profile\\game-data\\kotor3\\Saves","files":["000001 - Game0/GLOBALVARS.res","000001 - Game0/PARTYTABLE.res","000001 - Game0/SAVEGAME.sav","000001 - Game0/savenfo.res","000001 - Game0/Screen.tga"]} |
| f_mod_state_survives_save_load | PASS | {"beforeSave":{"quest":20,"journalText":"Seren is coming with me on her courier s","stage":2,"metSeren":true,"partyTags":["","k3_seren"],"serenInAreaCount":0,"gold":77,"area":"201tel"},"afterLoad":{"quest":20,"journalText":"Seren is coming with me on her courier s","stage":2,"metSeren":true,"partyTa |
| a1_no_write_to_stand_in_root | PASS | {"removed":[],"added":[]} |
| a1_no_write_to_real_game_folder | PASS | {"entries":19487,"removed":[],"added":[]} |

Earlier runs of the same test while fixing the engine: m1_run1 5 of 7 (arrival scene still started: trigger tag only in the template; booleans and party lost on load), m1_run2 6 of 7 (boolean bit order; party slot), m1_run3 7 of 7. The fixes are in commit `d24b6171`.

## Phase 1 regression (`e2e-electron.mjs`)

RESULT: PASS after M1; area loaded with "auto conversation: none" (the base-game arrival scene is switched off).

## M2 episode playthrough (`e2e-episode.mjs`, run ep_run2)

Run: 2026-10-25T19:43:01.021Z on the stand-in game folder (`C:\dev\kotor3\test-artifacts\gamedir-view`), KotOR.js desktop app (Electron). Every reply was chosen with a real "1" key press. Screenshots stay outside the repo (they show game assets).

## New Game

Main menu, New Game, first class, Quick Character, Play: the game starts on the Citadel Station docks (`201tel`).

## Prologue 1: Seren Vaux (`k3_seren`)

- E0 (line): Hold a moment. Everyone on this dock walks past me, but you slowed down. I have been carrying a message for three years, and I think it was meant for you.
- R0 (key 1 of 2): A message? From whom?
- E1 (line): From a ship that left Telos after the Sith Lords fell. It carried a Jedi past the edge of every star chart, chasing someone who had gone ahead.
- R2 (key 1 of 1): The Exile. You are talking about the Exile.
- E2 (line): No one on this station says that name out loud anymore. The recording came back on an automated drone, with a set of coordinates and a warning.
- R3 (key 1 of 1): What was the warning?
- E3 (line): That the Sith we fought were only the outer edge of something larger. An empire, old and patient, waiting in the dark beyond the charts. And that it is almost ready to come home.
- R4 (key 1 of 1): Why bring this to me?
- E4 (line): Because the recording is sealed with the Force. It opens only for someone who carries it the way she did. When you walked past, the seal lit up in my hands.
- R5 (key 1 of 2): Then I will go. Tell me where.
- E5 (line): Meet me at the docking ring when you are ready. Bring a ship that can make the long jump, and friends who will not turn back when the stars run out.
- R7 (key 1 of 1): Why wait for a ship? I am ready to leave today.
- E7 (line): Then I am coming with you. My courier shuttle is fuelled, and the credits I just handed you will cover the clearance fee. The security officer on this dock still has to clear the shuttle before we lift.

State after: quests The Last Signal 20, A Navigator 0, A Ship 0; party: player, k3_seren.

## Prologue 2: Brannick (`k3_brannick`)

- E0 (line): You're the one walking with the Vaux girl. Heard her shuttle got topped up this morning. Wherever she's taking you, I hope you packed warmer than she did.
- R0 (key 1 of 2): We need a route that goes beyond the star charts.
- E2 (line): Past the charts? Nobody on Telos sells routes like that. On Nar Shaddaa they trade them like any other cargo. The Mandalorian clans flew a few of those lanes once, in my day.
- R3 (key 1 of 1): Who on Nar Shaddaa would sell one?
- E4 (line): Somebody who still remembers the old clan lanes, if you can find one sober. Start at the refugee landing pad. And keep one hand on your credit chip.
- R4 (key 1 of 1): Thank you, Brannick.
- E5 (line): Don't thank me. Just fly far enough for an old man who never got the chance.

State after: quests The Last Signal 20, A Navigator 10, A Ship 0; party: player, k3_seren.

## Prologue 3: Lieutenant Senn (`k3_senn`)

- E0 (line): Lieutenant Senn, Telos Security Force. Courier Vaux has filed to depart with a passenger aboard. I take it the passenger is you?
- R0 (key 1 of 2): That's me. We would like to leave today.
- E2 (line): The shuttle passed its inspection this morning, and the clearance fee is in. One last question for the log. Where is it bound?
- R3 (key 1 of 2): Nar Shaddaa.
- E4 (line): Nar Shaddaa. I will not ask why. Keep your wits about you there, and keep the courier out of trouble. Your shuttle is cleared for departure.

State after: quests The Last Signal 40, A Navigator 10, A Ship 10; party: player, k3_seren.

## Travel

Lieutenant Senn's last line ran `k3_go_nar`: the game moved to Nar Shaddaa (`301nar`).

## Act I 1: Seren on arrival (started by the mod's area-enter script) (`k3_sv_nar`)

- E0 (line): So this is Nar Shaddaa. Loud, crowded, and every second face is already pricing us. My shuttle got us this far, but it would come apart on the long jump.
- R0 (key 1 of 2): Then what do we need?
- E1 (line): Two things. A navigator who knows the routes past the charts, and a ship with the range to fly them. The coordinates in the recording are useless without both.
- R3 (key 1 of 2): Then we start asking around.
- E3 (line): Start with the refugees around the pad. People who have lost everything tend to notice who is asking questions, and who is listening to the answers.

State after: quests The Last Signal 40, A Navigator 10, A Ship 10; party: player, k3_seren.

## Act I 2: Kiri (`k3_kiri`)

- E0 (line): Mind the crates, dear. Everything I own is packed in them. Are you lost, or only new here? On this pad the two look much the same.
- R0 (key 1 of 2): I am looking for someone who knows the old routes past the charts.
- E1 (line): Then you want the Mandalorian. Scarred armour, quiet voice. She came through here asking about the old routes too, and about a ship that never came home.
- R3 (key 1 of 2): Where can I find her?
- E3 (line): She keeps to the far end of the pad, watching the ships land. If you want more than an old woman's guess, the Duros broker sells names.

State after: quests The Last Signal 40, A Navigator 20, A Ship 10; party: player, k3_seren.

## Act I 3: Zell Okkar (`k3_zell`)

- E0 (line): Ah, a new face carrying an old question. Zell Okkar, dealer in facts. The first answer is free, and the rest are priced to be remembered fondly.
- R0 (key 1 of 2): I need a navigator and a ship for a very long jump.
- E1 (line): The Mandalorian scout asking about the old routes is Rhea Vex. And for hulls that can make long jumps, see Hesk Varo at the end of the pad. Both are easy to find.
- R3 (key 1 of 2): And what do I owe you for that?
- E3 (line): Nothing today. Crews who chase routes past the charts either vanish or come back rich. I am betting on rich, and I have a long memory for friends.

State after: quests The Last Signal 40, A Navigator 20, A Ship 10; party: player, k3_seren.

## Act I 4: Rhea Vex (`k3_rhea`)

- E0 (line): You have been asking about me. The old woman or the Duros, I suppose. Either way, I am listening. Try to make it worth my time.
- R0 (key 1 of 2): I have coordinates past the charts, and I need a navigator.
- E2 (line): Past the charts? I have spent a year stitching together the route the Exile flew, one rumour at a time. Where did your coordinates come from?
- R3 (key 1 of 2): From the Exile herself. A recording she sent home.
- E4 (line): Then she got further than any of us guessed. All right, I will fly with you. But the clans hear everything I learn. That is my price, and it does not move.
- R6 (key 1 of 1): Your clans can have their share. Welcome to the crew.
- E6 (line): Good. Now find us a ship that can survive the trip. Hesk Varo has one he has been trying to sell for months. I will tell you what it is really worth.

State after: quests The Last Signal 40, A Navigator 30, A Ship 10; party: player, k3_seren, k3_rhea.

## Save and load (middle of the episode)

Saved as "K3 Episode mid" in the app's own storage, then removed the three quests and cleared a mod global, then loaded the save.

Before save: The Last Signal 40, A Navigator 30, A Ship 10; party player, k3_seren, k3_rhea.
After load: The Last Signal 40, A Navigator 30, A Ship 10; party player, k3_seren, k3_rhea; journal entries equal: true.

Save folder: `C:\dev\kotor3\test-artifacts\phase2\ep_run2\electron-profile\game-data\kotor3\Saves` (000001 - Game0).

## Act I 5: Hesk Varo (first visit) (`k3_hesk`)

- E2 (line): Welcome, welcome! Hesk Varo, the finest hulls on this landing pad and the friendliest prices on any of them. What are we flying today?
- R1 (key 1 of 1): Something that can jump past the star charts and keep going.
- E4 (line): Then you want the Far Lantern. An old long-range courier, plain as a cargo crate, but her drive will outlive both of us. Best range on the pad.
- R2 (key 1 of 2): She sounds right. What do you want for her?
- E5 (line): Your friend's shuttle in trade, plus a share of whatever you bring home. Done! Oh, and a woman in grey was here asking about your courier. I told her nothing, naturally.
- R5 (key 1 of 1): A woman in grey? Where did she go?
- E7 (line): Last I saw, near the far stairs. Never smiled once. My mechanic needs a little time with the Lantern anyway. Come back when you are ready to fly.

State after: quests The Last Signal 40, A Navigator 30, A Ship 20; party: player, k3_seren, k3_rhea.

## Act I 6: Corva (`k3_corva`)

- E0 (line): Leave the weapon holstered. Talking is all I came for. You and the courier have been asking about routes past the charts.
- R0 (key 1 of 2): Who sent you after us?
- E1 (line): Corva. I serve a lord with a very long memory. My name will not matter to you for much longer than this conversation.
- R2 (key 1 of 1): And what does your lord want from us?
- E2 (line): Go back to Telos. Give the recording to the station archive and forget the coordinates. What waits beyond the charts reaches far, and it has already noticed you.
- R3 (key 1 of 2): We are not turning back.
- E3 (line): Then my errand here is finished. When your signals start coming back unanswered, remember that someone offered you the way home first.

State after: quests The Last Signal 40, A Navigator 30, A Ship 20; party: player, k3_seren, k3_rhea.

## Act I 7: Hesk Varo (ship ready) (`k3_hesk`)

- E0 (line): There you are! Fuel cells full, hull patched, and your Mandalorian has already argued with my mechanic twice. The Far Lantern is waiting on you.
- R0 (key 1 of 1): Load the coordinates. We leave now.
- E3 (line): Coordinates loaded and locked. She is all yours. Try to return her with most of her panels attached, or at least come back with a decent story.

State after: quests The Last Signal 40, A Navigator 30, A Ship 30; party: player, k3_seren, k3_rhea.

## Act I 8: the crew boards the Far Lantern (started by k3_ship_done) (`k3_end`)

- E0 (line): This is it, then. A ship, a navigator, the coordinates, and a crew that came together in two days. I think she would have liked that.
- R0 (key 1 of 2): Everyone aboard. Time to go.
- E1 (line): Course is laid in from the recording. Past the last beacon, it is my clans' old lanes or nothing at all. Grab something solid.
- R3 (key 1 of 2): Take us out.
- E4 (line): Jumping now. Telos is behind us, and somewhere ahead is the last place she stopped. Let us go and see what she saw.

State after: quests The Last Signal 50, A Navigator 30, A Ship 30; party: player, k3_seren, k3_rhea.

## Checks

| Check | Result |
|---|---|
| auto_start_k3_sv_nar | PASS |
| auto_start_k3_end | PASS |
| save_load_mid_episode | PASS |
| quests_completed | PASS |
| companions_joined | PASS |
| episode_end_reached | PASS |
| every_conversation_played | PASS |
| no_base_game_conversation | PASS |
| no_write_stand_in_root | PASS |
| no_write_real_game_folder | PASS |

Nodes visited per conversation: k3_seren 13; k3_brannick 7; k3_senn 5; k3_sv_nar 5; k3_kiri 5; k3_zell 5; k3_rhea 7; k3_hesk 10; k3_corva 7; k3_end 5.

RESULT: PASS
