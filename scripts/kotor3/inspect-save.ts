/**
 * inspect-save.ts: prints what a KotOR.js save holds for the KOTOR III mod checks:
 * party members, available companions, journal entries, mod globals and the files inside SAVEGAME.sav.
 * Reads only the save folder given (the app's own storage), never the game folder.
 * Run: node scripts/kotor3/run.mjs inspect-save "<save folder>" [GLOBAL_PREFIX]
 */
import * as fs from 'fs';
import * as path from 'path';
import { GFFObject } from '@/resource/GFFObject';
import { ERFObject } from '@/resource/ERFObject';
import { ResourceTypes } from '@/resource/ResourceTypes';

const dir = process.argv[2];
const prefix = (process.argv[3] || 'K3_').toLowerCase();
if (!dir || !fs.existsSync(dir)) { console.error('usage: inspect-save <save folder> [GLOBAL_PREFIX]'); process.exit(2); }

const gff = (f: string) => new GFFObject(new Uint8Array(fs.readFileSync(path.join(dir, f))));
const out: any = {};

const pt = gff('PARTYTABLE.res');
out.members = pt.RootNode.hasField('PT_MEMBERS') ? pt.getFieldByLabel('PT_MEMBERS').getChildStructs().map((s: any) => ({
  id: s.getFieldByLabel('PT_MEMBER_ID')?.getValue(), leader: s.getFieldByLabel('PT_IS_LEADER')?.getValue(),
})) : [];
out.available = pt.RootNode.hasField('PT_AVAIL_NPCS') ? pt.getFieldByLabel('PT_AVAIL_NPCS').getChildStructs()
  .map((s: any, i: number) => ({ slot: i, avail: s.getFieldByLabel('PT_NPC_AVAIL')?.getValue(), select: s.getFieldByLabel('PT_NPC_SELECT')?.getValue() }))
  .filter((x: any) => x.avail || x.select) : [];
out.gold = pt.RootNode.getFieldByLabel('PT_GOLD')?.getValue();
out.journal = pt.RootNode.hasField('JNL_Entries') ? pt.getFieldByLabel('JNL_Entries').getChildStructs().map((s: any) => ({
  plot: s.getFieldByLabel('JNL_PlotID')?.getValue(), state: s.getFieldByLabel('JNL_State')?.getValue(),
})).filter((j: any) => String(j.plot).toLowerCase().startsWith(prefix.replace(/_$/, ''))) : [];

const gv = gff('GLOBALVARS.res');
const names = (label: string) => gv.getFieldByLabel(label).getChildStructs().map((s: any) => String(s.getFieldByLabel('Name').getValue()));
const boolNames = names('CatBoolean');
const boolBytes: Uint8Array = gv.RootNode.getFieldByLabel('ValBoolean').getVoid();
out.booleans = boolNames.map((n: string, i: number) => [n, (boolBytes[Math.floor(i / 8)] >> (7 - (i % 8))) & 1])
  .filter(([n]: any) => n.toLowerCase().startsWith(prefix));
const numNames = names('CatNumber');
const numBytes: Uint8Array = gv.RootNode.getFieldByLabel('ValNumber').getVoid();
out.numbers = numNames.map((n: string, i: number) => [n, numBytes[i]]).filter(([n]: any) => n.toLowerCase().startsWith(prefix));

(async () => {
  const sav = new ERFObject(new Uint8Array(fs.readFileSync(path.join(dir, 'SAVEGAME.sav'))));
  await sav.load();
  out.savegameFiles = sav.keyList.map((k: any) => `${k.resRef}.${ResourceTypes.getKeyByValue(k.resType)}`).sort();
  console.log(JSON.stringify(out, null, 2));
})();
