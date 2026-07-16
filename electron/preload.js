// electron/preload.js — runs in the renderer with Node access, before
// index.html's own scripts. Only exposes a flag so the app can tell it's
// running under Electron (e.g. to skip service-worker registration) —
// no Node/filesystem APIs are bridged into the page, since the app
// doesn't need any (File System Access API in the renderer already
// covers the local music-folder feature).

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
});
