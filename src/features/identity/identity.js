// identity.js — one-time "what's your name?" prompt so changes can be
// attributed in the activity log, without any real login. The name is
// stored locally on this device only (localStorage) — there's no
// account, no password, nothing to sync or verify. A singer can change
// it later by clearing the app's site data, or via setUserName() if
// ever wired to a settings screen.
//
// Captured via a custom modal (name-prompt.js), not window.prompt() —
// Electron's renderer does not support prompt() at all (throws
// immediately), and the modal looks nicer than a native browser dialog
// anyway.

import { openNamePrompt } from './name-prompt.js';

const LS_KEY = 'setlist_app_user_name';

export function getUserName() {
  return localStorage.getItem(LS_KEY) || null;
}

export function setUserName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  localStorage.setItem(LS_KEY, trimmed);
}

// Shows the name-capture modal on first launch only; no-ops (returns
// immediately) if a name is already stored. Call this once at app boot.
export function ensureUserName() {
  if (getUserName()) return;
  openNamePrompt({ onSubmit: name => setUserName(name) });
}
