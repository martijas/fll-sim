import { contextBridge, ipcRenderer } from "electron";

export interface FileFilter { name: string; extensions: string[] }
export interface OpenedFile { path: string; name: string; data: Uint8Array }

const api = {
  readAsset: (rel: string): Promise<Uint8Array | null> => ipcRenderer.invoke("asset:read", rel),
  loadUserMat: (season: string): Promise<Uint8Array | null> => ipcRenderer.invoke("mat:load", season),
  saveUserMat: (season: string, data: Uint8Array): Promise<void> => ipcRenderer.invoke("mat:save", season, data),
  openFile: (filters: FileFilter[]): Promise<OpenedFile | null> => ipcRenderer.invoke("file:open", filters),
  saveFile: (suggested: string, data: Uint8Array, filters: FileFilter[], path?: string): Promise<{ path: string; name: string } | null> =>
    ipcRenderer.invoke("file:save", suggested, data, filters, path),
};

contextBridge.exposeInMainWorld("fllsim", api);
export type FllSimApi = typeof api;
