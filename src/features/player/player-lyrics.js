// player-lyrics.js — full-screen lyrics view shown during Player Mode
// playback. Opens automatically when a track starts, stays in sync with
// whatever is actually playing (track ends/auto-advances -> lyrics swap
// with it), and its own Next/Previous Song buttons drive playback itself
// rather than just browsing text. The mini-player transport bar is
// re-docked at the bottom of this view while it's open.

import { getState, getSong, getSongsForSet, updateSongLyrics } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { onTrackChange, getPlayerState, playNext, playPrevious } from './player-engine.js';
import { mountMiniPlayer } from './mini-player.js';

const LYRICS_FONT_MIN = 12;
const LYRICS_FONT_MAX = 32;
const LYRICS_FONT_STEP = 2;
let lyricsFontSize = 16;

let overlayEl = null;
let unsubscribeTrackChange = null;
let editingSongId = null; // songId currently unlocked for editing, or null
// Once the user manually closes the lyrics view, it stays closed through
// auto-advance and mini-player Next/Prev — it only reopens when the user
// explicitly taps a song row in the list to start a fresh selection
// (signaled via notifyExplicitPlayRequested).
let suppressAutoOpen = false;

// Lets other subscribers (main.js's own onTrackChange) know not to
// re-dock the mini-player onto document.body while this view owns it —
// subscriber firing order isn't guaranteed, so this is checked instead
// of relied-on ordering.
export function isPlayerLyricsOpen() {
  return overlayEl !== null;
}

// Called by gig-view.js right before it starts playback from an explicit
// row tap — the one gesture that should be able to reopen the view even
// after the user closed it.
export function notifyExplicitPlayRequested() {
  suppressAutoOpen = false;
}

export function initPlayerLyrics() {
  if (unsubscribeTrackChange) return;
  unsubscribeTrackChange = onTrackChange(state => {
    if (!state.playerModeOn || !state.currentInstanceId) {
      closePlayerLyrics();
      suppressAutoOpen = false;
      return;
    }
    if (overlayEl) {
      renderCurrentSong(state);
    } else if (!suppressAutoOpen) {
      openPlayerLyrics(state);
    }
  });
}

function openPlayerLyrics(playerState) {
  overlayEl = document.createElement('div');
  overlayEl.className = 'lyrics-maximized-overlay player-lyrics-overlay';
  overlayEl.innerHTML = `
    <div class="lyrics-maximized-header">
      <button type="button" class="lyrics-close-btn" id="pl-close" aria-label="Close lyrics view">&#8595;</button>
      <span class="lyrics-maximized-title" id="pl-title"></span>
      <div class="lyrics-controls">
        <button type="button" class="lyrics-font-btn" id="pl-font-down" aria-label="Decrease lyrics font size">A&#8722;</button>
        <button type="button" class="lyrics-font-btn" id="pl-font-up" aria-label="Increase lyrics font size">A&#43;</button>
        <button type="button" class="lyrics-font-btn lyrics-edit-btn" id="pl-edit" aria-label="Edit lyrics" aria-pressed="false">&#9998;</button>
      </div>
    </div>
    <div class="lyrics-nav-bar">
      <button type="button" class="lyrics-nav-btn" id="pl-prev">&#8592; Previous Song</button>
      <button type="button" class="lyrics-nav-btn" id="pl-next">Next Song &#8594;</button>
    </div>
    <textarea id="pl-lyrics" readonly placeholder="No lyrics for this song yet."></textarea>
    <div class="player-lyrics-dock" id="pl-dock"></div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  overlayEl.querySelector('#pl-close').addEventListener('click', () => {
    saveEditedLyrics();
    suppressAutoOpen = true;
    closePlayerLyrics();
  });
  overlayEl.querySelector('#pl-font-up').addEventListener('click', () => bumpFont(LYRICS_FONT_STEP));
  overlayEl.querySelector('#pl-font-down').addEventListener('click', () => bumpFont(-LYRICS_FONT_STEP));
  overlayEl.querySelector('#pl-edit').addEventListener('click', toggleEditing);
  overlayEl.querySelector('#pl-prev').addEventListener('click', () => { saveEditedLyrics(); playPrevious(); });
  overlayEl.querySelector('#pl-next').addEventListener('click', () => { saveEditedLyrics(); playNext(); });

  mountMiniPlayer(overlayEl.querySelector('#pl-dock'));

  renderCurrentSong(playerState);
}

function renderCurrentSong(playerState) {
  if (!overlayEl) return;
  setEditing(false); // flushes edits to the outgoing song and locks — each song opens locked

  const state = getState();
  const instance = state.instances[playerState.currentInstanceId];
  const song = instance ? getSong(instance.songId) : null;
  if (!song) return;

  overlayEl.querySelector('#pl-title').textContent = song.title;
  const textarea = overlayEl.querySelector('#pl-lyrics');
  textarea.value = song.lyrics || '';
  textarea.scrollTop = 0;
  applyLyricsFontSize(textarea);

  const nav = getSetNavState(instance);
  overlayEl.querySelector('#pl-prev').disabled = !nav.hasPrev;
  overlayEl.querySelector('#pl-next').disabled = !nav.hasNext;
}

function toggleEditing() {
  setEditing(editingSongId === null);
}

function setEditing(shouldEdit) {
  if (!overlayEl) return;
  const textarea = overlayEl.querySelector('#pl-lyrics');
  const editBtn = overlayEl.querySelector('#pl-edit');

  if (!shouldEdit) {
    saveEditedLyrics();
    editingSongId = null;
    textarea.readOnly = true;
    editBtn.classList.remove('active');
    editBtn.setAttribute('aria-pressed', 'false');
    return;
  }

  const state = getState();
  const instance = state.instances[getPlayerState().currentInstanceId];
  const song = instance ? getSong(instance.songId) : null;
  if (!song) return;

  editingSongId = song.songId;
  textarea.readOnly = false;
  editBtn.classList.add('active');
  editBtn.setAttribute('aria-pressed', 'true');
  textarea.focus();
}

function saveEditedLyrics() {
  if (!overlayEl || !editingSongId) return;
  const textarea = overlayEl.querySelector('#pl-lyrics');
  updateSongLyrics(editingSongId, textarea.value.trim());
}

function getSetNavState(instance) {
  const state = getState();
  const set = state.sets[instance.setId];
  if (!set) return { hasPrev: false, hasNext: false };
  const raw = getSongsForSet(instance.setId);
  const ordered = sortInstancesForDisplay(raw, set.songOrderMode, state.songs);
  const idx = ordered.findIndex(i => i.instanceId === instance.instanceId);
  return { hasPrev: idx > 0, hasNext: idx >= 0 && idx < ordered.length - 1 };
}

function bumpFont(delta) {
  lyricsFontSize = Math.max(LYRICS_FONT_MIN, Math.min(LYRICS_FONT_MAX, lyricsFontSize + delta));
  const textarea = overlayEl?.querySelector('#pl-lyrics');
  if (textarea) applyLyricsFontSize(textarea);
}

function applyLyricsFontSize(textarea) {
  textarea.style.fontSize = `${lyricsFontSize}px`;
}

function closePlayerLyrics() {
  if (!overlayEl) return;
  saveEditedLyrics();
  editingSongId = null;
  mountMiniPlayer(document.body); // hand the transport bar back before removing our dock
  overlayEl.remove();
  overlayEl = null;
  document.body.classList.remove('modal-open');
}
