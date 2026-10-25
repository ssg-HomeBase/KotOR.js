/**
 * verify-mod.ts: parses every file of the KOTOR III fan mod back and checks it.
 *
 * - manifest.json parses; every listed file exists and has a valid resref (1-16 chars).
 * - every .utc / .dlg parses with KotOR.js's GFF reader (src/resource/GFFObject.ts) and has the
 *   right GFF file type and version.
 * - dialogue: counts entry and reply nodes, checks every link points at a real node, every node is
 *   reachable from the start, every node has text, and at least one entry offers a choice
 *   (two or more replies).
 * - creature: TemplateResRef matches the file name and its Conversation is a dialogue in the mod.
 * - placements: each refers to a creature file in the mod.
 * Exit code 1 on any failure. Run: node scripts/kotor3/run.mjs verify-mod
 */
import * as fs from 'fs';
import * as path from 'path';
import { GFFObject } from '@/resource/GFFObject';
import { GFFStruct } from '@/resource/GFFStruct';

const MOD_DIR = path.resolve(process.cwd(), 'mods/kotor3');
const problems: string[] = [];
const report: any = { files: {} };
const fail = (m: string) => problems.push(m);

const manifest = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'manifest.json'), 'utf8'));
report.manifest = { key: manifest.key, files: manifest.files.length, creatures: (manifest.creatures || []).length };

const quiet = console.log; console.log = () => {};
const parsed = new Map<string, GFFObject>();
for (const file of manifest.files) {
  if (!/^[a-z0-9_]{1,16}\.(utc|dlg)$/.test(file)) fail(`bad file name: ${file}`);
  const full = path.join(MOD_DIR, file);
  if (!fs.existsSync(full)) { fail(`missing: ${file}`); continue; }
  const gff = new GFFObject(new Uint8Array(fs.readFileSync(full)));
  const want = file.endsWith('.dlg') ? 'DLG ' : 'UTC ';
  if (gff.FileType !== want) fail(`${file}: file type "${gff.FileType}", expected "${want}"`);
  if (gff.FileVersion !== 'V3.2') fail(`${file}: version "${gff.FileVersion}", expected "V3.2"`);
  parsed.set(file, gff);
}
console.log = quiet;

// GFFField.getValue() on a localized-string field returns its first substring (or TLK text).
const textOf = (s: GFFStruct) => String(s.getFieldByLabel('Text')?.getValue() ?? '');

for (const [file, gff] of parsed) {
  const root = gff.RootNode;
  if (file.endsWith('.dlg')) {
    const entries = root.getFieldByLabel('EntryList')?.getChildStructs() || [];
    const replies = root.getFieldByLabel('ReplyList')?.getChildStructs() || [];
    const starts = root.getFieldByLabel('StartingList')?.getChildStructs() || [];
    const links = (s: GFFStruct, list: string) => (s.getFieldByLabel(list)?.getChildStructs() || []).map((l) => l.getFieldByLabel('Index').getValue());
    const choicePoints = entries.filter((e) => links(e, 'RepliesList').length >= 2).length;
    // reachability
    const seenE = new Set<number>(), seenR = new Set<number>();
    const queue: ['E' | 'R', number][] = starts.map((s) => ['E', s.getFieldByLabel('Index').getValue()] as ['E', number]);
    while (queue.length) {
      const [kind, i] = queue.shift();
      if (kind === 'E') {
        if (i >= entries.length) { fail(`${file}: link to missing entry ${i}`); continue; }
        if (seenE.has(i)) continue; seenE.add(i);
        for (const r of links(entries[i], 'RepliesList')) queue.push(['R', r]);
      } else {
        if (i >= replies.length) { fail(`${file}: link to missing reply ${i}`); continue; }
        if (seenR.has(i)) continue; seenR.add(i);
        for (const e of links(replies[i], 'EntriesList')) queue.push(['E', e]);
      }
    }
    if (seenE.size !== entries.length) fail(`${file}: ${entries.length - seenE.size} entries unreachable`);
    if (seenR.size !== replies.length) fail(`${file}: ${replies.length - seenR.size} replies unreachable`);
    entries.forEach((e, i) => { if (!textOf(e)) fail(`${file}: entry ${i} has no text`); });
    replies.forEach((r, i) => { if (!textOf(r)) fail(`${file}: reply ${i} has no text`); });
    const nodes = entries.length + replies.length;
    if (nodes < 8 || nodes > 15) fail(`${file}: ${nodes} nodes, expected 8 to 15`);
    if (choicePoints < 1) fail(`${file}: no entry offers a choice`);
    report.files[file] = { type: gff.FileType.trim(), entries: entries.length, replies: replies.length, nodes, choicePoints, startingLinks: starts.length };
  } else {
    const resref = root.getFieldByLabel('TemplateResRef')?.getValue();
    const conv = root.getFieldByLabel('Conversation')?.getValue();
    if (`${resref}.utc` !== file) fail(`${file}: TemplateResRef is "${resref}"`);
    if (conv && !parsed.has(`${conv}.dlg`)) fail(`${file}: Conversation "${conv}" is not a dialogue in this mod`);
    const first = `${root.getFieldByLabel('FirstName')?.getValue() ?? ''} ${root.getFieldByLabel('LastName')?.getValue() ?? ''}`.trim();
    if (!first) fail(`${file}: creature has no name`);
    report.files[file] = { type: gff.FileType.trim(), templateResRef: resref, conversation: conv, name: first, appearanceRow: root.getFieldByLabel('Appearance_Type')?.getValue() };
  }
}

for (const c of manifest.creatures || []) {
  if (!parsed.has(`${c.templateResRef}.utc`)) fail(`placement in ${c.area}: no creature file ${c.templateResRef}.utc`);
  for (const k of ['x', 'y', 'z', 'facing']) if (typeof c[k] !== 'number') fail(`placement in ${c.area}: ${k} is not a number`);
}

console.log(JSON.stringify(report, null, 2));
if (problems.length) {
  console.error(`verify-mod: FAIL (${problems.length})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`verify-mod: PASS (${parsed.size} game-format files parsed, manifest OK)`);
