// Exposes a small, fixed API to the editor page. The page never gets Node or file-system access directly.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('checklistAPI', {
  list: () => ipcRenderer.invoke('list'),
  read: name => ipcRenderer.invoke('read', name),
  write: (name, text, create = false) => ipcRenderer.invoke('write', name, text, create),
  starter: title => ipcRenderer.invoke('starter', title),
  previewHtml: () => ipcRenderer.invoke('preview-html'),
  exportPdf: (name, text) => ipcRenderer.invoke('export-pdf', name, text),
  exportHtml: (name, text) => ipcRenderer.invoke('export-html', name, text),
  reveal: filePath => ipcRenderer.invoke('reveal', filePath),
  onFileChanged: cb => ipcRenderer.on('file-changed', (_, name) => cb(name)),
  onAssetsChanged: cb => ipcRenderer.on('assets-changed', () => cb()),
  onMenu: cb => ipcRenderer.on('menu', (_, cmd) => cb(cmd)),
});
