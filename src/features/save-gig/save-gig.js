// save-gig.js — Save button dialog (title + Overwrite/Save-as-copy) and
// the Add+ "Open Saved Gig…" picker (§9).

import { getState, saveGigAsCopy, overwriteCurrentGig } from '../../data/store.js';
import { listGigs, loadGigBundle } from '../../firebase/sync.js';

let overlayEl = null;

function closeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    document.body.classList.remove('modal-open');
  }
}

export function openSaveDialog({ onSaved } = {}) {
  closeOverlay();
  const state = getState();
  if (!state.gig) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Save gig">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Save Gig</h2>
      </div>
      <div class="modal-body">
        <label class="field">
          <span class="field-label">Title</span>
          <input type="text" id="save-gig-title" value="${escapeAttr(state.gig.name)}">
        </label>
        <label class="field">
          <span class="field-label">Description</span>
          <textarea id="save-gig-desc" rows="2">${escapeHtml(state.gig.description || '')}</textarea>
        </label>
        <button class="btn-link-open" id="save-gig-overwrite">Overwrite This Gig</button>
        <button class="btn-link-open" id="save-gig-copy">Save as New Copy</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  overlayEl.querySelector('.modal-close').addEventListener('click', closeOverlay);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeOverlay(); });

  const getFields = () => ({
    title: overlayEl.querySelector('#save-gig-title').value.trim() || state.gig.name,
    desc: overlayEl.querySelector('#save-gig-desc').value.trim(),
  });

  overlayEl.querySelector('#save-gig-overwrite').addEventListener('click', async () => {
    const { title, desc } = getFields();
    closeOverlay();
    await overwriteCurrentGig(title, desc);
    onSaved?.({ mode: 'overwrite' });
  });

  overlayEl.querySelector('#save-gig-copy').addEventListener('click', async () => {
    const { title, desc } = getFields();
    closeOverlay();
    const newGig = await saveGigAsCopy(title, desc);
    onSaved?.({ mode: 'copy', gig: newGig });
  });
}

export async function openLoadGigPicker({ onLoad }) {
  closeOverlay();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Open saved gig">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Open Saved Gig</h2>
      </div>
      <div class="modal-body">
        <div class="field-label">Loading…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');
  overlayEl.querySelector('.modal-close').addEventListener('click', closeOverlay);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeOverlay(); });

  const gigs = await listGigs();
  if (!overlayEl) return; // closed while loading

  const body = overlayEl.querySelector('.modal-body');
  if (!gigs.length) {
    body.innerHTML = '<p class="empty-hint">No saved gigs yet.</p>';
    return;
  }

  body.innerHTML = `
    <div class="link-group-list">
      ${gigs.map(g => `
        <button class="link-group-item" data-gig-id="${g.gigId}">
          <span class="link-group-info">
            <span class="link-group-set">${g.description ? escapeHtml(g.description) : ''}</span>
            <span class="link-group-titles">${escapeHtml(g.name)}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;
  body.querySelectorAll('.link-group-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gigId = btn.dataset.gigId;
      closeOverlay();
      const bundle = await loadGigBundle(gigId);
      if (bundle) onLoad?.(bundle);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(val) {
  return escapeHtml(val == null ? '' : String(val));
}
