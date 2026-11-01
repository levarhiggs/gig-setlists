// delete-gigs.js — Add+ → Delete Gigs…: tick old gigs, review what will go,
// delete. A backup file is saved first (once per visit); the backup can bring
// any gig back through Restore from Backup…. Only gigs are removed — songs,
// lyrics and audio live in the shared library and are never touched. At least
// one gig always stays (see deleteGigs() in data/store.js).

import { getState, deleteGigs } from '../../data/store.js';
import { listGigs, loadGigBundle } from '../../firebase/sync.js';
import { saveBackup } from '../backup/backup.js';
import { toast } from '../../ui/output-helpers.js';

let overlayEl = null;
let gigs = [];
let backedUp = false;
const selected = new Set();

function closeModal() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKey);
}

function onKey(e) {
  if (e.key === 'Escape') closeModal();
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML.replace(/"/g, '&quot;');
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function savedText(g) {
  const ms = g.updatedAt?.toMillis?.();
  return ms ? `last saved ${new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : '';
}

function setView(bodyHtml, footerHtml) {
  overlayEl.querySelector('.modal-body').innerHTML = bodyHtml;
  overlayEl.querySelector('.add-song-footer').innerHTML = footerHtml;
}

export async function openDeleteGigs() {
  closeModal();
  selected.clear();
  backedUp = false;

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet add-song-sheet" role="dialog" aria-modal="true" aria-label="Delete gigs">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Delete Gigs</h2>
      </div>
      <div class="modal-body"><p class="empty-hint">Loading your gigs…</p></div>
      <div class="add-song-footer"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');
  overlayEl.querySelector('.modal-close').addEventListener('click', closeModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeModal(); });
  document.addEventListener('keydown', onKey);

  await refreshList();
}

async function refreshList() {
  const root = overlayEl;
  try {
    gigs = (await listGigs()).filter(g => g.gigId);
  } catch (err) {
    console.error('Could not list gigs:', err);
    if (overlayEl === root) setView('<p class="empty-hint">Couldn\'t read your gigs — check your connection and try again.</p>', '');
    return;
  }
  if (overlayEl === root) renderPick();
}

// ── Step 1: choose gigs ─────────────────────────────────────────────────────

function renderPick() {
  const openId = getState().gig?.gigId;
  for (const id of [...selected]) if (!gigs.some(g => g.gigId === id)) selected.delete(id);

  if (gigs.length < 2) {
    setView(`<p class="empty-hint">${gigs.length ? 'You only have one gig, and at least one has to be kept.' : 'There are no gigs.'}</p>`, '');
    return;
  }

  setView(`
    <p class="field-hint tidy-intro">Tick the gigs to delete. Songs, lyrics and audio are <b>not</b> deleted — only the gig's sets and setlist. A backup file is saved first, and Restore from Backup… can bring a gig back.</p>
    <div class="stored-song-list">
      ${gigs.map(g => `
        <label class="stored-song-item">
          <input type="checkbox" class="stored-song-checkbox" data-gig-id="${esc(g.gigId)}" ${selected.has(g.gigId) ? 'checked' : ''}>
          <span class="stored-song-title">${esc(g.name || 'Untitled gig')}
            <span class="merge-meta">${[g.gigId === openId ? 'open now' : '', savedText(g), g.description ? esc(g.description) : ''].filter(Boolean).join(' · ')}</span>
          </span>
        </label>`).join('')}
    </div>
    <p class="field-hint stored-song-count" id="dg-count" aria-live="polite"></p>
  `, '<button class="btn-link-open" id="dg-next" disabled>Delete selected…</button>');

  const nextBtn = overlayEl.querySelector('#dg-next');
  const countEl = overlayEl.querySelector('#dg-count');
  const refresh = () => {
    countEl.textContent = selected.size ? `${plural(selected.size, 'gig')} selected` : '';
    nextBtn.disabled = selected.size === 0;
  };
  overlayEl.querySelectorAll('[data-gig-id]').forEach(box => box.addEventListener('change', () => {
    if (box.checked) selected.add(box.dataset.gigId); else selected.delete(box.dataset.gigId);
    refresh();
  }));
  refresh();

  nextBtn.addEventListener('click', renderConfirm);
}

// ── Step 2: review + delete ─────────────────────────────────────────────────

async function renderConfirm() {
  const root = overlayEl;
  const chosen = gigs.filter(g => selected.has(g.gigId));

  if (chosen.length === gigs.length) {
    setView(`<p class="empty-hint">You can't delete every gig — at least one has to be kept. Go back and untick one.</p>`,
      '<button class="btn-link-open" id="dg-back">Back</button>');
    overlayEl.querySelector('#dg-back').addEventListener('click', renderPick);
    return;
  }

  setView('<p class="empty-hint">Checking what\'s in these gigs…</p>', '');
  const counts = {};
  try {
    for (const g of chosen) {
      const b = await loadGigBundle(g.gigId, { withSongs: false });
      counts[g.gigId] = b ? `${plural(Object.keys(b.sets).length, 'set')}, ${plural(Object.keys(b.instances).length, 'song')}` : 'already empty';
    }
  } catch (err) {
    console.error('Could not read gigs before delete:', err);
    if (overlayEl === root) {
      setView('<p class="empty-hint">Couldn\'t read those gigs — nothing was deleted. Check your connection and try again.</p>',
        '<button class="btn-link-open" id="dg-back">Back</button>');
      overlayEl.querySelector('#dg-back').addEventListener('click', renderPick);
    }
    return;
  }
  if (overlayEl !== root) return;

  const openId = getState().gig?.gigId;
  setView(`
    <p class="field-hint tidy-intro"><b>Delete ${plural(chosen.length, 'gig')}?</b> This removes the sets and setlists for good, apart from the backup file saved first.</p>
    <div class="merge-summary">
      ${chosen.map(g => `<div><b>${esc(g.name || 'Untitled gig')}</b> — ${esc(counts[g.gigId])}</div>`).join('')}
      ${chosen.some(g => g.gigId === openId) ? '<div>The gig that\'s open now is included; the app will switch to your most recently saved remaining gig.</div>' : ''}
    </div>
    <p class="field-error hidden" id="dg-error"></p>
  `, `<div class="merge-footer-row">
        <button class="btn-link-open" id="dg-back">Back</button>
        <button class="btn-link-open btn-danger" id="dg-go">Delete ${plural(chosen.length, 'gig')}</button>
      </div>`);

  const backBtn = overlayEl.querySelector('#dg-back');
  const goBtn = overlayEl.querySelector('#dg-go');
  const errorEl = overlayEl.querySelector('#dg-error');
  const fail = msg => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };
  backBtn.addEventListener('click', renderPick);

  goBtn.addEventListener('click', async () => {
    errorEl.classList.add('hidden');
    goBtn.disabled = backBtn.disabled = true;

    if (!backedUp) {
      goBtn.textContent = 'Saving backup…';
      backedUp = await saveBackup();
      if (!backedUp) {
        fail("The backup couldn't be saved, so nothing was deleted. Check your connection and try again.");
        goBtn.textContent = `Delete ${plural(chosen.length, 'gig')}`;
        goBtn.disabled = backBtn.disabled = false;
        return;
      }
    }

    goBtn.textContent = 'Deleting…';
    try {
      const { deleted, failure } = await deleteGigs(chosen.map(g => g.gigId));
      deleted.forEach(id => selected.delete(id));
      if (failure) {
        console.error('Delete gigs stopped early:', failure);
        toast(`Deleted ${deleted.length} of ${chosen.length} — one didn't finish. It's still in the list; try again.`, 6000);
      } else {
        toast(`Deleted ${plural(deleted.length, 'gig')}`, 4000);
      }
      if (overlayEl === root) await refreshList();
    } catch (err) {
      console.error('Delete gigs failed:', err);
      fail(err?.message === 'At least one gig has to be kept.'
        ? 'At least one gig has to be kept.'
        : "Couldn't delete — nothing was removed. Check your connection and try again.");
      goBtn.textContent = `Delete ${plural(chosen.length, 'gig')}`;
      goBtn.disabled = backBtn.disabled = false;
    }
  });
}
