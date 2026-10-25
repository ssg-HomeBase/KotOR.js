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
 * - scripts: every .ncs in mods/kotor3/ parses with KotOR.js's own NCS reader (src/nwscript/NWScript.ts,
 *   the class the engine loads scripts with): "NCS V1.0" header, program size equal to the file size,
 *   instructions decoded end to end, every engine call a known KOTOR II routine, every jump on an
 *   instruction. Each .ncs has its .nss in mods/kotor3/src/ and is byte-identical to a fresh compile of
 *   it (stale builds fail); each .nss there (except *_inc_* include libraries) has its .ncs.
 * - every script a dialogue uses ("script" / "active" in the dialogue sources, Script / Script2 /
 *   Active / Active2 / EndConversation / EndConverAbort in the built .dlg) has its .ncs in the mod.
 *   A script used by a dialogue listed in the manifest but not itself listed is reported as a WARNING
 *   (the game would not load it).
 * Exit code 1 on any failure. Run: node scripts/kotor3/run.mjs verify-mod [--list-ncs]
 *   --list-ncs also prints every compiled script's instructions.
 */
import * as fs from 'fs';
import * as path from 'path';
import { GFFObject } from '@/resource/GFFObject';
import { GFFStruct } from '@/resource/GFFStruct';
// Keep NWScriptDefK2 ahead of NWScript: the engine's module graph has import cycles, and loading it
// from NWScript first leaves a base class undefined when DLGNode's module runs.
import { NWScriptDefK2 } from '@/nwscript/NWScriptDefK2';
import { compileNss, dialogueScriptRefs, isIncludeLibrary, listNss, SRC_DIR } from './build-mod';
import { NWScript } from '@/nwscript/NWScript';
import { GameEngineType } from '@/enums/engine/GameEngineType';
import { OP_ACTION, OP_JMP, OP_JNZ, OP_JSR, OP_JZ, OP_T } from '@/nwscript/NWScriptOPCodes';

const MOD_DIR = path.resolve(process.cwd(), 'mods/kotor3');
const LIST_NCS = process.argv.includes('--list-ncs');
const problems: string[] = [];
const warnings: string[] = [];
const report: any = { files: {}, scripts: {} };
const fail = (m: string) => problems.push(m);

const manifest = JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'manifest.json'), 'utf8'));
report.manifest = { key: manifest.key, files: manifest.files.length, creatures: (manifest.creatures || []).length };

const quiet = console.log; console.log = () => {};
const parsed = new Map<string, GFFObject>();
const manifestFiles = new Set<string>(manifest.files);
for (const file of manifest.files) {
  if (!/^[a-z0-9_]{1,16}\.(utc|dlg|ncs)$/.test(file)) fail(`bad file name: ${file}`);
  const full = path.join(MOD_DIR, file);
  if (!fs.existsSync(full)) { fail(`missing: ${file}`); continue; }
  if (file.endsWith('.ncs')) continue; // checked with the other scripts below
  const gff = new GFFObject(new Uint8Array(fs.readFileSync(full)));
  const want = file.endsWith('.dlg') ? 'DLG ' : 'UTC ';
  if (gff.FileType !== want) fail(`${file}: file type "${gff.FileType}", expected "${want}"`);
  if (gff.FileVersion !== 'V3.2') fail(`${file}: version "${gff.FileVersion}", expected "V3.2"`);
  parsed.set(file, gff);
}
console.log = quiet;

// GFFField.getValue() on a localized-string field returns its first substring (or TLK text).
const textOf = (s: GFFStruct) => String(s.getFieldByLabel('Text')?.getValue() ?? '');
const resrefOf = (s: GFFStruct, label: string) => String(s.getFieldByLabel(label)?.getValue() ?? '').trim().toLowerCase();
/** Scripts the mod's files use: resref -> where. */
const usedScripts = new Map<string, string[]>();
const useScript = (resref: string, where: string) => {
  if (!resref) return;
  if (!usedScripts.has(resref)) usedScripts.set(resref, []);
  usedScripts.get(resref).push(where);
};

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
    // scripts the dialogue runs
    for (const label of ['EndConversation', 'EndConverAbort']) useScript(resrefOf(root, label), `${file} ${label}`);
    const nodeScripts: string[] = [];
    for (const [kind, list, linkList] of [['entry', entries, 'RepliesList'], ['reply', replies, 'EntriesList']] as const) {
      list.forEach((n, i) => {
        for (const label of ['Script', 'Script2']) {
          const r = resrefOf(n, label);
          if (r) { useScript(r, `${file} ${kind} ${i} ${label}`); nodeScripts.push(`${kind} ${i} ${label}=${r}`); }
        }
        (n.getFieldByLabel(linkList)?.getChildStructs() || []).forEach((l, j) => {
          for (const label of ['Active', 'Active2']) {
            const r = resrefOf(l, label);
            if (r) { useScript(r, `${file} ${kind} ${i} link ${j} ${label}`); nodeScripts.push(`${kind} ${i} link ${j} ${label}=${r}`); }
          }
        });
      });
    }
    starts.forEach((s, j) => {
      for (const label of ['Active', 'Active2']) {
        const r = resrefOf(s, label);
        if (r) { useScript(r, `${file} start ${j} ${label}`); nodeScripts.push(`start ${j} ${label}=${r}`); }
      }
    });
    report.files[file] = { type: gff.FileType.trim(), entries: entries.length, replies: replies.length, nodes, choicePoints, startingLinks: starts.length, scripts: nodeScripts };
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

// ---------------------------------------------------------------- scripts

/** Parses an .ncs with the engine's own reader; returns the instructions in address order, or fails. */
function readNcs(file: string, bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  if (header !== 'NCS V1.0') { fail(`${file}: header "${header}", expected "NCS V1.0"`); return undefined; }
  if (bytes.length < 15 || bytes.length > 1 << 20) { fail(`${file}: ${bytes.length} bytes, not a sane script size`); return undefined; }
  if (bytes[8] !== OP_T) { fail(`${file}: byte 8 is 0x${bytes[8].toString(16)}, expected the program-size marker 0x42`); return undefined; }
  const progSize = new DataView(bytes.buffer, bytes.byteOffset).getUint32(9, false);
  if (progSize !== bytes.length) { fail(`${file}: program size field ${progSize}, file is ${bytes.length} bytes`); return undefined; }
  let script: NWScript;
  try {
    script = new NWScript(bytes, { game: GameEngineType.TSL, actionsMap: NWScriptDefK2.Actions });
  } catch (e: any) { fail(`${file}: NCS reader: ${e?.message ?? e}`); return undefined; }
  const ins = [...(script.instructions?.values() ?? [])].sort((a, b) => a.address - b.address);
  if (!ins.length) { fail(`${file}: no instructions decoded`); return undefined; }
  const decoded = ins.reduce((n, i) => n + i.instructionSize, 0);
  if (decoded !== bytes.length - 13) fail(`${file}: decoded ${decoded} bytes of instructions, program has ${bytes.length - 13}`);
  for (const i of ins) {
    if (i.code === OP_ACTION && !i.actionDefinition) fail(`${file}: instruction ${i.index} calls engine routine ${i.action}, not in the KOTOR II table`);
    if ([OP_JMP, OP_JSR, OP_JZ, OP_JNZ].includes(i.code) && !script.instructions.has(i.address + i.offset)) {
      fail(`${file}: instruction ${i.index} (${i.codeName}) jumps to ${i.address + i.offset}, which is not an instruction`);
    }
  }
  return ins;
}

const sources = listNss();
const toCompile = sources.filter((n) => !isIncludeLibrary(n));
const ncsFiles = fs.readdirSync(MOD_DIR).filter((f) => f.toLowerCase().endsWith('.ncs')).sort();
const listings: string[] = [];
let scriptsChecked = 0;
for (const file of ncsFiles) {
  const name = file.slice(0, -4);
  if (!/^[a-z0-9_]{1,16}$/.test(name)) fail(`bad script file name: ${file}`);
  const bytes = new Uint8Array(fs.readFileSync(path.join(MOD_DIR, file)));
  const ins = readNcs(file, bytes);
  let fresh = false;
  if (!toCompile.includes(name)) {
    fail(`${file}: no source mods/kotor3/src/${name}.nss to build it from`);
  } else {
    try {
      const built = compileNss(name).ncs;
      fresh = built.length === bytes.length && built.every((b, i) => b === bytes[i]);
      if (!fresh) fail(`${file}: differs from a fresh compile of mods/kotor3/src/${name}.nss (stale build: run build-mod)`);
    } catch (e: any) { fail(`${file}: ${e?.message ?? e}`); }
  }
  if (ins) {
    const calls = ins.filter((i) => i.code === OP_ACTION).map((i) => `${i.action} ${i.actionDefinition?.name ?? '?'}`);
    report.scripts[file] = { bytes: bytes.length, instructions: ins.length, engineCalls: [...new Set(calls)], matchesSource: fresh };
    if (LIST_NCS) listings.push(`${file}: ${ins.length} instructions`, ...ins.map((i) => `  ${i.toAssemblyString()}`));
    scriptsChecked++;
  }
}
for (const name of toCompile) {
  if (!ncsFiles.includes(`${name}.ncs`)) fail(`mods/kotor3/src/${name}.nss has no compiled mods/kotor3/${name}.ncs (run build-mod)`);
}

// scripts named in the dialogue sources (the built .dlg files were collected above)
for (const f of fs.readdirSync(SRC_DIR).filter((x) => x.endsWith('.dialogue.json')).sort()) {
  const src = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
  for (const { resref, where } of dialogueScriptRefs(src)) {
    if (typeof resref !== 'string' || !/^[a-z0-9_]{1,16}$/.test(resref)) { fail(`${where}: not a resref: ${JSON.stringify(resref)}`); continue; }
    useScript(resref, where);
  }
}
for (const [resref, where] of usedScripts) {
  if (!ncsFiles.includes(`${resref}.ncs`)) { fail(`script ${resref} has no mods/kotor3/${resref}.ncs (used by ${where.join('; ')})`); continue; }
  const fromManifest = where.filter((w) => manifestFiles.has(w.split(' ')[0]));
  if (fromManifest.length && !manifestFiles.has(`${resref}.ncs`)) {
    warnings.push(`${resref}.ncs is used by ${fromManifest.join('; ')} but is not in manifest.json "files", so the game will not load it`);
  }
}

console.log(JSON.stringify(report, null, 2));
for (const l of listings) console.log(l);
for (const w of warnings) console.log(`verify-mod: WARNING: ${w}`);
if (problems.length) {
  console.error(`verify-mod: FAIL (${problems.length})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`verify-mod: PASS (${parsed.size} game-format files parsed, ${scriptsChecked} script${scriptsChecked === 1 ? '' : 's'} compiled and checked, manifest OK)`);
