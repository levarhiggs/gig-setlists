// importer.js — parses the Setlist Import.xlsx shape into Songs + Gig +
// Sets + Instances, per SETLIST_APP_HANDOFF.md §3.

import { makeSong, makeSongInstance, makeSet, makeGig, ORDER_STEP } from './models.js';
import { findMatchingSong } from '../lib/song-names.js';

// Some source spreadsheets carry mis-encoded apostrophes (curly quote
// round-tripped through the wrong codepage) — normalize to a straight one
// so titles/song ids are stable regardless of how the sheet was saved.
function cleanText(v) {
  if (v == null) return null;
  const s = String(v).replace(/�/g, "'").trim();
  return s === '' ? null : s;
}

function cleanNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// rows: array of objects with keys SET, COUNT, SEQUENCE, SONGS, ARTIST (optional),
// KEY, NOTES, LEAD, BPM, "EST.DURATION" (as produced by sheetToRows in xlsx.js).
// gigId, if provided, overrides the auto-derived id (e.g. for a fixed seed doc).
// existingSongs, if provided, is the current library: a row that is the same
// song (title + artist) reuses that record instead of creating a duplicate.
export function importGigFromRows(rows, gigName, gigId = null, existingSongs = null) {
  const songs = {};
  const sets = {};
  const instances = {};
  const gig = makeGig({ name: gigName });
  if (gigId) gig.gigId = gigId;

  // Group rows by SET, preserving sheet order within each set.
  const bySet = new Map();
  for (const row of rows) {
    const setNum = row.SET;
    if (setNum == null || setNum === '') continue;
    if (!bySet.has(setNum)) bySet.set(setNum, []);
    bySet.get(setNum).push(row);
  }

  const setNums = [...bySet.keys()].sort((a, b) => a - b);

  setNums.forEach((setNum, setIndex) => {
    const set = makeSet({
      gigId: gig.gigId,
      name: `Set ${setNum}`,
      order: setIndex,
      songOrderMode: 'custom', // §3.1: imported sets keep sheet order
    });
    sets[set.setId] = set;
    gig.sets.push(set.setId);

    const setRows = bySet.get(setNum);
    // §3.1: fall back to sheet row order within the set when SEQUENCE is blank.
    const ordered = [...setRows].sort((a, b) => {
      const sa = cleanNumber(a.SEQUENCE);
      const sb = cleanNumber(b.SEQUENCE);
      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return 0; // keep original sheet order (stable sort)
    });

    ordered.forEach((row, i) => {
      const title = cleanText(row.SONGS);
      if (!title) return;

      const artist = cleanText(row.ARTIST);
      const key = cleanText(row.KEY);
      const notes = cleanText(row.NOTES);
      const lead = cleanText(row.LEAD);
      const bpm = cleanNumber(row.BPM);

      // key/bpm/lead/notes are per-instance (this placement, in this
      // gig) — pass the row's values straight onto the instance. The
      // Song record still gets a copy of the FIRST row's values as a
      // starting "template" for future placements of this song to
      // pre-fill from, but is never treated as canonical.
      let song = findMatchingSong(songs, title, artist) || findMatchingSong(existingSongs, title, artist);
      if (!song) {
        song = makeSong({ title, artist, key, bpm, lead, notes });
        // Library songs are left out of the bundle, so their lyrics/audio stay as-is.
        song = songs[song.songId] || existingSongs?.[song.songId] || (songs[song.songId] = song);
      }

      const instance = makeSongInstance({
        songId: song.songId,
        setId: set.setId,
        order: (i + 1) * ORDER_STEP,
        key, bpm, lead, notes,
      });
      instances[instance.instanceId] = instance;
    });
  });

  return { gig, sets, instances, links: {}, songs };
}
