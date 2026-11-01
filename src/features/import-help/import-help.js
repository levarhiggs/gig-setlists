// import-help.js — the (i) next to Add+ → Bulk Import: an overlay describing the
// Excel layout the importer accepts. Keep in step with data/importer.js.

let overlayEl = null;

const COLUMNS = [
  ['SET', 'The set number (1, 2, 3…).', 'Required. A row with no SET is skipped.'],
  ['SONGS', 'The song title only, kept exactly as typed (e.g. Let\'s Stay Together).', 'Required. A row with no title is skipped.'],
  ['ARTIST', 'The artist (e.g. Al Green).', 'Optional. Keep it out of SONGS.'],
  ['SEQUENCE', 'Order within the set.', 'Optional. If blank, the row order in the sheet is used.'],
  ['KEY', 'Free text, e.g. A > Bb.', 'Optional.'],
  ['LEAD', 'Free text, e.g. Clarence / Tatiana.', 'Optional.'],
  ['NOTES', 'Free text.', 'Optional. Never creates medley links; you link songs by hand.'],
  ['BPM', 'A number.', 'Optional.'],
  ['COUNT, EST.DURATION', 'Not used.', 'Leave them in or take them out.'],
];

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

export function openImportHelp() {
  closeModal();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Bulk import format">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Bulk Import Format</h2>
      </div>
      <div class="modal-body import-help">
        <p>Add+ → Bulk Import takes an Excel file (<b>.xlsx</b>). Put a header row on the <b>first sheet</b>, typed exactly as below (capital letters).</p>
        <table class="import-help-table">
          <thead><tr><th>Column</th><th>What to put there</th></tr></thead>
          <tbody>
            ${COLUMNS.map(([name, what, note]) => `
              <tr>
                <td><b>${name}</b></td>
                <td>${what}<br><span class="field-hint">${note}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <ul class="import-help-list">
          <li>Only the <b>first sheet</b> is read. Its tab name becomes the gig name.</li>
          <li>Sets are made from the distinct SET numbers, in ascending order, named Set 1, Set 2… Songs keep your sheet order.</li>
          <li>A row whose SONGS + ARTIST match a song already in your library reuses it, so its lyrics and audio carry over. Different spelling makes a new song. If ARTIST is blank and only one library song has that title, that song is reused.</li>
          <li>The import always creates a new gig. It never overwrites an existing one.</li>
        </ul>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');

  overlayEl.querySelector('.modal-close').addEventListener('click', closeModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeModal(); });
  document.addEventListener('keydown', onKey);
}
