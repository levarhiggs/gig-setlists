// auto-attach.js — on Player Mode activation, silently fill in local
// audio for any song that doesn't have it yet by matching against the
// remembered music folder (see folder-access.js), instead of the user
// having to re-run "Attach Audio Files…" by hand after every hard
// refresh. Falls back to a no-op (existing manual flow still works) if
// no folder is linked yet or the browser doesn't support it.

import { getState } from '../../data/store.js';
import { attachLocalAudio } from './local-audio-library.js';
import { hasPlayableAudio } from './audio-source.js';
import { matchSongsToFiles } from '../../lib/audio-match.js';
import { getStoredMusicFolder, listAudioFilesRecursive } from './folder-access.js';

// Same bar as the manual bulk-attach review flow (see bulk-local-attach.js)
// — below this, don't guess automatically, leave it for manual attach.
const AUTO_SELECT_THRESHOLD = 0.6;

let cachedFileList = null; // [{name, handle}], re-used for the rest of this page session
let scanInFlight = null;

async function getFileList() {
  if (cachedFileList) return cachedFileList;
  if (scanInFlight) return scanInFlight;

  scanInFlight = (async () => {
    const dirHandle = await getStoredMusicFolder();
    if (!dirHandle) return [];
    const files = await listAudioFilesRecursive(dirHandle);
    cachedFileList = files;
    return files;
  })();

  try {
    return await scanInFlight;
  } finally {
    scanInFlight = null;
  }
}

// Attaches local audio for every song missing it that has a confident
// filename match in the linked folder. Returns the count attached.
export async function autoAttachMissingAudio() {
  const files = await getFileList();
  if (!files.length) return 0;

  const state = getState();
  const songs = Object.values(state.songs).filter(s => !hasPlayableAudio(s));
  if (!songs.length) return 0;

  const fileNames = files.map(f => f.name);
  const candidatesBySong = matchSongsToFiles(songs, fileNames);
  const byName = new Map(files.map(f => [f.name, f.handle]));

  let attached = 0;
  for (const song of songs) {
    const candidates = candidatesBySong.get(song.songId) || [];
    const top = candidates[0];
    if (!top || top.score < AUTO_SELECT_THRESHOLD) continue;

    const fileHandle = byName.get(top.fileName);
    if (!fileHandle) continue;
    const file = await fileHandle.getFile();
    attachLocalAudio(song.songId, file);
    attached++;
  }
  return attached;
}

// Forces the folder to be re-scanned next time autoAttachMissingAudio()
// runs — call after linking a new/different folder.
export function invalidateFileListCache() {
  cachedFileList = null;
}
