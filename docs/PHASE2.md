# KOTOR III (fan) Phase 2

Started 2026-10-25. Branch `kotor3-phase2`, built on `kotor3-phase1` (PR 1). Do not merge.

## Objective
Turn the Phase 1 prototype of the fan-made "KOTOR III" (premise "The Last Signal", docs/STORY_BIBLE.md section 4) into a first playable episode slice that runs as a mod on top of each player's own KOTOR II in KotOR.js, and test co-op.

## Milestones
1. **M1, engine and preview.** Saves and in-progress files move out of the game folder (browser: origin private file system; desktop app: Electron's user data folder) and the game folder is opened read-only; the Grant Access box explains Chrome's Program Files block and the `C:\Games` copy; number keys 1 to 9 pick dialogue replies; mod scripts (`.nss`) compile at build time with the in-tree NWScript compiler; a manifest field switches off named base-game conversations, scripts, triggers or creatures per area; mod globals, journal, quest stages, party and placements survive save and load; a deploy guard keeps upstream screenshots out of deploys; a protected Vercel preview (Vercel Authentication, previews only).
2. **M2, the episode.** A text-only episode: the Citadel Station prologue and the Nar Shaddaa opening of Act I, about 10 conversations, 3 quests, Seren Vaux and Rhea Vex joining the party, all in the player's own KOTOR II areas. Design in docs/EPISODE1.md.
3. **M3, co-op spike.** On branch `kotor3-coop-spike` (PR 3 into this branch): two game windows on one PC see each other move over a WebRTC data channel with local signaling; go or no-go in research/COOP_SPIKE.md.

## Rules carried from Phase 1
No KOTOR game file, extracted or converted asset, or screenshot of game assets in any commit, PR or deploy. `scripts/scan-no-game-files.mjs` runs before every push and deploy.

## Kickoff
The run brief is `C:\dev\kotor3\phase2\KICKOFF.md` on the developer's PC (outside the repo).
