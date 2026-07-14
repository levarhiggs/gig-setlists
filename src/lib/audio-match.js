// audio-match.js — fuzzy-matches audio filenames to library song titles,
// for bulk attach/upload flows. Filenames are rarely an exact match to
// the stored title (artist prefixes, "LIVE COVER", track numbers,
// punctuation drift), so this normalizes both sides the same way and
// scores by token overlap, keeping the top few candidates per song
// rather than forcing a single guess.

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\.(mp3|m4a|wav|aac|ogg)$/i, '')
    .replace(/^\s*\d{1,3}[\s._-]+/, '') // leading track number, e.g. "03 - "
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(str) {
  return new Set(normalize(str).split(' ').filter(Boolean));
}

// Overlap-coefficient style score: overlap / min(setSize), so a short
// title fully contained in a long, artist-prefixed filename still scores
// well instead of being diluted by the filename's extra tokens (Jaccard
// would unfairly punish "Celebration" against "Kool & The Gang -
// Celebration.mp3" for exactly this reason).
function similarity(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap++;
  return overlap / Math.min(setA.size, setB.size);
}

const CANDIDATE_FLOOR = 0.25; // below this, don't bother suggesting at all
const MAX_CANDIDATES = 4;

// songs: array of {songId, title}. fileNames: array of strings.
// Returns a Map<songId, [{fileName, score}, …]> — each song's candidate
// files, best-scoring first, capped to MAX_CANDIDATES, floor-filtered.
export function matchSongsToFiles(songs, fileNames) {
  const result = new Map();
  for (const song of songs) {
    const scored = fileNames
      .map(fileName => ({ fileName, score: similarity(song.title, fileName) }))
      .filter(c => c.score >= CANDIDATE_FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);
    result.set(song.songId, scored);
  }
  return result;
}
