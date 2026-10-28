#!/usr/bin/env node
/**
 * check-dlg.mjs: parses every mods/kotor3/*.dlg with a small GFF reader written here from the format
 * description (it does not use KotOR.js's own GFF classes), then checks each dialogue: every entry and
 * reply is reachable from a starting link, every link index is in range, and it counts nodes.
 * Usage: node scripts/kotor3/check-dlg.mjs   (exit 0 pass, 1 problems)
 */
import fs from 'node:fs';
import path from 'node:path';

function readGFF(buf) {
  const u32 = (o) => buf.readUInt32LE(o);
  const type = buf.toString('latin1', 0, 4), version = buf.toString('latin1', 4, 8);
  if (version !== 'V3.2') throw new Error(`not a GFF V3.2 file (${type}${version})`);
  const [structOff, structCnt, fieldOff, fieldCnt, labelOff, labelCnt, dataOff, , idxOff, , listOff] =
    [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48].map(u32);
  const label = (i) => buf.toString('latin1', labelOff + i * 16, labelOff + i * 16 + 16).replace(/\0.*$/, '');
  const field = (i) => {
    const o = fieldOff + i * 12; const t = u32(o), l = label(u32(o + 4)), d = u32(o + 8);
    let value = d;
    if (t === 15) { value = []; const n = u32(listOff + d); for (let k = 0; k < n; k++) value.push(struct(u32(listOff + d + 4 + k * 4))); }
    else if (t === 14) value = struct(d);
    else if (t === 10) value = buf.toString('latin1', dataOff + d + 4, dataOff + d + 4 + u32(dataOff + d));
    else if (t === 11) value = buf.toString('latin1', dataOff + d + 1, dataOff + d + 1 + buf[dataOff + d]);
    else if (t === 12) { const cnt = u32(dataOff + d + 8); let p = dataOff + d + 12; const subs = []; for (let k = 0; k < cnt; k++) { const len = u32(p + 4); subs.push(buf.toString('latin1', p + 8, p + 8 + len)); p += 8 + len; } value = { strref: buf.readInt32LE(dataOff + d + 4), subs }; }
    return [l, value];
  };
  const struct = (i) => {
    if (i >= structCnt) throw new Error(`struct index ${i} out of range`);
    const o = structOff + i * 12; const d = u32(o + 4), n = u32(o + 8); const out = {};
    if (n === 1) { const [l, v] = field(d); out[l] = v; }
    else for (let k = 0; k < n; k++) { const [l, v] = field(u32(idxOff + d + k * 4)); out[l] = v; }
    return out;
  };
  return { type, root: struct(0) };
}

const MOD = path.resolve('mods/kotor3');
const problems = [];
const rows = [];
for (const f of fs.readdirSync(MOD).filter((f) => f.toLowerCase().endsWith('.dlg')).sort()) {
  try {
    const { type, root } = readGFF(fs.readFileSync(path.join(MOD, f)));
    if (type !== 'DLG ') throw new Error(`file type ${JSON.stringify(type)}`);
    const E = root.EntryList || [], R = root.ReplyList || [];
    const seenE = new Set(), seenR = new Set();
    const queue = (root.StartingList || []).map((s) => ['E', s.Index]);
    if (!queue.length) problems.push(`${f}: no starting link`);
    while (queue.length) {
      const [k, i] = queue.pop();
      if (k === 'E') {
        if (i >= E.length) { problems.push(`${f}: link to entry ${i} out of range`); continue; }
        if (seenE.has(i)) continue; seenE.add(i);
        for (const l of E[i].RepliesList || []) queue.push(['R', l.Index]);
      } else {
        if (i >= R.length) { problems.push(`${f}: link to reply ${i} out of range`); continue; }
        if (seenR.has(i)) continue; seenR.add(i);
        for (const l of R[i].EntriesList || []) queue.push(['E', l.Index]);
      }
    }
    const unreachable = E.length - seenE.size + R.length - seenR.size;
    if (unreachable) problems.push(`${f}: ${unreachable} node(s) not reachable from a start`);
    const empty = [...E, ...R].filter((n) => !(n.Text?.subs?.join('') || '').trim()).length;
    if (empty) problems.push(`${f}: ${empty} node(s) without text`);
    rows.push(`${f}: ${E.length} entries + ${R.length} replies = ${E.length + R.length} nodes, all reachable: ${!unreachable}`);
  } catch (e) {
    problems.push(`${f}: does not parse: ${e.message}`);
  }
}
rows.forEach((r) => console.log(r));
console.log(`check-dlg: ${rows.length} dialogue files parsed with an independent GFF reader`);
if (problems.length) { console.log('FAIL:'); problems.forEach((p) => console.log(`  - ${p}`)); process.exit(1); }
console.log('PASS: every node reachable from a start in every dialogue.');
