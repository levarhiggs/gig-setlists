// settings-modal.js — Add+ → Settings…: display preferences for this device.

import { getShowArtists, setShowArtists } from '../../lib/settings.js';

let overlayEl = null;

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

export function openSettings() {
  closeModal();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Settings</h2>
      </div>
      <div class="modal-body">
        <label class="settings-row">
          <span class="settings-text">
            <span class="settings-name">Show artist names</span>
            <span class="field-hint">On the setlist and in prints / exports. The song pickers always show artists. This setting is saved on this device only.</span>
          </span>
          <input type="checkbox" id="setting-show-artists" class="settings-switch" role="switch" ${getShowArtists() ? 'checked' : ''}>
        </label>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  overlayEl.querySelector('#setting-show-artists').addEventListener('change', e => setShowArtists(e.target.checked));
  overlayEl.querySelector('.modal-close').addEventListener('click', closeModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeModal(); });
  document.addEventListener('keydown', onKey);
}
