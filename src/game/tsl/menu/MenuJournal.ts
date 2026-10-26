import type { GUIListBox, GUILabel, GUIButton } from "@/gui";
import { MenuJournal as K1_MenuJournal } from "@/game/kotor/KOTOR";
import { GUIJournalItem } from "@/game/tsl/gui/GUIJournalItem";
import type { JournalEntry } from "@/engine/JournalEntry";

// The KOTOR I journal's JournalQuestMode values (src/game/kotor/menu/MenuJournal.ts).
const MODE_ACTIVE = 0;
const MODE_COMPLETED = 1;

enum JournalSort {
  RECIEVED = 0,
  NAME = 1,
  PRIORITY = 2,
  PLANET = 3,
}

/**
 * MenuJournal class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file MenuJournal.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class MenuJournal extends K1_MenuJournal {

  declare LB_ITEMS: GUIListBox;
  declare LBL_TITLE: GUILabel;
  declare LBL_ITEM_DESCRIPTION: GUIListBox;
  declare LBL_BAR1: GUILabel;
  declare LBL_BAR2: GUILabel;
  declare LBL_BAR3: GUILabel;
  declare LBL_BAR4: GUILabel;
  declare LBL_BAR5: GUILabel;
  declare BTN_SWAPTEXT: GUIButton;
  declare BTN_FILTER_TIME: GUIButton;
  declare BTN_FILTER_NAME: GUIButton;
  declare BTN_FILTER_PRIORITY: GUIButton;
  declare BTN_FILTER_PLANET: GUIButton;
  declare BTN_MESSAGES: GUIButton;
  declare BTN_EXIT: GUIButton;

  constructor(){
    super();
    this.gui_resref = 'journal_p';
    this.background = 'blackfill';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {

      this.BTN_MESSAGES = this.getControlByName('BTN_MESSAGES');

      this.BTN_MESSAGES.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close()
        this.manager.MenuMessages.open();
      });
      
      // KOTOR III Phase 2 (finding 25): the KOTOR I setup is skipped above, so Close, picking a quest and the
      // completed/active button had no handlers. Same behaviour as the KOTOR I journal.
      this.BTN_EXIT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
      this._button_b = this.BTN_EXIT;

      this.LB_ITEMS.setProtoBuilder(GUIJournalItem);
      this.LB_ITEMS.onSelected = (item: JournalEntry) => {
        this.selected = item;
        this.UpdateSelected();
      };

      this.BTN_SWAPTEXT.addEventListener('click', (e) => {
        e.stopPropagation();
        this.mode = this.mode == MODE_COMPLETED ? MODE_ACTIVE : MODE_COMPLETED;
        this.selected = undefined;
        this.updateList();
        this.UpdateLabels();
      });

      this.BTN_FILTER_TIME.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.RECIEVED;
        this.updateList();
      });

      this.BTN_FILTER_NAME.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.NAME;
        this.updateList();
      });

      this.BTN_FILTER_PRIORITY.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.PRIORITY;
        this.updateList();
      });

      this.BTN_FILTER_PLANET.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sort = JournalSort.PLANET;
        this.updateList();
      });

      resolve();
    });
  }

  show() {
    super.show();
  }

  /** KOTOR II has filter buttons instead of KOTOR I's sort button (BTN_SORT), so only the completed/active button changes. */
  UpdateLabels(){
    this.BTN_SWAPTEXT?.setText(this.GetQuestModeBTNLabel());
  }

  /** Active quests by default; the completed/active button shows the finished ones (a quest is finished at a stage marked End). */
  getFilteredEntries(){
    const finished = (e: JournalEntry) => !!e.category?.getEntryById(e.state)?.end;
    return super.getFilteredEntries().filter( (e: JournalEntry) => (this.mode == MODE_COMPLETED) == finished(e) );
  }
  
}
