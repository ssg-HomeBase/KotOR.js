#!/usr/bin/env node
/**
 * coop-signal.mjs: KOTOR III co-op spike (Phase 2, M3). A tiny WebRTC signaling relay for two game
 * windows on one PC. It listens on 127.0.0.1 only and passes offer, answer and ICE candidate messages
 * between the two peers of a room; once the peer-to-peer data channel is open it carries nothing else.
 * Uses the `ws` package already in node_modules (no install). No third-party server.
 *
 * Usage: node scripts/kotor3/coop-signal.mjs [--port 8765] [--log <file>]
 */
import { WebSocketServer } from 'ws';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const PORT = parseInt(arg('--port') || '8765', 10);
const LOG = arg('--log');
const ALLOWED = new Set(['join', 'peer-joined', 'offer', 'answer', 'candidate', 'bye']);
const rooms = new Map();
const counts = {};
const log = (msg) => { const line = `${new Date().toISOString()} ${msg}`; console.log(line); if (LOG) fs.appendFileSync(LOG, line + '\n'); };

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
wss.on('listening', () => log(`coop-signal: listening on ws://127.0.0.1:${PORT}`));
wss.on('connection', (ws, req) => {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { ws.close(); return; }
  let room = null, role = '?';
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(String(data)); } catch { return; }
    if (!m || !ALLOWED.has(m.type)) { log(`dropped a non-signaling message (${m && m.type})`); return; }
    counts[m.type] = (counts[m.type] || 0) + 1;
    if (m.type === 'join') {
      room = String(m.room || 'k3').slice(0, 32); role = String(m.role || '?').slice(0, 8);
      if (!rooms.has(room)) rooms.set(room, new Set());
      const peers = rooms.get(room);
      for (const p of peers) p.send(JSON.stringify({ type: 'peer-joined', role }));
      if (peers.size) ws.send(JSON.stringify({ type: 'peer-joined', role: 'existing' }));
      peers.add(ws);
      log(`${role} joined room ${room} (${peers.size} in room)`);
      return;
    }
    if (!room) return;
    for (const p of rooms.get(room)) if (p !== ws && p.readyState === 1) p.send(JSON.stringify(m));
  });
  ws.on('close', () => {
    if (room && rooms.has(room)) { rooms.get(room).delete(ws); log(`${role} left room ${room}`); }
    log(`message counts: ${JSON.stringify(counts)}`);
  });
});
