import EngineLocation from "@/engine/EngineLocation";
import { IEngineGlobals } from "@/interface/engine/IEngineGlobals";
import { TwoDAManager } from "@/managers/TwoDAManager";

/**
 * GlobalVariableManager class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file GlobalVariableManager.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class GlobalVariableManager {

  static Globals: IEngineGlobals = {
    Boolean   : new Map(), 
    Number    : new Map(), 
    String    : new Map(), 
    Location  : new Map(), 
  };
  
  /** Globals a fan mod defines in its own data (KOTOR III Phase 2): added on every Init, never written to globalcat.2da. */
  static ExtraDefinitions: { name: string; type: 'Boolean' | 'Number' | 'String' | 'Location' }[] = [];

  public static AddExtraDefinitions(){
    for(const def of GlobalVariableManager.ExtraDefinitions){
      const key = def.name.toLowerCase();
      switch(def.type){
        case 'Boolean':
          if(!GlobalVariableManager.Globals.Boolean.has(key)) GlobalVariableManager.Globals.Boolean.set(key, {name: def.name, value: false});
        break;
        case 'Number':
          if(!GlobalVariableManager.Globals.Number.has(key)) GlobalVariableManager.Globals.Number.set(key, {name: def.name, value: 0});
        break;
        case 'String':
          if(!GlobalVariableManager.Globals.String.has(key)) GlobalVariableManager.Globals.String.set(key, {name: def.name, value: ''});
        break;
        case 'Location':
          if(!GlobalVariableManager.Globals.Location.has(key)) GlobalVariableManager.Globals.Location.set(key, {name: def.name, value: new EngineLocation()});
        break;
      }
    }
  }

  public static Init(){
    // A new game starts from a clean set of globals (before this, values from a previous game stayed).
    GlobalVariableManager.Globals.Boolean.clear();
    GlobalVariableManager.Globals.Number.clear();
    GlobalVariableManager.Globals.String.clear();
    GlobalVariableManager.Globals.Location.clear();
    let _initGlobals = TwoDAManager.datatables.get('globalcat').rows;
    for (let key in _initGlobals) {
      if (_initGlobals.hasOwnProperty(key)) {
        let globItem = _initGlobals[key];

        switch(globItem.type){
          case 'Boolean':
            GlobalVariableManager.Globals.Boolean.set(globItem.name.toLowerCase(), {name: globItem.name, value: false});
          break;
          case 'Location':
            GlobalVariableManager.Globals.Location.set(globItem.name.toLowerCase(), {name: globItem.name, value: new EngineLocation()});
          break;
          case 'Number':
            GlobalVariableManager.Globals.Number.set(globItem.name.toLowerCase(), {name: globItem.name, value: 0});
          break;
          case 'String':
            GlobalVariableManager.Globals.String.set(globItem.name.toLowerCase(), {name: globItem.name, value: ''});
          break;
        }
      }
    }
    GlobalVariableManager.AddExtraDefinitions();
  }
  
  public static SetGlobalBoolean(name = '', value = false){
    let key = GlobalVariableManager.Globals.Boolean.get(name.toLocaleLowerCase());
    if(key){
      key.value = value ? true : false;
    }
  }

  public static GetGlobalBoolean(name = ''): boolean {
    let key = GlobalVariableManager.Globals.Boolean.get(name.toLocaleLowerCase());
    if(key){
      return key.value ? true : false;
    }

    return false;
  }

  public static SetGlobalNumber(name:string = '', value:number = 0){
    let key = GlobalVariableManager.Globals.Number.get(name.toLocaleLowerCase());
    if(key){
      key.value = Math.floor(value);
    }
  }

  public static GetGlobalNumber(name:string = ''): number {
    let key = GlobalVariableManager.Globals.Number.get(name.toLocaleLowerCase());
    if(key) return key.value;

    return 0;
  }

  public static SetGlobalString(name:string = '', value: string = ''){
    let key = GlobalVariableManager.Globals.String.get(name.toLocaleLowerCase());
    if(key){
      key.value = value;
    }
  }

  public static GetGlobalString(name:string = ''): string {
    let key = GlobalVariableManager.Globals.String.get(name.toLocaleLowerCase());
    if(key) return key.value;

    return '';
  }

  public static SetGlobalLocation(name = '', value = new EngineLocation){
    let key = GlobalVariableManager.Globals.Location.get(name.toLocaleLowerCase());
    if(key && value instanceof EngineLocation)
      key.value = value;
  }

  public static GetGlobalLocation(name = ''): EngineLocation {
    let key = GlobalVariableManager.Globals.Location.get(name.toLocaleLowerCase());
    if(key) return key.value;

    return new EngineLocation;
  }

}