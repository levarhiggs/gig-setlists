// export-songs.js — Export menu → All Songs to Excel…: the whole song library
// as one .xlsx. Sheet 1 ("Songs") lists every song; if "include lyrics" is on,
// each song that has lyrics also gets its own tab, linked from the Songs sheet.
// Columns match the Bulk Import names (SONGS, ARTIST) so the sheet reads the same.

import { getState } from '../../data/store.js';
import { getAllSongs } from '../../firebase/sync.js';
import { downloadBlob, toast } from '../../ui/output-helpers.js';

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

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The full library from Firestore, with anything already in memory laid over
// it. Unlike loadSongLibrary() this THROWS when the read fails — a "complete"
// export that quietly holds only the songs of the open gig would be worse
// than none.
async function fetchFullLibrary() {
  const remote = await Promise.race([
    getAllSongs(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 15000)),
  ]);
  return Object.values({ ...remote, ...getState().songs });
}

function sortedSongs(songs) {
  return [...songs].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }) ||
    (a.artist || '').localeCompare(b.artist || '', undefined, { sensitivity: 'base' }));
}

// Excel tab names: ≤31 chars, none of  [ ] : * ? / \ , no leading/trailing
// apostrophe, and unique ignoring case.
function makeSheetName(song, used) {
  let base = (song.title || 'Untitled').replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Untitled';
  let name = base.slice(0, 31).trim();
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` ${n}`;
    name = base.slice(0, 31 - suffix.length).trim() + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

export function buildSongsWorkbook(songs, { includeLyrics }) {
  const list = sortedSongs(songs);
  const used = new Set(['songs']);
  const lyricSheets = [];

  const rows = [['SONGS', 'ARTIST', 'LYRICS', 'AUDIO']];
  for (const song of list) {
    let lyricsCell = song.lyrics ? 'Yes' : '';
    let sheetName = null;
    if (includeLyrics && song.lyrics) {
      sheetName = makeSheetName(song, used);
      lyricsCell = 'View';
      lyricSheets.push({ song, sheetName });
    }
    rows.push([song.title || '', song.artist || '', lyricsCell, song.audioUrl ? 'Yes' : '']);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 38 }, { wch: 26 }, { wch: 9 }, { wch: 9 }];
  ws['!autofilter'] = { ref: `A1:D${rows.length}` };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
  // Link each "View" cell to its lyrics tab.
  list.forEach((song, i) => {
    const hit = lyricSheets.find(l => l.song === song);
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 2 })];
    if (hit && cell) cell.l = { Target: `#'${hit.sheetName.replace(/'/g, "''")}'!A1` };
  });
  XLSX.utils.book_append_sheet(wb, ws, 'Songs');

  for (const { song, sheetName } of lyricSheets) {
    const head = song.artist ? `${song.title} – ${song.artist}` : (song.title || '');
    const lines = String(song.lyrics).replace(/\r\n?/g, '\n').split('\n');
    const data = [[head, '← All songs'], [''], ...lines.map(l => [l])];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = [{ wch: 70 }, { wch: 14 }];
    sheet['B1'].l = { Target: "#'Songs'!A1" };
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  }

  return { wb, total: list.length, lyricTabs: lyricSheets.length };
}

export async function openExportSongs() {
  closeModal();
  if (typeof XLSX === 'undefined') {
    toast("The Excel tools didn't load — connect to the internet once and try again.", 4200);
    return;
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Export all songs">
      <div class="modal-header">
        <button class="modal-close" aria-label="Close">&times;</button>
        <h2 class="modal-title">Export All Songs</h2>
      </div>
      <div class="modal-body">
        <p class="tidy-intro" id="exs-status">Loading your song library…</p>
        <label class="settings-row" id="exs-lyrics-row" style="display:none">
          <span class="settings-text">
            <span class="settings-name">Include lyrics</span>
            <span class="field-hint" id="exs-lyrics-hint"></span>
          </span>
          <input type="checkbox" id="exs-lyrics" class="settings-switch" role="switch" checked>
        </label>
      </div>
      <div class="add-song-footer">
        <button class="btn-link-open" id="exs-go" disabled>Export to Excel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  document.body.classList.add('modal-open');
  const root = overlayEl;

  root.querySelector('.modal-close').addEventListener('click', closeModal);
  root.addEventListener('click', e => { if (e.target === root) closeModal(); });
  document.addEventListener('keydown', onKey);

  const statusEl = root.querySelector('#exs-status');
  let songs;
  try {
    songs = await fetchFullLibrary();
  } catch (err) {
    console.warn('Export songs: library load failed', err);
    if (overlayEl !== root) return;
    statusEl.textContent = "Couldn't load the whole song library (check your connection). Nothing was exported — close this and try again.";
    return;
  }
  if (overlayEl !== root) return; // closed while loading

  const withLyrics = songs.filter(s => s.lyrics).length;
  if (!songs.length) { statusEl.textContent = 'There are no songs to export yet.'; return; }
  statusEl.textContent = `${songs.length} song${songs.length === 1 ? '' : 's'} in your library, ${withLyrics} with lyrics. The first sheet lists every song with its artist.`;

  const lyricsRow = root.querySelector('#exs-lyrics-row');
  const lyricsBox = root.querySelector('#exs-lyrics');
  if (withLyrics) {
    lyricsRow.style.display = '';
    root.querySelector('#exs-lyrics-hint').textContent =
      `Adds one extra tab per song that has lyrics (${withLyrics} tab${withLyrics === 1 ? '' : 's'}), linked from the song list.`;
  } else {
    lyricsBox.checked = false;
  }

  const go = root.querySelector('#exs-go');
  go.disabled = false;
  go.addEventListener('click', () => {
    try {
      const { wb, total, lyricTabs } = buildSongsWorkbook(songs, { includeLyrics: lyricsBox.checked });
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `GigSetlists-songs-${date}.xlsx`);
      closeModal();
      toast(`Saved ${total} songs${lyricTabs ? ` + ${lyricTabs} lyrics tab${lyricTabs === 1 ? '' : 's'}` : ''}`);
    } catch (err) {
      console.error('Export songs failed', err);
      statusEl.textContent = `Couldn't create the spreadsheet: ${err.message || err}`;
    }
  });
}
