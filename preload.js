/* Pont volontairement limité ; aucun accès Node depuis l'interface. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('standup', {
  readState: () => ipcRenderer.invoke('quiz:read'),
  saveState: value => ipcRenderer.invoke('quiz:save', value),
  copyText: text => ipcRenderer.invoke('quiz:copy', text),
  toggleFullscreen: () => ipcRenderer.invoke('quiz:fullscreen'),
  setProjection: active => ipcRenderer.invoke('quiz:projection', active),
  displays: () => ipcRenderer.invoke('quiz:displays'),
  openAudience: options => ipcRenderer.invoke('quiz:audience-open', options),
  closeAudience: () => ipcRenderer.invoke('quiz:audience-close'),
  present: value => ipcRenderer.invoke('quiz:present', value),
  onAudienceClosed: callback => { ipcRenderer.on('quiz:audience-closed', callback); },
  exportFile: value => ipcRenderer.invoke('quiz:export', value),
  importFile: () => ipcRenderer.invoke('quiz:import')
});
