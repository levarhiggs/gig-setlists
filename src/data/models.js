// models.js — shapes and id helpers, per SETLIST_APP_HANDOFF.md §13

export function normalizeTitleToId(title) {
  return 'sng_' + title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

let instanceCounter = 0;
export function newInstanceId() {
  instanceCounter += 1;
  return `inst_${Date.now().toString(36)}${instanceCounter.toString(36)}`;
}

let linkCounter = 0;
export function newLinkId() {
  linkCounter += 1;
  return `lnk_${Date.now().toString(36)}${linkCounter.toString(36)}`;
}

// Always unique: saveGigBundle REPLACES whatever already lives under a gig
// id, so an id derived from the name alone let a new gig (new, imported, or
// saved-as-copy) silently overwrite an existing gig with the same name.
// Existing gigs keep the ids they already have.
export function newGigId(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `gig_${slug ? slug + '_' : ''}${unique}`;
}

export function newSetId(gigId, order) {
  return `${gigId}_set_${order}`;
}

// Spaced order values so inserts rarely require a full reindex (§13.2).
export const ORDER_STEP = 10;

export function makeSong({ title, key = null, bpm = null, lead = null, notes = null }) {
  const now = new Date().toISOString();
  return {
    songId: normalizeTitleToId(title),
    title,
    key: key || null,
    bpm: bpm == null || bpm === '' ? null : Number(bpm),
    lead: lead || null,
    notes: notes || null,
    createdAt: now,
    updatedAt: now,
  };
}

// key/bpm/lead/notes are per-INSTANCE (per placement in a gig) — different
// gigs can call for a different singer, key, or tempo for the same song.
// Lyrics stays on the Song record (see makeSong) since the words don't
// change gig to gig. `key`/`bpm`/`lead`/`notes` default to null (blank);
// callers that want to pre-fill from the song's most recent use pass
// those values in explicitly.
export function makeSongInstance({ songId, setId, order, linkId = null, key = null, bpm = null, lead = null, notes = null }) {
  return {
    instanceId: newInstanceId(),
    songId, setId, order, linkId,
    key: key || null,
    bpm: bpm == null || bpm === '' ? null : Number(bpm),
    lead: lead || null,
    notes: notes || null,
  };
}

// attributeDisplay controls what secondary text shows on each song row in
// this set: "key" | "lead" | "none". Defaults to "key" to match the
// original row layout (key + bpm).
export function makeSet({ gigId, name, order, songOrderMode = 'custom', attributeDisplay = 'key' }) {
  return { setId: newSetId(gigId, order), name, order, songOrderMode, attributeDisplay };
}

export function makeLink({ gigId, color, memberInstanceIds }) {
  return { linkId: newLinkId(), gigId, color, memberInstanceIds };
}

export function makeGig({ name, description = '' }) {
  const now = new Date().toISOString();
  return {
    gigId: newGigId(name),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    sets: [],
    links: [],
  };
}
