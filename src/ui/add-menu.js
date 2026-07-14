// add-menu.js — the "Add+" dropdown: New Gig, Add Set, Add Song, Bulk Import.
// Only "Bulk Import" and "Add Set" are wired to real behavior so far;
// "New Gig" and "Add Song" are stubbed with a friendly not-yet-built message
// until their milestones land.

import { addSet } from '../data/store.js';
import { openAddSongModal } from '../features/add-song/add-song-modal.js';
import { openBulkLocalAttachModal } from '../features/bulk-audio/bulk-local-attach.js';

export function initAddMenu({ onBulkImport, onOpenSaved }) {
  const btn = document.getElementById('add-btn');
  const menu = document.getElementById('add-menu');
  if (!btn || !menu) return;

  function closeMenu() {
    menu.classList.add('hidden');
    document.removeEventListener('click', onOutsideClick);
  }
  function onOutsideClick(e) {
    if (!menu.contains(e.target) && e.target !== btn) closeMenu();
  }
  function openMenu() {
    menu.classList.remove('hidden');
    document.addEventListener('click', onOutsideClick);
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });

  menu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      closeMenu();
      const action = item.dataset.action;
      if (action === 'new-gig') {
        alert('New Gig — coming soon.');
      } else if (action === 'add-set') {
        addSet();
      } else if (action === 'add-song') {
        openAddSongModal();
      } else if (action === 'bulk-import') {
        onBulkImport?.();
      } else if (action === 'open-saved') {
        onOpenSaved?.();
      } else if (action === 'attach-audio') {
        openBulkLocalAttachModal();
      }
    });
  });
}
