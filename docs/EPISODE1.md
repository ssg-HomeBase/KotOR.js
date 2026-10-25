# KOTOR III (fan) Episode 1: "The Last Signal" (design)

Phase 2, 2026-10-25. Text only, about 30 to 45 minutes. Runs as a mod on the player's own KOTOR II in KotOR.js (`mods/kotor3/`). Everything here is **fan invention** unless a line is marked **Lore** with a source; it follows docs/STORY_BIBLE.md section 4 (premise "The Last Signal", cast, planets, acts) and adds no new lore claims beyond it.

## Where it sits in the story bible

- **Prologue: The Message (Citadel Station)**: Seren Vaux stops the player on the docks and offers the Exile's sealed recording (story bible section 4, "Prologue"). This episode grows Phase 1's scene into the prologue: Seren joins the player, an old spacer gives a lead, and a Telos Security Force officer clears the departure.
- **Act I opening (Nar Shaddaa)**: "Find a navigator and a ship that can make the jump" (story bible, Planets table, Nar Shaddaa row). Rhea Vex, the Mandalorian scout the clans sent to learn where Revan went (story bible, Cast), becomes the navigator and joins. Darth Severis's hidden scouts (story bible, Cast) make their first move through a watcher. Dantooine, Tamsin Rho, VX-9 and Ashkar come in a later episode.

## Areas (the player's own KOTOR II areas; no area file is shipped)

| Area | KOTOR II module | Used for | Base-game content switched off (manifest `switchOff`) |
|---|---|---|---|
| Citadel Station docks | `201tel` | Prologue: Seren, Brannick, Lieutenant Senn | arrival trigger `201Enter`, arrival conversation `201bay` |
| Nar Shaddaa, Refugee Landing Pad | `301nar` | Act I opening: Seren's arrival talk, Kiri, Zell Okkar, Rhea Vex, Hesk Varo, Corva | KOTOR II's arrival and companion triggers (`301Arrival`, `301AttonWarn2`, `301AttonHelp`, `301KreiaTouch`, `TT32Talk`, `TriggerLupo`, `301Mug`, `301Ref3`, `301RefEnc`, `301Ratrin`, `tr_thugboss`, `RedEclipseArrival`, `RedEclipseAttack`, `tr_spawn_mira`, `tr_prevent306`, `tr_swoop_return`) and the hostile Exchange thugs (`ExchangeThug1` to `ExchangeThug4`, `ThugBoss`, `GranThug`) so the episode stays a text episode |

**Travel from Telos to Nar Shaddaa (fan invention):** Seren's courier shuttle. When Lieutenant Senn grants clearance, the conversation's last line runs `k3_go_nar`, which moves the player and party to `301nar` (`StartNewModule`). On arrival the mod's own area-enter script (`k3_nar_enter`, manifest `onEnter`) starts Seren's arrival talk once.

## Cast in this episode

| Character | Tag | Body (KOTOR II appearance row, by reference) | Where | Role |
|---|---|---|---|---|
| Seren Vaux | `k3_seren` | 185 (female commoner) | 201tel (-11.9, 9.0); then party | Courier with the recording; joins in the prologue (party slot 4) |
| Brannick | `k3_brannick` | 193 (old male commoner) | 201tel (-17.1, 15.07) | Retired spacer; knows Nar Shaddaa is where routes past the charts are sold |
| Lieutenant Senn | `k3_senn` | 483 (TSF officer, female) | 201tel (-8.57, 11.53) | Telos Security Force dock officer; grants departure clearance |
| Kiri | `k3_kiri` | 342 (old female refugee) | 301nar (-105.22, 22.8) | Refugee who saw a Mandalorian asking about the old routes |
| Zell Okkar | `k3_zell` | 373 (Duros) | 301nar (-103.76, 26.34) | Information broker on the landing pad |
| Rhea Vex | `k3_rhea` | 351 (Mandalorian, armoured) | 301nar (-112.29, 29.87); then party | Mandalorian scout; becomes the navigator; joins (party slot 2) |
| Hesk Varo | `k3_hesk` | 365 (Twi'lek male) | 301nar (-112.29, 22.8) | Ship broker with an old long-range courier, the *Far Lantern* (fan invention) |
| Corva | `k3_corva` | 590 (female commoner) | 301nar (-116.76, 26.34) | A watcher for Darth Severis's scouts; warns the crew off |

Party slots reuse KOTOR II's own slots (no new slots exist; research/R9_LOG.md search 34): Seren in slot 4 and Rhea in slot 2, neither of whose base-game companions appears in this episode.

## Quests (mod data in `mods/kotor3/campaign.json`, no game table shipped)

| Tag | Name | Stages |
|---|---|---|
| `k3_signal` | The Last Signal | 10 heard Seren out; 20 Seren joins, find a way off the station; 30 cleared to leave for Nar Shaddaa; 40 arrived on Nar Shaddaa; 50 the ship and navigator are ready (end) |
| `k3_navigator` | A Navigator Past the Charts | 10 a navigator who knows the routes past the charts can be found on Nar Shaddaa; 20 a Mandalorian scout has been asking about the old routes; 30 Rhea Vex joins as navigator (end) |
| `k3_ship` | A Ship That Will Not Turn Back | 10 a long-range ship is needed; 20 Hesk Varo agreed to sell the *Far Lantern*; 30 the ship is ready (end) |

Mod globals: `K3_MET_SEREN`, `K3_SEREN_JOINED`, `K3_BRANNICK_TALKED`, `K3_CLEARANCE`, `K3_NAR_ARRIVED`, `K3_RHEA_JOINED`, `K3_SHIP_PAID`, `K3_CORVA_MET`, `K3_EPISODE_DONE` (Boolean), `K3_SIGNAL_STAGE` (Number, kept for the engine test).

## Conversations (10)

Rule for every conversation: the **first reply in every reply list is the main-path choice** (it advances the episode), so pressing 1 at each choice plays the episode through; other replies branch and come back or end politely. Conditional openings are listed first in `start`, the plain opening last.

| # | File | Owner | Opens when | Main path does | Scripts |
|---|---|---|---|---|---|
| 1 | `k3_seren` | Seren | first talk (Phase 1 scene, kept); a "you came back" opening if the player refused before | the player hears the warning and agrees; Seren gives credits for the clearance fee and joins | `k3_q_sig10` on the first line; `k3_probe` (77 credits) on the accept line; `k3_sv_join` when she joins; conditions `k3_c_metsv` |
| 2 | `k3_brannick` | Brannick | after Seren joined (otherwise a short grumble) | he says routes past the charts are bought and sold on Nar Shaddaa, and the clans once flew them | `k3_q_nav10`; condition `k3_c_svjoin` |
| 3 | `k3_senn` | Lieutenant Senn | after Seren joined (otherwise "move along") | she checks the shuttle, asks where it is going, and clears it | `k3_go_nar` (signal 30, travel); condition `k3_c_svjoin` |
| 4 | `k3_sv_nar` | Seren | started once by `k3_nar_enter` on arrival | Seren sizes up Nar Shaddaa: they need a navigator and a ship | `k3_q_arrive` (signal 40, navigator 10, ship 10) |
| 5 | `k3_kiri` | Kiri | any time | she saw a Mandalorian in scarred armour asking about old routes | `k3_q_nav20` |
| 6 | `k3_zell` | Zell Okkar | any time | he sells what he knows: the scout is Rhea Vex; Hesk Varo sells ships that can make long jumps | `k3_q_nav20` |
| 7 | `k3_rhea` | Rhea Vex | after navigator stage 20 (otherwise she waves the player off) | she has been mapping the Exile's route for her clan; she joins as navigator | `k3_rh_join` (navigator 30); condition `k3_c_nav20` |
| 8 | `k3_hesk` | Hesk Varo | first visit; a "ready" opening when the ship is paid for, Rhea has joined and Corva was met; otherwise "come back with your navigator" | first visit: the *Far Lantern* is sold; he mentions a woman in grey asking about Seren. Ready visit: the ship is fuelled and the coordinates load | `k3_q_ship20`; `k3_ship_done` (ship 30, starts conversation 10); conditions `k3_c_ready`, `k3_c_shippaid` |
| 9 | `k3_corva` | Corva | any time | she warns the crew that the dark beyond the charts has a long reach; the player refuses to turn back | `k3_corva_met`; ends with her leaving |
| 10 | `k3_end` | Seren (Rhea speaks too) | started by `k3_ship_done` | the crew boards the *Far Lantern*; the episode ends on the jump | `k3_ep_end` (signal 50, `K3_EPISODE_DONE`) |

## Playthrough order (the automated test follows it)

New Game (Quick Character) into `201tel` → Seren (joins) → Brannick → Senn (travel) → Seren's arrival talk (automatic) → Kiri → Zell → Rhea (joins) → **save, change state, load, check quest stages, journal and party** → Hesk (first visit) → Corva → Hesk (ready) → final scene → episode end.

## Writing rules

- Original lines only; no KOTOR dialogue is quoted or paraphrased. All new text is compared by script with the player's own `dialog.tlk` (read in memory): 0 exact matches and 0 shared runs of 6 or more words.
- Plain, spoken lines of at most about 40 words; the player character is never named.
- Fan inventions in the dialogue (not lore): the Mandalorian clans once flew a few lanes past the charts, which Rhea now reads; the *Far Lantern*; Corva's unnamed lord.
- New lore claims need a URL and date in docs/STORY_BIBLE.md; this episode adds none (it uses the story bible's lore 2, 3 and 9 only through Seren's recording and Rhea's clan).

## Engine pieces this design needs (all in M1 or small additions on the branch)

Placements, switch-offs and quests from mod data (M1.5, M1.6); compiled mod scripts (M1.4); the manifest `onEnter` area script (`src/module/ModuleArea.ts`, `runOnEnterScripts`, added in M2 as fallback F3); party joins through `AddAvailableNPCByTemplate` and `AddPartyMember` (fixed in M1.6).
