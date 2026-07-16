// folder-access.js — remembers a local music folder (e.g. D:\Music
// Downloads\) across sessions using the File System Access API, so audio
// can auto-attach on every Player Mode activation without re-picking
// files after every hard refresh. Chrome/Edge only — the API doesn't
// exist in Firefox/Safari, so everything here degrades to "unavailable"
// there and the existing manual attach flow still works as a fallback.
//
// The directory handle itself is stored in IndexedDB (handles aren't
// JSON-serializable, so localStorage can't hold them). The browser
// remembers the underlying OS permission grant tied to that handle, but
// still requires re-confirming it (a lightweight, no-dialog re-grant in
// practice, once already allowed) each session via queryPermission /
// requestPermission — that's a browser security rule, not something we
// can bypass, but it does NOT show a folder picker again.

const DB_NAME = 'gig-setlists-folder-access';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'musicFolder';

export function isFolderAccessSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Prompts the folder picker once (real user click required — must be
// called directly from a click handler, not deferred). Persists the
// handle so future sessions can skip this.
export async function chooseMusicFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'read' });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

// Returns a usable, permission-confirmed directory handle from a prior
// chooseMusicFolder() call, or null if none is stored / permission was
// revoked and silent re-grant failed (caller should fall back to
// prompting chooseMusicFolder() again from a user gesture in that case).
export async function getStoredMusicFolder() {
  if (!isFolderAccessSupported()) return null;
  const handle = await idbGet(HANDLE_KEY);
  if (!handle) return null;

  const opts = { mode: 'read' };
  let permission = await handle.queryPermission(opts);
  if (permission !== 'granted') {
    // Only succeeds silently if the browser still trusts this handle from a
    // prior grant; otherwise it no-ops and stays 'prompt', which we treat as
    // "not available right now" rather than showing a picker unprompted.
    permission = await handle.requestPermission(opts).catch(() => 'denied');
  }
  return permission === 'granted' ? handle : null;
}

export async function forgetMusicFolder() {
  await idbSet(HANDLE_KEY, null);
}

// Recursively walks a directory handle, returning [{ name, handle }, …]
// for every audio file found (by extension) in it and all subfolders.
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg)$/i;

export async function listAudioFilesRecursive(dirHandle) {
  const results = [];
  async function walk(handle) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        await walk(entry);
      } else if (entry.kind === 'file' && AUDIO_EXT.test(entry.name)) {
        results.push({ name: entry.name, handle: entry });
      }
    }
  }
  await walk(dirHandle);
  return results;
}
