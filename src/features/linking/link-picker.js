// link-picker.js — small overlay shown when the link-mode icon is tapped:
// choose "New Group" or pick an existing group to edit.

import { listExistingGroups, startNewGroup, startEditGroup } from './linking.js';

let overlayEl = null;

export function openLinkPicker() {
  closeLinkPicker();

  const groups = listExistingGroups();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Link groups">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Medley Groups</h2>
      </div>
      <div class="modal-body">
        <button class="btn-link-open" id="link-picker-new">+ New Group</button>
        ${groups.length ? '<div class="field-label" style="margin-top:8px;">Edit existing group</div>' : ''}
        <div class="link-group-list">
          ${groups.map(g => `
            <button class="link-group-item" data-link-id="${g.linkId}">
              <span class="link-dot" style="background:${g.color}"></span>
              <span class="link-group-info">
                <span class="link-group-set">${escapeHtml(g.setName)}</span>
                <span class="link-group-titles">${escapeHtml(g.titles.join(', '))}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  overlayEl.querySelector('.modal-close').addEventListener('click', closeLinkPicker);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeLinkPicker(); });

  overlayEl.querySelector('#link-picker-new').addEventListener('click', () => {
    closeLinkPicker();
    startNewGroup();
  });

  overlayEl.querySelectorAll('.link-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeLinkPicker();
      startEditGroup(btn.dataset.linkId);
    });
  });
}

export function closeLinkPicker() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    document.body.classList.remove('modal-open');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
