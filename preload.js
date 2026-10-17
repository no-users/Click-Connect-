const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shell', {
  nav: (a, url) => ipcRenderer.send('nav', a, url),
  mode: (m) => ipcRenderer.send('mode', m),
  onUrl: (cb) => ipcRenderer.on('url', (_, u, loading) => cb(u, loading)),
  onMode: (cb) => ipcRenderer.on('mode', (_, m) => cb(m)),
});
