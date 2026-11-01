// settings.js — per-device display preferences (localStorage, never synced:
// the phone and the desktop can each show what suits them).

const SHOW_ARTISTS_KEY = 'setlist_show_artists';

// Default ON. Only an explicit '0' turns it off.
export function getShowArtists() {
  try { return localStorage.getItem(SHOW_ARTISTS_KEY) !== '0'; } catch { return true; }
}

export function setShowArtists(on) {
  try { localStorage.setItem(SHOW_ARTISTS_KEY, on ? '1' : '0'); } catch { /* blocked storage — non-fatal */ }
  document.dispatchEvent(new CustomEvent('settingschanged'));
}
