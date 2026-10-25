import { ResourceLoader } from "@/loaders/ResourceLoader";
import { ResourceTypes } from "@/resource/ResourceTypes";
import { CacheScope } from "@/enums/resource/CacheScope";
import { ApplicationProfile } from "@/utility/ApplicationProfile";
import { ApplicationEnvironment } from "@/enums/ApplicationEnvironment";

/** One creature the mod adds to an existing area (same fields as a GIT "Creature List" entry). */
export interface IModCreaturePlacement {
  area: string;
  templateResRef: string;
  x: number;
  y: number;
  z: number;
  /** Facing in degrees, 0 = +X, counter-clockwise. */
  facing: number;
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
}

/**
 * ModManager class.
 *
 * Loads a fan mod that ships with the web build (dist/game/mods/<key>/) on top of the player's
 * own game files. Mod resources go into the OVERRIDE cache scope, which ResourceLoader checks
 * before module archives and chitin.key, and after the game's own Override folder has loaded.
 * The mod never reads or writes anything in the player's game folder.
 *
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 *
 * @file ModManager.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class ModManager {

  static manifest: IModManifest | undefined;
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
    console.log(`ModManager: loaded mod "${manifest.name}" (${ModManager.loadedFiles.length} files)`, ModManager.loadedFiles);
  }

  /** Creatures the active mod places in the given area (matched by area resref, case-insensitive). */
  static GetCreaturePlacements(areaResRef: string): IModCreaturePlacement[] {
    const area = String(areaResRef || '').toLowerCase();
    return (ModManager.manifest?.creatures || []).filter((c) => c.area.toLowerCase() === area);
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
