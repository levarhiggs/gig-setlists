// new-gig-modal.js — Add+ → New Gig: name, optional description, and how many
// empty sets to start with. The new gig becomes the active gig; everything
// from the existing gig stays saved and reachable via Open Saved Gig.

import { createNewGig } from '../../data/store.js';

let overlayEl = null;

function closeModal() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    document.body.classList.remove('modal-open');
  }
}

export function openNewGigModal() {
  closeModal();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="New gig">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">New Gig</h2>
      </div>
      <div class="modal-body">
        <label class="field">
          <span class="field-label">Name <span class="field-hint">(required)</span></span>
          <input type="text" id="new-gig-name" placeholder="e.g. Saturday at The Blue Room">
        </label>
        <label class="field">
          <span class="field-label">Description</span>
          <textarea id="new-gig-desc" rows="2" placeholder="Optional"></textarea>
        </label>
        <label class="field">
          <span class="field-label">Number of sets</span>
          <select id="new-gig-sets">
            ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === 2 ? ' selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        <p class="field-hint">Your current gig stays saved — reopen it any time with Add+ → Open Saved Gig.</p>
        <p class="field-hint new-gig-error" id="new-gig-error" hidden></p>
        <button class="btn-link-open" id="new-gig-create">Create Gig</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  const nameInput = overlayEl.querySelector('#new-gig-name');
  const createBtn = overlayEl.querySelector('#new-gig-create');
  const errorEl = overlayEl.querySelector('#new-gig-error');
  nameInput.focus();

  overlayEl.querySelector('.modal-close').addEventListener('click', closeModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeModal(); });

  const submit = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = 'Give the gig a name first.';
      errorEl.hidden = false;
      nameInput.focus();
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';
    errorEl.hidden = true;
    try {
      await createNewGig({
        name,
        description: overlayEl.querySelector('#new-gig-desc').value.trim(),
        setCount: Number(overlayEl.querySelector('#new-gig-sets').value) || 2,
      });
      closeModal();
    } catch (err) {
      console.error('Create gig failed:', err);
      errorEl.textContent = "Couldn't save the new gig — check your connection and try again. Your current gig is unchanged.";
      errorEl.hidden = false;
      createBtn.disabled = false;
      createBtn.textContent = 'Create Gig';
    }
  };

  createBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}
