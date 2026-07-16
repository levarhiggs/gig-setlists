// player-engine.js — the actual <audio> element and playback state
// machine for Player Mode. Auto-advances to the next song WITH attached
// audio within the current set only (stops at set boundaries, per spec);
// songs with no attached audio are skipped over when advancing.
//
// Two audio sources, checked in this order:
//   1. song.audioUrl — a public streaming URL (Cloudflare R2), works on
//      any device including phones with no local file access.
//   2. local blob attachment (local-audio-library.js) — session-only,
//      desktop-only fallback for testing before a song is uploaded to R2.

import { getState, getSongsForSet } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { getPlayableAudioUrl } from './audio-source.js';

const audioEl = new Audio();
audioEl.preload = 'metadata';

let playerModeOn = false;
let currentInstanceId = null;
let currentSetId = null;
let listeners = new Set();      // fires on every tick (mini-player scrub bar)
let trackListeners = new Set(); // fires only when the mode/track actually changes (gig-view row highlight)

// Practice-loop points, for looping a passage of the current song
// (§ rehearsal looping). Session-only, remembered per songId while the
// app stays open — not persisted to Firestore, not tied to gig instances.
// { start, end, active } — start/end are seconds, or null until tagged.
const loopsBySong = new Map();

function getLoopState(songId) {
  if (!songId) return { start: null, end: null, active: false };
  if (!loopsBySong.has(songId)) loopsBySong.set(songId, { start: null, end: null, active: false });
  return loopsBySong.get(songId);
}

function currentSongId() {
  if (!currentInstanceId) return null;
  const instance = getState().instances[currentInstanceId];
  return instance ? instance.songId : null;
}

function notify() {
  for (const fn of listeners) fn(getPlayerState());
}

function notifyTrackChange() {
  for (const fn of trackListeners) fn(getPlayerState());
}

export function onPlayerChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Lower-frequency subscription — fires on mode toggle, track start/stop,
// but NOT on every timeupdate tick. Use this for anything that re-renders
// the full gig view; use onPlayerChange for the scrub bar itself.
export function onTrackChange(fn) {
  trackListeners.add(fn);
  return () => trackListeners.delete(fn);
}

export function isPlayerModeOn() {
  return playerModeOn;
}

export function togglePlayerMode() {
  playerModeOn = !playerModeOn;
  if (!playerModeOn) stop();
  notify();
  notifyTrackChange();
}

export function getPlayerState() {
  const state = getState();
  const instance = currentInstanceId ? state.instances[currentInstanceId] : null;
  const song = instance ? state.songs[instance.songId] : null;
  const loop = getLoopState(instance ? instance.songId : null);
  return {
    playerModeOn,
    currentInstanceId,
    currentSetId,
    song,
    isPlaying: !audioEl.paused && !audioEl.ended,
    currentTime: audioEl.currentTime,
    duration: audioEl.duration || 0,
    loopStart: loop.start,
    loopEnd: loop.end,
    loopActive: loop.active,
  };
}

// Returns the current set's instances in display order, i.e. the actual
// playback queue for auto-advance purposes.
function getSetQueue(setId) {
  const state = getState();
  const set = state.sets[setId];
  if (!set) return [];
  const raw = getSongsForSet(setId);
  return sortInstancesForDisplay(raw, set.songOrderMode, state.songs);
}

export function playInstance(instanceId) {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return;
  const song = state.songs[instance.songId];
  const url = getPlayableAudioUrl(song);
  if (!url) return; // no audio attached — caller should prompt to attach instead

  currentInstanceId = instanceId;
  currentSetId = instance.setId;
  audioEl.src = url;
  audioEl.currentTime = 0;
  audioEl.play().catch(err => console.error('Playback failed:', err));
  notify();
  notifyTrackChange();
}

export function togglePlayPause() {
  if (!currentInstanceId) return;
  if (audioEl.paused) audioEl.play().catch(err => console.error('Playback failed:', err));
  else audioEl.pause();
  notify();
}

export function seekBy(deltaSeconds) {
  if (!currentInstanceId || !isFinite(audioEl.duration)) return;
  audioEl.currentTime = Math.max(0, Math.min(audioEl.duration, audioEl.currentTime + deltaSeconds));
  notify();
}

export function seekTo(seconds) {
  if (!currentInstanceId || !isFinite(audioEl.duration)) return;
  audioEl.currentTime = Math.max(0, Math.min(audioEl.duration, seconds));
  notify();
}

export function stop() {
  audioEl.pause();
  audioEl.removeAttribute('src');
  audioEl.load();
  currentInstanceId = null;
  currentSetId = null;
  notify();
  notifyTrackChange();
}

// Moves to the next/previous song WITH attached audio in the current
// set's display order — skips over songs with no audio. Returns false
// (and does nothing) if there's no such song (start/end of set).
function stepWithinSet(direction) {
  if (!currentSetId) return false;
  const queue = getSetQueue(currentSetId);
  const idx = queue.findIndex(i => i.instanceId === currentInstanceId);
  if (idx < 0) return false;

  const state = getState();
  let i = idx + direction;
  while (i >= 0 && i < queue.length) {
    const candidate = queue[i];
    const candidateSong = state.songs[state.instances[candidate.instanceId].songId];
    if (getPlayableAudioUrl(candidateSong)) {
      playInstance(candidate.instanceId);
      return true;
    }
    i += direction;
  }
  return false;
}

export function playNext() {
  return stepWithinSet(1);
}

export function playPrevious() {
  return stepWithinSet(-1);
}

// Tags the current playback position as the loop start/end for THIS song
// (§ rehearsal looping). Setting a new start after the loop was already
// active re-tags without losing the end point (and vice versa); a loop
// only actually starts looping once both points exist and it's toggled on.
export function setLoopStart() {
  const songId = currentSongId();
  if (!songId || !isFinite(audioEl.currentTime)) return;
  const loop = getLoopState(songId);
  loop.start = audioEl.currentTime;
  if (loop.end != null && loop.start >= loop.end) loop.end = null; // invalidate an end that's now behind the new start
  notify();
}

export function setLoopEnd() {
  const songId = currentSongId();
  if (!songId || !isFinite(audioEl.currentTime)) return;
  const loop = getLoopState(songId);
  if (loop.start != null && audioEl.currentTime <= loop.start) return; // end must come after start
  loop.end = audioEl.currentTime;
  notify();
}

export function toggleLoopActive() {
  const songId = currentSongId();
  if (!songId) return;
  const loop = getLoopState(songId);
  if (loop.start == null || loop.end == null) return; // need both points tagged first
  loop.active = !loop.active;
  notify();
}

export function clearLoop() {
  const songId = currentSongId();
  if (!songId) return;
  loopsBySong.set(songId, { start: null, end: null, active: false });
  notify();
}

audioEl.addEventListener('timeupdate', () => {
  const songId = currentSongId();
  const loop = getLoopState(songId);
  if (loop.active && loop.start != null && loop.end != null && audioEl.currentTime >= loop.end) {
    audioEl.currentTime = loop.start;
  }
  notify();
});
audioEl.addEventListener('play', notify);
audioEl.addEventListener('pause', notify);
audioEl.addEventListener('loadedmetadata', notify);
audioEl.addEventListener('ended', () => {
  const advanced = playNext();
  if (!advanced) stop(); // end of set (or no more songs with audio) — stop per spec
});
