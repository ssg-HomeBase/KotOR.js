import React from "react";
import { KotORModal } from "@/apps/game/components/modal/modal";
import { useApp } from "@/apps/game/context/AppContext";
import { ApplicationEnvironment } from "@/apps/game/KotOR";
import { NeedKotorCollapsibleSection } from "@/apps/common/components/needKotor/NeedKotorCollapsibleSection";
import * as KotOR from "@/apps/game/KotOR";

/**
 * KOTOR III Phase 2: what the game app's Grant Access box tells the player.
 * Chrome refuses to let any website open folders under C:\Program Files or C:\Program Files (x86)
 * (chrome_file_system_access_permission_context.cc), which is where Steam installs KOTOR II by default.
 */
export const GRANT_ACCESS_READ_ONLY_TEXT =
  "Pick your KOTOR II game folder. The game only reads it: saves and temporary files are kept in this browser's own storage (or the desktop app's data folder), never in your game folder.";
export const GRANT_ACCESS_PROGRAM_FILES_TEXT =
  "Chrome cannot open folders under C:\\Program Files or C:\\Program Files (x86), and that is where Steam installs KOTOR II. First copy the game folder to C:\\Games: in File Explorer, copy the \"Knights of the Old Republic II\" folder from C:\\Program Files (x86)\\Steam\\steamapps\\common and paste it into C:\\Games. Then click GRANT ACCESS and pick C:\\Games\\Knights of the Old Republic II.";

export const ModalGrantAccess = () => {
  const appContext = useApp();
  const [appState] = appContext.appState;
  const [gameKey] = appContext.gameKey;

  const onCancel = (e: React.MouseEvent<HTMLButtonElement>) => {
    KotOR.EventManager.FireEvent('grant-access.cancel');
    console.log("File System: access denied");
    alert("You must grant access to your local game directory to continue.");
    window.close();
  }
  
  const showBrowserDirectoryPicker = async () => {
    const handle = await window.showDirectoryPicker({
      mode: "read"
    });
    if(!handle) return;

    if (!(await appState.validateDirectoryHandle(handle))) {
      return;
    }

    KotOR.EventManager.FireEvent('grant-access.grant');
    return handle;
  }

  const showElectronDirectoryPicker = async () => {
    try{
      const directory = await(window as any).electron.locate_game_directory(appState.appProfile);
      if(directory){
        appState.attachDirectoryPath(directory);
        return directory;
      }
    }catch(e){
      appState.attachDirectoryPath('');
      console.error(e);
      alert("Unable to access your local game directory. Please try again.");
    }
    return;
  }

  const onOk = async (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log("File System: access granted");

    // Electron
    if(appState.env == ApplicationEnvironment.ELECTRON){
      await showElectronDirectoryPicker();
      return;
    }

    // Browser
    if(appState.env == ApplicationEnvironment.BROWSER){
      const handle = await showBrowserDirectoryPicker();
      if(!handle){
        console.log("File System: access denied");
        alert("Unable to access your local game directory. Please try again.");
        return;
      }
      appState.attachDirectoryHandle(handle);
    }
  }

  return (
    <KotORModal 
      title="Grant Access" 
      show={true} 
      className="forge-style-modal grant-access-modal"
      onCancel={onCancel} 
      onOk={onOk} 
      cancelText="QUIT" 
      okText="GRANT ACCESS"
    >
      <div className="grant-access-info">
        <p>{GRANT_ACCESS_READ_ONLY_TEXT}</p>
        {appState.env == ApplicationEnvironment.BROWSER && (
          <p className="grant-access-program-files"><strong>{GRANT_ACCESS_PROGRAM_FILES_TEXT}</strong></p>
        )}
      </div>
      <NeedKotorCollapsibleSection gameKey={gameKey} />
    </KotORModal>
  );
};
