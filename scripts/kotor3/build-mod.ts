/**
 * build-mod.ts: builds the KOTOR III fan mod's game-format files from readable sources.
 *
 *   mods/kotor3/src/<resref>.creature.json  ->  mods/kotor3/<resref>.utc  (GFF "UTC ")
 *   mods/kotor3/src/<resref>.dialogue.json  ->  mods/kotor3/<resref>.dlg  (GFF "DLG ")
 *   mods/kotor3/src/<resref>.nss            ->  mods/kotor3/<resref>.ncs  (compiled NWScript, "NCS V1.0")
 *
 * GFF files use KotOR.js's own GFF writer (src/resource/GFFObject.ts), the same format code the KotOR
 * Forge editor uses. Scripts use KotOR.js's own NWScript compiler (src/nwscript/compiler/, the one
 * KotOR Forge drives in src/apps/forge/helpers/ForgeNWScriptCompile.ts), for KOTOR II, under Node.
 *
 * Where the compiler's engine knowledge comes from (nothing is read from the game):
 *   - engine routines (name, routine number, argument and return types): KotOR.js's own KOTOR II table
 *     src/nwscript/NWScriptDefK2.ts, turned into declarations by engineDeclarations() below. (Forge
 *     parses the game's nwscript.nss instead; the build does not.)
 *   - TRUE, FALSE, OBJECT_SELF, OBJECT_INVALID: keywords of the compiler's own lexer
 *     (src/nwscript/compiler/NWScriptLexer.ts).
 * So mod scripts:
 *   - pass every argument to engine routines (the table has no default values);
 *   - have no other named engine constants (NPC_*, etc.): declare what they need in a shared
 *     mods/kotor3/src/k3_inc_*.nss;
 *   - #include only other files in mods/kotor3/src/ (never base-game scripts such as k_inc_*, which live
 *     in each player's game archives). Files named *_inc_*.nss are include libraries: they are compiled
 *     only inside the scripts that include them and get no .ncs of their own.
 * Any compile problem fails the build with the file and line.
 *
 * Dialogue nodes (entries and replies) may carry two optional script keys:
 *   "script": written to the node's Script resref (an action script, run when the node is shown or picked);
 *   "active": written to the Active resref of every link that points at the node, including the
 *             StartingList link for a start entry (the condition script deciding whether it is offered).
 * Both must name a script compiled from mods/kotor3/src/. Absent keys are written as empty resrefs.
 *
 * Everything written here is authored for this project. Run: node scripts/kotor3/run.mjs build-mod
 */
import * as fs from 'fs';
import * as path from 'path';
import { format } from 'util';
import { GFFObject } from '@/resource/GFFObject';
import { GFFStruct } from '@/resource/GFFStruct';
import { GFFField } from '@/resource/GFFField';
import { GFFDataType } from '@/enums/resource/GFFDataType';
import { CExoLocString } from '@/resource/CExoLocString';
import { CExoLocSubString } from '@/resource/CExoLocSubString';
import { NWScriptDataType } from '@/enums/nwscript/NWScriptDataType';
import { NWScriptDefK2 } from '@/nwscript/NWScriptDefK2';
import { NWScriptParser } from '@/nwscript/compiler/NWScriptParser';
import { NWScriptCompiler } from '@/nwscript/compiler/NWScriptCompiler';

export const MOD_DIR = path.resolve(process.cwd(), 'mods/kotor3');
export const SRC_DIR = path.join(MOD_DIR, 'src');
export const RESREF = /^[a-z0-9_]{1,16}$/;
/** A source file as messages show it: relative to the repo, forward slashes. */
const nssLabel = (srcDir: string, name: string) => path.relative(process.cwd(), path.join(srcDir, `${name}.nss`)).split(path.sep).join('/');

/** Runs fn with console output captured; returns what it returned plus every warning/error it printed. */
function quiet<T>(fn: () => T): { value: T; complaints: string[] } {
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
  const complaints: string[] = [];
  const complain = (...a: any[]) => { complaints.push(format(...a).split('\n')[0].slice(0, 300)); };
  console.log = console.info = console.debug = () => {};
  console.warn = console.error = complain;
  try {
    return { value: fn(), complaints };
  } finally {
    Object.assign(console, saved);
  }
}

// ---------------------------------------------------------------- NWScript

/** *_inc_*.nss files are include libraries: no main(), no .ncs of their own. */
export const isIncludeLibrary = (name: string) => /_inc_/.test(name);

/** Script names (without .nss) in a source folder; every name must be a valid resref. */
export function listNss(srcDir = SRC_DIR): string[] {
  const names = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.nss')).map((f) => f.slice(0, -4)).sort();
  for (const n of names) {
    if (!RESREF.test(n)) throw new Error(`${nssLabel(srcDir, n)}: script name must be 1-16 lowercase letters, digits or _`);
  }
  return names;
}

const TYPE_NAMES: Record<number, string> = {
  [NWScriptDataType.VOID]: 'void',
  [NWScriptDataType.INTEGER]: 'int',
  [NWScriptDataType.FLOAT]: 'float',
  [NWScriptDataType.STRING]: 'string',
  [NWScriptDataType.OBJECT]: 'object',
  [NWScriptDataType.VECTOR]: 'vector',
  [NWScriptDataType.ACTION]: 'action',
  [NWScriptDataType.EFFECT]: 'effect',
  [NWScriptDataType.EVENT]: 'event',
  [NWScriptDataType.LOCATION]: 'location',
  [NWScriptDataType.TALENT]: 'talent',
};
/** Engine structures, numbered from NWScriptDataType.EFFECT the way the engine numbers them. */
const ENGINE_STRUCTURES = [NWScriptDataType.EFFECT, NWScriptDataType.EVENT, NWScriptDataType.LOCATION, NWScriptDataType.TALENT];

/** NWScript declarations of every KOTOR II engine routine, in routine-number order, from NWScriptDefK2. */
function engineDeclarations(): string {
  const lines = ENGINE_STRUCTURES.map((t) => `#define ENGINE_STRUCTURE_${t - NWScriptDataType.EFFECT} ${TYPE_NAMES[t]}`);
  const ids = Object.keys(NWScriptDefK2.Actions).map(Number).sort((a, b) => a - b);
  ids.forEach((id, i) => {
    // The compiler numbers routines by declaration order, so the table must run 0..N with no gaps.
    if (id !== i) throw new Error(`NWScriptDefK2 has no routine ${i}; cannot number engine routines`);
    const a = NWScriptDefK2.Actions[id];
    const type = (t: number) => {
      if (!TYPE_NAMES[t]) throw new Error(`NWScriptDefK2 routine ${id} ${a.name}: unknown data type ${t}`);
      return TYPE_NAMES[t];
    };
    lines.push(`${type(a.type)} ${a.name}(${a.args.map((t, j) => `${type(t)} arg${j + 1}`).join(', ')});`);
  });
  return lines.join('\n') + '\n';
}

let engineParser: NWScriptParser | undefined;
function baseParser(): NWScriptParser {
  if (engineParser) return engineParser;
  const want = Object.keys(NWScriptDefK2.Actions).length;
  const { value: parser, complaints } = quiet(() => new NWScriptParser(engineDeclarations()));
  if (complaints.length || parser.engine_actions.length !== want) {
    throw new Error(`could not load the KOTOR II routine table into the compiler (${parser.engine_actions.length} of ${want} routines): ${complaints.join('; ')}`);
  }
  return (engineParser = parser);
}

type Segment = { file: string; start: number; lines: number };

/** The script with its includes in front of it (each include before the files that use it), plus a line map. */
function gatherSource(name: string, srcDir: string): { code: string; segments: Segment[]; includes: string[] } {
  const available = new Set(listNss(srcDir));
  const order: string[] = [];
  const texts = new Map<string, string>();
  const state = new Map<string, 'open' | 'done'>();
  const visit = (n: string, chain: string[]) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'open') throw new Error(`#include cycle: ${[...chain, n].map((x) => `${x}.nss`).join(' -> ')}`);
    state.set(n, 'open');
    const text = fs.readFileSync(path.join(srcDir, `${n}.nss`), 'utf8');
    texts.set(n, text.endsWith('\n') ? text : text + '\n');
    text.split('\n').forEach((line, i) => {
      const m = /^\s*#include\s+(\S+)/.exec(line);
      if (!m) return;
      const where = `${nssLabel(srcDir, n)}:${i + 1}`;
      const inc = m[1].replace(/^"|"$/g, '').replace(/\.nss$/i, '');
      if (!RESREF.test(inc)) throw new Error(`${where}: #include ${m[1]}: not a valid script name (1-16 lowercase letters, digits or _)`);
      if (!available.has(inc)) {
        throw new Error(`${where}: #include "${inc}" is not a file in ${path.dirname(nssLabel(srcDir, inc))}/. Mod scripts may include only other `
          + 'mod scripts in that folder; base-game scripts (k_inc_* and the rest) are in each player\'s game, not in the build.');
      }
      visit(inc, [...chain, n]);
    });
    state.set(n, 'done');
    order.push(n);
  };
  visit(name, []);
  const segments: Segment[] = [];
  let code = '';
  let start = 0;
  for (const n of order) {
    const text = texts.get(n);
    const lines = text.split('\n').length - 1;
    segments.push({ file: nssLabel(srcDir, n), start, lines });
    code += text;
    start += lines;
  }
  return { code, segments, includes: order.slice(0, -1) };
}

/** Compiles mods/kotor3/src/<name>.nss (or <srcDir>/<name>.nss) for KOTOR II. Throws with file:line on any problem. */
export function compileNss(name: string, srcDir = SRC_DIR): { ncs: Uint8Array; includes: string[] } {
  if (!RESREF.test(name)) throw new Error(`${name}.nss: script name must be 1-16 lowercase letters, digits or _`);
  if (isIncludeLibrary(name)) throw new Error(`${name}.nss is an include library (*_inc_*); it is compiled only inside scripts that include it`);
  const { code, segments, includes } = gatherSource(name, srcDir);
  const file = nssLabel(srcDir, name);
  const at = (line: number | undefined) => {
    if (typeof line !== 'number') return file;
    const s = segments.find((g) => line >= g.start && line < g.start + g.lines) || segments[segments.length - 1];
    return `${s.file}:${line - s.start + 1}`; // the lexer counts lines from 0
  };
  const lineOf = (e: any): number | undefined => {
    const l = e?.statement?.source?.first_line ?? e?.offender?.source?.first_line;
    if (typeof l === 'number') return l;
    const m = /@ (\d+):\d+/.exec(String(e?.message ?? ''));
    return m ? Number(m[1]) : undefined;
  };
  // parse errors end in " @ line:column" counted from 0; the file:line in front replaces that
  const msg = (e: any) => String(e?.message ?? e).replace(/ @ \d+:\d+$/, '');
  const failed = (problems: string[]) => new Error(`script compile failed:\n${problems.map((p) => `    ${p}`).join('\n')}`);

  const parser = baseParser().clone();
  const parsed = quiet(() => parser.parseScript(code));
  if (parser.errors.length) throw failed(parser.errors.map((e) => `${at(lineOf(e))}: ${msg(e)}`));
  if (parsed.complaints.length) throw failed(parsed.complaints.map((c) => `${file}: compiler: ${c}`));

  const compiler = new NWScriptCompiler(parser.program as any);
  let ncs: Uint8Array | undefined;
  let complaints: string[] = [];
  try {
    ({ value: ncs, complaints } = quiet(() => compiler.compile()));
  } catch (e: any) {
    throw failed([`${file}: compiler: ${e?.message ?? String(e)}`]);
  }
  if (compiler.errors.length) throw failed(compiler.errors.map((e) => `${at(lineOf(e))}: ${msg(e)}`));
  if (complaints.length) throw failed(complaints.map((c) => `${file}: compiler: ${c}`));
  if (!ncs || ncs.length <= 13) throw failed([`${file}: compiler produced no bytecode (needs void main() or int StartingConditional())`]);
  return { ncs: new Uint8Array(ncs), includes };
}

/** Every "script" / "active" key in a dialogue source, with where it is used. */
export function dialogueScriptRefs(src: any): { resref: string; where: string }[] {
  const refs: { resref: string; where: string }[] = [];
  for (const n of [...(src.entries || []), ...(src.replies || [])]) {
    for (const key of ['script', 'active']) {
      if (n[key] !== undefined && n[key] !== '') refs.push({ resref: n[key], where: `dialogue ${src.resref}: node ${n.id} "${key}"` });
    }
  }
  return refs;
}

// ---------------------------------------------------------------- GFF

type Val = number | string | CExoLocString | GFFStruct[];
function add(node: GFFStruct, type: GFFDataType, label: string, value: Val): GFFField {
  const field = new GFFField(type, label);
  if (type === GFFDataType.LIST) {
    for (const s of value as GFFStruct[]) field.addChildStruct(s);
  } else {
    field.setValue(value);
  }
  node.addField(field);
  return field;
}
const text = (s: string) => { const l = new CExoLocString(-1); if (s) l.addSubString(new CExoLocSubString(0, s)); return l; };

/** Condition / parameter fields KOTOR II puts on every dialogue link. */
function addLinkParams(s: GFFStruct, active = '') {
  add(s, GFFDataType.RESREF, 'Active', active);
  add(s, GFFDataType.RESREF, 'Active2', '');
  add(s, GFFDataType.BYTE, 'Not', 0);
  add(s, GFFDataType.BYTE, 'Not2', 0);
  add(s, GFFDataType.INT, 'Logic', 0);
  for (const n of ['1', '2', '3', '4', '5']) { add(s, GFFDataType.INT, `Param${n}`, 0); add(s, GFFDataType.INT, `Param${n}b`, 0); }
  add(s, GFFDataType.CEXOSTRING, 'ParamStrA', '');
  add(s, GFFDataType.CEXOSTRING, 'ParamStrB', '');
}

/** Fields KOTOR II puts on every entry and reply node. */
function addNodeFields(s: GFFStruct, nodeText: string, nodeId: number, script = '') {
  add(s, GFFDataType.CEXOLOCSTRING, 'Text', text(nodeText));
  add(s, GFFDataType.CEXOSTRING, 'Listener', '');
  add(s, GFFDataType.LIST, 'AnimList', []);
  add(s, GFFDataType.RESREF, 'VO_ResRef', '');
  add(s, GFFDataType.RESREF, 'Sound', '');
  add(s, GFFDataType.BYTE, 'SoundExists', 0);
  add(s, GFFDataType.RESREF, 'Script', script);
  add(s, GFFDataType.RESREF, 'Script2', '');
  for (const n of ['1', '2', '3', '4', '5']) { add(s, GFFDataType.INT, `ActionParam${n}`, 0); add(s, GFFDataType.INT, `ActionParam${n}b`, 0); }
  add(s, GFFDataType.CEXOSTRING, 'ActionParamStrA', '');
  add(s, GFFDataType.CEXOSTRING, 'ActionParamStrB', '');
  add(s, GFFDataType.DWORD, 'Delay', 0xFFFFFFFF);
  add(s, GFFDataType.CEXOSTRING, 'Comment', '');
  add(s, GFFDataType.CEXOSTRING, 'Quest', '');
  add(s, GFFDataType.DWORD, 'QuestEntry', 0);
  add(s, GFFDataType.INT, 'PlotIndex', -1);
  add(s, GFFDataType.FLOAT, 'PlotXPPercentage', 1);
  add(s, GFFDataType.DWORD, 'WaitFlags', 0);
  add(s, GFFDataType.DWORD, 'CameraAngle', 0);
  add(s, GFFDataType.BYTE, 'FadeType', 0);
  add(s, GFFDataType.INT, 'CamVidEffect', -1);
  add(s, GFFDataType.INT, 'Emotion', 4);
  add(s, GFFDataType.INT, 'FacialAnim', 0);
  add(s, GFFDataType.INT, 'NodeID', nodeId);
  add(s, GFFDataType.BYTE, 'NodeUnskippable', 0);
  add(s, GFFDataType.INT, 'PostProcNode', 0);
  add(s, GFFDataType.BYTE, 'RecordNoVOOverri', 0);
  add(s, GFFDataType.BYTE, 'RecordVO', 0);
  add(s, GFFDataType.BYTE, 'VOTextChanged', 0);
  add(s, GFFDataType.INT, 'AlienRaceNode', 0);
}

function buildDialogue(src: any, scripts: Set<string>): Uint8Array {
  const entryIndex = new Map<string, number>(src.entries.map((e: any, i: number) => [e.id, i]));
  const replyIndex = new Map<string, number>(src.replies.map((r: any, i: number) => [r.id, i]));
  const need = (map: Map<string, number>, id: string, where: string) => {
    if (!map.has(id)) throw new Error(`dialogue ${src.resref}: ${where} links to unknown node ${id}`);
    return map.get(id);
  };
  // Optional "script" / "active" keys: a resref of a script compiled from mods/kotor3/src/, or absent.
  const scriptRef = (node: any, key: 'script' | 'active') => {
    const v = node[key];
    if (v === undefined || v === '') return '';
    if (typeof v !== 'string' || !RESREF.test(v)) throw new Error(`dialogue ${src.resref}: node ${node.id} "${key}" must be a resref (1-16 lowercase letters, digits or _): ${JSON.stringify(v)}`);
    if (!scripts.has(v)) throw new Error(`dialogue ${src.resref}: node ${node.id} "${key}" names ${v}, but there is no script mods/kotor3/src/${v}.nss to compile`);
    return v;
  };
  const link = (i: number, index: number, target: any) => {
    const s = new GFFStruct(i);
    add(s, GFFDataType.DWORD, 'Index', index);
    addLinkParams(s, scriptRef(target, 'active'));
    add(s, GFFDataType.BYTE, 'IsChild', 0);
    add(s, GFFDataType.CEXOSTRING, 'LinkComment', '');
    return s;
  };

  const gff = new GFFObject();
  gff.FileType = 'DLG ';
  const root = gff.RootNode;
  const words = [...src.entries, ...src.replies].reduce((n: number, x: any) => n + x.text.split(/\s+/).filter(Boolean).length, 0);
  add(root, GFFDataType.DWORD, 'DelayEntry', 0);
  add(root, GFFDataType.DWORD, 'DelayReply', 0);
  add(root, GFFDataType.DWORD, 'NumWords', words);
  add(root, GFFDataType.RESREF, 'EndConverAbort', '');
  add(root, GFFDataType.RESREF, 'EndConversation', '');
  add(root, GFFDataType.BYTE, 'Skippable', 1);
  add(root, GFFDataType.INT, 'ConversationType', 0);
  add(root, GFFDataType.BYTE, 'ComputerType', 0);
  add(root, GFFDataType.RESREF, 'CameraModel', '');
  add(root, GFFDataType.BYTE, 'AnimatedCut', 0);
  add(root, GFFDataType.BYTE, 'OldHitCheck', 0);
  add(root, GFFDataType.BYTE, 'UnequipHItem', 0);
  add(root, GFFDataType.BYTE, 'UnequipItems', 0);
  add(root, GFFDataType.RESREF, 'AmbientTrack', '');
  add(root, GFFDataType.CEXOSTRING, 'VO_ID', '');
  add(root, GFFDataType.INT, 'AlienRaceOwner', 0);
  add(root, GFFDataType.INT, 'PostProcOwner', 0);
  add(root, GFFDataType.INT, 'RecordNoVO', 0);
  add(root, GFFDataType.INT, 'NextNodeID', src.entries.length + src.replies.length);

  let nodeId = 0;
  const entries = src.entries.map((e: any, i: number) => {
    const s = new GFFStruct(i);
    // Optional "speaker": the tag of another creature in the scene who says this line (blank = the owner).
    if (e.speaker !== undefined && (typeof e.speaker !== 'string' || !/^[a-z0-9_]{1,32}$/i.test(e.speaker))) throw new Error(`dialogue ${src.resref}: entry ${e.id} "speaker" must be a creature tag: ${JSON.stringify(e.speaker)}`);
    add(s, GFFDataType.CEXOSTRING, 'Speaker', e.speaker || '');
    addNodeFields(s, e.text, nodeId++, scriptRef(e, 'script'));
    add(s, GFFDataType.LIST, 'RepliesList', e.replies.map((r: string, j: number) => {
      const index = need(replyIndex, r, e.id);
      return link(j, index, src.replies[index]);
    }));
    return s;
  });
  const replies = src.replies.map((r: any, i: number) => {
    const s = new GFFStruct(i);
    addNodeFields(s, r.text, nodeId++, scriptRef(r, 'script'));
    const next = r.next ? need(entryIndex, r.next, r.id) : -1;
    add(s, GFFDataType.LIST, 'EntriesList', next >= 0 ? [link(0, next, src.entries[next])] : []);
    return s;
  });
  const starting = src.start.map((id: string, i: number) => {
    const s = new GFFStruct(i);
    const index = need(entryIndex, id, 'start');
    add(s, GFFDataType.DWORD, 'Index', index);
    addLinkParams(s, scriptRef(src.entries[index], 'active'));
    return s;
  });
  add(root, GFFDataType.LIST, 'EntryList', entries);
  add(root, GFFDataType.LIST, 'ReplyList', replies);
  add(root, GFFDataType.LIST, 'StartingList', starting);
  add(root, GFFDataType.LIST, 'StuntList', []);
  return gff.getExportBuffer();
}

function buildCreature(src: any): Uint8Array {
  const gff = new GFFObject();
  gff.FileType = 'UTC ';
  const r = gff.RootNode;
  add(r, GFFDataType.RESREF, 'TemplateResRef', src.resref);
  add(r, GFFDataType.CEXOSTRING, 'Tag', src.tag);
  add(r, GFFDataType.CEXOLOCSTRING, 'FirstName', text(src.firstName));
  add(r, GFFDataType.CEXOLOCSTRING, 'LastName', text(src.lastName));
  add(r, GFFDataType.CEXOLOCSTRING, 'Description', text(''));
  add(r, GFFDataType.CEXOSTRING, 'Comment', src.comment);
  add(r, GFFDataType.RESREF, 'Conversation', src.conversation);
  add(r, GFFDataType.WORD, 'Appearance_Type', src.appearanceRow);
  add(r, GFFDataType.BYTE, 'Gender', src.gender);
  add(r, GFFDataType.BYTE, 'Race', src.race);
  add(r, GFFDataType.BYTE, 'SubraceIndex', 0);
  add(r, GFFDataType.INT, 'Phenotype', 0);
  add(r, GFFDataType.BYTE, 'BodyVariation', 0);
  add(r, GFFDataType.BYTE, 'TextureVar', 1);
  add(r, GFFDataType.WORD, 'FactionID', src.factionId);
  add(r, GFFDataType.SHORT, 'HitPoints', src.hitPoints);
  add(r, GFFDataType.SHORT, 'CurrentHitPoints', src.hitPoints);
  add(r, GFFDataType.SHORT, 'MaxHitPoints', src.hitPoints);
  add(r, GFFDataType.SHORT, 'ForcePoints', 0);
  add(r, GFFDataType.SHORT, 'CurrentForce', 0);
  for (const [k, v] of Object.entries(src.abilities)) add(r, GFFDataType.BYTE, k, v as number);
  add(r, GFFDataType.BYTE, 'NaturalAC', 0);
  add(r, GFFDataType.SHORT, 'refbonus', 0);
  add(r, GFFDataType.SHORT, 'willbonus', 0);
  add(r, GFFDataType.SHORT, 'fortbonus', 0);
  add(r, GFFDataType.BYTE, 'GoodEvil', 50);
  add(r, GFFDataType.FLOAT, 'ChallengeRating', 1);
  add(r, GFFDataType.INT, 'WalkRate', 4);
  add(r, GFFDataType.BYTE, 'Plot', src.plot ? 1 : 0);
  add(r, GFFDataType.BYTE, 'Min1HP', 1);
  add(r, GFFDataType.BYTE, 'Disarmable', 0);
  add(r, GFFDataType.BYTE, 'Interruptable', 1);
  add(r, GFFDataType.BYTE, 'NoPermDeath', 0);
  add(r, GFFDataType.BYTE, 'IsPC', 0);
  add(r, GFFDataType.BYTE, 'PartyInteract', 0);
  add(r, GFFDataType.BYTE, 'Hologram', 0);
  add(r, GFFDataType.BYTE, 'IgnoreCrePath', 0);
  add(r, GFFDataType.BYTE, 'NotReorienting', 0);
  const cls = new GFFStruct(2);
  add(cls, GFFDataType.INT, 'Class', src.classId);
  add(cls, GFFDataType.SHORT, 'ClassLevel', src.classLevel);
  add(r, GFFDataType.LIST, 'ClassList', [cls]);
  add(r, GFFDataType.LIST, 'SkillList', Array.from({ length: 8 }, () => { const s = new GFFStruct(0); add(s, GFFDataType.BYTE, 'Rank', 0); return s; }));
  add(r, GFFDataType.LIST, 'FeatList', []);
  add(r, GFFDataType.LIST, 'Equip_ItemList', []);
  add(r, GFFDataType.LIST, 'ItemList', []);
  for (const s of ['ScriptAttacked', 'ScriptDamaged', 'ScriptDeath', 'ScriptDialogue', 'ScriptDisturbed', 'ScriptEndDialogu',
    'ScriptEndRound', 'ScriptHeartbeat', 'ScriptOnBlocked', 'ScriptOnNotice', 'ScriptRested', 'ScriptSpawn', 'ScriptSpellAt', 'ScriptUserDefine']) {
    add(r, GFFDataType.RESREF, s, '');
  }
  return gff.getExportBuffer();
}

// ---------------------------------------------------------------- main

function main() {
  const scripts = new Set(listNss().filter((n) => !isIncludeLibrary(n)));
  const written: string[] = [];
  for (const file of fs.readdirSync(SRC_DIR).sort()) {
    let out: string, data: Uint8Array;
    if (file.toLowerCase().endsWith('.nss')) {
      const name = file.slice(0, -4);
      if (isIncludeLibrary(name)) continue;
      out = `${name}.ncs`; data = compileNss(name).ncs;
    } else if (file.endsWith('.dialogue.json') || file.endsWith('.creature.json')) {
      const src = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf8'));
      if (!RESREF.test(src.resref)) throw new Error(`resref must be 1-16 lowercase letters, digits or _: ${src.resref}`);
      // GFFObject logs on export; keep the output readable (warnings still shown)
      const built = file.endsWith('.dialogue.json') ? quiet(() => buildDialogue(src, scripts)) : quiet(() => buildCreature(src));
      for (const c of built.complaints) console.warn(`build-mod: ${file}: ${c}`);
      out = `${src.resref}.${file.endsWith('.dialogue.json') ? 'dlg' : 'utc'}`; data = built.value;
    } else continue;
    fs.writeFileSync(path.join(MOD_DIR, out), data);
    written.push(`${out} (${data.length} bytes)`);
  }
  console.log(`build-mod: wrote ${written.length} files to mods/kotor3: ${written.join(', ')}`);
}

// verify-mod imports the compiler helpers above; only build when this file is the tool being run.
if (/build-mod\.(c?js|ts)$/.test(process.argv[1] || '')) {
  try {
    main();
  } catch (e: any) {
    console.error(`build-mod: FAIL: ${e?.message ?? e}`);
    process.exit(1);
  }
}
