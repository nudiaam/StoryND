const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  newProject: () => ipcRenderer.invoke('project:new'),
  openProject: () => ipcRenderer.invoke('project:open'),
  openLast: () => ipcRenderer.invoke('project:openLast'),
  openFile: (file) => ipcRenderer.invoke('project:openFile', file),
  recents: () => ipcRenderer.invoke('recents:list'),
  forgetRecent: (file) => ipcRenderer.invoke('recents:forget', file),
  createVersion: (name) => ipcRenderer.invoke('versions:create', name),
  switchVersion: (id) => ipcRenderer.invoke('versions:switch', id),
  renameVersion: (id, name) => ipcRenderer.invoke('versions:rename', { id, name }),
  deleteVersion: (id) => ipcRenderer.invoke('versions:delete', id),
  restoreVersion: () => ipcRenderer.invoke('versions:restore'),
  save: (data) => ipcRenderer.invoke('project:save', data),

  pathForFile: (file) => webUtils.getPathForFile(file),
  importPaths: (paths) => ipcRenderer.invoke('assets:importPaths', paths),
  importBuffer: (name, type, bytes) => ipcRenderer.invoke('assets:importBuffer', { name, type, bytes }),
  importUrl: (url) => ipcRenderer.invoke('assets:importUrl', url),
  removeAssets: (names) => ipcRenderer.invoke('assets:remove', names),
  assetUrl: (name) => 'sb://asset/' + encodeURIComponent(name),

  pickImages: () => ipcRenderer.invoke('dialog:pickImages'),
  pickMedia: () => ipcRenderer.invoke('dialog:pickMedia'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  imageMenu: () => ipcRenderer.invoke('menu:image'),
  copyImage: (bytes) => ipcRenderer.invoke('clipboard:image', bytes),

  onFlush: (cb) => ipcRenderer.on('app:flush', cb),
  onOpenFile: (cb) => ipcRenderer.on('app:openFile', (_e, file) => cb(file)),
  closeReady: () => ipcRenderer.send('app:closeReady'),
});
