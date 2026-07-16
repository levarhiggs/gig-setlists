// electron/main.js — desktop wrapper around the same web app used on
// GitHub Pages. No server, no browser tab: this creates a native window
// and loads index.html straight off disk. All app logic (Firestore sync,
// player, etc.) is completely unchanged — only the delivery mechanism
// differs from the phone/browser version.

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#0f1117',
    icon: path.join(__dirname, '..', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  if (process.env.GIG_SETLISTS_DEBUG) {
    win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.on('console-message', (_e, level, message) => {
      console.log(`[renderer:${level}]`, message);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
