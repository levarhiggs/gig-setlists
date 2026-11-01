// backup.js — Add+ → Save Backup… / Restore from Backup…
//
// The app has no version history, so a backup file is the only way back to
// an earlier state. Save Backup writes every gig plus the whole song library
// to one .json file. Restore never overwrites: it adds one gig from the file
// as a new "(restored)" gig and only fills in songs the library is missing.

import { fetchFullBackup, BACKUP_FORMAT } from '../../firebase/sync.js';
import { restoreGigFromBackup } from '../../data/store.js';
import { downloadBlob, toast } from '../../ui/output-helpers.js';

const BACKUP_TIMEOUT_MS = 60000;

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function saveBackup() {
  toast('Preparing backup…', 15000);
  try {
    const backup = await Promise.race([
      fetchFullBackup(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out reading your data')), BACKUP_TIMEOUT_MS)),
    ]);
    const json = JSON.stringify(backup, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `GigSetlists-backup-${today()}.json`);
    const songCount = Object.keys(backup.songs).length;
    toast(`Backup saved — ${backup.gigs.length} gig${backup.gigs.length === 1 ? '' : 's'}, ${songCount} songs`, 4000);
  } catch (err) {
    console.error('Backup failed:', err);
    toast("Couldn't create the backup — check your connection and try again.", 5000);
  }
}

// ── Restore ──────────────────────────────────────────────────────────────────

let overlayEl = null;

function closeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    document.body.classList.remove('modal-open');
  }
}

function isValidBackup(data) {
  return data && data.format === BACKUP_FORMAT && Array.isArray(data.gigs)
    && data.gigs.every(g => g?.gig && g.sets && g.instances);
}

export function chooseBackupFileToRestore() {
  document.getElementById('restore-file-input')?.remove();
  const input = document.createElement('input');
  input.id = 'restore-file-input';
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      backup = null;
    }
    if (!isValidBackup(backup)) {
      alert("That file isn't a Gig Setlists backup.");
      return;
    }
    openRestorePicker(backup);
  });
  input.click();
}

function openRestorePicker(backup) {
  closeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';

  const when = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'unknown date';
  const rows = backup.gigs.map((entry, i) => {
    const sets = Object.keys(entry.sets).length;
    const songs = Object.keys(entry.instances).length;
    return `
      <button class="link-group-item" data-index="${i}">
        <span class="link-group-info">
          <span class="link-group-set">${sets} set${sets === 1 ? '' : 's'} · ${songs} song${songs === 1 ? '' : 's'}${entry.gig.description ? ' · ' + escapeHtml(entry.gig.description) : ''}</span>
          <span class="link-group-titles">${escapeHtml(entry.gig.name || '(untitled)')}</span>
        </span>
      </button>`;
  }).join('');

  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Restore from backup">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Restore from Backup</h2>
      </div>
      <div class="modal-body">
        <p class="field-hint">Backup from ${escapeHtml(when)}. Pick a gig to bring back — it's added as a new "(restored)" gig and nothing you have now is changed.</p>
        <div class="link-group-list">${rows || '<p class="empty-hint">This backup has no gigs.</p>'}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');
  overlayEl.querySelector('.modal-close').addEventListener('click', closeOverlay);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeOverlay(); });

  overlayEl.querySelectorAll('[data-index]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entry = backup.gigs[Number(btn.dataset.index)];
      closeOverlay();
      toast('Restoring…', 30000);
      try {
        const gig = await restoreGigFromBackup(backup, entry);
        toast(`Restored as "${gig.name}"`, 4000);
      } catch (err) {
        console.error('Restore failed:', err);
        toast("Couldn't restore that gig — nothing was changed.", 5000);
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
