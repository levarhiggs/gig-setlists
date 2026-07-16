// activity-view.js — admin-only read-only screen listing who changed
// what and when (see firebase/activity-log.js for the write side). Not
// linked from anywhere visible to singers — opened via openActivityView()
// from a discreet trigger (5 taps on the app title, see main.js) so it
// stays out of their way entirely.

import { fetchRecentActivity } from '../../firebase/activity-log.js';

let modalEl = null;

export async function openActivityView() {
  closeActivityView();

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Activity log">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Activity Log</h2>
      </div>
      <div class="modal-body">
        <p class="field-hint">Who changed what, most recent first.</p>
        <div id="activity-list"><p class="field-hint">Loading…</p></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.classList.add('modal-open');

  const close = () => closeActivityView();
  modalEl.querySelector('.modal-close').addEventListener('click', close);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });

  try {
    const entries = await fetchRecentActivity();
    renderEntries(entries);
  } catch (err) {
    console.error('Failed to load activity log:', err);
    const list = modalEl?.querySelector('#activity-list');
    if (list) list.innerHTML = '<p class="field-hint">Couldn\'t load the activity log — see console for details.</p>';
  }
}

function renderEntries(entries) {
  const list = modalEl?.querySelector('#activity-list');
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = '<p class="field-hint">No activity recorded yet.</p>';
    return;
  }

  list.innerHTML = `
    <div class="activity-rows">
      ${entries.map(e => `
        <div class="activity-row">
          <div class="activity-row-top">
            <span class="activity-who">${escapeHtml(e.who || 'Unknown')}</span>
            <span class="activity-when">${formatWhen(e.createdAt)}</span>
          </div>
          <div class="activity-desc">${escapeHtml(e.description || e.action || '')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function formatWhen(ts) {
  const date = ts?.toDate?.() ?? null;
  if (!date) return '';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function closeActivityView() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
    document.body.classList.remove('modal-open');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
