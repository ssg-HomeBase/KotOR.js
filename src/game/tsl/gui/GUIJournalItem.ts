import type { SaveGame } from "@/engine/SaveGame";
import { JournalCategory } from "@/engine/JournalCategory";
import { JournalEntry } from "@/engine/JournalEntry";
import { GUIProtoItem } from "@/gui";
import type { GameMenu, GUIControl } from "@/gui";
import { GFFStruct } from "@/resource/GFFStruct";

const toPaddedDigit = (num: number, len = 2) => {
  return new String(num).padStart(len, '0');
}

/**
 * GUIJournalItem class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file GUIJournalItem.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class GUIJournalItem extends GUIProtoItem {

  declare node: JournalEntry;

  constructor(menu: GameMenu, control: GFFStruct, parent: GUIControl, scale: boolean = false){
    super(menu, control, parent, scale);
    this.extent.height = 44;
  }

  createControl(){
    try{
      // KOTOR III Phase 2 (finding 25): getName() gives a mod quest's own title or the game's string; getTLKValue()
      // threw for mod quests (no string id), so the row was never built and the journal looked empty.
      this.setText(this.node.getName());
      super.createControl();
    }catch(e){
      console.error(e);
    }
    return this.widget;
  }

}
