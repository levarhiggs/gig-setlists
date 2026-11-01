// add-menu.js — the "Add+" dropdown: New Gig, Add Set, Add Song, Bulk Import,
// Attach Audio, Open Saved Gig.

import { addSet } from '../data/store.js';
import { openNewGigModal } from '../features/new-gig/new-gig-modal.js';
import { saveBackup, chooseBackupFileToRestore } from '../features/backup/backup.js';
import { openTidySongNames } from '../features/song-names/tidy-song-names.js';
import { openSettings } from '../features/settings/settings-modal.js';
import { openMergeSongs } from '../features/merge-songs/merge-songs.js';
import { openImportHelp } from '../features/import-help/import-help.js';
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
        openNewGigModal();
      } else if (action === 'add-set') {
        addSet();
      } else if (action === 'add-song') {
        openAddSongModal();
      } else if (action === 'bulk-import') {
        onBulkImport?.();
      } else if (action === 'open-saved') {
        onOpenSaved?.();
      } else if (action === 'tidy-song-names') {
        openTidySongNames();
      } else if (action === 'merge-songs') {
        openMergeSongs();
      } else if (action === 'attach-audio') {
        openBulkLocalAttachModal();
      } else if (action === 'save-backup') {
        saveBackup();
      } else if (action === 'restore-backup') {
        chooseBackupFileToRestore();
      } else if (action === 'settings') {
        openSettings();
      }
    });
  });

  menu.querySelector('.dropdown-info')?.addEventListener('click', () => {
    closeMenu();
    openImportHelp();
  });
}
