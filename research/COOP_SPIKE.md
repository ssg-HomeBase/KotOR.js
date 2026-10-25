# KOTOR III (fan) co-op spike (Phase 2, M3)

Date: 2026-10-25. Branch `kotor3-coop-spike` (built on `kotor3-phase2`). Question: can two KotOR.js game windows, each on its own copy of the player's KOTOR II files, see each other move, with nothing but positions and actions crossing the link?

## Verdict: go (with conditions)

**Go** on the transport and the avatar sync: on one PC, two KotOR.js desktop-app windows connected over a WebRTC data channel set up through a local signaling relay, and each saw the other player move, walk and animate in KOTOR II's Citadel Station docks (`201tel`), with updates logged both ways and only position, facing and animation fields on the wire (test log below: 6 of 6 checks). The conditions are the parts the spike did not try: play across the internet (STUN/TURN and a hosted signaling service), shared game state (combat, dialogue, saves) and the player-two controls. Those carry most of the estimate below.

## Revised co-op estimate: about 1,300 person-hours

Phase 1 estimated about 1,400 person-hours for two-player online co-op (docs/FEASIBILITY.md, "(b) Two-player co-op"). The spike took about 0.3 hours of agent time (15:52 to 16:00 EDT on 2026-10-25, plus about 0.3 hours drafted earlier while other tests ran) for the transport and a remote avatar, so the networking line is cheaper than assumed; everything that depends on shared game state is unchanged.

| Part | Phase 1 | Revised | Why |
|---|---|---|---|
| Networking: WebRTC data channel plus signaling | 200 | 120 | The local version works (`src/coop/CoopSession.ts`, `scripts/kotor3/coop-signal.mjs`); still needed: hosted signaling and matchmaking, STUN/TURN for players behind NAT, reconnects, a simple room code UI |
| Sync of objects, actions and animations from the host | 500 | 480 | Player position, facing and animation sync proven; still needed: every creature, door, placeable and action queue from the host, interpolation |
| Combat rounds and dice results from the host | 150 | 150 | not tried |
| Player 2 controls a party member | 200 | 200 | not tried |
| Shared dialogue and cutscenes | 120 | 120 | not tried |
| Saving, loading and joining a game in progress | 150 | 150 | not tried |
| Lag, disconnects and testing | 80 | 80 | not tried across a real network |
| **Total** | **about 1,400** | **about 1,300** | |

## What worked

- **Signaling** through a 49-line relay on 127.0.0.1 using the `ws` package already in node_modules (`scripts/kotor3/coop-signal.mjs`); no third-party server. It only relays join, offer, answer, ICE candidate and bye messages (line 17) and refuses connections from other machines (line 25).
- **WebRTC data channel** between the two Electron windows with no ICE servers at all (`src/coop/CoopSession.ts:58`), unordered and without retransmits (line 76), opened in about 20 ms after the offer.
- **Updates** about 10 times a second each way (line 70): `{k, s, x, y, z, f, a}` (position, facing, animation state index). Each side spawns the other player as `k3_coop_peer`, a mod character that uses KOTOR II appearance row 190 by reference, and moves it with every update.
- **Walking with a real W key press** in one window showed up in the other: the copy moved about 13 m and its animation state went from idle (10000) to the walk and run states (10002, 10004).
- **No game data on the wire**: every received message was checked for exactly those seven fields (bad messages: 0 in both windows).
- **mDNS**: Electron hides local addresses behind mDNS names by default; the test passed both with that default (run 3) and with it switched off (`--disable-features=WebRtcHideLocalIpsWithMdns`, run 2).

## What broke or is missing (file and line)

| # | Finding | File and line |
|---|---|---|
| 1 | KotOR.js has no networking layer; the spike adds one class beside the engine and exposes it as `KotOR.CoopSession`. Nothing in the engine knows another player exists (no authority, no object ids shared between windows). | `src/coop/CoopSession.ts`; `src/KotOR.ts` (export) |
| 2 | Animation states are engine-internal numbers (`ModuleCreatureAnimState`, e.g. 10000 idle), so both players must run the same KotOR.js build. | `src/coop/CoopSession.ts`, `sendUpdate` (field `a`) |
| 3 | The remote player is drawn without collision, so the local player can walk through it; real co-op needs it to be a proper party creature. | `src/coop/CoopSession.ts:150` |
| 4 | Positions are applied as they arrive (10 per second) with no interpolation, so a running copy moves in steps of about half a metre. | `src/coop/CoopSession.ts`, `receive` |
| 5 | Only localhost was tried: no STUN/TURN, no hosted signaling, so two players on different networks cannot connect yet. | `src/coop/CoopSession.ts:58` (`iceServers: []`); `scripts/kotor3/coop-signal.mjs:22` (127.0.0.1 only) |
| 6 | The spike is started from the console or a test (`KotOR.CoopSession.start`); there is no menu for it. | `src/coop/CoopSession.ts` |

## How it was tested

`node scripts/kotor3/e2e-coop.mjs --game-dir "<stand-in folder>" --out "<folder outside the repo>"` starts the relay, opens two desktop-app windows with separate profiles on the stand-in game folder, loads `201tel` in both, starts the session (window A host, window B guest), moves each player in turn by script and then by holding W, and checks what the other window shows. Screenshots stay outside the repo (they show game assets).

## Test log (run 2, 2026-10-25)

Run: 2026-10-25T19:55:07.958Z. Two KotOR.js desktop-app windows on one PC, stand-in game folder, area `201tel`. Signaling relay on ws://127.0.0.1:8765 (`scripts/kotor3/coop-signal.mjs`).

## Setup

Both windows started KOTOR III and loaded `201tel` from the player's own KOTOR II files.

## Connection

Host (window A) and guest (window B) exchanged offer, answer and ICE candidates through the relay; the data channel opened in both windows, and each window spawned the other player as `k3_coop_peer` (KOTOR II appearance row by reference).

## Window A (host) moves, window B watches

- step 5: Window A (host) at (-12.57, 11.53); window B shows it at (-12.57, 11.53)
- step 10: Window A (host) at (-11.57, 11.53); window B shows it at (-11.57, 11.53)
- step 15: Window A (host) at (-10.57, 11.53); window B shows it at (-10.57, 11.53)

window B's copy ended 0.00 m from where Window A (host) stopped; 15 distinct positions seen during the move.

## Window B (guest) moves, window A watches

- step 5: Window B (guest) at (-13.57, 12.53); window A shows it at (-13.57, 12.53)
- step 10: Window B (guest) at (-13.57, 13.53); window A shows it at (-13.57, 13.53)
- step 15: Window B (guest) at (-13.57, 14.53); window A shows it at (-13.57, 14.53)

window A's copy ended 0.00 m from where Window B (guest) stopped; 15 distinct positions seen during the move.

## Window A (host) walks (W key held 2.4 s), window B watches

window B's copy moved 13.22 m; animation states received during the walk: 10002, 10004; all animation states received so far: 10000, 10002, 10004.

## Window B (guest) walks (W key held 2.4 s), window A watches

window A's copy moved 13.43 m; animation states received during the walk: 10002, 10004; all animation states received so far: 10000, 10002, 10004.

## Messages

Window A sent 164 and received 164 updates; window B sent 164 and received 164. Every message had exactly the fields k, s, x, y, z, f, a (bad messages: A 0, B 0).

Example update A to B: `{"k":"pos","s":164,"x":-2.923,"y":0.749,"z":13.142,"f":-2.553,"a":10000}`

Example update B to A: `{"k":"pos","s":164,"x":-6.332,"y":3.22,"z":13.142,"f":-2.553,"a":10000}`

Window A events:
- 19:55:38.678 joined signaling room k3 as host
- 19:55:38.693 offer sent
- 19:55:38.695 answer received
- 19:55:38.695 connection connecting
- 19:55:38.704 data channel open (host)
- 19:55:38.704 connection connected
- 19:55:38.815 other player shown as k3_coop_peer

Window B events:
- 19:55:38.691 joined signaling room k3 as guest
- 19:55:38.694 answer sent
- 19:55:38.695 connection connecting
- 19:55:38.696 connection connected
- 19:55:38.703 data channel open (guest)
- 19:55:38.814 other player shown as k3_coop_peer

## Signaling relay log

- coop-signal: listening on ws://127.0.0.1:8765
- host joined room k3 (1 in room)
- guest joined room k3 (2 in room)
- host left room k3
- message counts: {"join":2,"offer":1,"candidate":4,"answer":1}
- guest left room k3
- message counts: {"join":2,"offer":1,"candidate":4,"answer":1}

## Checks

| Check | Result |
|---|---|
| b_sees_a_move | PASS |
| a_sees_b_move | PASS |
| b_sees_a_walk_and_animate | PASS |
| a_sees_b_walk_and_animate | PASS |
| updates_logged_both_ways | PASS |
| only_positions_and_actions | PASS |

RESULT: PASS

Run 3 (`--keep-mdns`, Electron's default address hiding left on): RESULT: PASS (6 of 6 checks), connection in about 10 ms.
