// song-names.js — Title / Artist helpers. A song's `title` is the song name
// alone (required); `artist` is optional and lives in its own field.

// Comparison key: case, apostrophes and punctuation don't matter.
export function nameKey(s) {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "Title – Artist" for places that show one line (exports, pickers).
export function songLabel(song) {
  if (!song) return '';
  return song.artist ? `${song.title} – ${song.artist}` : (song.title || '');
}

// Finds a library song that is the same song as title+artist, so adding or
// importing never creates a second copy. Exact title+artist match wins;
// otherwise a lone same-title song is reused when either side has no artist.
export function findMatchingSong(songs, title, artist) {
  const nt = nameKey(title);
  if (!nt) return null;
  const na = nameKey(artist);
  const sameTitle = Object.values(songs || {}).filter(s => nameKey(s.title) === nt);
  const exact = sameTitle.find(s => nameKey(s.artist) === na);
  if (exact) return exact;
  if (sameTitle.length === 1 && (!na || !nameKey(sameTitle[0].artist))) return sameTitle[0];
  return null;
}

// The Title/Artist a song is effectively known by, for comparison only: its
// own fields when it has an artist, otherwise a guess from the old combined
// name ("Stevie Wonder - Superstition" → Superstition / Stevie Wonder).
export function effectiveNames(song) {
  if (song.artist) return { title: song.title, artist: song.artist };
  const g = guessSplit(song.title);
  return { title: g.title, artist: g.artist };
}

// Suggests songs that look like the same song: same title (ignoring case and
// punctuation) and the same artist, or an artist missing on one side. Two
// different named artists never group together ("Hello" by Adele vs Lionel
// Richie), and a song with no artist is only added when exactly one artist
// is named for that title, otherwise it's ambiguous and left out.
// Returns arrays of 2+ songs, sorted by title.
export function findDuplicateGroups(songs) {
  const byTitle = new Map();
  for (const song of Object.values(songs)) {
    const { title, artist } = effectiveNames(song);
    const tk = nameKey(title);
    if (!tk) continue;
    if (!byTitle.has(tk)) byTitle.set(tk, []);
    byTitle.get(tk).push({ song, ak: nameKey(artist) });
  }
  const groups = [];
  for (const members of byTitle.values()) {
    if (members.length < 2) continue;
    const byArtist = new Map();
    const blank = [];
    for (const m of members) {
      if (!m.ak) { blank.push(m); continue; }
      if (!byArtist.has(m.ak)) byArtist.set(m.ak, []);
      byArtist.get(m.ak).push(m);
    }
    const named = [...byArtist.values()];
    if (named.length === 0) groups.push(blank);
    else if (named.length === 1) groups.push([...named[0], ...blank]);
    else for (const g of named) groups.push(g); // blank ones are ambiguous: leave out
  }
  return groups
    .filter(g => g.length >= 2)
    .map(g => g.map(m => m.song).sort((a, b) => a.title.localeCompare(b.title)))
    .sort((a, b) => effectiveNames(a[0]).title.localeCompare(effectiveNames(b[0]).title));
}

// Best-effort split of an old combined name into { title, artist, guessed }.
//   "Al Green - Let's Stay Together"  → artist first (the common pattern)
//   "Rock steady (The Whispers)"      → trailing parentheses are the artist
// "Title - Artist" can't be told apart from "Artist - Title" by a program,
// so the review screen lets the user swap or fix every guess.
export function guessSplit(raw) {
  const text = (raw || '').trim();
  let m = text.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim(), guessed: true };
  m = text.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (m) return { title: m[1].trim(), artist: m[2].trim(), guessed: true };
  return { title: text, artist: '', guessed: false };
}
