import * as path from "path";
import * as fs from "fs";
import { ApplicationProfile } from "@/utility/ApplicationProfile";
import { ApplicationEnvironment } from "@/enums/ApplicationEnvironment";
import { IGameFileSystemReadDirOptions } from "@/interface/filesystem/IGameFileSystemReadDirOptions";
import { isUsableDirectoryHandle } from "@/utility/gameDirectoryAccess";
declare const dialog: any;

const webHandleHasRemove = typeof (FileSystemFileHandle.prototype as any).remove === 'function'

const spleep = (time: number = 0) => {
  return new Promise( (resolve, reject) => {
    setTimeout(resolve, time);
  });
}

/**
 * GameFileSystem class.
 * 
 * Handles file system access for the application.
 * It will use either the File System Access API or the fs module built into node
 * depending on the ENVIRONMENT ( BROWSER|ELECTRON ) the app was loaded under.
 * 
 * This class should only access the directory that the user supplied and not escape it.
 * Under the web this is forced, but the node implementation is not so strict.
 * 
 * This class will also be able to access sub files and folders of the supplied directory.
 * 
 * File access outside of this usecase should be delagated to calling the open/save file dialogs
 * when the user requests them.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file GameFileSystem.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class GameFileSystem {

  /**
   * KOTOR III Phase 2: the player's game folder is only ever read.
   * Everything the engine writes (saves, the in-progress module state, settings, screenshots)
   * goes to the app's own storage instead:
   *   - desktop app (Electron): <app.getPath('userData')>/game-data/<profile key>/
   *   - browser: the origin private file system, /kotorjs-game-data/<profile key>/
   * Reads of the folders below come from that storage too; root-level *.ini files are read from it
   * when the app has written its own copy. Every other read comes from the game folder.
   */
  private static readonly USER_DATA_DIRS = new Set(['gameinprogress', 'saves', 'screenshots']);
  /**
   * Set to true by the game app (src/apps/game/states/AppState.ts initApp) before anything runs.
   * While true, nothing is ever written to the game folder. KotOR Forge leaves it false and keeps
   * its own behaviour (it writes into the folder on purpose, e.g. compiling scripts into Override).
   */
  static gameFolderReadOnly: boolean = false;
  /** Electron: absolute path of this profile's writable data folder. */
  static userDataDirectory: string = '';
  /** Browser: this profile's folder in the origin private file system. */
  static userDataHandle: FileSystemDirectoryHandle | undefined;

  static get userDataReady(): boolean {
    return ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON
      ? !!this.userDataDirectory
      : isUsableDirectoryHandle(this.userDataHandle);
  }

  private static userDataKey(): string {
    const key = String(ApplicationProfile.profile?.key || ApplicationProfile.key || 'default').toLowerCase();
    return key.replace(/[^a-z0-9_-]/g, '_') || 'default';
  }

  /** Must run before the game reads or writes saves. Creates the profile's data folder and its Saves folder. */
  static async initUserDataStorage(): Promise<void> {
    const key = this.userDataKey();
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      const base: string = await (window as any).electron?.getUserDataPath?.();
      if(!base) throw new Error('GameFileSystem: the desktop app did not report its user data folder');
      const dir = path.join(base, 'game-data', key);
      await new Promise<void>((resolve, reject) => {
        fs.mkdir(path.join(dir, 'Saves'), { recursive: true }, (err) => err ? reject(err) : resolve());
      });
      this.userDataDirectory = dir;
    }else{
      const opfsRoot = await navigator.storage.getDirectory();
      const top = await opfsRoot.getDirectoryHandle('kotorjs-game-data', { create: true });
      const handle = await top.getDirectoryHandle(key, { create: true });
      await handle.getDirectoryHandle('Saves', { create: true });
      this.userDataHandle = handle;
    }
    console.log('GameFileSystem: writable data lives outside the game folder', this.describeUserDataLocation());
  }

  static describeUserDataLocation(): string {
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON) return this.userDataDirectory;
    return this.userDataHandle ? `origin private file system: kotorjs-game-data/${this.userDataKey()}` : '';
  }

  /** True when this relative path belongs to the app's own storage (saves, in-progress state, screenshots). */
  static isUserDataPath(filepath: string): boolean {
    const parts = this.splitRelativePath(filepath);
    return parts.length > 0 && this.USER_DATA_DIRS.has(parts[0].toLowerCase());
  }

  private static isRootIniPath(filepath: string): boolean {
    const parts = this.splitRelativePath(filepath);
    return parts.length == 1 && /\.ini$/i.test(parts[0]);
  }

  /** Which storage a read of this path should use. */
  private static async readsFromUserData(filepath: string): Promise<boolean> {
    if(!this.gameFolderReadOnly) return false;
    if(this.isUserDataPath(filepath)) return true;
    if(this.isRootIniPath(filepath) && this.userDataReady){
      return await this.userDataExists(filepath);
    }
    return false;
  }

  private static requireUserData(filepath: string){
    if(!this.userDataReady){
      throw new Error(`GameFileSystem: refusing to touch "${filepath}" before the app's own storage is ready (the game folder is never written)`);
    }
  }

  /** Electron: absolute path for a relative path, in the user data folder or the game folder. */
  private static electronPath(filepath: string, userData: boolean): string {
    if(userData){
      this.requireUserData(filepath);
      return path.join(this.userDataDirectory, ...this.splitRelativePath(filepath));
    }
    return path.join(ApplicationProfile.directory, filepath);
  }

  private static async userDataExists(filepath: string): Promise<boolean> {
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return await new Promise<boolean>((resolve) => {
        fs.stat(this.electronPath(filepath, true), (err) => resolve(!err));
      });
    }
    try{
      const parts = this.splitRelativePath(filepath);
      const name = parts.pop();
      const dir = await this.resolvePathDirectoryHandle(parts.join('/'), false, true);
      if(!dir || !name) return false;
      for await (const entry of dir.values()){
        if(entry.name.toLowerCase() === name.toLowerCase()) return true;
      }
      return false;
    }catch{
      return false;
    }
  }

  /** Forget cached browser directory handles under a path (after it is removed). */
  private static forgetDirectoryCache(userData: boolean, dirPath: string){
    const prefix = this.cacheKey(userData, this.splitRelativePath(dirPath).join('/')).toLowerCase();
    for(const key of [...this.directoryCache.keys()]){
      const k = key.toLowerCase();
      if(k === prefix || k.startsWith(prefix + '/')) this.directoryCache.delete(key);
    }
  }

  private static cacheKey(userData: boolean, relPath: string): string {
    return (userData ? 'u:' : 'g:') + relPath;
  }

  private static normalizePath(filepath: string){
    filepath = String(filepath ?? '').trim();
    filepath = filepath.replace(/\\/g, '/');
    filepath = filepath.replace(/^file:\/\//i, '');
    filepath = filepath.replace(/^game\.dir\/?/i, '');
    filepath = filepath.replace(/^\/+/, '').replace(/\/+$/, '');
    return filepath;
  }

  private static decodePathSegment(segment: string): string {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  private static splitRelativePath(filepath: string): string[] {
    return this.normalizePath(filepath).split('/').filter(Boolean).map((part) => this.decodePathSegment(part));
  }

  private static getRootDirectoryHandle(userData: boolean = false): FileSystemDirectoryHandle | undefined {
    if(userData){
      return isUsableDirectoryHandle(this.userDataHandle) ? this.userDataHandle : undefined;
    }
    const candidates = [
      ApplicationProfile.directoryHandle,
      ApplicationProfile.profile?.directory_handle,
    ];
    for(let i = 0; i < candidates.length; i++){
      if(isUsableDirectoryHandle(candidates[i])){
        return candidates[i];
      }
    }
    return undefined;
  }

  //filepath should be relative to the rootDirectoryPath or ApplicationProfile.directory
  static async open(filepath: string, mode: 'r'|'w' = 'r'): Promise<any> {
    const userData = await this.readsFromUserData(filepath);
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      const absPath = this.electronPath(filepath, userData);
      return new Promise<number>( (resolve, reject) => {
        fs.open(absPath, (err, fd) => {
          if(err){
            console.error(err);
            reject(err);
            return;
          }
          resolve(fd);
        });
      });
    }else{
      // console.log('open', filepath);
      filepath = this.normalizePath(filepath);
      const dirs = filepath.split('/');
      const filename = dirs.pop();
      const dirHandle = await this.resolveFilePathDirectoryHandle(filepath, userData);
      if(dirHandle){
        try {
          const file = await dirHandle.getFileHandle(filename, {
            create: false
          });
          if(file){
            return file;
          }
        } catch {
          // Fall through to a case-insensitive scan (File System Access API is case-sensitive).
        }
        const want = String(filename || '').toLowerCase();
        for await (const entry of dirHandle.values()){
          if(entry.kind === 'file' && entry.name.toLowerCase() === want){
            return await dirHandle.getFileHandle(entry.name, { create: false });
          }
        }
        throw new Error('Failed to read file: ' + filepath);
      }else{
        throw new Error('Failed to locate file directory: ' + filepath);
      }
    }
  }

  static async read(handle: FileSystemFileHandle|number, output: Uint8Array, offset: number, length: number, position: number){
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<Uint8Array>( (resolve, reject) => {
        fs.read(handle as number, output, offset, length, position, (err, bytes, buffer) => {
          if(err) reject(err);
          output.set(new Uint8Array(buffer), offset);
          resolve(output);
        })
      });
    }else{
      if(!(handle)) throw new Error('No file handle supplied!');
      
      // KOTOR III Phase 2: also accepts the read-only stand-in built from the older folder picker (FileListDirectory.ts).
      if(!(handle instanceof FileSystemFileHandle) && typeof (handle as any).getFile !== 'function') throw new Error('FileSystemFileHandle expected but one was not supplied!');
      
      if(!(output instanceof Uint8Array)) throw new Error('No output buffer supplied!');

      const fileHandle = handle as FileSystemFileHandle;
      let file = GameFileSystem.fileSnapshotCache.get(fileHandle);
      if(!file){
        file = await fileHandle.getFile();
        if(file){
          GameFileSystem.fileSnapshotCache.set(fileHandle, file);
        }
      }
      if(!file) throw new Error('Failed to read file from handle!');

      let blob = file.slice(position, position + length);
      let arrayBuffer = await blob.arrayBuffer();
      output.set(new Uint8Array(arrayBuffer), offset);
    }
  }

  static async close(handle: FileSystemFileHandle|number){
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return new Promise<void>( (resolve, reject) => {
        fs.close(handle as number, () => {
          resolve();
        })
      });
    }else{
      //this api does not expose a close method for reads
      return;
    }
  }

  //filepath should be relative to the rootDirectoryPath or ApplicationProfile.directory
  static async readFile(filepath: string, options: any = {}): Promise<Uint8Array> {
    // console.log('readFile', filepath);
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      const absPath = this.electronPath(filepath, await this.readsFromUserData(filepath));
      return new Promise<Uint8Array>( (resolve, reject) => {
        fs.readFile(absPath, options, (err, buffer) => {
          if(err){
            reject(err);
            return;
          }
          resolve(new Uint8Array(buffer));
        })
      });
    }else{
      const file = await this.open(filepath);
      if(!file) throw new Error('Failed to read file');
      
      let handle = await file.getFile();
      return new Uint8Array( await handle.arrayBuffer() );
    }
  }

  //filepath should be relative to the rootDirectoryPath or ApplicationProfile.directory
  // KOTOR III Phase 2: in the game app every write goes to the app's own storage, never the game folder.
  static async writeFile(filepath: string, data: Uint8Array): Promise<boolean> {
    const userData = this.gameFolderReadOnly;
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      let absPath: string;
      try{
        absPath = this.electronPath(filepath, userData);
      }catch(e){
        console.error(e);
        return false;
      }
      return new Promise<boolean>((resolve) => {
        fs.writeFile(absPath, data, (err) => {
          resolve(!err);
        });
      });
    }

    try {
      filepath = this.normalizePath(filepath);
      const parts = this.splitRelativePath(filepath);
      const filename = parts.pop();
      if(!filename){
        console.error('GameFileSystem.writeFile: missing filename', filepath);
        return false;
      }

      if(userData) this.requireUserData(filepath);
      const root = this.getRootDirectoryHandle(userData);
      if(!root){
        console.error('GameFileSystem.writeFile: no writable directory handle');
        return false;
      }

      if(!userData){
        // KotOR Forge only: it writes into the game folder on purpose.
        const granted = await this.validateWritableDirectoryHandle(root);
        if(!granted){
          console.error('GameFileSystem.writeFile: write permission denied');
          return false;
        }
      }

      const dirHandle = await this.resolveFilePathDirectoryHandle(filepath, userData);
      if(!dirHandle){
        console.error('GameFileSystem.writeFile: failed to locate directory', filepath);
        return false;
      }

      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      } catch {
        let found: FileSystemFileHandle | undefined;
        const want = filename.toLowerCase();
        for await (const entry of dirHandle.values()){
          if(entry.kind === 'file' && entry.name.toLowerCase() === want){
            found = await dirHandle.getFileHandle(entry.name, { create: false });
            break;
          }
        }
        if(!found){
          console.error('GameFileSystem.writeFile: failed to create file', filepath);
          return false;
        }
        fileHandle = found;
      }

      const stream = await fileHandle.createWritable();
      await stream.write(data as any);
      await stream.close();
      return true;
    } catch(e) {
      console.error('GameFileSystem.writeFile', filepath, e);
      return false;
    }
  }

  static async readdir(
    dirpath: string, options: IGameFileSystemReadDirOptions = {}, files: any[] = []
  ): Promise<string[]> {
    const userData = this.gameFolderReadOnly && this.isUserDataPath(dirpath);
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return await this.readdir_fs(dirpath, options, files, undefined, userData);
    }else{
      return await this.readdir_web(dirpath, options, files, '', userData);
    }
  }

  private static async readdir_web(pathOrHandle: string|FileSystemDirectoryHandle = '', opts: any = {},  files: any[] = [], dirbase: string = '', userData: boolean = false){
    try{
      if(typeof pathOrHandle === 'string'){
        const dirPath = this.normalizePath(pathOrHandle as string);
        pathOrHandle = await this.resolvePathDirectoryHandle(pathOrHandle, false, userData);
        if(!pathOrHandle) throw new Error('Failed to locate directory inside game folder: '+dirPath);
        // Paths must stay relative to the game root. Handle.name is only the last segment
        // (e.g. "000001 - AUTOSAVE"), which would make nested reads miss Saves/.
        dirbase = dirPath;
      }

      if(isUsableDirectoryHandle(pathOrHandle)){
        // Convert async iterator to array for parallel processing
        const entries = [];
        for await (const entry of pathOrHandle.values()) {
          entries.push(entry);
        }

        // Separate files and directories for parallel processing
        const fileEntries = [];
        const directoryEntries = [];

        for (const entry of entries) {
          if (entry.kind === "file") {
            if (!opts.list_dirs) {
              fileEntries.push(entry.name);
            }
          } else if (entry.kind === "directory") {
            if (opts.recursive) {
              directoryEntries.push(entry);
            } else {
              files.push(path.join(dirbase, entry.name));
            }
          }
        }

        // Add files to results (no async needed)
        for (const fileName of fileEntries) {
          files.push(path.join(dirbase, fileName));
        }

        // Process subdirectories in parallel using Promise.all
        if (opts.recursive && directoryEntries.length > 0) {
          const subdirPromises = directoryEntries.map(async (entry) => {
            const newdirbase = path.join(dirbase, entry.name);
            const subdirFiles: string[] = [];
            await this.readdir_web(entry, opts, subdirFiles, newdirbase, userData);
            return subdirFiles;
          });

          // Process all subdirectories in parallel
          const subdirResults = await Promise.all(subdirPromises);
          
          // Flatten results
          for (const subdirFiles of subdirResults) {
            files.push(...subdirFiles);
          }
        }
      }

      return files;

    }catch(e){
      console.error(e);
      if(typeof pathOrHandle === 'string'){
        throw new Error('Failed to resolve directory inside game folder: '+pathOrHandle);
      }else{
        throw new Error('Failed to resolve directory inside game folder: '+pathOrHandle.name);
      }
    }
  }

  private static async isFSDirectory(resource_path: string = ''): Promise<boolean> {
    const absPath = this.electronPath(resource_path, await this.readsFromUserData(resource_path));
    return new Promise<boolean>( (resolve, reject) => {
      fs.stat(absPath, (err, stats) => {
        if(err){
          console.error(err);
          reject();
          return;
        }
        resolve((stats.mode & fs.constants.S_IFDIR) == fs.constants.S_IFDIR)
      })
    });
  }

  private static async readdir_fs(resource_path: string = '', opts: IGameFileSystemReadDirOptions = {}, files: any[] = [], depthState?: any, userData: boolean = false): Promise<string[]> {
    if(typeof depthState === 'undefined'){
      depthState = { folder: resource_path, depth: 0 };
    }
    const currentDepth: number = depthState.depth;
    const dir_path = this.electronPath(resource_path, userData);

    return new Promise<string[]>((resolve, reject) => {
      fs.readdir(dir_path, { withFileTypes: true }, async (err, dir_files: fs.Dirent[]) => {
        if(err){
          // resource_path is a file, not a directory
          if(!opts.list_dirs){
            files.push(resource_path);
          }
          resolve(files);
          return;
        }

        if(!!opts.list_dirs && currentDepth > 0){
          files.push(resource_path);
        }

        if(currentDepth < 1 || !!opts.recursive){
          const subdirPromises: Promise<string[]>[] = [];
          for(const file of dir_files){
            const file_path = path.join(resource_path, file.name);
            if(file.isDirectory()){
              if(!!opts.recursive){
                const subFiles: string[] = [];
                subdirPromises.push(
                  this.readdir_fs(file_path, opts, subFiles, { ...depthState, depth: currentDepth + 1 }, userData)
                );
              }else{
                files.push(file_path);
              }
            }else{
              if(!opts.list_dirs){
                files.push(file_path);
              }
            }
          }
          const subResults = await Promise.all(subdirPromises);
          for(const subFiles of subResults) files.push(...subFiles);
        }

        resolve(files);
      });
    });
  }

  // KOTOR III Phase 2: in the game app folders are only ever created in the app's own storage.
  static async mkdir(dirPath: string, opts: IGameFileSystemReadDirOptions = {}){
    return new Promise<boolean>( async (resolve, reject) => {
      dirPath = dirPath.trim();
      const userData = this.gameFolderReadOnly;
      if(userData && !this.userDataReady){
        console.error(`GameFileSystem.mkdir: refusing "${dirPath}" before the app storage is ready`);
        resolve(false);
        return;
      }
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        fs.mkdir(this.electronPath(dirPath, userData), { recursive: !!opts.recursive }, (err) => {
          if(err){
            console.error(err);
            resolve(false);
            return;
          }
          resolve(true);
        });
      }else{
        if(dirPath.length){
          const dirs = this.splitRelativePath(dirPath);
          const cacheKey = this.cacheKey(userData, dirs.join('/'));
          if(this.directoryCache.has(cacheKey)){
            resolve(true);
            return;
          }
          try{
            let currentDirHandle = this.getRootDirectoryHandle(userData);
            for(let i = 0; i < dirs.length; i++){
              const canCreate = (i === dirs.length - 1) || !!opts.recursive;
              currentDirHandle = await currentDirHandle.getDirectoryHandle(dirs[i], { create: canCreate });
              if(!currentDirHandle){
                resolve(false);
                return;
              }
              const partialKey = this.cacheKey(userData, dirs.slice(0, i + 1).join('/'));
              this.directoryCache.set(partialKey, currentDirHandle);
            }
            resolve(true);
          }catch(e){
            console.error(e);
            resolve(false);
            return;
          }
        }else{
          resolve(false);
          return;
        }
      }
    });
  }

  // KOTOR III Phase 2: in the game app folders are only ever removed from the app's own storage.
  static async rmdir(dirPath: string, opts: IGameFileSystemReadDirOptions = {}){
    return new Promise<boolean>( async (resolve, reject) => {
      dirPath = dirPath.trim();
      const userData = this.gameFolderReadOnly;
      if((userData && !this.userDataReady) || !this.splitRelativePath(dirPath).length){
        console.error(`GameFileSystem.rmdir: refusing "${dirPath}"`);
        resolve(false);
        return;
      }
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        const absPath = this.electronPath(dirPath, userData);
        console.log(`fs.rmdir`, absPath);
        fs.rmdir(
          absPath,
          {
            recursive: opts.recursive
          } as fs.RmDirOptions, 
          //@ts-ignore
          async (err) => {
            if(err){
              console.error(err);
              resolve(false);
              return;
            }
            resolve(true);
          }
        );
      }else{
        try{
          const parts = this.splitRelativePath(dirPath);
          const name = parts.pop();
          let parentHandle = await this.resolvePathDirectoryHandle(parts.join('/'), false, userData);
          if(parentHandle){
            for await (const entry of parentHandle.values()) {
              if(entry.kind == 'file') continue;
              if(entry.name.toLowerCase() != name.toLowerCase()) continue;
              await parentHandle.removeEntry(entry.name, {
                recursive: opts.recursive
              });
              break;
            }
          }
          this.forgetDirectoryCache(userData, dirPath);
          resolve(true);
          return;
        }catch(e){
          console.error(e);
          resolve(false);
          return;
        }
      }
    });
  }

  static async opendir_web(dirPath: string = ''): Promise<FileSystemDirectoryHandle|undefined> {
    try{
      return await this.resolvePathDirectoryHandle(dirPath, false, await this.readsFromUserData(dirPath));
    }catch{
      return undefined;
    }
  }

  static exists(dirOrFilePath: string): Promise<boolean> {
    return new Promise<boolean>( async (resolve, reject) => {
      const userData = await this.readsFromUserData(dirOrFilePath);
      if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
        let absPath: string;
        try{
          absPath = this.electronPath(dirOrFilePath, userData);
        }catch(e){
          console.error(e);
          resolve(false);
          return;
        }
        fs.stat(absPath, (err, stats) => {
          if(err){
            console.log(dirOrFilePath);
            console.error(err);
            resolve(false);
            return
          }

          resolve(true);
        });
      }else{
        const details = path.parse(dirOrFilePath);
        try{
          if(details.ext){
            let handle = await this.resolveFilePathDirectoryHandle(dirOrFilePath, userData);
            if(handle){
              let fileHandle = await handle.getFileHandle(details.base);
              if(fileHandle){
                resolve(true);
                return;
              }else{
                resolve(false);
                return;
              }
            }else{
              resolve(false);
              return;
            }
          }else{
            let handle = await this.resolvePathDirectoryHandle(dirOrFilePath, false, userData);
            if(handle){
              resolve(true);
              return;
            }else{
              resolve(false);
              return;
            }
          }
        }catch(e){
          console.log(dirOrFilePath);
          console.error(e);
          resolve(false);
          return;
        }
      }
    });
  }

  // KOTOR III Phase 2: in the game app files are only ever deleted from the app's own storage.
  static async unlink(handleOrPath: string|FileSystemFileHandle){
    const userData = this.gameFolderReadOnly;
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      const absPath = this.electronPath(handleOrPath as string, userData);
      return new Promise<void>( (resolve, reject) => {
        try{
          fs.unlink(absPath, () => {
            resolve();
            return;
          })
        }catch(e){
          console.error(e);
          reject(e);
          return;
        }
      })
    }else{
      if(handleOrPath instanceof FileSystemFileHandle && webHandleHasRemove && !userData){
        //@ts-ignore
        await handleOrPath.remove();
        return;
      }
      if(typeof handleOrPath === 'string'){
        if(userData) this.requireUserData(handleOrPath);
        const normalized = this.normalizePath(handleOrPath);
        const details = path.parse(normalized);
        const parentHandle = await this.resolveFilePathDirectoryHandle(normalized, userData);
        if(parentHandle) await parentHandle.removeEntry(details.base);
      }else{
        throw new Error('unlink: supply a path string in web mode, not a FileSystemFileHandle');
      }
    }
  }

  static async showOpenFileDialog(){
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){

    }else{
      // const pickerOpts = {
      //   types: [
      //     {
      //       description: 'Images',
      //       accept: {
      //         'image/*': ['.png', '.gif', '.jpeg', '.jpg']
      //       }
      //     },
      //   ],
      //   excludeAcceptAllOption: true,
      //   multiple: false
      // };
      let [fileHandle] = await window.showOpenFilePicker({multiple: false});
      return fileHandle;
    }
  }

  static async showSaveFileDialog(): Promise<FileSystemFileHandle | undefined> {
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      return undefined;
    }else{
      return await window.showSaveFilePicker({});
    }
  }

  private static async resolvePathDirectoryHandle(filepath: string, parent = false, userData = false): Promise<FileSystemDirectoryHandle> {
    const root = this.getRootDirectoryHandle(userData);
    if(root){
      const dirs = this.splitRelativePath(filepath);
      if(!dirs.length) return root;
      const cacheKey = this.cacheKey(userData, dirs.join('/'));
      if(this.directoryCache.has(cacheKey)){
        const cached = this.directoryCache.get(cacheKey)!;
        if(!parent) return cached;
        // for parent=true we need the second-to-last handle; fall through to traverse
      }
      if(!parent && this.directoryInflight.has(cacheKey)){
        return this.directoryInflight.get(cacheKey)!;
      }
      const promise = (async () => {
        let lastDirectoryHandle = root;
        let currentDirHandle = root;
        for(let i = 0, len = dirs.length; i < len; i++){
          lastDirectoryHandle = currentDirHandle;
          const partialKey = this.cacheKey(userData, dirs.slice(0, i + 1).join('/'));
          if(this.directoryCache.has(partialKey)){
            currentDirHandle = this.directoryCache.get(partialKey)!;
            continue;
          }
          try{
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dirs[i], { create: false });
          }catch{
            // Fallback: case-insensitive scan for case-sensitive FSAPI
            let found = false;
            for await (const entry of currentDirHandle.values()){
              if(entry.kind === 'directory' && entry.name.toLowerCase() === dirs[i].toLowerCase()){
                currentDirHandle = entry as FileSystemDirectoryHandle;
                found = true;
                break;
              }
            }
            if(!found){
              this.directoryInflight.delete(cacheKey);
              throw new Error(`Failed to resolve file path directory handle: Filepath: ${filepath} | Current Directory: ${dirs[i]} | Index: ${i}`);
            }
          }
          this.directoryCache.set(partialKey, currentDirHandle);
        }
        this.directoryCache.set(cacheKey, currentDirHandle);
        this.directoryInflight.delete(cacheKey);
        return !parent ? currentDirHandle : lastDirectoryHandle;
      })();
      if(!parent){
        this.directoryInflight.set(cacheKey, promise);
      }
      return promise;
    }
    return;
  }

  static directoryCache: Map<string, FileSystemDirectoryHandle> = new Map();
  static directoryInflight: Map<string, Promise<FileSystemDirectoryHandle>> = new Map();
  private static fileSnapshotCache = new WeakMap<FileSystemFileHandle, File>();

  private static async resolveFilePathDirectoryHandle(filepath: string, userData = false): Promise<FileSystemDirectoryHandle> {
    const root = this.getRootDirectoryHandle(userData);
    if(root){
      const dirs = this.splitRelativePath(filepath);
      dirs.pop(); // remove filename
      if(!dirs.length) return root;
      const cacheKey = this.cacheKey(userData, dirs.join('/'));
      if(this.directoryCache.has(cacheKey)){
        return this.directoryCache.get(cacheKey)!;
      }
      if(this.directoryInflight.has(cacheKey)){
        return this.directoryInflight.get(cacheKey)!;
      }
      const promise = (async () => {
        let currentDirHandle = root;
        for(let i = 0, len = dirs.length; i < len; i++){
          const partialKey = this.cacheKey(userData, dirs.slice(0, i + 1).join('/'));
          if(this.directoryCache.has(partialKey)){
            currentDirHandle = this.directoryCache.get(partialKey)!;
            continue;
          }
          try{
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dirs[i], { create: false });
          }catch{
            // Fallback: case-insensitive scan for case-sensitive FSAPI
            let found = false;
            for await (const entry of currentDirHandle.values()){
              if(entry.kind === 'directory' && entry.name.toLowerCase() === dirs[i].toLowerCase()){
                currentDirHandle = entry as FileSystemDirectoryHandle;
                found = true;
                break;
              }
            }
            if(!found){
              this.directoryInflight.delete(cacheKey);
              throw new Error(`Failed to resolve file path directory handle: Filepath: ${filepath} | Current Directory: ${dirs[i]} | Index: ${i}`);
            }
          }
          this.directoryCache.set(partialKey, currentDirHandle);
        }
        this.directoryCache.set(cacheKey, currentDirHandle);
        this.directoryInflight.delete(cacheKey);
        return currentDirHandle;
      })();
      this.directoryInflight.set(cacheKey, promise);
      return promise;
    }
    return;
  }

  // KOTOR III Phase 2: the game folder is opened read-only.
  static async initializeGameDirectory(){
    if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON){
      ApplicationProfile.directory = ApplicationProfile.directory;
    }else{
      ApplicationProfile.directoryHandle = await window.showDirectoryPicker({
        mode: "read"
      });
    }
  }

  static async validateDirectoryHandle(handle: FileSystemDirectoryHandle){
    try{
      if ((await handle.queryPermission({ mode: 'read' })) === 'granted') {
        return true;
      }
      return (await handle.requestPermission({ mode: 'read' })) === 'granted';
    }catch(e){
      console.error(e);
      return false;
    }
  }

  /** KotOR Forge only (gameFolderReadOnly is false there): it writes into the game folder on purpose. */
  static async validateWritableDirectoryHandle(handle: FileSystemDirectoryHandle){
    try{
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        return true;
      }
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    }catch(e){
      console.error(e);
      return false;
    }
  }

  static async showRequestDirectoryDialog(){
    let handle = await window.showDirectoryPicker({
      id: ApplicationProfile.profile?.key,
      mode: "read"
    });
    if(handle){
      if ((await handle.requestPermission({ mode: 'read' })) === 'granted') {
        return handle;
      }
    }
    return;
  }


}
