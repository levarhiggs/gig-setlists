// audio-source.js — single place that decides which audio URL to play
// for a song, across two possible sources:
//   1. song.audioUrl — a public streaming URL (Cloudflare R2 bucket),
//      works on any device including phones with no local file access.
//      This is what makes Player Mode usable on singers' own phones.
//   2. local blob attachment (local-audio-library.js) — session-only,
//      this-browser-only fallback, mainly useful for testing a song
//      before it's been uploaded to R2.

import { getLocalAudio, hasLocalAudio } from './local-audio-library.js';

export function getPlayableAudioUrl(song) {
  if (!song) return null;
  if (song.audioUrl) return song.audioUrl;
  const local = getLocalAudio(song.songId);
  return local ? local.url : null;
}

export function hasPlayableAudio(song) {
  if (!song) return false;
  return !!song.audioUrl || hasLocalAudio(song.songId);
}
