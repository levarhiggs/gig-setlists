// set-menu.js — overflow menu behind a set block's ⋮ button: copy set to
// another gig, delete set, attribute display (key / lead / none).

import { deleteSet, setAttributeDisplay, copySetToGig } from '../../data/store.js';
import { listGigs } from '../../firebase/sync.js';

let menuEl = null;

function closeMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('click', onOutsideClick);
  }
}

function onOutsideClick(e) {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
}

export function openSetMenu(anchorBtn, set) {
  closeMenu();

  menuEl = document.createElement('div');
  menuEl.className = 'dropdown-menu set-overflow-menu';
  menuEl.innerHTML = `
    <button class="dropdown-item" data-action="attr-display">Attribute Display…</button>
    <button class="dropdown-item" data-action="copy-set">Copy Set to Another Gig…</button>
    <button class="dropdown-item dropdown-item-danger" data-action="delete-set">Delete Set</button>
  `;
  document.body.appendChild(menuEl);

  anchorBtn.scrollIntoView({ block: 'nearest' });
  const rect = anchorBtn.getBoundingClientRect();
  const menuHeight = menuEl.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;

  menuEl.style.position = 'fixed';
  menuEl.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  if (spaceBelow < menuHeight + 12) {
    // Not enough room below the button — open upward instead.
    menuEl.style.top = `${Math.max(8, rect.top - menuHeight - 6)}px`;
  } else {
    menuEl.style.top = `${rect.bottom + 6}px`;
  }

  setTimeout(() => document.addEventListener('click', onOutsideClick), 0);

  menuEl.querySelector('[data-action="delete-set"]').addEventListener('click', () => {
    closeMenu();
    const confirmed = confirm(`Delete "${set.name}" and all its songs from this gig? This can't be undone.`);
    if (confirmed) deleteSet(set.setId);
  });

  menuEl.querySelector('[data-action="attr-display"]').addEventListener('click', () => {
    closeMenu();
    openAttributeDisplayPicker(set);
  });

  menuEl.querySelector('[data-action="copy-set"]').addEventListener('click', () => {
    closeMenu();
    openCopySetPicker(set);
  });
}

function openAttributeDisplayPicker(set) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Attribute display">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Show on Song Rows</h2>
      </div>
      <div class="modal-body">
        <div class="link-group-list">
          <button class="link-group-item" data-mode="key">Key <span class="field-hint">(and BPM if set)</span></button>
          <button class="link-group-item" data-mode="lead">Artist / Lead Singer</button>
          <button class="link-group-item" data-mode="none">Nothing</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const close = () => { overlay.remove(); document.body.classList.remove('modal-open'); };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('[data-mode]').forEach(btn => {
    if (btn.dataset.mode === set.attributeDisplay) btn.classList.add('link-selected');
    btn.addEventListener('click', () => {
      setAttributeDisplay(set.setId, btn.dataset.mode);
      close();
    });
  });
}

async function openCopySetPicker(set) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Copy set to another gig">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Copy "${escapeHtml(set.name)}" to…</h2>
      </div>
      <div class="modal-body">
        <div class="field-label">Loading saved gigs…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const close = () => { overlay.remove(); document.body.classList.remove('modal-open'); };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const gigs = (await listGigs()).filter(g => g.gigId !== set.gigId);
  const body = overlay.querySelector('.modal-body');

  if (!gigs.length) {
    body.innerHTML = '<p class="empty-hint">No other saved gigs yet. Save this gig as a copy first to create another destination.</p>';
    return;
  }

  body.innerHTML = `
    <div class="link-group-list">
      ${gigs.map(g => `<button class="link-group-item" data-gig-id="${g.gigId}">${escapeHtml(g.name)}</button>`).join('')}
    </div>
  `;
  body.querySelectorAll('[data-gig-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      close();
      await copySetToGig(set.setId, btn.dataset.gigId);
      alert(`"${set.name}" copied.`);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
