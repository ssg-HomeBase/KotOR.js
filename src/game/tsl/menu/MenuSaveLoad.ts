import { GameState } from "@/GameState";
import type { GUILabel, GUIListBox, GUIButton } from "@/gui";
import { MenuSaveLoad as K1_MenuSaveLoad, NewSaveItem } from "@/game/kotor/KOTOR";
import { MenuSaveLoadMode } from "@/enums/gui/MenuSaveLoadMode";
import { GUISaveGameItem } from "@/game/tsl/gui/GUISaveGameItem";
import { SaveGame } from "@/engine/SaveGame";
import { TextureLoader } from "@/loaders";

/**
 * MenuSaveLoad class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file MenuSaveLoad.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class MenuSaveLoad extends K1_MenuSaveLoad {

  declare LBL_BAR4: GUILabel;
  declare LBL_PANELNAME: GUILabel;
  declare LBL_SCREENSHOT: GUILabel;
  declare LBL_PLANETNAME: GUILabel;
  declare LBL_PM2: GUILabel;
  declare LBL_AREANAME: GUILabel;
  declare LBL_PM1: GUILabel;
  declare LBL_PM3: GUILabel;
  declare LBL_PCNAME: GUILabel;
  declare LBL_TIMEPLAYED: GUILabel;
  declare LBL_BAR1: GUILabel;
  declare LBL_BAR2: GUILabel;
  declare LBL_BAR3: GUILabel;
  declare LB_GAMES: GUIListBox;
  declare BTN_BACK: GUIButton;
  declare BTN_SAVELOAD: GUIButton;
  declare BTN_DELETE: GUIButton;
  declare BTN_FILTER: GUIButton;

  filters: string[] = [];
  cFilterIndex: number = 0;

  constructor(){
    super();
    this.gui_resref = 'saveload_p';
    this.background = 'blackfill';
    this.voidFill = true;
  }

  async menuControlInitializer(skipInit: boolean = false) {
    await super.menuControlInitializer(true);
    if(skipInit) return;
    return new Promise<void>((resolve, reject) => {
      this.BTN_SAVELOAD.setText('Load');
      this.BTN_SAVELOAD.addEventListener('click', (e) => {
        e.stopPropagation();
        const savegame = this.selected;
        if(this.mode == MenuSaveLoadMode.LOADGAME){
          if(savegame){
            this.manager.ClearMenus();
            if(GameState.module){
              GameState.module.dispose();
              GameState.module = undefined;
            }
            savegame.load()
          }
        }else{
          // KOTOR III Phase 2: the KOTOR II save menu never saved (the name was only logged, and
          // overwriting was empty). Same behaviour as the KOTOR I menu (src/game/kotor/menu/MenuSaveLoad.ts).
          if(savegame instanceof NewSaveItem){
            this.manager.MenuSaveName.open();
            this.manager.MenuSaveName.onSave = async ( name = '' ) => {
              await SaveGame.SaveCurrentGame(String(name).trim());
              this.reloadSaves();
            };
          }else if(savegame){
            // Existing slot: confirm, then overwrite (string 1591 in the player's own dialog.tlk, as in KOTOR I).
            this.manager.InGameConfirm.showConfirmDialog(
              1591,
              async () => {
                await SaveGame.OverwriteSave(savegame);
                this.reloadSaves();
              },
              () => {}
            );
          }
        }
      });
      this._button_a = this.BTN_SAVELOAD;

      this.BTN_BACK.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
      this._button_b = this.BTN_BACK;

      // KOTOR III Phase 2: Delete was shown but had no handler. Same as KOTOR I: confirm (string 1592), then delete.
      this.BTN_DELETE.addEventListener('click', (e) => {
        e.stopPropagation();
        const save = this.selected;
        if(!(save instanceof SaveGame) || save instanceof NewSaveItem) return;
        this.manager.InGameConfirm.showConfirmDialog(
          1592,
          async () => {
            await SaveGame.DeleteSave(save);
            this.reloadSaves();
          },
          () => {}
        );
      });
      this._button_y = this.BTN_DELETE;

      this.BTN_FILTER.addEventListener('click', (e) => {
        if(this.filters.length){
          this.cFilterIndex++;
          if(this.cFilterIndex >= this.filters.length){
            this.cFilterIndex = 0;
          }
        }
        this.reloadSaves();
        this.UpdateSelected();
      });

      this.LBL_PCNAME.setText('');
      this.LBL_TIMEPLAYED.setText('');
      // this.LB_GAMES.border.inneroffsety = 7;
      this.LB_GAMES.setProtoBuilder(GUISaveGameItem);
      this.LB_GAMES.onSelected = (save: any) => {
        this.selected = save;
        this.UpdateSelected();
        this.LBL_PCNAME.setText('');
        this.LBL_TIMEPLAYED.setText('');
        if (this.selected instanceof SaveGame) {
          if (this.selected instanceof NewSaveItem) {
    
          }else{
            this.LBL_PCNAME.setText(this.selected.PCNAME);
            this.LBL_TIMEPLAYED.setText(`Time: ${this.selected.getHoursPlayed()}H ${this.selected.getMinutesPlayed()}M`);
          }
        }
      }

      this.tGuiPanel.getFill().position.z = -1;
      resolve();
    });
  }

  getSaveGames(): SaveGame[] {
    let saves: SaveGame[] = [];

    if (this.mode == MenuSaveLoadMode.SAVEGAME) {
      saves = SaveGame.saves.slice().filter(save => {
        return !save.getIsQuickSave() && !save.getIsAutoSave();
      });
      saves = saves.reverse();
      saves.unshift(new NewSaveItem());
    }else{
      saves = SaveGame.saves.slice();
      let special = saves.filter(save => {
        return save.getIsQuickSave() || save.getIsAutoSave();
      });
      
      saves = saves.filter(save => {
        return !save.getIsQuickSave() && !save.getIsAutoSave();
      }).reverse();
      saves.unshift(...special);
    }

    this.filters = saves.filter( (save) => {
      return !save.getIsQuickSave() && !save.getIsAutoSave() && !save.isNewSave;
    }).map( (save) => {
      return save.PCNAME;
    }).filter( (pcname, index, array) => {
      return array.indexOf(pcname) === index;
    });

    if(this.filters.length){
      // KOTOR III Phase 2: keep the New Save slot (it has no character name), or it vanished after the first save.
      saves = saves.filter((save) => {
        return save.isNewSave || save.PCNAME == this.filters[this.cFilterIndex];
      });
    }

    return saves;
  }
  
}
