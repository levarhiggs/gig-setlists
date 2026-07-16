// store.js — in-memory app state + localStorage mirror for offline reload.
// Firestore (src/firebase/sync.js) is the source of truth; this is the
// local working copy the UI reads/writes synchronously, mirroring the
// draft-tool app's pattern of Firestore-direct writes with a cached shell.

import {
  saveGigMeta, saveSet as saveSetRemote, saveSong as saveSongRemote,
  saveInstance as saveInstanceRemote, deleteInstance as deleteInstanceRemote,
  saveLink as saveLinkRemote, deleteLink as deleteLinkRemote,
  deleteSet as deleteSetRemote, loadGigBundle as loadGigBundleRemote,
  saveGigBundle,
} from '../firebase/sync.js';
import { reindex } from '../lib/ordering.js';
import { makeSet, makeLink, makeGig, makeSong, makeSongInstance, newInstanceId, newLinkId, ORDER_STEP } from './models.js';
import { assignColor } from '../lib/colors.js';
import { uploadSongAudio, deleteSongAudio } from '../firebase/audio-storage.js';

const LS_KEY = 'setlist_app_state_v1';

const state = {
  songs: {},      // songId -> Song
  gig: null,      // active Gig
  sets: {},       // setId -> Set
  instances: {},  // instanceId -> SongInstance
  links: {},      // linkId -> Link
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
  persistLocal();
}

export function getState() {
  return state;
}

export function loadGig({ gig, sets, instances, links, songs }) {
  state.gig = gig;
  state.sets = sets;
  state.instances = instances;
  state.links = links;
  state.songs = { ...state.songs, ...songs };
  notify();
}

export function upsertSong(song) {
  state.songs[song.songId] = song;
  notify();
}

// Lyrics stay global on the Song record (the words don't change gig to
// gig) — this is the only attribute-modal field still written here.
export function updateSongLyrics(songId, lyrics) {
  const song = state.songs[songId];
  if (!song) return;
  song.lyrics = lyrics || null;
  song.updatedAt = new Date().toISOString();
  notify();
  saveSongRemote(song).catch(err => console.error('saveSong failed:', err));
}

// key/bpm/lead/notes are per-INSTANCE: the same song can call for a
// different singer/key/tempo in different gigs (or different sets of the
// same gig), so these write to the SongInstance, not the shared Song.
export function updateInstanceAttributes(instanceId, { key, bpm, lead, notes }) {
  const instance = state.instances[instanceId];
  if (!instance) return;
  instance.key = key || null;
  instance.bpm = bpm === '' || bpm == null ? null : Number(bpm);
  instance.lead = lead || null;
  instance.notes = notes || null;
  notify();
  saveInstanceRemote(state.gig.gigId, instance).catch(err => console.error('saveInstance failed:', err));
}

// Uploads an MP3 File to Storage and records its URL on the Song. Used by
// both the per-song attach flow and the bulk-upload matcher.
export async function attachAudioToSong(songId, file) {
  const song = state.songs[songId];
  if (!song) return;
  const url = await uploadSongAudio(songId, file);
  song.audioUrl = url;
  song.audioFileName = file.name;
  song.updatedAt = new Date().toISOString();
  notify();
  await saveSongRemote(song);
}

export async function removeAudioFromSong(songId) {
  const song = state.songs[songId];
  if (!song || !song.audioUrl) return;
  await deleteSongAudio(songId);
  song.audioUrl = null;
  song.audioFileName = null;
  song.updatedAt = new Date().toISOString();
  notify();
  await saveSongRemote(song);
}

export function getSong(songId) {
  return state.songs[songId] || null;
}

// Double-tap: cycle an instance's live-gig status during a set:
// none -> "done" (green check) -> "cut" (red X, not performing) -> none.
// Per-instance (not per-Song) — completing one placement of a duplicated
// song shouldn't complete every placement.
const COMPLETED_CYCLE = [null, 'done', 'cut'];
export function toggleCompleted(instanceId) {
  const instance = state.instances[instanceId];
  if (!instance) return;
  const currentIndex = COMPLETED_CYCLE.indexOf(instance.completed ?? null);
  const next = COMPLETED_CYCLE[(currentIndex + 1) % COMPLETED_CYCLE.length];
  instance.completed = next;
  notify();
  saveInstanceRemote(state.gig.gigId, instance).catch(err => console.error('saveInstance failed:', err));
}

// §6: form a Link from a set of instance ids (already same-set, enforced by
// the caller/UI — link mode is scoped to one set block at a time). Members
// cluster contiguously at the position of the earliest-ordered member
// (§6.4's recommended rule) in the submitted `orderedInstanceIds` order.
export function createLink(setId, orderedInstanceIds) {
  if (!state.gig || orderedInstanceIds.length < 2) return;

  const set = state.sets[setId];
  if (!set) return;

  const usedColors = Object.values(state.links).map(l => l.color);
  const color = assignColor(usedColors);
  const link = makeLink({ gigId: state.gig.gigId, color, memberInstanceIds: orderedInstanceIds });
  state.links[link.linkId] = link;

  for (const id of orderedInstanceIds) {
    if (state.instances[id]) state.instances[id].linkId = link.linkId;
  }

  // Cluster contiguously at the earliest currently-ordered member (§6.4).
  const allIds = getSongsForSet(setId).map(i => i.instanceId);
  const minIndex = Math.min(...orderedInstanceIds.map(id => allIds.indexOf(id)).filter(i => i >= 0));
  const remaining = allIds.filter(id => !orderedInstanceIds.includes(id));
  const clustered = [
    ...remaining.slice(0, minIndex),
    ...orderedInstanceIds,
    ...remaining.slice(minIndex),
  ];

  const reindexed = reindex(clustered.map(id => state.instances[id]));
  for (const inst of reindexed) state.instances[inst.instanceId] = inst;

  notify();

  saveLinkRemote(state.gig.gigId, link).catch(err => console.error('saveLink failed:', err));
  for (const inst of reindexed) {
    saveInstanceRemote(state.gig.gigId, inst).catch(err => console.error('saveInstance failed:', err));
  }
}

// §6.5: dissolve an existing link entirely (used when a re-opened selection
// drops below 2 members) — clears linkId off all members and frees the color.
export function dissolveLink(linkId) {
  const link = state.links[linkId];
  if (!link) return;
  for (const id of link.memberInstanceIds) {
    const inst = state.instances[id];
    if (inst) {
      inst.linkId = null;
      saveInstanceRemote(state.gig.gigId, inst).catch(err => console.error('saveInstance failed:', err));
    }
  }
  delete state.links[linkId];
  notify();
  deleteLinkRemote(state.gig.gigId, linkId).catch(err => console.error('deleteLink failed:', err));
}

// Deletes one song placement from the gig entirely (not the master Song
// record, which may still be used elsewhere — §5.3's duplicate-instance
// model). If the instance was linked and removing it would drop the group
// below 2 members, the group dissolves too (§6.5); otherwise the link
// keeps its remaining members.
export function removeInstance(instanceId) {
  const instance = state.instances[instanceId];
  if (!instance) return;

  const setId = instance.setId;
  const linkId = instance.linkId;

  delete state.instances[instanceId];

  if (linkId && state.links[linkId]) {
    const link = state.links[linkId];
    // Trim the deleted instance out of the member list FIRST, so
    // dissolveLink (if triggered) only ever iterates ids that still
    // correspond to real, still-linked instances.
    link.memberInstanceIds = link.memberInstanceIds.filter(id => id !== instanceId);
    if (link.memberInstanceIds.length < 2) {
      dissolveLink(linkId);
    } else {
      saveLinkRemote(state.gig.gigId, link).catch(err => console.error('saveLink failed:', err));
    }
  }

  const remainingInSet = getSongsForSet(setId);
  const reindexed = reindex(remainingInSet);
  for (const inst of reindexed) state.instances[inst.instanceId] = inst;

  notify();

  deleteInstanceRemote(state.gig.gigId, setId, instanceId).catch(err => console.error('deleteInstance failed:', err));
  for (const inst of reindexed) {
    saveInstanceRemote(state.gig.gigId, inst).catch(err => console.error('saveInstance failed:', err));
  }
}

export function renameGig(name) {
  if (!state.gig) return;
  state.gig.name = name;
  state.gig.updatedAt = new Date().toISOString();
  notify();
  saveGigMeta(state.gig).catch(err => console.error('saveGigMeta failed:', err));
}

export function renameSet(setId, name) {
  const set = state.sets[setId];
  if (!set) return;
  set.name = name;
  notify();
  saveSetRemote(state.gig.gigId, set).catch(err => console.error('saveSet failed:', err));
}

// "key" | "lead" | "none" — what secondary text shows on this set's rows.
export function setAttributeDisplay(setId, mode) {
  const set = state.sets[setId];
  if (!set) return;
  set.attributeDisplay = mode;
  notify();
  saveSetRemote(state.gig.gigId, set).catch(err => console.error('saveSet failed:', err));
}

// Deletes a set and every instance in it (dissolving any links that lose
// members below 2, same as removeInstance). The master Song records are
// untouched.
export function deleteSet(setId) {
  const set = state.sets[setId];
  if (!set || !state.gig) return;

  const instancesInSet = getSongsForSet(setId);
  const touchedLinkIds = new Set(instancesInSet.map(i => i.linkId).filter(Boolean));

  for (const inst of instancesInSet) delete state.instances[inst.instanceId];

  for (const linkId of touchedLinkIds) {
    const link = state.links[linkId];
    if (!link) continue;
    const remaining = link.memberInstanceIds.filter(id => state.instances[id]);
    if (remaining.length < 2) {
      delete state.links[linkId];
      deleteLinkRemote(state.gig.gigId, linkId).catch(err => console.error('deleteLink failed:', err));
      for (const id of remaining) {
        if (state.instances[id]) state.instances[id].linkId = null;
      }
    } else {
      link.memberInstanceIds = remaining;
      saveLinkRemote(state.gig.gigId, link).catch(err => console.error('saveLink failed:', err));
    }
  }

  delete state.sets[setId];
  state.gig.sets = state.gig.sets.filter(id => id !== setId);

  notify();

  for (const inst of instancesInSet) {
    deleteInstanceRemote(state.gig.gigId, setId, inst.instanceId).catch(err => console.error('deleteInstance failed:', err));
  }
  deleteSetRemote(state.gig.gigId, setId).catch(err => console.error('deleteSet failed:', err));
  saveGigMeta(state.gig).catch(err => console.error('saveGigMeta failed:', err));
}

// Copies a set (and its song instances, minus links — a medley grouping is
// meaningful only within its original gig's flow) into another saved gig,
// appended as a new set at the end. Uses the SAME Song master records
// (songs are shared across gigs, per §13.6) — only Set + SongInstance rows
// are cloned with fresh ids.
export async function copySetToGig(setId, targetGigId) {
  const set = state.sets[setId];
  if (!set) return;

  const instancesInSet = getSongsForSet(setId);
  const targetBundle = await loadGigBundleRemote(targetGigId);
  if (!targetBundle) return;

  const nextOrder = Object.keys(targetBundle.sets).length
    ? Math.max(...Object.values(targetBundle.sets).map(s => s.order)) + 1
    : 0;
  const newSet = makeSet({
    gigId: targetGigId,
    name: set.name,
    order: nextOrder,
    songOrderMode: set.songOrderMode,
    attributeDisplay: set.attributeDisplay,
  });

  const newInstances = {};
  instancesInSet.forEach((inst, i) => {
    const newInst = makeSongInstance({
      songId: inst.songId,
      setId: newSet.setId,
      order: (i + 1) * ORDER_STEP,
      key: inst.key, bpm: inst.bpm, lead: inst.lead, notes: inst.notes,
    });
    newInstances[newInst.instanceId] = newInst;
  });

  await saveSetRemote(targetGigId, newSet);
  for (const inst of Object.values(newInstances)) {
    await saveInstanceRemote(targetGigId, inst);
  }
  const updatedGig = { ...targetBundle.gig, sets: [...targetBundle.gig.sets, newSet.setId] };
  await saveGigMeta(updatedGig);
}

// §5.2/§5.4/§6.7: move an instance (and, if linked, its whole link group as
// a contiguous block — §6.7) to `insertIndex` within `newSetId`'s ordered
// instance list. `targetOrderedInstanceIds` is the *other* instances
// currently in the target list (chain-group-drag.js reads this straight from
// the DOM, excluding the moving row/placeholder), in their displayed order.
export function moveInstance(instanceId, newSetId, insertIndex, targetOrderedInstanceIds) {
  const instance = state.instances[instanceId];
  const targetSet = state.sets[newSetId];
  if (!instance || !targetSet) return;

  const oldSetId = instance.setId;

  // A linked instance drags its whole group as one contiguous block (§6.7).
  const link = instance.linkId ? state.links[instance.linkId] : null;
  const movingIds = link ? link.memberInstanceIds : [instanceId];

  // Build the new ordered id list for the target set: the DOM-derived
  // siblings (which exclude the moving block already) with the moving
  // block spliced in at insertIndex, preserving its internal link order.
  const siblingIds = targetOrderedInstanceIds.filter(id => !movingIds.includes(id));
  const clampedIndex = Math.max(0, Math.min(insertIndex, siblingIds.length));
  const newOrderIds = [
    ...siblingIds.slice(0, clampedIndex),
    ...movingIds,
    ...siblingIds.slice(clampedIndex),
  ];

  const reindexed = reindex(newOrderIds.map(id => state.instances[id]));
  for (const inst of reindexed) {
    inst.setId = newSetId;
    state.instances[inst.instanceId] = inst;
  }

  // Dropping into a set permanently switches it to custom order (§5.4),
  // whether it's the same set (pure reorder) or a new one (cross-set move).
  targetSet.songOrderMode = 'custom';

  // If the source set is different and now has remaining instances, its
  // own order values are untouched — only the target set was reindexed.
  notify();

  saveSetRemote(state.gig.gigId, targetSet).catch(err => console.error('saveSet failed:', err));
  for (const inst of reindexed) {
    saveInstanceRemote(state.gig.gigId, inst).catch(err => console.error('saveInstance failed:', err));
  }
  if (oldSetId !== newSetId) {
    for (const id of movingIds) {
      deleteInstanceRemote(state.gig.gigId, oldSetId, id).catch(err => console.error('deleteInstance failed:', err));
    }
  }
}

// Per-song grip drag: always moves exactly ONE instance (never the whole
// chain, even if it's linked) to `insertIndex` within `newSetId`'s ordered
// list. Chain adjacency/legality is decided by the caller (chain-drag.js)
// BEFORE calling this — this function just performs the move once a
// decision has been made. `targetOrderedInstanceIds` excludes the moving
// instance already (same convention as moveInstance).
export function moveSingleInstance(instanceId, newSetId, insertIndex, targetOrderedInstanceIds) {
  const instance = state.instances[instanceId];
  const targetSet = state.sets[newSetId];
  if (!instance || !targetSet) return;

  const oldSetId = instance.setId;

  const clampedIndex = Math.max(0, Math.min(insertIndex, targetOrderedInstanceIds.length));
  const newOrderIds = [
    ...targetOrderedInstanceIds.slice(0, clampedIndex),
    instanceId,
    ...targetOrderedInstanceIds.slice(clampedIndex),
  ];

  const reindexed = reindex(newOrderIds.map(id => state.instances[id]));
  for (const inst of reindexed) {
    inst.setId = newSetId;
    state.instances[inst.instanceId] = inst;
  }

  targetSet.songOrderMode = 'custom';
  notify();

  saveSetRemote(state.gig.gigId, targetSet).catch(err => console.error('saveSet failed:', err));
  for (const inst of reindexed) {
    saveInstanceRemote(state.gig.gigId, inst).catch(err => console.error('saveInstance failed:', err));
  }
  if (oldSetId !== newSetId) {
    deleteInstanceRemote(state.gig.gigId, oldSetId, instanceId).catch(err => console.error('deleteInstance failed:', err));
  }
}

// Adds a previously-unlinked instance into an existing link's membership,
// at a specific position within the chain's own internal order (used when
// a dropped orphan is confirmed to join a chain — §6.6 still applies: only
// call this for instances with no existing linkId).
export function addOrphanToChain(instanceId, linkId, chainInsertIndex) {
  const instance = state.instances[instanceId];
  const link = state.links[linkId];
  if (!instance || !link || instance.linkId) return;

  const newMembers = [...link.memberInstanceIds];
  const clamped = Math.max(0, Math.min(chainInsertIndex, newMembers.length));
  newMembers.splice(clamped, 0, instanceId);
  link.memberInstanceIds = newMembers;
  instance.linkId = linkId;

  notify();

  saveLinkRemote(state.gig.gigId, link).catch(err => console.error('saveLink failed:', err));
  saveInstanceRemote(state.gig.gigId, instance).catch(err => console.error('saveInstance failed:', err));
}

// Removes one instance from its link's membership without touching its
// position in the set (used when a drag pulls a linked song away from its
// chain and the user confirms the unlink). Dissolves the link entirely if
// membership would drop below 2 (§6.5).
export function extractFromChain(instanceId) {
  const instance = state.instances[instanceId];
  if (!instance || !instance.linkId) return;
  const link = state.links[instance.linkId];
  if (!link) { instance.linkId = null; notify(); return; }

  link.memberInstanceIds = link.memberInstanceIds.filter(id => id !== instanceId);
  instance.linkId = null;

  if (link.memberInstanceIds.length < 2) {
    dissolveLink(link.linkId); // clears linkId off any one remaining member too
  } else {
    saveLinkRemote(state.gig.gigId, link).catch(err => console.error('saveLink failed:', err));
  }

  notify();
  saveInstanceRemote(state.gig.gigId, instance).catch(err => console.error('saveInstance failed:', err));
}

// Updates a link's own internal member order (used after a within-chain
// drag reorder) without touching membership itself.
export function syncChainMemberOrder(linkId, newMemberOrder) {
  const link = state.links[linkId];
  if (!link) return;
  link.memberInstanceIds = newMemberOrder;
  notify();
  saveLinkRemote(state.gig.gigId, link).catch(err => console.error('saveLink failed:', err));
}

// §4.1: a new set starts empty; §5.3 says a set only picked up alpha
// ordering once a song is added into it, but an empty set has nothing to
// order either way, so "alpha" here is just the eventual default.
export function addSet(name) {
  if (!state.gig) return;
  const nextOrder = Object.keys(state.sets).length
    ? Math.max(...Object.values(state.sets).map(s => s.order)) + 1
    : 0;
  const set = makeSet({
    gigId: state.gig.gigId,
    name: name || `Set ${nextOrder + 1}`,
    order: nextOrder,
    songOrderMode: 'alpha',
  });
  state.sets[set.setId] = set;
  state.gig.sets.push(set.setId);
  notify();
  saveSetRemote(state.gig.gigId, set).catch(err => console.error('saveSet failed:', err));
  saveGigMeta(state.gig).catch(err => console.error('saveGigMeta failed:', err));
}

// "Add Song" from the Add+ menu: appends instances of zero or more
// EXISTING songs (picked from the library) and, optionally, one brand-new
// song (created here, upserted by normalized title like the importer
// does) — all to the end of the chosen set, in one batch. Existing songs
// are appended first (in the order given), then the new song last.
// Finds this song's most recently-touched instance among everything
// currently loaded (the active gig) — used to pre-fill a new placement's
// key/bpm/lead/notes as a convenience starting point (§ Add Song). Falls
// back to the Song record's own template values if this song has never
// been placed anywhere yet.
function mostRecentInstanceValuesFor(songId) {
  const candidates = Object.values(state.instances).filter(i => i.songId === songId);
  if (!candidates.length) {
    const song = state.songs[songId];
    return { key: song?.key ?? null, bpm: song?.bpm ?? null, lead: song?.lead ?? null, notes: song?.notes ?? null };
  }
  // No per-instance timestamp is tracked, so "most recent" falls back to
  // insertion order among currently-loaded instances — the last one
  // created is last in object key iteration order, which is stable for
  // this purpose since instanceIds are time-ordered strings.
  const latest = candidates[candidates.length - 1];
  return { key: latest.key, bpm: latest.bpm, lead: latest.lead, notes: latest.notes };
}

export function addSongsToSet({ existingSongIds = [], newSongFields = null }, setId) {
  if (!state.gig) return;
  const set = state.sets[setId];
  if (!set) return;

  const existing = getSongsForSet(setId);
  let nextOrder = existing.length ? Math.max(...existing.map(i => i.order)) : 0;

  const newInstances = [];

  for (const songId of existingSongIds) {
    if (!state.songs[songId]) continue;
    nextOrder += ORDER_STEP;
    const prefill = mostRecentInstanceValuesFor(songId);
    const instance = makeSongInstance({ songId, setId, order: nextOrder, ...prefill });
    state.instances[instance.instanceId] = instance;
    newInstances.push(instance);
  }

  if (newSongFields) {
    const { lyrics, key, bpm, lead, notes, ...songFields } = newSongFields;
    // makeSong still gets a copy of these as the song's initial "template"
    // (used by mostRecentInstanceValuesFor when this song has no
    // instances anywhere yet), but the values the user just typed belong
    // on THIS placement, not shared globally.
    const song = makeSong({ ...songFields, key, bpm, lead, notes });
    if (lyrics) song.lyrics = lyrics;
    if (!state.songs[song.songId]) {
      state.songs[song.songId] = song;
      saveSongRemote(song).catch(err => console.error('saveSong failed:', err));
    }
    nextOrder += ORDER_STEP;
    const instance = makeSongInstance({ songId: song.songId, setId, order: nextOrder, key, bpm, lead, notes });
    state.instances[instance.instanceId] = instance;
    newInstances.push(instance);
  }

  if (!newInstances.length) return;

  notify();
  for (const instance of newInstances) {
    saveInstanceRemote(state.gig.gigId, instance).catch(err => console.error('saveInstance failed:', err));
  }
}

// §9/§13.6 "Save as copy": deep-clone the current gig under a NEW gigId,
// with fresh instanceIds/linkIds (memberInstanceIds remapped). Does not
// clone `songs` — the copy references the same master records.
export async function saveGigAsCopy(name, description = '') {
  if (!state.gig) return null;

  const newGig = makeGig({ name, description });
  const idMap = {}; // old setId/instanceId/linkId -> new

  const newSets = {};
  for (const set of Object.values(state.sets)) {
    const newSetId = `${newGig.gigId}_set_${set.order}`;
    idMap[set.setId] = newSetId;
    newSets[newSetId] = { ...set, setId: newSetId };
  }
  newGig.sets = Object.keys(newSets);

  const newInstances = {};
  for (const inst of Object.values(state.instances)) {
    const newId = newInstanceId();
    idMap[inst.instanceId] = newId;
    newInstances[newId] = {
      ...inst,
      instanceId: newId,
      setId: idMap[inst.setId],
      completed: inst.completed ?? null,
    };
  }

  const newLinks = {};
  for (const link of Object.values(state.links)) {
    const newId = newLinkId();
    idMap[link.linkId] = newId;
    newLinks[newId] = {
      ...link,
      linkId: newId,
      gigId: newGig.gigId,
      memberInstanceIds: link.memberInstanceIds.map(id => idMap[id]),
    };
  }
  for (const inst of Object.values(newInstances)) {
    inst.linkId = inst.linkId ? idMap[inst.linkId] : null;
  }
  newGig.links = Object.keys(newLinks);

  const bundle = { gig: newGig, sets: newSets, instances: newInstances, links: newLinks, songs: state.songs };
  await saveGigBundle(bundle);
  return newGig;
}

// §9 "Overwrite": update the current gig's own name/description in place
// (its subtree is already kept current by every other mutation in this
// module firing its own Firestore write as it happens).
export async function overwriteCurrentGig(name, description = '') {
  if (!state.gig) return;
  state.gig.name = name;
  state.gig.description = description;
  state.gig.updatedAt = new Date().toISOString();
  notify();
  await saveGigMeta(state.gig);
}

export function getSongsForSet(setId) {
  return Object.values(state.instances)
    .filter(i => i.setId === setId)
    .sort((a, b) => a.order - b.order);
}

export function getOrderedSets() {
  return Object.values(state.sets).sort((a, b) => a.order - b.order);
}

// Reassigns `order` on every set to match `orderedSetIds` (the full new
// sequence, e.g. read straight off the DOM after a drag).
export function reorderSets(orderedSetIds) {
  if (!state.gig) return;
  orderedSetIds.forEach((setId, i) => {
    const set = state.sets[setId];
    if (!set) return;
    set.order = i;
    saveSetRemote(state.gig.gigId, set).catch(err => console.error('saveSet failed:', err));
  });
  notify();
}

function persistLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('localStorage persist failed:', err);
  }
}

export function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    Object.assign(state, cached);
    return true;
  } catch {
    return false;
  }
}
