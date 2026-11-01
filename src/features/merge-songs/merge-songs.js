// merge-songs.js — Add+ → Merge Duplicate Songs: tick songs that are really
// the same song, pick the one to keep, and every gig that used any of them
// uses the kept one; the extras are deleted. A backup file is saved first
// (once per visit to this screen) and nothing is deleted until every
// placement has been repointed — see mergeSongs() in data/store.js.

import { getState, loadSongLibrary, getSongUsage, mergeSongs } from '../../data/store.js';
import { saveBackup } from '../backup/backup.js';
import { findDuplicateGroups, effectiveNames, nameKey } from '../../lib/song-names.js';
import { toast } from '../../ui/output-helpers.js';

let overlayEl = null;
let usage = {};
let backedUp = false;
const selected = new Set();

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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function nameHtml(song) {
  return `${esc(song.title)}${song.artist ? ` <span class="stored-song-artist">${esc(song.artist)}</span>` : ''}`;
}

function metaText(song) {
  const u = usage[song.songId];
  const parts = [u ? `${plural(u.gigs, 'gig')}, ${plural(u.placements, 'placement')}` : 'not in any gig'];
  if (song.lyrics) parts.push('lyrics');
  if (song.audioUrl) parts.push('audio');
  return parts.join(' · ');
}

// Which of the chosen songs to keep by default: the one with the most to lose.
function keeperScore(song) {
  const u = usage[song.songId];
  return (song.lyrics ? 1000 : 0) + (song.audioUrl ? 500 : 0) + (song.artist ? 100 : 0) + (u ? u.placements : 0);
}

function setView(bodyHtml, footerHtml) {
  overlayEl.querySelector('.modal-body').innerHTML = bodyHtml;
  overlayEl.querySelector('.add-song-footer').innerHTML = footerHtml;
}

export async function openMergeSongs() {
  closeModal();
  selected.clear();
  backedUp = false;

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet add-song-sheet" role="dialog" aria-modal="true" aria-label="Merge duplicate songs">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Merge Duplicate Songs</h2>
      </div>
      <div class="modal-body"><p class="empty-hint">Loading your songs…</p></div>
      <div class="add-song-footer"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');
  overlayEl.querySelector('.modal-close').addEventListener('click', closeModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeModal(); });

  await loadSongLibrary();
  try {
    usage = await getSongUsage();
  } catch (err) {
    console.error('Could not read gigs for merge:', err);
    if (overlayEl) setView('<p class="empty-hint">Couldn\'t read your gigs — check your connection and try again. (Merging needs to see every gig.)</p>', '');
    return;
  }
  if (overlayEl) renderPick();
}

// ── Step 1: choose which songs are the same ─────────────────────────────────

function renderPick() {
  const songs = Object.values(getState().songs).sort((a, b) => a.title.localeCompare(b.title));
  const groups = findDuplicateGroups(getState().songs);

  setView(`
    <p class="field-hint tidy-intro">Tick the songs that are really the <b>same song</b>, then tap Merge. Every gig using any of them will use the one you keep, and the extras are deleted. A backup file is saved first.</p>
    ${groups.length ? `
      <h3 class="add-song-col-header">Suggested duplicates (${groups.length})</h3>
      ${groups.map((g, i) => `
        <div class="merge-group">
          <div class="merge-group-names">${g.map(s => `<div>${nameHtml(s)}</div>`).join('')}</div>
          <button type="button" class="btn-link-open merge-select-group" data-group="${i}">Select these</button>
        </div>`).join('')}`
      : '<p class="field-hint">No obvious duplicates found. You can still tick any songs below.</p>'}
    <h3 class="add-song-col-header">All songs</h3>
    <input type="search" id="merge-search" class="stored-song-search" placeholder="Search songs…" autocomplete="off" aria-label="Search songs">
    <p class="field-hint stored-song-count" id="merge-count" aria-live="polite"></p>
    <div class="stored-song-list">
      ${songs.map(s => `
        <label class="stored-song-item merge-item" data-search="${esc(`${s.title} ${s.artist || ''}`.toLowerCase())}">
          <input type="checkbox" class="stored-song-checkbox" data-song-id="${s.songId}" ${selected.has(s.songId) ? 'checked' : ''}>
          <span class="stored-song-title">${nameHtml(s)}<span class="merge-meta">${esc(metaText(s))}</span></span>
        </label>`).join('')}
      <p class="empty-hint stored-song-nomatch hidden">No songs match.</p>
    </div>
  `, '<button class="btn-link-open" id="merge-next" disabled>Merge selected…</button>');

  const rows = [...overlayEl.querySelectorAll('.merge-item')];
  const searchEl = overlayEl.querySelector('#merge-search');
  const countEl = overlayEl.querySelector('#merge-count');
  const noMatchEl = overlayEl.querySelector('.stored-song-nomatch');
  const nextBtn = overlayEl.querySelector('#merge-next');

  const refresh = () => {
    const q = searchEl.value.trim().toLowerCase();
    const qKey = nameKey(q);
    let shown = 0;
    for (const row of rows) {
      const hay = row.dataset.search;
      const match = !q || hay.includes(q) || (qKey && nameKey(hay).includes(qKey));
      row.classList.toggle('hidden', !match);
      if (match) shown++;
    }
    noMatchEl.classList.toggle('hidden', shown > 0);
    countEl.textContent = `${q ? `${shown} of ${rows.length}` : rows.length} songs${selected.size ? ` · ${selected.size} selected` : ''}`;
    nextBtn.disabled = selected.size < 2;
    nextBtn.textContent = selected.size >= 2 ? `Merge ${selected.size} selected…` : 'Merge selected…';
  };
  searchEl.addEventListener('input', refresh);

  overlayEl.querySelectorAll('.stored-song-checkbox').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) selected.add(cb.dataset.songId);
    else selected.delete(cb.dataset.songId);
    refresh();
  }));

  overlayEl.querySelectorAll('.merge-select-group').forEach(btn => btn.addEventListener('click', () => {
    selected.clear();
    for (const s of groups[Number(btn.dataset.group)]) selected.add(s.songId);
    overlayEl.querySelectorAll('.stored-song-checkbox').forEach(cb => { cb.checked = selected.has(cb.dataset.songId); });
    refresh();
    nextBtn.scrollIntoView({ block: 'nearest' });
  }));

  nextBtn.addEventListener('click', renderConfirm);
  refresh();
}

// ── Step 2: pick the keeper and confirm ─────────────────────────────────────

function renderConfirm() {
  const songsById = getState().songs;
  const members = [...selected].map(id => songsById[id]).filter(Boolean);
  if (members.length < 2) { renderPick(); return; }
  let keepId = [...members].sort((a, b) => keeperScore(b) - keeperScore(a))[0].songId;
  let dirty = false;

  const prefill = () => {
    const keeper = songsById[keepId];
    const eff = effectiveNames(keeper);
    const artist = eff.artist || members.map(m => effectiveNames(m).artist).find(Boolean) || '';
    return { title: eff.title, artist };
  };

  setView(`
    <p class="field-hint tidy-intro">Choose the song to <b>keep</b>. Its record survives; the others are deleted, and every gig placement is moved to it.</p>
    <div class="merge-keep-list">
      ${members.map(s => `
        <label class="merge-keep">
          <input type="radio" name="merge-keep" value="${s.songId}" ${s.songId === keepId ? 'checked' : ''}>
          <span class="stored-song-title">${nameHtml(s)}<span class="merge-meta">${esc(metaText(s))}</span></span>
        </label>`).join('')}
    </div>
    <label class="field">
      <span class="field-label">Title of the merged song</span>
      <input type="text" id="merge-title">
    </label>
    <label class="field">
      <span class="field-label">Artist</span>
      <input type="text" id="merge-artist" placeholder="Optional">
    </label>
    <div class="field-hint merge-summary" id="merge-summary"></div>
    <p class="field-error hidden" id="merge-error"></p>
  `, `
    <div class="merge-footer-row">
      <button class="btn-link-open" id="merge-back">Back</button>
      <button class="btn-link-open merge-go" id="merge-go">Merge</button>
    </div>
  `);

  const titleEl = overlayEl.querySelector('#merge-title');
  const artistEl = overlayEl.querySelector('#merge-artist');
  const summaryEl = overlayEl.querySelector('#merge-summary');
  const errorEl = overlayEl.querySelector('#merge-error');
  const goBtn = overlayEl.querySelector('#merge-go');
  const backBtn = overlayEl.querySelector('#merge-back');

  const fillFields = () => { const p = prefill(); titleEl.value = p.title; artistEl.value = p.artist; };
  const updateSummary = () => {
    const keeper = songsById[keepId];
    const others = members.filter(m => m.songId !== keepId);
    const moved = others.reduce((n, m) => n + (usage[m.songId]?.placements || 0), 0);
    const source = field => [keeper, ...others].find(s => s[field]);
    const conflict = field => others.some(o => o[field] && o[field] !== source(field)[field]);
    const line = (label, field) => {
      const src = source(field);
      if (!src) return `${label}: none`;
      const from = src === keeper ? 'from the kept song' : `taken from "${src.title}"`;
      return `${label}: ${from}${conflict(field) ? ' (a different copy on another song is dropped)' : ''}`;
    };
    summaryEl.innerHTML = [
      `<div>Moves <b>${plural(moved, 'placement')}</b> onto the kept song and deletes <b>${plural(others.length, 'song record')}</b>.</div>`,
      `<div>${esc(line('Lyrics', 'lyrics'))}</div>`,
      `<div>${esc(line('Audio', 'audioUrl'))}</div>`,
    ].join('');
  };

  fillFields();
  updateSummary();
  titleEl.addEventListener('input', () => { dirty = true; });
  artistEl.addEventListener('input', () => { dirty = true; });
  overlayEl.querySelectorAll('input[name="merge-keep"]').forEach(r => r.addEventListener('change', () => {
    keepId = r.value;
    if (!dirty) fillFields();
    updateSummary();
  }));

  backBtn.addEventListener('click', renderPick);

  goBtn.addEventListener('click', async () => {
    const title = titleEl.value.trim();
    if (!title) {
      errorEl.textContent = 'The merged song needs a title.';
      errorEl.classList.remove('hidden');
      titleEl.focus();
      return;
    }
    errorEl.classList.add('hidden');
    goBtn.disabled = backBtn.disabled = true;

    if (!backedUp) {
      goBtn.textContent = 'Saving backup…';
      backedUp = await saveBackup();
      if (!backedUp) {
        errorEl.textContent = "The backup couldn't be saved, so nothing was changed. Check your connection and try again.";
        errorEl.classList.remove('hidden');
        goBtn.textContent = 'Merge';
        goBtn.disabled = backBtn.disabled = false;
        return;
      }
    }

    goBtn.textContent = 'Merging…';
    try {
      const removeIds = members.map(m => m.songId).filter(id => id !== keepId);
      const result = await mergeSongs({ keepId, removeIds, title, artist: artistEl.value });
      toast(`Merged ${plural(result.removed + 1, 'song')} into "${title}" — ${plural(result.moved, 'placement')} updated.`, 5000);
      selected.clear();
      try { usage = await getSongUsage(); } catch { /* counts are cosmetic; the next open refreshes them */ }
      if (overlayEl) renderPick();
    } catch (err) {
      console.error('Merge failed:', err);
      errorEl.textContent = "The merge didn't finish. Nothing was deleted, and you can safely tap Merge again.";
      errorEl.classList.remove('hidden');
      goBtn.textContent = 'Merge';
      goBtn.disabled = backBtn.disabled = false;
    }
  });
}
