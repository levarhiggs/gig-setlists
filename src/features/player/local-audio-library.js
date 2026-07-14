// local-audio-library.js — session-only local file attachments for
// Player Mode testing. Deliberately NOT persisted anywhere (no Firestore,
// no localStorage) — a blob: URL is only valid for this page session and
// only makes sense pointing at a file actually present on this device.
// This is scaffolding for the real playback engine; the eventual source
// of truth for audio (Firebase Storage, Drive, etc.) is a swap-in later
// without touching the player itself.

const attachments = new Map(); // songId -> { url, fileName }

export function attachLocalAudio(songId, file) {
  const existing = attachments.get(songId);
  if (existing) URL.revokeObjectURL(existing.url);

  const url = URL.createObjectURL(file);
  attachments.set(songId, { url, fileName: file.name });
  return url;
}

export function getLocalAudio(songId) {
  return attachments.get(songId) || null;
}

export function hasLocalAudio(songId) {
  return attachments.has(songId);
}

export function removeLocalAudio(songId) {
  const existing = attachments.get(songId);
  if (existing) URL.revokeObjectURL(existing.url);
  attachments.delete(songId);
}
