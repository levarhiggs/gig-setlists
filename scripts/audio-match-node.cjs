// audio-match-node.cjs — CommonJS port of src/lib/audio-match.js for use
// from Node scripts (the original is an ES module written for the
// browser). Keep the matching logic identical between the two — this is
// duplicated rather than shared because the browser file is loaded via a
// bare <script type="module"> with no bundler, so it can't easily be
// required from a .cjs script without extra tooling.

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\.(mp3|m4a|wav|aac|ogg)$/i, '')
    .replace(/^\s*\d{1,3}[\s._-]+/, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(str) {
  return new Set(normalize(str).split(' ').filter(Boolean));
}

function similarity(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap++;
  return overlap / Math.min(setA.size, setB.size);
}

const CANDIDATE_FLOOR = 0.25;
const MAX_CANDIDATES = 4;

function matchSongsToFiles(songs, fileNames) {
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

module.exports = { matchSongsToFiles };
