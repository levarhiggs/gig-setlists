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
