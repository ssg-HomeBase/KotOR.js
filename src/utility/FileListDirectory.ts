/**
 * FileListDirectory (KOTOR III Phase 2).
 *
 * A read-only stand-in for a FileSystemDirectoryHandle, built from the file list that Chrome's older
 * folder picker (<input type="file" webkitdirectory>) returns. Some Chrome profiles refuse the newer
 * folder access (window.showDirectoryPicker) with no message; this gives the game a second way to read
 * the player's game folder. Nothing is uploaded or copied: the game reads the File objects in the tab.
 * It only offers what GameFileSystem's browser path uses: getDirectoryHandle, getFileHandle, values,
 * entries, keys, getFile, and queryPermission/requestPermission (always "granted": read only).
 * It is not saved between visits; the player picks the folder again after a reload.
 *
 * @file FileListDirectory.ts
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */

const notFound = (name: string) => new DOMException(`"${name}" was not found in the chosen folder.`, 'NotFoundError');

export class FileListFile {
  readonly kind = 'file';
  readonly isFileListEntry = true;
  constructor(readonly name: string, private readonly file: File) {}
  async getFile(): Promise<File> { return this.file; }
  async queryPermission(): Promise<PermissionState> { return 'granted'; }
  async requestPermission(): Promise<PermissionState> { return 'granted'; }
  async isSameEntry(other: any): Promise<boolean> { return other === this; }
}

export class FileListDirectory {
  readonly kind = 'directory';
  readonly isFileListEntry = true;
  readonly children = new Map<string, FileListDirectory | FileListFile>();
  constructor(readonly name: string) {}

  private child(name: string, kind: 'file' | 'directory') {
    const exact = this.children.get(name);
    if (exact && exact.kind === kind) return exact;
    const want = String(name).toLowerCase();
    for (const [key, value] of this.children) {
      if (key.toLowerCase() === want && value.kind === kind) return value;
    }
    return undefined;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileListDirectory> {
    if (options?.create) throw new DOMException('The chosen game folder is read only.', 'NotAllowedError');
    const dir = this.child(name, 'directory');
    if (!dir) throw notFound(name);
    return dir as FileListDirectory;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileListFile> {
    if (options?.create) throw new DOMException('The chosen game folder is read only.', 'NotAllowedError');
    const file = this.child(name, 'file');
    if (!file) throw notFound(name);
    return file as FileListFile;
  }

  async *values(): AsyncGenerator<FileListDirectory | FileListFile> { for (const v of this.children.values()) yield v; }
  async *keys(): AsyncGenerator<string> { for (const k of this.children.keys()) yield k; }
  async *entries(): AsyncGenerator<[string, FileListDirectory | FileListFile]> { for (const e of this.children.entries()) yield e; }
  [Symbol.asyncIterator]() { return this.entries(); }
  async queryPermission(): Promise<PermissionState> { return 'granted'; }
  async requestPermission(): Promise<PermissionState> { return 'granted'; }
  async isSameEntry(other: any): Promise<boolean> { return other === this; }
  async removeEntry(): Promise<void> { throw new DOMException('The chosen game folder is read only.', 'NotAllowedError'); }

  /**
   * Builds the folder tree from a picked file list. Each File's webkitRelativePath starts with the
   * chosen folder's own name ("Knights of the Old Republic II/Modules/201tel.rim").
   */
  static fromFiles(files: ArrayLike<File> | { path: string, file: File }[]): FileListDirectory | undefined {
    const items: { path: string, file: File }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f: any = (files as any)[i];
      if (f && f.file) items.push({ path: String(f.path), file: f.file });
      else if (f) items.push({ path: String(f.webkitRelativePath || f.name), file: f });
    }
    if (!items.length) return undefined;
    const rootName = items[0].path.split('/')[0];
    const root = new FileListDirectory(rootName);
    for (const { path, file } of items) {
      const parts = path.split('/').filter(Boolean);
      if (parts[0] === rootName) parts.shift();
      let dir = root;
      for (let i = 0; i < parts.length - 1; i++) {
        let next = dir.children.get(parts[i]);
        if (!next || next.kind !== 'directory') {
          next = new FileListDirectory(parts[i]);
          dir.children.set(parts[i], next);
        }
        dir = next as FileListDirectory;
      }
      const name = parts[parts.length - 1];
      if (name) dir.children.set(name, new FileListFile(name, file));
    }
    return root;
  }
}

/** True for a folder or file that came from the older folder picker (never saved to storage). */
export const isFileListEntry = (handle: any): boolean => !!(handle && handle.isFileListEntry);
