// bulk-audio-upload.js — Add+ → Bulk Upload Audio: pick multiple MP3
// files at once, auto-match each to a library song by filename
// similarity, let the user correct any mismatches or skip files, then
// upload everything to Firebase Storage in one pass.

import { getState, attachAudioToSong } from '../../data/store.js';
import { matchFilesToSongs } from '../../lib/audio-match.js';

let modalEl = null;
let pendingFiles = []; // { file, songId | null }

export function openBulkAudioUploadModal() {
  closeBulkAudioUploadModal();
  pendingFiles = [];

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Bulk upload audio">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Bulk Upload Audio</h2>
      </div>
      <div class="modal-body">
        <label class="field">
          <span class="field-label">Select MP3 files</span>
          <input type="file" id="bulk-audio-files" accept="audio/mpeg,.mp3" multiple>
        </label>
        <div id="bulk-audio-review"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => closeBulkAudioUploadModal();
  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  modalEl.querySelector('#bulk-audio-files').addEventListener('change', e => {
    const files = [...e.target.files];
    if (!files.length) return;
    runMatching(files);
  });
}

function runMatching(files) {
  const state = getState();
  const songs = Object.values(state.songs).sort((a, b) => a.title.localeCompare(b.title));
  const results = matchFilesToSongs(files.map(f => f.name), songs);

  pendingFiles = files.map((file, i) => ({
    file,
    songId: results[i].suggestedSong?.songId || null,
  }));

  renderReview(songs);
}

function renderReview(songs) {
  const container = modalEl.querySelector('#bulk-audio-review');
  container.innerHTML = `
    <div class="field-label" style="margin-top:8px;">Review matches (${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'})</div>
    <div class="bulk-audio-list">
      ${pendingFiles.map((pf, i) => `
        <div class="bulk-audio-row">
          <span class="bulk-audio-filename" title="${escapeHtml(pf.file.name)}">${escapeHtml(pf.file.name)}</span>
          <select class="bulk-audio-select" data-index="${i}">
            <option value="">— Skip this file —</option>
            ${songs.map(s => `<option value="${s.songId}" ${s.songId === pf.songId ? 'selected' : ''}>${escapeHtml(s.title)}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
    <button class="btn-link-open" id="bulk-audio-upload-btn">Upload ${pendingFiles.filter(p => p.songId).length} Matched File${pendingFiles.filter(p => p.songId).length === 1 ? '' : 's'}</button>
    <p class="field-hint" id="bulk-audio-progress"></p>
  `;

  container.querySelectorAll('.bulk-audio-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = Number(sel.dataset.index);
      pendingFiles[i].songId = sel.value || null;
      updateUploadButtonLabel();
    });
  });

  container.querySelector('#bulk-audio-upload-btn').addEventListener('click', uploadAll);
}

function updateUploadButtonLabel() {
  const btn = modalEl?.querySelector('#bulk-audio-upload-btn');
  if (!btn) return;
  const count = pendingFiles.filter(p => p.songId).length;
  btn.textContent = `Upload ${count} Matched File${count === 1 ? '' : 's'}`;
}

async function uploadAll() {
  const toUpload = pendingFiles.filter(p => p.songId);
  if (!toUpload.length) return;

  const btn = modalEl.querySelector('#bulk-audio-upload-btn');
  const progress = modalEl.querySelector('#bulk-audio-progress');
  btn.disabled = true;

  let done = 0;
  let failed = 0;
  for (const { file, songId } of toUpload) {
    progress.textContent = `Uploading ${done + 1} of ${toUpload.length}…`;
    try {
      await attachAudioToSong(songId, file);
      done++;
    } catch (err) {
      console.error('Bulk audio upload failed for', file.name, err);
      failed++;
    }
  }

  progress.textContent = failed
    ? `Done — ${done} uploaded, ${failed} failed. See console for details.`
    : `Done — ${done} file${done === 1 ? '' : 's'} uploaded.`;
  btn.disabled = false;
  btn.textContent = 'Upload Complete';
}

export function closeBulkAudioUploadModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
    document.body.classList.remove('modal-open');
  }
  pendingFiles = [];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
