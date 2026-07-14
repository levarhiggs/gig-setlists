// bulk-local-attach.js — Add+ → Attach Audio Files: pick a batch of local
// MP3 files at once (e.g. everything in one folder), auto-match each
// LIBRARY SONG to its best-candidate file by name similarity, review/
// correct per song, then attach all confirmed matches as local (session-
// only) audio for Player Mode. No upload, no persistence — same
// blob-URL mechanism as the single-song attach flow.

import { getState } from '../../data/store.js';
import { attachLocalAudio, hasLocalAudio } from '../player/local-audio-library.js';
import { matchSongsToFiles } from '../../lib/audio-match.js';

let modalEl = null;
let selectedFiles = []; // File[]
let songChoices = new Map(); // songId -> fileName | null

export function openBulkLocalAttachModal() {
  closeBulkLocalAttachModal();
  selectedFiles = [];
  songChoices = new Map();

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-sheet add-song-sheet" role="dialog" aria-modal="true" aria-label="Attach audio files">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Attach Audio Files</h2>
      </div>
      <div class="modal-body">
        <p class="field-hint">Pick a batch of local MP3 files (e.g. select-all inside one folder). These attach for this browser session only — nothing is uploaded.</p>
        <label class="field">
          <span class="field-label">Select MP3 files</span>
          <input type="file" id="bulk-local-files" accept="audio/mpeg,.mp3" multiple>
        </label>
        <div id="bulk-local-review"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => closeBulkLocalAttachModal();
  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  modalEl.querySelector('#bulk-local-files').addEventListener('change', e => {
    selectedFiles = [...e.target.files];
    if (!selectedFiles.length) return;
    runMatching();
  });
}

// Only pre-select a candidate automatically when it's a confident match —
// weaker candidates still show up in the dropdown (so the user can pick
// them manually) but default to "Don't attach" rather than guessing wrong
// silently, per the "All Night Long" -> "...Shotgun.mp3" false-positive
// found during testing (0.33 score, only shared the word "All").
const AUTO_SELECT_THRESHOLD = 0.6;

function runMatching() {
  const state = getState();
  const songs = Object.values(state.songs).sort((a, b) => a.title.localeCompare(b.title));
  const fileNames = selectedFiles.map(f => f.name);
  const candidatesBySong = matchSongsToFiles(songs, fileNames);

  songChoices = new Map();
  for (const song of songs) {
    const candidates = candidatesBySong.get(song.songId) || [];
    const top = candidates[0];
    songChoices.set(song.songId, (top && top.score >= AUTO_SELECT_THRESHOLD) ? top.fileName : null);
  }

  renderReview(songs, candidatesBySong);
}

function renderReview(songs, candidatesBySong) {
  const container = modalEl.querySelector('#bulk-local-review');
  const withCandidates = songs.filter(s => (candidatesBySong.get(s.songId) || []).length > 0);
  const withoutCandidates = songs.filter(s => (candidatesBySong.get(s.songId) || []).length === 0);

  container.innerHTML = `
    <div class="field-label" style="margin-top:8px;">Review matches (${withCandidates.length} of ${songs.length} songs found a candidate)</div>
    <div class="bulk-audio-list">
      ${withCandidates.map(song => {
        const candidates = candidatesBySong.get(song.songId) || [];
        const already = hasLocalAudio(song.songId);
        return `
          <div class="bulk-audio-row">
            <span class="bulk-audio-filename" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}${already ? ' <span class="field-hint">(already attached)</span>' : ''}</span>
            <select class="bulk-audio-select" data-song-id="${song.songId}">
              <option value="">— Don't attach —</option>
              ${candidates.map(c => `<option value="${escapeHtml(c.fileName)}" ${c.fileName === songChoices.get(song.songId) ? 'selected' : ''}>${Math.round(c.score * 100)}% — ${escapeHtml(c.fileName)}</option>`).join('')}
            </select>
          </div>
        `;
      }).join('')}
    </div>
    ${withoutCandidates.length ? `
      <div class="field-label" style="margin-top:12px;">No file found for (${withoutCandidates.length})</div>
      <p class="field-hint">${withoutCandidates.map(s => escapeHtml(s.title)).join(', ')}</p>
    ` : ''}
    <button class="btn-link-open" id="bulk-local-attach-btn">Attach ${countChosen()} File${countChosen() === 1 ? '' : 's'}</button>
    <p class="field-hint" id="bulk-local-progress"></p>
  `;

  container.querySelectorAll('.bulk-audio-select').forEach(sel => {
    sel.addEventListener('change', () => {
      songChoices.set(sel.dataset.songId, sel.value || null);
      updateAttachButtonLabel();
    });
  });

  container.querySelector('#bulk-local-attach-btn').addEventListener('click', attachAll);
}

function countChosen() {
  return [...songChoices.values()].filter(Boolean).length;
}

function updateAttachButtonLabel() {
  const btn = modalEl?.querySelector('#bulk-local-attach-btn');
  if (!btn) return;
  const count = countChosen();
  btn.textContent = `Attach ${count} File${count === 1 ? '' : 's'}`;
}

async function attachAll() {
  const entries = [...songChoices.entries()].filter(([, fileName]) => fileName);
  if (!entries.length) return;

  const btn = modalEl.querySelector('#bulk-local-attach-btn');
  const progress = modalEl.querySelector('#bulk-local-progress');
  btn.disabled = true;

  let done = 0;
  for (const [songId, fileName] of entries) {
    const file = selectedFiles.find(f => f.name === fileName);
    if (!file) continue;
    attachLocalAudio(songId, file);
    done++;
    progress.textContent = `Attached ${done} of ${entries.length}…`;
  }

  progress.textContent = `Done — ${done} song${done === 1 ? '' : 's'} attached for this session.`;
  btn.disabled = false;
  btn.textContent = 'Attach Complete';
}

export function closeBulkLocalAttachModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
    document.body.classList.remove('modal-open');
  }
  selectedFiles = [];
  songChoices = new Map();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
