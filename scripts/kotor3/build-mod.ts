/**
 * build-mod.ts: builds the KOTOR III fan mod's game-format files from readable JSON sources.
 *
 *   mods/kotor3/src/<resref>.creature.json  ->  mods/kotor3/<resref>.utc  (GFF "UTC ")
 *   mods/kotor3/src/<resref>.dialogue.json  ->  mods/kotor3/<resref>.dlg  (GFF "DLG ")
 *
 * Uses KotOR.js's own GFF writer (src/resource/GFFObject.ts), the same format code the KotOR Forge
 * editor uses. Everything written here is authored for this project; nothing is read from the game.
 * Run: node scripts/kotor3/run.mjs build-mod
 */
import * as fs from 'fs';
import * as path from 'path';
import { GFFObject } from '@/resource/GFFObject';
import { GFFStruct } from '@/resource/GFFStruct';
import { GFFField } from '@/resource/GFFField';
import { GFFDataType } from '@/enums/resource/GFFDataType';
import { CExoLocString } from '@/resource/CExoLocString';
import { CExoLocSubString } from '@/resource/CExoLocSubString';

const MOD_DIR = path.resolve(process.cwd(), 'mods/kotor3');
const SRC_DIR = path.join(MOD_DIR, 'src');

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
function addLinkParams(s: GFFStruct) {
  add(s, GFFDataType.RESREF, 'Active', '');
  add(s, GFFDataType.RESREF, 'Active2', '');
  add(s, GFFDataType.BYTE, 'Not', 0);
  add(s, GFFDataType.BYTE, 'Not2', 0);
  add(s, GFFDataType.INT, 'Logic', 0);
  for (const n of ['1', '2', '3', '4', '5']) { add(s, GFFDataType.INT, `Param${n}`, 0); add(s, GFFDataType.INT, `Param${n}b`, 0); }
  add(s, GFFDataType.CEXOSTRING, 'ParamStrA', '');
  add(s, GFFDataType.CEXOSTRING, 'ParamStrB', '');
}

/** Fields KOTOR II puts on every entry and reply node. */
function addNodeFields(s: GFFStruct, nodeText: string, nodeId: number) {
  add(s, GFFDataType.CEXOLOCSTRING, 'Text', text(nodeText));
  add(s, GFFDataType.CEXOSTRING, 'Listener', '');
  add(s, GFFDataType.LIST, 'AnimList', []);
  add(s, GFFDataType.RESREF, 'VO_ResRef', '');
  add(s, GFFDataType.RESREF, 'Sound', '');
  add(s, GFFDataType.BYTE, 'SoundExists', 0);
  add(s, GFFDataType.RESREF, 'Script', '');
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

function buildDialogue(src: any): Uint8Array {
  const entryIndex = new Map<string, number>(src.entries.map((e: any, i: number) => [e.id, i]));
  const replyIndex = new Map<string, number>(src.replies.map((r: any, i: number) => [r.id, i]));
  const need = (map: Map<string, number>, id: string, where: string) => {
    if (!map.has(id)) throw new Error(`dialogue ${src.resref}: ${where} links to unknown node ${id}`);
    return map.get(id);
  };
  const link = (i: number, index: number) => {
    const s = new GFFStruct(i);
    add(s, GFFDataType.DWORD, 'Index', index);
    addLinkParams(s);
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
    add(s, GFFDataType.CEXOSTRING, 'Speaker', '');
    addNodeFields(s, e.text, nodeId++);
    add(s, GFFDataType.LIST, 'RepliesList', e.replies.map((r: string, j: number) => link(j, need(replyIndex, r, e.id))));
    return s;
  });
  const replies = src.replies.map((r: any, i: number) => {
    const s = new GFFStruct(i);
    addNodeFields(s, r.text, nodeId++);
    add(s, GFFDataType.LIST, 'EntriesList', r.next ? [link(0, need(entryIndex, r.next, r.id))] : []);
    return s;
  });
  const starting = src.start.map((id: string, i: number) => {
    const s = new GFFStruct(i);
    add(s, GFFDataType.DWORD, 'Index', need(entryIndex, id, 'start'));
    addLinkParams(s);
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

const quiet = console.log; // GFFObject logs on export; keep the output readable
console.log = () => {};
const written: string[] = [];
for (const file of fs.readdirSync(SRC_DIR).sort()) {
  const src = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf8'));
  let out: string, data: Uint8Array;
  if (file.endsWith('.dialogue.json')) { out = `${src.resref}.dlg`; data = buildDialogue(src); }
  else if (file.endsWith('.creature.json')) { out = `${src.resref}.utc`; data = buildCreature(src); }
  else continue;
  if (!/^[a-z0-9_]{1,16}$/.test(src.resref)) throw new Error(`resref must be 1-16 lowercase letters, digits or _: ${src.resref}`);
  fs.writeFileSync(path.join(MOD_DIR, out), data);
  written.push(`${out} (${data.length} bytes)`);
}
console.log = quiet;
console.log(`build-mod: wrote ${written.length} files to mods/kotor3: ${written.join(', ')}`);
