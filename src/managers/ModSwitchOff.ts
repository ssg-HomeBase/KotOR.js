/**
 * Base-game content a fan mod switches off in one area (KOTOR III Phase 2, M1.5).
 * Names are matched case-insensitively: triggers and creatures by their GIT Tag or TemplateResRef,
 * scripts by script resref, conversations by dialogue resref, doors by their GIT Tag or TemplateResRef
 * (a switched-off door stays shut and leads nowhere: an exit out of the mod's areas).
 */
export interface IModSwitchOff {
  triggers?: string[];
  creatures?: string[];
  scripts?: string[];
  conversations?: string[];
  doors?: string[];
}

/**
 * What the player is told instead (KOTOR III Phase 2, finding 30): `talk` lines for a base-game character whose
 * conversation is switched off (each character always gets the same one), `object` for a clicked object (a terminal,
 * a computer) whose conversation is switched off, `closedExit` for a switched-off door.
 */
export interface IModSwitchOffText {
  talk?: string[];
  object?: string;
  closedExit?: string;
}

/**
 * ModSwitchOff class.
 *
 * Holds the active mod's per-area switch-off rules (set by ModManager from the mod's manifest) and
 * answers "is this base-game trigger, creature, script or conversation switched off here?".
 * It has no imports on purpose, so low-level engine code (NWScript, CutsceneManager, ModuleArea)
 * can ask without pulling in the rest of the engine.
 *
 * @file ModSwitchOff.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class ModSwitchOff {

  /** Rules keyed by area resref (lower case). */
  static rules: Record<string, IModSwitchOff> = {};
  /** Resref of the area being loaded or played (set by ModuleArea). */
  static currentArea: string = '';
  /** What was switched off, for tests and debugging: "<kind>:<area>:<name>" -> count. */
  static log: Map<string, number> = new Map();

  /** Lines shown instead of switched-off content (from the mod's manifest `switchOffText`). */
  static text: IModSwitchOffText = {};

  static SetText(text: IModSwitchOffText | undefined) {
    ModSwitchOff.text = text || {};
  }

  /** The line a switched-off character says when clicked; the same character always gets the same line. */
  static TalkLine(key: string): string {
    const lines = ModSwitchOff.text.talk || [];
    if (!lines.length) return '';
    let h = 0;
    for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return lines[Math.abs(h) % lines.length];
  }

  static SetRules(rules: Record<string, IModSwitchOff> | undefined) {
    ModSwitchOff.rules = {};
    for (const [area, rule] of Object.entries(rules || {})) {
      ModSwitchOff.rules[area.toLowerCase()] = rule;
    }
  }

  /** True when the area has any rule of this kind (lets callers skip extra lookups). */
  static HasRules(areaResRef: string, kind: keyof IModSwitchOff): boolean {
    return !!ModSwitchOff.rules[String(areaResRef || '').toLowerCase()]?.[kind]?.length;
  }

  static IsSwitchedOff(kind: keyof IModSwitchOff, names: string | string[], areaResRef: string = ModSwitchOff.currentArea): boolean {
    const area = String(areaResRef || '').toLowerCase();
    const list = ModSwitchOff.rules[area]?.[kind];
    if (!list || !list.length) return false;
    const wanted = (Array.isArray(names) ? names : [names]).map((n) => String(n || '').toLowerCase()).filter(Boolean);
    const hit = list.find((n) => wanted.includes(String(n).toLowerCase()));
    if (!hit) return false;
    const logKey = `${kind}:${area}:${hit.toLowerCase()}`;
    const count = (ModSwitchOff.log.get(logKey) || 0) + 1;
    ModSwitchOff.log.set(logKey, count);
    if (count === 1) console.log(`ModManager: switched off base-game ${kind.replace(/s$/, '')} "${hit}" in ${area}`);
    return true;
  }

}
