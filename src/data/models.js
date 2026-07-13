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

export function newGigId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `gig_${slug || Date.now().toString(36)}`;
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

export function makeSongInstance({ songId, setId, order, linkId = null }) {
  return { instanceId: newInstanceId(), songId, setId, order, linkId };
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
