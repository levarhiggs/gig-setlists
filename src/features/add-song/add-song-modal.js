// add-song-modal.js — Add+ → Add Song: a two-column picker. Left column
// ("Stored Songs") lists every song in the library, alphabetized, with
// checkboxes for multi-select. Right column ("New Song") is a form for
// creating a brand-new song. Save adds every checked stored song plus
// (if filled in) the new song to a set the user then picks.

import { getState, addSongsToSet, loadSongLibrary } from '../../data/store.js';
import { nameKey } from '../../lib/song-names.js';

let modalEl = null;
const checkedSongIds = new Set();

export async function openAddSongModal() {
  // The gig only holds the songs it uses; pull in the whole library first.
  await loadSongLibrary();
  closeAddSongModal();
  checkedSongIds.clear();

  const state = getState();
  const allSongs = Object.values(state.songs).sort((a, b) => a.title.localeCompare(b.title));

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-sheet add-song-sheet" role="dialog" aria-modal="true" aria-label="Add song">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Add Song</h2>
      </div>
      <div class="modal-body add-song-columns">
        <div class="add-song-col">
          <h3 class="add-song-col-header">Stored Songs</h3>
          ${allSongs.length ? `
            <input type="search" id="stored-song-search" class="stored-song-search" placeholder="Search songs…" autocomplete="off" aria-label="Search stored songs">
            <p class="field-hint stored-song-count" id="stored-song-count" aria-live="polite"></p>` : ''}
          <div class="stored-song-list">
            ${allSongs.length ? allSongs.map(s => `
              <label class="stored-song-item" data-search="${escapeAttr(`${s.title} ${s.artist || ''}`.toLowerCase())}">
                <input type="checkbox" class="stored-song-checkbox" data-song-id="${s.songId}">
                <span class="stored-song-title">${escapeHtml(s.title)}${s.artist ? ` <span class="stored-song-artist">${escapeHtml(s.artist)}</span>` : ''}</span>
              </label>
            `).join('') + '<p class="empty-hint stored-song-nomatch hidden">No songs match.</p>' : '<p class="empty-hint">No songs in the library yet.</p>'}
          </div>
        </div>
        <div class="add-song-col">
          <h3 class="add-song-col-header">New Song</h3>
          <label class="field">
            <span class="field-label">Title <span class="field-hint">(required)</span></span>
            <input type="text" id="new-song-title" placeholder="Song title (without the artist)">
          </label>
          <label class="field">
            <span class="field-label">Artist</span>
            <input type="text" id="new-song-artist" placeholder="Optional">
          </label>
          <label class="field">
            <span class="field-label">Key</span>
            <input type="text" id="new-song-key" placeholder="e.g. Bb or A > Bb">
          </label>
          <label class="field">
            <span class="field-label">BPM</span>
            <input type="number" id="new-song-bpm" inputmode="numeric" placeholder="—">
          </label>
          <label class="field">
            <span class="field-label">Lead / Singer</span>
            <input type="text" id="new-song-lead" placeholder="e.g. Clarence / Tatiana">
          </label>
          <label class="field">
            <span class="field-label">Notes</span>
            <textarea id="new-song-notes" rows="3" placeholder="Transition cues, reminders…"></textarea>
          </label>
          <label class="field">
            <span class="field-label">Lyrics</span>
            <textarea id="new-song-lyrics" rows="6" placeholder="Paste or type lyrics…"></textarea>
          </label>
          <p class="field-error hidden" id="new-song-error">Title is required if adding a new song.</p>
        </div>
      </div>
      <div class="add-song-footer">
        <button class="btn-link-open" id="add-song-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => closeAddSongModal();
  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  // Search: show only songs whose title or artist contains the typed text
  // (any position, any case; punctuation like apostrophes is ignored).
  // Rows are hidden, not removed, so ticked songs stay ticked while filtering.
  const searchEl = modalEl.querySelector('#stored-song-search');
  const countEl = modalEl.querySelector('#stored-song-count');
  const noMatchEl = modalEl.querySelector('.stored-song-nomatch');
  const rows = [...modalEl.querySelectorAll('.stored-song-item')];

  const applyFilter = () => {
    if (!searchEl) return;
    const q = searchEl.value.trim().toLowerCase();
    const qKey = nameKey(q);
    let shown = 0;
    for (const row of rows) {
      const hay = row.dataset.search;
      const match = !q || hay.includes(q) || (qKey && nameKey(hay).includes(qKey));
      row.classList.toggle('hidden', !match);
      if (match) shown++;
    }
    noMatchEl?.classList.toggle('hidden', shown > 0);
    const sel = checkedSongIds.size ? ` · ${checkedSongIds.size} selected` : '';
    countEl.textContent = (q ? `${shown} of ${rows.length} songs` : `${rows.length} songs`) + sel;
  };
  searchEl?.addEventListener('input', applyFilter);
  applyFilter();

  modalEl.querySelectorAll('.stored-song-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) checkedSongIds.add(cb.dataset.songId);
      else checkedSongIds.delete(cb.dataset.songId);
      applyFilter();
    });
  });

  modalEl.querySelector('#add-song-save').addEventListener('click', () => {
    const title = modalEl.querySelector('#new-song-title').value.trim();
    const hasNewSong = title.length > 0;
    const hasSelection = checkedSongIds.size > 0;

    if (!hasNewSong && !hasSelection) {
      const errorEl = modalEl.querySelector('#new-song-error');
      errorEl.textContent = 'Select at least one stored song or enter a new song title.';
      errorEl.classList.remove('hidden');
      return;
    }

    const newSongFields = hasNewSong ? {
      title,
      artist: modalEl.querySelector('#new-song-artist').value.trim() || null,
      key: modalEl.querySelector('#new-song-key').value.trim() || null,
      bpm: modalEl.querySelector('#new-song-bpm').value.trim() || null,
      lead: modalEl.querySelector('#new-song-lead').value.trim() || null,
      notes: modalEl.querySelector('#new-song-notes').value.trim() || null,
      lyrics: modalEl.querySelector('#new-song-lyrics').value.trim() || null,
    } : null;

    const existingSongIds = [...checkedSongIds];

    closeAddSongModal();
    openSetPicker({ existingSongIds, newSongFields });
  });
}

function openSetPicker({ existingSongIds, newSongFields }) {
  const state = getState();
  const sets = Object.values(state.sets).sort((a, b) => a.order - b.order);

  const count = existingSongIds.length + (newSongFields ? 1 : 0);
  const label = count === 1
    ? (newSongFields ? `"${newSongFields.title}"` : `"${state.songs[existingSongIds[0]]?.title}"`)
    : `${count} songs`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Choose a set">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Add ${escapeHtml(label)} to which set?</h2>
      </div>
      <div class="modal-body">
        <div class="link-group-list">
          ${sets.length
            ? sets.map(s => `<button class="link-group-item" data-set-id="${s.setId}">${escapeHtml(s.name)}</button>`).join('')
            : '<p class="empty-hint">No sets yet — add one first.</p>'}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const close = () => { overlay.remove(); document.body.classList.remove('modal-open'); };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('[data-set-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      close();
      addSongsToSet({ existingSongIds, newSongFields }, btn.dataset.setId);
    });
  });
}

export function closeAddSongModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
    document.body.classList.remove('modal-open');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
