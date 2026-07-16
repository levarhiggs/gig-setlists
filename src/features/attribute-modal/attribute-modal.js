// attribute-modal.js — full-screen overlay to view/edit a song instance's
// attributes (§4.2). Key/BPM/Lead/Notes are per-INSTANCE (this placement,
// in this gig) since different gigs can call for a different singer, key,
// or tempo for the same song. Lyrics stay on the shared Song record — the
// words don't change gig to gig.

import { getState, getSong, updateSongLyrics, updateInstanceAttributes, removeInstance } from '../../data/store.js';

let modalEl = null;
let onCloseCallback = null;

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

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Song attributes">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">${escapeHtml(song.title)}</h2>
      </div>
      <div class="modal-body">
        <div class="field">
          <div class="field-label-row">
            <span class="field-label">Lyrics</span>
            <div class="lyrics-controls">
              <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-down" aria-label="Decrease lyrics font size">A&#8722;</button>
              <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-up" aria-label="Increase lyrics font size">A&#43;</button>
              <button type="button" class="lyrics-maximize-btn" id="attr-lyrics-maximize" aria-label="Maximize lyrics">&#9974;</button>
            </div>
          </div>
          <textarea id="attr-lyrics" rows="6" placeholder="Paste or type lyrics…">${escapeHtml(song.lyrics || '')}</textarea>
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
        <button type="button" class="lyrics-restore-btn" id="attr-lyrics-restore" aria-label="Shrink lyrics">&#9975; Shrink</button>
        <div class="lyrics-controls">
          <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-down-2" aria-label="Decrease lyrics font size">A&#8722;</button>
          <button type="button" class="lyrics-font-btn" id="attr-lyrics-font-up-2" aria-label="Increase lyrics font size">A&#43;</button>
        </div>
      </div>
      <textarea id="attr-lyrics-maximized" placeholder="Paste or type lyrics…"></textarea>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => {
    saveFields(instanceId, song.songId);
    closeAttributeModal();
  };

  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  wireLyricsControls();

  if (onLinkRequested) {
    modalEl.querySelector('#attr-link-btn').addEventListener('click', () => {
      saveFields(instanceId, song.songId);
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

  modalEl.querySelector('#attr-lyrics-maximize').addEventListener('click', () => {
    maxTextarea.value = inlineTextarea.value;
    overlay.classList.remove('hidden');
    maxTextarea.focus();
  });

  modalEl.querySelector('#attr-lyrics-restore').addEventListener('click', () => {
    inlineTextarea.value = maxTextarea.value;
    overlay.classList.add('hidden');
  });
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
  // the inline one only gets synced back on explicit "Shrink".
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
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(val) {
  return escapeHtml(val == null ? '' : String(val));
}
