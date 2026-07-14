// player-engine.js — the actual <audio> element and playback state
// machine for Player Mode. Auto-advances to the next song WITH attached
// audio within the current set only (stops at set boundaries, per spec);
// songs with no attached audio are skipped over when advancing.

import { getState, getSongsForSet } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { getLocalAudio } from './local-audio-library.js';

const audioEl = new Audio();
audioEl.preload = 'metadata';

let playerModeOn = false;
let currentInstanceId = null;
let currentSetId = null;
let listeners = new Set();      // fires on every tick (mini-player scrub bar)
let trackListeners = new Set(); // fires only when the mode/track actually changes (gig-view row highlight)

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
  return {
    playerModeOn,
    currentInstanceId,
    currentSetId,
    song,
    isPlaying: !audioEl.paused && !audioEl.ended,
    currentTime: audioEl.currentTime,
    duration: audioEl.duration || 0,
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
  const local = getLocalAudio(instance.songId);
  if (!local) return; // no audio attached — caller should prompt to attach instead

  currentInstanceId = instanceId;
  currentSetId = instance.setId;
  audioEl.src = local.url;
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
    if (getLocalAudio(state.instances[candidate.instanceId].songId)) {
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

audioEl.addEventListener('timeupdate', notify);
audioEl.addEventListener('play', notify);
audioEl.addEventListener('pause', notify);
audioEl.addEventListener('loadedmetadata', notify);
audioEl.addEventListener('ended', () => {
  const advanced = playNext();
  if (!advanced) stop(); // end of set (or no more songs with audio) — stop per spec
});
