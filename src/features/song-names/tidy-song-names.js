// tidy-song-names.js — Add+ → Tidy Song Names: one-time review screen that
// splits old combined names ("Al Green - Let's Stay Together") into a Title
// and an Artist. Every split is only a guess, shown in editable boxes; nothing
// is saved until Save, and only the song's name fields are written (gigs,
// medleys, lyrics and audio are untouched — song ids never change).

import { getState, applySongNameFixes, loadSongLibrary } from '../../data/store.js';
import { guessSplit } from '../../lib/song-names.js';
import { toast } from '../../ui/output-helpers.js';

let overlayEl = null;

function closeModal() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
  document.body.classList.remove('modal-open');
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML.replace(/"/g, '&quot;');
}

export async function openTidySongNames() {
  await loadSongLibrary(); // the gig only holds its own songs; tidy the whole library
  closeModal();

  // Songs that already have an artist are done; the rest are candidates.
  const rows = Object.values(getState().songs)
    .filter(s => !s.artist)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(s => ({ song: s, ...guessSplit(s.title) }));
  const guessedCount = rows.filter(r => r.guessed).length;

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet add-song-sheet" role="dialog" aria-modal="true" aria-label="Tidy song names">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Tidy Song Names</h2>
      </div>
      <div class="modal-body">
        <p class="field-hint tidy-intro">Song names are split into <b>Title</b> and <b>Artist</b>. I guessed from " - " and trailing (parentheses), assuming <i>Artist - Title</i>. Fix anything wrong (⇄ swaps the two). Nothing changes until you tap Save.</p>
        ${rows.length ? `
          <label class="tidy-filter"><input type="checkbox" id="tidy-only-guessed" ${guessedCount ? 'checked' : ''}> Only show songs I found a split for (${guessedCount} of ${rows.length})</label>
          <div class="tidy-list">
            ${rows.map(r => `
              <div class="tidy-row${r.guessed ? ' tidy-guessed' : ''}" data-song-id="${r.song.songId}" data-guessed="${r.guessed ? 1 : 0}">
                <div class="tidy-was">${esc(r.song.title)}</div>
                <div class="tidy-inputs">
                  <div class="tidy-fields">
                    <input type="text" class="tidy-title" value="${esc(r.title)}" placeholder="Title" aria-label="Title">
                    <input type="text" class="tidy-artist" value="${esc(r.artist)}" placeholder="Artist" aria-label="Artist">
                  </div>
                  <button type="button" class="tidy-swap" aria-label="Swap title and artist" title="Swap title and artist">&#8645;</button>
                </div>
              </div>`).join('')}
          </div>
          <p class="field-error hidden" id="tidy-error"></p>
          <button class="btn-link-open" id="tidy-save">Save</button>`
        : '<p class="empty-hint">Every song already has an artist.</p>'}
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  overlayEl.querySelector('.modal-close').addEventListener('click', closeModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeModal(); });
  if (!rows.length) return;

  const rowEls = [...overlayEl.querySelectorAll('.tidy-row')];
  const onlyGuessed = overlayEl.querySelector('#tidy-only-guessed');
  const applyFilter = () => {
    for (const el of rowEls) el.classList.toggle('hidden', onlyGuessed.checked && el.dataset.guessed !== '1');
  };
  onlyGuessed.addEventListener('change', applyFilter);
  applyFilter();

  overlayEl.querySelectorAll('.tidy-swap').forEach(btn => btn.addEventListener('click', () => {
    const row = btn.closest('.tidy-row');
    const t = row.querySelector('.tidy-title');
    const a = row.querySelector('.tidy-artist');
    [t.value, a.value] = [a.value, t.value];
  }));

  const errorEl = overlayEl.querySelector('#tidy-error');
  const saveBtn = overlayEl.querySelector('#tidy-save');
  saveBtn.addEventListener('click', async () => {
    const fixes = rowEls.map(el => ({
      songId: el.dataset.songId,
      title: el.querySelector('.tidy-title').value.trim(),
      artist: el.querySelector('.tidy-artist').value.trim(),
      el,
    }));
    const blank = fixes.find(f => !f.title);
    if (blank) {
      errorEl.textContent = 'Every song needs a Title. Fill in the highlighted one (or put the original name back).';
      errorEl.classList.remove('hidden');
      blank.el.classList.remove('hidden');
      blank.el.querySelector('.tidy-title').focus();
      return;
    }
    errorEl.classList.add('hidden');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    const before = fixes.filter(f => {
      const s = getState().songs[f.songId];
      return s && (f.title !== s.title || f.artist !== (s.artist || ''));
    }).length;
    const failed = await applySongNameFixes(fixes);
    closeModal();
    toast(failed
      ? `Updated ${before} song${before === 1 ? '' : 's'}, but ${failed} didn't reach the cloud, so they only show correctly on this device for now.`
      : `Updated ${before} song${before === 1 ? '' : 's'}.`, 4000);
  });
}
