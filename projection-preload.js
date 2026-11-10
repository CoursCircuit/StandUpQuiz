/* Lecture seule : l’écran élèves n’a accès ni aux listes, ni aux fichiers, ni aux scores modifiables. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('audience', {
  getView: () => ipcRenderer.invoke('quiz:audience-view'),
  onView: callback => { ipcRenderer.on('quiz:view', (_event, view) => callback(view)); },
  toggleFullscreen: () => ipcRenderer.invoke('quiz:audience-fullscreen')
});
