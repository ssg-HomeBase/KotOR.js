import React from "react";
import { KotORModal } from "@/apps/game/components/modal/modal";
import { useApp } from "@/apps/game/context/AppContext";
import { ApplicationEnvironment } from "@/apps/game/KotOR";
import { NeedKotorCollapsibleSection } from "@/apps/common/components/needKotor/NeedKotorCollapsibleSection";
import * as KotOR from "@/apps/game/KotOR";
import { FileListDirectory } from "@/utility/FileListDirectory";

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
  
  // KOTOR III Phase 2: never fail silently. Each problem after the folder picker is shown in the box,
  // and when Chrome needs a fresh click to grant read access, the button becomes CONTINUE.
  const [status, setStatus] = React.useState<string>('');
  const [pendingHandle, setPendingHandle] = React.useState<FileSystemDirectoryHandle | null>(null);
  const describe = (e: any) => `${e?.name || 'Error'}: ${e?.message || String(e)}`;

  const folderHasGame = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
    try {
      await handle.getFileHandle('chitin.key');
      return true;
    } catch {
      for await (const entry of (handle as any).values()) {
        if (entry.kind === 'file' && String(entry.name).toLowerCase() === 'chitin.key') return true;
      }
      return false;
    }
  }

  const finishBrowserGrant = async (handle: FileSystemDirectoryHandle) => {
    let state: string = 'prompt';
    try {
      state = await (handle as any).queryPermission({ mode: 'read' });
    } catch (e) {
      console.warn('Grant Access: queryPermission failed', e);
    }
    if (state !== 'granted') {
      try {
        state = await (handle as any).requestPermission({ mode: 'read' });
      } catch (e) {
        // Chrome can only ask during a click; keep the folder and let the next click ask.
        console.warn('Grant Access: requestPermission needs a click', e);
        setPendingHandle(handle);
        setStatus(`Chrome needs one more click before the game can read "${handle.name}". Click CONTINUE, then choose View files (or Allow) if Chrome asks.`);
        return;
      }
    }
    if (state !== 'granted') {
      setPendingHandle(null);
      setStatus(`Chrome did not allow the game to read "${handle.name}" (permission: ${state}). Click GRANT ACCESS again and choose View files (or Allow) when Chrome asks.`);
      return;
    }
    if (!(await folderHasGame(handle))) {
      setPendingHandle(null);
      setStatus(`The folder "${handle.name}" does not contain KOTOR II (no chitin.key in it). Click GRANT ACCESS and pick the folder C:\\Games\\Knights of the Old Republic II itself, not C:\\Games.`);
      return;
    }
    setPendingHandle(null);
    setStatus('');
    KotOR.EventManager.FireEvent('grant-access.grant');
    await appState.attachDirectoryHandle(handle);
  }

  // The older folder picker (<input webkitdirectory>): a second way in when Chrome refuses the newer one.
  const folderInput = React.useRef<HTMLInputElement | null>(null);
  const openOlderPicker = () => {
    setPendingHandle(null);
    setStatus('');
    folderInput.current?.click();
  }
  const onOlderPickerFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = e.target.files;
      if (!files || !files.length) {
        setStatus('No folder was chosen. Click OPEN THE FOLDER ANOTHER WAY and pick C:\\Games\\Knights of the Old Republic II.');
        return;
      }
      setStatus(`Reading the list of ${files.length.toLocaleString()} files...`);
      const folder = FileListDirectory.fromFiles(files);
      e.target.value = '';
      if (!folder) { setStatus('That folder looks empty. Pick C:\\Games\\Knights of the Old Republic II.'); return; }
      await finishBrowserGrant(folder as unknown as FileSystemDirectoryHandle);
    } catch (err) {
      console.error('Grant Access (older picker)', err);
      setStatus(`Something went wrong reading the folder (${describe(err)}). Tell Claude this message.`);
    }
  }

  const showBrowserDirectoryPicker = async () => {
    if (pendingHandle) {
      await finishBrowserGrant(pendingHandle);
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({
        mode: "read"
      });
    } catch (e: any) {
      console.warn('Grant Access: folder picker', e);
      setStatus(e?.name === 'AbortError'
        ? 'No folder was opened. If Chrome said it cannot open the folder, it is probably under C:\\Program Files: pick C:\\Games\\Knights of the Old Republic II instead.'
        : `Chrome could not open the folder picker (${describe(e)}).`);
      return;
    }
    if (!handle) return;
    await finishBrowserGrant(handle);
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
      try {
        await showBrowserDirectoryPicker();
      } catch (err) {
        console.error('Grant Access', err);
        setPendingHandle(null);
        setStatus(`Something went wrong after the folder was picked (${describe(err)}). Click GRANT ACCESS to try again, and tell Claude this message if it repeats.`);
      }
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
      okText={pendingHandle ? "CONTINUE" : "GRANT ACCESS"}
    >
      <div className="grant-access-info">
        <p>{GRANT_ACCESS_READ_ONLY_TEXT}</p>
        {appState.env == ApplicationEnvironment.BROWSER && (
          <p className="grant-access-program-files"><strong>{GRANT_ACCESS_PROGRAM_FILES_TEXT}</strong></p>
        )}
        {status && (
          <p className="grant-access-status" role="alert" style={{ color: '#ffcc66' }}>{status}</p>
        )}
        {appState.env == ApplicationEnvironment.BROWSER && (
          <p className="grant-access-older-picker">
            If GRANT ACCESS does nothing or Chrome refuses the folder, use{' '}
            <button type="button" className="modal-button grant-access-older-button" onClick={openOlderPicker}>OPEN THE FOLDER ANOTHER WAY</button>
            {' '}and pick the same folder. Chrome then asks to &quot;upload&quot; the files: nothing leaves your PC, the game only reads them in this tab. You will need to pick the folder again after reloading the page.
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              ref={(el) => { if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', ''); } folderInput.current = el; }}
              onChange={onOlderPickerFiles}
            />
          </p>
        )}
      </div>
      <NeedKotorCollapsibleSection gameKey={gameKey} />
    </KotORModal>
  );
};
