// attribute-modal.js — full-screen overlay to view/edit a song instance's
// attributes (§4.2). Edits write to the underlying Song record (§5.5).

import { getState, getSong, updateSongAttributes, removeInstance } from '../../data/store.js';

let modalEl = null;
let onCloseCallback = null;

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
        <label class="field">
          <span class="field-label">Key</span>
          <input type="text" id="attr-key" value="${escapeAttr(song.key)}" placeholder="e.g. Bb or A > Bb">
        </label>
        <label class="field">
          <span class="field-label">BPM</span>
          <input type="number" id="attr-bpm" value="${escapeAttr(song.bpm)}" inputmode="numeric" placeholder="—">
        </label>
        <label class="field">
          <span class="field-label">Lead / Singer</span>
          <input type="text" id="attr-lead" value="${escapeAttr(song.lead)}" placeholder="e.g. Clarence / Tatiana">
        </label>
        <label class="field">
          <span class="field-label">Notes</span>
          <textarea id="attr-notes" rows="3" placeholder="Transition cues, reminders…">${escapeHtml(song.notes || '')}</textarea>
        </label>
        <label class="field">
          <span class="field-label">Lyrics</span>
          <textarea id="attr-lyrics" rows="6" placeholder="Paste or type lyrics…">${escapeHtml(song.lyrics || '')}</textarea>
        </label>
        ${onLinkRequested ? '<button class="btn-link-open" id="attr-link-btn">Link…</button>' : ''}
        <button class="btn-danger" id="attr-delete-btn">Delete Song From Gig</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => {
    saveFields(song.songId);
    closeAttributeModal();
  };

  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  if (onLinkRequested) {
    modalEl.querySelector('#attr-link-btn').addEventListener('click', () => {
      saveFields(song.songId);
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

function saveFields(songId) {
  if (!modalEl) return;
  const key = modalEl.querySelector('#attr-key').value.trim();
  const bpm = modalEl.querySelector('#attr-bpm').value.trim();
  const lead = modalEl.querySelector('#attr-lead').value.trim();
  const notes = modalEl.querySelector('#attr-notes').value.trim();
  const lyrics = modalEl.querySelector('#attr-lyrics').value.trim();
  updateSongAttributes(songId, { key, bpm, lead, notes, lyrics });
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
