import { GameState } from "@/GameState";
import { GFFObject } from "@/resource/GFFObject";
import { ResourceLoader } from "@/loaders";
import { ResourceTypes } from "@/resource/ResourceTypes";
import type { ModuleCreature } from "@/module";

/** The only message that crosses the peer-to-peer link: a position, a facing and an animation. */
export interface ICoopUpdate {
  k: 'pos';
  /** Sequence number. */
  s: number;
  x: number;
  y: number;
  z: number;
  /** Facing in radians. */
  f: number;
  /** Animation state index (ModuleCreatureAnimState). */
  a: number;
}

/**
 * CoopSession class (KOTOR III Phase 2, M3 co-op spike).
 *
 * Connects two game windows on one PC: WebRTC signaling goes through a WebSocket relay on 127.0.0.1
 * (scripts/kotor3/coop-signal.mjs); then each side sends its player's position, facing and current
 * animation about 10 times a second over an RTCDataChannel and shows the other player as a creature
 * built from a mod template that uses a KOTOR II appearance row by reference. Only positions and
 * actions cross the link, never game files. A spike, not a co-op mode: no shared state, combat,
 * dialogue or saves.
 *
 * Start from the console or a test: KotOR.CoopSession.start({ role: 'host' | 'guest', port: 8765 })
 *
 * @file CoopSession.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class CoopSession {
  static ws: WebSocket | undefined;
  static pc: RTCPeerConnection | undefined;
  static channel: RTCDataChannel | undefined;
  static role: 'host' | 'guest' = 'host';
  static template = 'k3_coop_peer';
  static remote: ModuleCreature | undefined;
  static spawning = false;
  static timer: any;
  static seq = 0;
  static stats = { open: false, sent: 0, received: 0, badMessages: 0, keys: [] as string[], anims: [] as number[], lastSent: null as ICoopUpdate | null, lastReceived: null as ICoopUpdate | null, events: [] as string[] };

  static note(msg: string) {
    CoopSession.stats.events.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
    console.log('CoopSession:', msg);
  }

  static async start(opts: { role: 'host' | 'guest', port?: number, room?: string, template?: string, rateHz?: number }) {
    CoopSession.stop();
    CoopSession.role = opts.role;
    CoopSession.template = opts.template || 'k3_coop_peer';
    const port = opts.port || 8765, room = opts.room || 'k3', rate = opts.rateHz || 10;
    const pc = new RTCPeerConnection({ iceServers: [] });
    CoopSession.pc = pc;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    CoopSession.ws = ws;
    const signal = (m: any) => ws.readyState === 1 && ws.send(JSON.stringify(m));
    pc.onicecandidate = (e) => { if (e.candidate) signal({ type: 'candidate', candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => CoopSession.note(`connection ${pc.connectionState}`);
    const useChannel = (ch: RTCDataChannel) => {
      CoopSession.channel = ch;
      ch.onopen = () => {
        CoopSession.stats.open = true;
        CoopSession.note(`data channel open (${CoopSession.role})`);
        CoopSession.timer = setInterval(() => CoopSession.sendUpdate(), Math.round(1000 / rate));
      };
      ch.onclose = () => { CoopSession.stats.open = false; CoopSession.note('data channel closed'); };
      ch.onmessage = (e) => CoopSession.receive(e.data);
    };
    if (CoopSession.role === 'host') {
      useChannel(pc.createDataChannel('k3-coop', { ordered: false, maxRetransmits: 0 }));
    } else {
      pc.ondatachannel = (e) => useChannel(e.channel);
    }
    ws.onmessage = async (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === 'peer-joined' && CoopSession.role === 'host') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal({ type: 'offer', sdp: pc.localDescription });
        CoopSession.note('offer sent');
      } else if (m.type === 'offer' && CoopSession.role === 'guest') {
        await pc.setRemoteDescription(m.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal({ type: 'answer', sdp: pc.localDescription });
        CoopSession.note('answer sent');
      } else if (m.type === 'answer' && CoopSession.role === 'host') {
        await pc.setRemoteDescription(m.sdp);
        CoopSession.note('answer received');
      } else if (m.type === 'candidate' && m.candidate) {
        try { await pc.addIceCandidate(m.candidate); } catch (e) { CoopSession.note(`ice candidate rejected: ${e}`); }
      }
    };
    await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error('signaling server not reachable')); });
    signal({ type: 'join', room, role: CoopSession.role });
    CoopSession.note(`joined signaling room ${room} as ${CoopSession.role}`);
  }

  /** This window's player: position, facing, animation. */
  static sendUpdate() {
    const p = GameState.PartyManager?.party?.[0];
    if (!p || !CoopSession.channel || CoopSession.channel.readyState !== 'open') return;
    const u: ICoopUpdate = {
      k: 'pos', s: ++CoopSession.seq,
      x: +p.position.x.toFixed(3), y: +p.position.y.toFixed(3), z: +p.position.z.toFixed(3),
      f: +(p.getFacing ? p.getFacing() : p.rotation.z).toFixed(3),
      a: (p as any).animationState?.index ?? 0,
    };
    CoopSession.channel.send(JSON.stringify(u));
    CoopSession.stats.sent++;
    CoopSession.stats.lastSent = u;
  }

  static receive(data: any) {
    let u: ICoopUpdate;
    try { u = JSON.parse(String(data)); } catch { CoopSession.stats.badMessages++; return; }
    const keys = Object.keys(u).sort().join(',');
    if (keys !== 'a,f,k,s,x,y,z' || u.k !== 'pos') { CoopSession.stats.badMessages++; return; }
    if (!CoopSession.stats.keys.includes(keys)) CoopSession.stats.keys.push(keys);
    CoopSession.stats.received++;
    if (!CoopSession.stats.anims.includes(u.a)) CoopSession.stats.anims.push(u.a);
    CoopSession.stats.lastReceived = u;
    if (!CoopSession.remote) { CoopSession.spawnRemote(u); return; }
    const r = CoopSession.remote;
    r.position.set(u.x, u.y, u.z);
    r.setFacing(u.f, true);
    if ((r as any).animationState?.index !== u.a && typeof (r as any).setAnimationState === 'function') (r as any).setAnimationState(u.a);
  }

  /** The other player, shown as a creature from a mod template (KOTOR II appearance row by reference). */
  static spawnRemote(u: ICoopUpdate) {
    if (CoopSession.spawning || !GameState.module?.area) return;
    const buffer = ResourceLoader.loadCachedResource(ResourceTypes['utc'], CoopSession.template);
    if (!buffer) { CoopSession.note(`template ${CoopSession.template} not found`); return; }
    CoopSession.spawning = true;
    const creature = new GameState.Module.ModuleArea.ModuleCreature(new GFFObject(buffer)) as ModuleCreature;
    creature.load();
    creature.clearAllActions();
    creature.position.set(u.x, u.y, u.z);
    creature.setFacing(u.f, true);
    GameState.module.area.attachObject(creature);
    creature.loadModel().then((model: any) => {
      model.userData.moduleObject = creature;
      model.hasCollision = false;
      model.name = creature.getTag();
      GameState.group.creatures.add(creature.container);
      creature.getCurrentRoom();
      CoopSession.remote = creature;
      CoopSession.spawning = false;
      CoopSession.note(`other player shown as ${CoopSession.template}`);
    });
  }

  static stop() {
    if (CoopSession.timer) clearInterval(CoopSession.timer);
    CoopSession.timer = undefined;
    try { CoopSession.channel?.close(); } catch { /* ignore */ }
    try { CoopSession.pc?.close(); } catch { /* ignore */ }
    try { CoopSession.ws?.close(); } catch { /* ignore */ }
    CoopSession.channel = undefined; CoopSession.pc = undefined; CoopSession.ws = undefined;
  }
}
