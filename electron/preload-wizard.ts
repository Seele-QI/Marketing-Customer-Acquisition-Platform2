import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('wizardAPI', {
  activate: (code: string) => ipcRenderer.invoke('wizard:activate', code),
  getMachineId: () => ipcRenderer.invoke('wizard:get-machine-id'),
  done: () => ipcRenderer.invoke('wizard:done'),
});
