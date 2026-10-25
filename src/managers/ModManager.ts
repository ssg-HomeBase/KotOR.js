import { ResourceLoader } from "@/loaders/ResourceLoader";
import { ResourceTypes } from "@/resource/ResourceTypes";
import { CacheScope } from "@/enums/resource/CacheScope";
import { ApplicationProfile } from "@/utility/ApplicationProfile";
import { ApplicationEnvironment } from "@/enums/ApplicationEnvironment";
import { GlobalVariableManager } from "@/managers/GlobalVariableManager";
import { JournalManager } from "@/managers/JournalManager";
import { TwoDAManager } from "@/managers/TwoDAManager";
import { JournalCategory } from "@/engine/JournalCategory";
import { JournalCategoryEntry } from "@/engine/JournalCategoryEntry";
import { CExoLocString } from "@/resource/CExoLocString";
import { CExoLocSubString } from "@/resource/CExoLocSubString";
import { ModSwitchOff, IModSwitchOff } from "@/managers/ModSwitchOff";
export type { IModSwitchOff } from "@/managers/ModSwitchOff";

/** One creature the mod adds to an existing area (same fields as a GIT "Creature List" entry). */
export interface IModCreaturePlacement {
  area: string;
  templateResRef: string;
  x: number;
  y: number;
  z: number;
  /** Facing in degrees, 0 = +X, counter-clockwise. */
  facing: number;
  /** Not placed when this mod global (Boolean) is TRUE, e.g. after the creature joined the party. */
  skipIfGlobal?: string;
}

/** A global variable the mod defines (instead of shipping an edited globalcat.2da). */
export interface IModGlobal {
  name: string;
  type: 'Boolean' | 'Number' | 'String';
}

/** A quest the mod defines (instead of shipping an edited global.jrl and plot.2da). */
export interface IModQuest {
  tag: string;
  name: string;
  priority?: number;
  planetId?: number;
  comment?: string;
  /** plot.2da "xp" value for the quest. */
  xp?: number;
  entries: { id: number; text: string; end?: boolean; xpPercentage?: number }[];
}

/** Shape of the mod's campaign data file (named by the manifest's `campaign` field). */
export interface IModCampaign {
  globals?: IModGlobal[];
  quests?: IModQuest[];
}

/** Shape of mods/<key>/manifest.json */
export interface IModManifest {
  key: string;
  name: string;
  baseGame: 'tsl' | 'kotor';
  /** Area a new game starts in (after quick character creation). */
  startModule?: string;
  files: string[];
  creatures?: IModCreaturePlacement[];
  /** Per-area switch-off of base-game plot, keyed by area resref. */
  switchOff?: Record<string, IModSwitchOff>;
  /** Campaign data file (globals and quests), e.g. "campaign.json". */
  campaign?: string;
}

/**
 * ModManager class.
 *
 * Loads a fan mod that ships with the web build (dist/game/mods/<key>/) on top of the player's
 * own game files. Mod resources go into the OVERRIDE cache scope, which ResourceLoader checks
 * before module archives and chitin.key, and after the game's own Override folder has loaded.
 * The mod's globals, quests and plot rows are added in memory; no game table is edited or shipped.
 * The mod never reads or writes anything in the player's game folder.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file ModManager.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class ModManager {

  static manifest: IModManifest | undefined;
  static campaign: IModCampaign | undefined;
  static loadedFiles: string[] = [];

  /** The mod named by the active launcher profile (`mod` field), if any. */
  static get activeModKey(): string | undefined {
    const key = ApplicationProfile.profile?.mod;
    return typeof key === 'string' && /^[a-z0-9_-]+$/i.test(key) ? key : undefined;
  }

  static async LoadActiveMod(): Promise<void> {
    const key = ModManager.activeModKey;
    if (!key) return;
    const manifest = JSON.parse(new TextDecoder().decode(await ModManager.readModFile(key, 'manifest.json'))) as IModManifest;
    ModManager.manifest = manifest;
    ModManager.loadedFiles = [];
    ModSwitchOff.SetRules(manifest.switchOff);
    for (const file of manifest.files) {
      const match = /^([a-z0-9_]{1,16})\.([a-z0-9]{3})$/i.exec(file);
      if (!match) throw new Error(`ModManager: bad file name in manifest: ${file}`);
      const resRef = match[1].toLowerCase();
      const resType = ResourceTypes[match[2].toLowerCase()];
      if (typeof resType !== 'number') throw new Error(`ModManager: unknown resource type: ${file}`);
      const buffer = await ModManager.readModFile(key, file);
      ResourceLoader.setCache(CacheScope.OVERRIDE, resType, resRef, buffer);
      ModManager.loadedFiles.push(file);
    }
    if (manifest.campaign) {
      if (!/^[a-z0-9_-]+\.json$/i.test(manifest.campaign)) throw new Error(`ModManager: bad campaign file name: ${manifest.campaign}`);
      ModManager.campaign = JSON.parse(new TextDecoder().decode(await ModManager.readModFile(key, manifest.campaign))) as IModCampaign;
      ModManager.ApplyCampaign(ModManager.campaign);
    }
    console.log(`ModManager: loaded mod "${manifest.name}" (${ModManager.loadedFiles.length} files)`, ModManager.loadedFiles);
  }

  /**
   * Registers the mod's globals, quests and plot rows with the engine, in memory only.
   * Globals are re-added every time GlobalVariableManager.Init runs (new game), quests every time
   * the journal loads; saves store them by name like the base game's own (SaveGame.ts, PartyManager.ts).
   */
  static ApplyCampaign(campaign: IModCampaign) {
    GlobalVariableManager.ExtraDefinitions = (campaign.globals || []).map((g) => ({ name: g.name, type: g.type }));
    GlobalVariableManager.AddExtraDefinitions();

    const categories: JournalCategory[] = [];
    for (const quest of campaign.quests || []) {
      const category = new JournalCategory();
      category.tag = quest.tag;
      category.name = ModManager.text(quest.name);
      category.priority = quest.priority ?? 1;
      category.planet_id = quest.planetId ?? 0;
      category.comment = quest.comment ?? '';
      category.entries = quest.entries.map((e) => {
        const entry = new JournalCategoryEntry();
        entry.id = e.id;
        entry.text = ModManager.text(e.text);
        entry.end = e.end ? 1 : 0;
        entry.xp_percentage = e.xpPercentage ?? 0;
        return entry;
      });
      categories.push(category);
      ModManager.addPlotRow(quest.tag, quest.xp ?? 0);
    }
    JournalManager.ExtraCategories = categories;
    JournalManager.AddExtraCategories();
    console.log(`ModManager: campaign data: ${GlobalVariableManager.ExtraDefinitions.length} globals, ${categories.length} quests`);
  }

  /** Adds an in-memory plot.2da row so AddJournalQuestEntry accepts the mod's quest tag. */
  private static addPlotRow(label: string, xp: number) {
    const plot = TwoDAManager.datatables.get('plot');
    if (!plot) { console.warn('ModManager: plot table not loaded; quest', label, 'has no plot row'); return; }
    if (plot.getRowByColumnAndValue('label', label.toLowerCase())) return;
    const index = Object.keys(plot.rows).reduce((max, k) => Math.max(max, parseInt(k, 10) || 0), -1) + 1;
    const row: any = {};
    for (const col of plot.columns) row[col] = '****';
    row.__rowlabel = String(index);
    row.label = label.toLowerCase();
    row.xp = String(xp);
    plot.rows[index] = row;
    plot.RowCount = Object.keys(plot.rows).length;
  }

  private static text(s: string): CExoLocString {
    const l = new CExoLocString(-1);
    l.addSubString(new CExoLocSubString(0, s));
    return l;
  }

  /** Creatures the active mod places in the given area (matched by area resref, case-insensitive). */
  static GetCreaturePlacements(areaResRef: string): IModCreaturePlacement[] {
    const area = String(areaResRef || '').toLowerCase();
    return (ModManager.manifest?.creatures || []).filter((c) => c.area.toLowerCase() === area);
  }

  /** True when the mod switches this base-game trigger, creature, script or conversation off in the area. */
  static IsSwitchedOff(kind: keyof IModSwitchOff, names: string | string[], areaResRef?: string): boolean {
    return ModSwitchOff.IsSwitchedOff(kind, names, areaResRef);
  }

  /** Mod files sit next to the game app: <app>/mods/<key>/<file>. */
  static async readModFile(key: string, file: string): Promise<Uint8Array> {
    const url = new URL(`mods/${key}/${file}`, window.location.href);
    if (ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON) {
      // Electron loads the app from file://, where fetch() is not available; read through the preload fs bridge.
      const filePath = decodeURIComponent(url.pathname).replace(/^\/([a-zA-Z]:)/, '$1');
      return await new Promise<Uint8Array>((resolve, reject) => {
        (window as any).fs.readFile(filePath, {}, (err: any, data: any) => err ? reject(err) : resolve(new Uint8Array(data)));
      });
    }
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`ModManager: ${url.pathname} returned HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

}
