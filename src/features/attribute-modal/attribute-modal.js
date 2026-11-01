// attribute-modal.js — full-screen overlay to view/edit a song instance's
// attributes (§4.2). Key/BPM/Lead/Notes are per-INSTANCE (this placement,
// in this gig) since different gigs can call for a different singer, key,
// or tempo for the same song. Lyrics stay on the shared Song record — the
// words don't change gig to gig.
//
// Lyrics gestures (tuned for performers reading off a phone mid-song):
//   - Normal size: single tap maximizes; double tap enters edit (focuses
//     the textarea for typing).
//   - Maximized: double tap shrinks back down; a single tap/scroll does
//     NOT shrink, so scrolling through long lyrics never accidentally
//     backs out of full-screen.
//   - Maximized view has Previous/Next Song buttons that jump to the
//     adjacent song in the same set (any song, even ones with no lyrics
//     yet) without leaving full-screen. Previous stops at the start of
//     the set. Next, on the last song, prompts to continue into the next
//     non-empty set (confirm) or exit to the main menu (cancel).

import {
  getState, getSong, updateSongLyrics, updateSongTitle, updateSongArtist, updateInstanceAttributes, removeInstance, getSongsForSet, getOrderedSets,
} from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { makeEditable } from '../../ui/editable-text.js';
import { DOUBLE_TAP_MS } from '../../config.js';

let modalEl = null;
let onCloseCallback = null;
let currentInstanceId = null;
let currentSongId = null;

const LYRICS_FONT_MIN = 12;
const LYRICS_FONT_MAX = 32;
const LYRICS_FONT_STEP = 2;
let lyricsFontSize = 16; // persists across modal opens for this session

export function openAttributeModal(instanceId, { onLinkRequested } = {}) {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return;
  const song = getSong(instance.songId);
  if (!song) return;

  closeAttributeModal();
  currentInstanceId = instanceId;
  currentSongId = song.songId;

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Song attributes">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title" id="attr-title">${escapeHtml(song.title)}</h2>
      </div>
      <p class="field-hint attr-title-hint">Tap the title to rename this song everywhere it appears</p>
      <div class="modal-body">
        <label class="field">
          <span class="field-label">Artist <span class="field-hint">(all gigs)</span></span>
          <input type="text" id="attr-artist" value="${escapeAttr(song.artist)}" placeholder="Optional">
        </label>
        <div class="field">
          <div class="field-label-row">
            <span class="field-label">Lyrics <span class="field-hint">(tap to view full-screen)</span></span>
            <div class="lyrics-controls">
              <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-down" aria-label="Decrease lyrics font size">A&#8722;</button>
              <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-up" aria-label="Increase lyrics font size">A&#43;</button>
            </div>
          </div>
          <textarea id="attr-lyrics" rows="6" placeholder="Tap once to view full-screen, double-tap to edit…" readonly>${escapeHtml(song.lyrics || '')}</textarea>
        </div>
        <label class="field">
          <span class="field-label">Key <span class="field-hint">(this gig only)</span></span>
          <input type="text" id="attr-key" value="${escapeAttr(instance.key)}" placeholder="e.g. Bb or A > Bb">
        </label>
        <label class="field">
          <span class="field-label">BPM <span class="field-hint">(this gig only)</span></span>
          <input type="number" id="attr-bpm" value="${escapeAttr(instance.bpm)}" inputmode="numeric" placeholder="—">
        </label>
        <label class="field">
          <span class="field-label">Lead / Singer <span class="field-hint">(this gig only)</span></span>
          <input type="text" id="attr-lead" value="${escapeAttr(instance.lead)}" placeholder="e.g. Clarence / Tatiana">
        </label>
        <label class="field">
          <span class="field-label">Notes <span class="field-hint">(this gig only)</span></span>
          <textarea id="attr-notes" rows="3" placeholder="Transition cues, reminders…">${escapeHtml(instance.notes || '')}</textarea>
        </label>
        ${onLinkRequested ? '<button class="btn-link-open" id="attr-link-btn">Link…</button>' : ''}
        <button class="btn-danger" id="attr-delete-btn">Delete Song From Gig</button>
      </div>
    </div>
    <div class="lyrics-maximized-overlay hidden" id="attr-lyrics-overlay">
      <div class="lyrics-maximized-header">
        <span class="lyrics-maximized-title" id="attr-lyrics-max-title">${escapeHtml(song.title)}</span>
        <div class="lyrics-controls">
          <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-down-2" aria-label="Decrease lyrics font size">A&#8722;</button>
          <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-up-2" aria-label="Increase lyrics font size">A&#43;</button>
        </div>
      </div>
      <div class="lyrics-nav-bar">
        <button type="button" class="lyrics-nav-btn" id="attr-lyrics-prev">&#8592; Previous Song</button>
        <button type="button" class="lyrics-nav-btn" id="attr-lyrics-next">Next Song &#8594;</button>
      </div>
      <textarea id="attr-lyrics-maximized" placeholder="No lyrics yet — double-tap to edit."></textarea>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => {
    saveFields(currentInstanceId, currentSongId);
    closeAttributeModal();
  };

  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  wireLyricsControls();
  wireTitleEditing();
  // Artist lives on the shared song, saved as soon as the field is left.
  modalEl.querySelector('#attr-artist').addEventListener('change', e => {
    updateSongArtist(currentSongId, e.target.value);
  });

  if (onLinkRequested) {
    modalEl.querySelector('#attr-link-btn').addEventListener('click', () => {
      saveFields(currentInstanceId, currentSongId);
      closeAttributeModal();
      onLinkRequested(instanceId);
    });
  }

  modalEl.querySelector('#attr-delete-btn').addEventListener('click', () => {
    const confirmed = confirm(`Remove "${song.title}" from this gig? This only removes this placement — the song stays in your library.`);
    if (!confirmed) return;
    removeInstance(instanceId);
    closeAttributeModal();
  });

  onCloseCallback = close;
}

// Renaming here edits the shared Song record (title is global, like
// lyrics) — safe because every placement/link/audio-attachment keys off
// songId, never the title text, so a rename can't disassociate anything.
function wireTitleEditing() {
  const titleEl = modalEl.querySelector('#attr-title');
  makeEditable(titleEl, {
    getValue: () => titleEl.textContent,
    onCommit: next => {
      updateSongTitle(currentSongId, next);
      titleEl.textContent = next;
      const maxTitleEl = modalEl.querySelector('#attr-lyrics-max-title');
      if (maxTitleEl) maxTitleEl.textContent = next;
    },
    ariaLabel: 'Song title — tap to rename',
  });
}

function wireLyricsControls() {
  const inlineTextarea = modalEl.querySelector('#attr-lyrics');
  const maxTextarea = modalEl.querySelector('#attr-lyrics-maximized');
  const overlay = modalEl.querySelector('#attr-lyrics-overlay');

  applyLyricsFontSize(inlineTextarea, maxTextarea);

  const bumpFont = delta => {
    lyricsFontSize = Math.max(LYRICS_FONT_MIN, Math.min(LYRICS_FONT_MAX, lyricsFontSize + delta));
    applyLyricsFontSize(inlineTextarea, maxTextarea);
  };

  modalEl.querySelector('#attr-lyrics-font-up').addEventListener('click', () => bumpFont(LYRICS_FONT_STEP));
  modalEl.querySelector('#attr-lyrics-font-down').addEventListener('click', () => bumpFont(-LYRICS_FONT_STEP));
  modalEl.querySelector('#attr-lyrics-font-up-2').addEventListener('click', () => bumpFont(LYRICS_FONT_STEP));
  modalEl.querySelector('#attr-lyrics-font-down-2').addEventListener('click', () => bumpFont(-LYRICS_FONT_STEP));

  const maximize = () => {
    maxTextarea.value = inlineTextarea.value;
    overlay.classList.remove('hidden');
  };
  const restore = () => {
    inlineTextarea.value = maxTextarea.value;
    overlay.classList.add('hidden');
  };
  const enterEdit = () => {
    inlineTextarea.readOnly = false;
    inlineTextarea.focus();
  };

  // Normal size: single tap maximizes (view mode — textarea stays
  // readonly so a tap can't put a cursor/select text instead), double
  // tap switches it to editable and focuses it.
  let inlineTapTimer = null;
  let inlineTapCount = 0;
  inlineTextarea.addEventListener('click', () => {
    inlineTapCount += 1;
    if (inlineTapCount === 1) {
      inlineTapTimer = setTimeout(() => {
        inlineTapCount = 0;
        if (inlineTextarea.readOnly) maximize();
      }, DOUBLE_TAP_MS);
    } else if (inlineTapCount === 2) {
      clearTimeout(inlineTapTimer);
      inlineTapCount = 0;
      enterEdit();
    }
  });
  // Once editing, blur (tapping elsewhere) returns it to view/tap-to-maximize mode.
  inlineTextarea.addEventListener('blur', () => {
    inlineTextarea.readOnly = true;
  });

  // Maximized: only a genuine double-tap shrinks it — a plain tap or a
  // scroll/drag must never trigger this, so performers can scroll long
  // lyrics without accidentally backing out of full-screen.
  let maxTapTimer = null;
  let maxTapCount = 0;
  maxTextarea.addEventListener('click', () => {
    maxTapCount += 1;
    if (maxTapCount === 1) {
      maxTapTimer = setTimeout(() => { maxTapCount = 0; }, DOUBLE_TAP_MS);
    } else if (maxTapCount === 2) {
      clearTimeout(maxTapTimer);
      maxTapCount = 0;
      restore();
    }
  });

  modalEl.querySelector('#attr-lyrics-prev').addEventListener('click', () => navigateLyrics(-1));
  modalEl.querySelector('#attr-lyrics-next').addEventListener('click', () => navigateLyrics(1));
}

// Jumps the maximized view to the adjacent song in the current set
// (§ Next/Previous Song), saving the outgoing song's fields first so
// nothing is lost, then loading the new song's data in place —
// including its own key/bpm/lead/notes back in the (now-hidden) normal
// fields, so closing the modal from here still saves correctly.
//
// Going past the last song of a set with "Next" prompts to jump into the
// next set instead of silently stopping — confirm continues to that
// set's first song (still maximized), cancel exits to the main menu.
function navigateLyrics(direction) {
  const state = getState();
  const instance = state.instances[currentInstanceId];
  if (!instance) return;

  const set = state.sets[instance.setId];
  if (!set) return;

  const raw = getSongsForSet(instance.setId);
  const ordered = sortInstancesForDisplay(raw, set.songOrderMode, state.songs);
  const idx = ordered.findIndex(i => i.instanceId === currentInstanceId);
  if (idx < 0) return;

  const targetIdx = idx + direction;

  if (targetIdx >= ordered.length && direction > 0) {
    const nextSet = findAdjacentSetWithSongs(set.setId, 1);
    if (!nextSet) return; // no next set — stay put
    const confirmed = confirm('This was the last song in this set. Press OK to jump to the next set, or Cancel to exit.');
    if (!confirmed) {
      closeAttributeModal();
      return;
    }
    saveFields(currentInstanceId, currentSongId);
    loadInstanceIntoMaximizedView(nextSet.ordered[0]);
    return;
  }

  if (targetIdx < 0) return; // stop at the start of a set — no prompt requested for this direction

  saveFields(currentInstanceId, currentSongId);
  loadInstanceIntoMaximizedView(ordered[targetIdx]);
}

// Finds the next/previous set (relative to setId) that has at least one
// song, skipping empty sets, and returns its display-ordered instances.
function findAdjacentSetWithSongs(setId, direction) {
  const state = getState();
  const sets = getOrderedSets();
  const idx = sets.findIndex(s => s.setId === setId);
  if (idx < 0) return null;

  for (let i = idx + direction; i >= 0 && i < sets.length; i += direction) {
    const candidate = sets[i];
    const raw = getSongsForSet(candidate.setId);
    if (raw.length === 0) continue;
    const ordered = sortInstancesForDisplay(raw, candidate.songOrderMode, state.songs);
    return { set: candidate, ordered };
  }
  return null;
}

function loadInstanceIntoMaximizedView(nextInstance) {
  const nextSong = getSong(nextInstance.songId);
  if (!nextSong) return;

  currentInstanceId = nextInstance.instanceId;
  currentSongId = nextSong.songId;

  modalEl.querySelector('.modal-title').textContent = nextSong.title;
  modalEl.querySelector('#attr-lyrics-max-title').textContent = nextSong.title;
  const maxTextarea = modalEl.querySelector('#attr-lyrics-maximized');
  maxTextarea.value = nextSong.lyrics || '';
  maxTextarea.scrollTop = 0;
  modalEl.querySelector('#attr-lyrics').value = nextSong.lyrics || '';
  modalEl.querySelector('#attr-artist').value = nextSong.artist ?? '';
  modalEl.querySelector('#attr-key').value = nextInstance.key ?? '';
  modalEl.querySelector('#attr-bpm').value = nextInstance.bpm ?? '';
  modalEl.querySelector('#attr-lead').value = nextInstance.lead ?? '';
  modalEl.querySelector('#attr-notes').value = nextInstance.notes ?? '';
}

function applyLyricsFontSize(inlineTextarea, maxTextarea) {
  inlineTextarea.style.fontSize = `${lyricsFontSize}px`;
  maxTextarea.style.fontSize = `${lyricsFontSize}px`;
}

function saveFields(instanceId, songId) {
  if (!modalEl) return;
  const key = modalEl.querySelector('#attr-key').value.trim();
  const bpm = modalEl.querySelector('#attr-bpm').value.trim();
  const lead = modalEl.querySelector('#attr-lead').value.trim();
  const notes = modalEl.querySelector('#attr-notes').value.trim();
  updateInstanceAttributes(instanceId, { key, bpm, lead, notes });

  // If lyrics is currently maximized, its textarea holds the latest edits —
  // the inline one only gets synced back on explicit shrink/navigate.
  const overlayOpen = !modalEl.querySelector('#attr-lyrics-overlay').classList.contains('hidden');
  const lyricsSource = overlayOpen ? '#attr-lyrics-maximized' : '#attr-lyrics';
  const lyrics = modalEl.querySelector(lyricsSource).value.trim();
  updateSongLyrics(songId, lyrics);
}

export function closeAttributeModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
    document.body.classList.remove('modal-open');
  }
  onCloseCallback = null;
  currentInstanceId = null;
  currentSongId = null;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(val) {
  return escapeHtml(val == null ? '' : String(val));
}
