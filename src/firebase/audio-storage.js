// audio-storage.js — Firebase Storage read/write for per-song MP3 files.
// Layout: /audio/{songId}.mp3 — one file per Song master record (not per
// instance/placement, matching how key/bpm/etc. are shared across every
// placement of a song).

import { storage } from './init.js';
import {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

function audioRef(songId) {
  return ref(storage, `audio/${songId}.mp3`);
}

export async function uploadSongAudio(songId, file) {
  const fileRef = audioRef(songId);
  await uploadBytes(fileRef, file, { contentType: file.type || 'audio/mpeg' });
  return getDownloadURL(fileRef);
}

export async function deleteSongAudio(songId) {
  try {
    await deleteObject(audioRef(songId));
  } catch (err) {
    // Not-found is fine (nothing to delete); anything else is worth logging.
    if (err.code !== 'storage/object-not-found') console.error('deleteSongAudio failed:', err);
  }
}
