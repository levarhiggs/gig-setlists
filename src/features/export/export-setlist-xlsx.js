// export-setlist-xlsx.js — Export menu → Setlist to Excel: the open gig as an
// .xlsx in the Bulk Import layout, so it can be edited in Excel and brought
// back with Add+ → Bulk Import. Every placement is written (including songs
// marked done/cut), in the order the app shows them. Beyond the documented
// import columns it writes SET NAME and MEDLEY, which the importer also reads,
// so set names and medley groups survive the round trip. Keep in step with
// data/importer.js and the import-help overlay.

import { getState, getOrderedSets, getSongsForSet } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { fileSlug, downloadBlob, toast } from '../../ui/output-helpers.js';

export const SETLIST_COLUMNS = ['SET', 'SET NAME', 'SEQUENCE', 'SONGS', 'ARTIST', 'KEY', 'LEAD', 'NOTES', 'BPM', 'MEDLEY'];

// The importer names the new gig after the first tab, and Excel caps tab
// names at 31 characters and forbids  [ ] : * ? / \
function tabName(title) {
  return (title || 'Setlist').replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').slice(0, 31).trim() || 'Setlist';
}

export function buildSetlistRows() {
  const state = getState();
  if (!state.gig) return null;

  const rows = [SETLIST_COLUMNS];
  // Medley labels are numbered per gig in the order they first appear.
  const medleyNumber = new Map();

  getOrderedSets().forEach((set, setIndex) => {
    const ordered = sortInstancesForDisplay(getSongsForSet(set.setId), set.songOrderMode, state.songs);
    if (!ordered.length) {
      // An empty set would vanish on re-import without a row to carry it.
      rows.push([setIndex + 1, set.name || `Set ${setIndex + 1}`, null, null, null, null, null, null, null, null]);
      return;
    }
    ordered.forEach((inst, i) => {
      const song = state.songs[inst.songId];
      let medley = null;
      if (inst.linkId && state.links[inst.linkId]) {
        if (!medleyNumber.has(inst.linkId)) medleyNumber.set(inst.linkId, medleyNumber.size + 1);
        medley = `Medley ${medleyNumber.get(inst.linkId)}`;
      }
      rows.push([
        setIndex + 1,
        set.name || `Set ${setIndex + 1}`,
        i + 1,
        song?.title || '(unknown song)',
        song?.artist || null,
        inst.key || null,
        inst.lead || null,
        inst.notes || null,
        inst.bpm ?? null,
        medley,
      ]);
    });
  });

  return rows;
}

export function exportSetlistToExcel() {
  const state = getState();
  if (!state.gig) { toast('No gig loaded yet.'); return; }
  if (typeof XLSX === 'undefined') {
    toast("The Excel tools didn't load — connect to the internet once and try again.", 4200);
    return;
  }

  const rows = buildSetlistRows();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 36 }, { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 7 }, { wch: 11 }];
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabName(state.gig.name));

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileSlug(state.gig.name)}-setlist.xlsx`,
  );
  const songCount = rows.slice(1).filter(r => r[3]).length;
  toast(`Saved ${songCount} song${songCount === 1 ? '' : 's'} — edit in Excel, then Add+ → Bulk Import`, 4500);
}
