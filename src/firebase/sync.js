// sync.js — Firestore read/write for gigs, sets, instances, links, songs.
// Storage layout per SETLIST_APP_HANDOFF.md §13.6:
//   /songs/{songId}                                  (top-level, shared)
//   /gigs/{gigId}                                     (gig doc)
//   /gigs/{gigId}/sets/{setId}
//   /gigs/{gigId}/sets/{setId}/instances/{instanceId}
//   /gigs/{gigId}/links/{linkId}

import { db } from './init.js';
import {
  doc, getDoc, getDocs, setDoc, deleteDoc, collection, writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Firestore rejects `undefined` field values outright. Instance/link/set
// objects sometimes carry `undefined` for not-yet-set optional fields
// (e.g. linkId, completed) depending on how they were constructed —
// normalize to `null` right at the write boundary so no caller has to
// remember to do this themselves.
function stripUndefined(obj) {
  const clean = {};
  for (const [k, v] of Object.entries(obj)) clean[k] = v === undefined ? null : v;
  return clean;
}

function songRef(songId) { return doc(db, 'songs', songId); }
function gigRef(gigId) { return doc(db, 'gigs', gigId); }
function setRef(gigId, setId) { return doc(db, 'gigs', gigId, 'sets', setId); }
function instanceRef(gigId, setId, instanceId) {
  return doc(db, 'gigs', gigId, 'sets', setId, 'instances', instanceId);
}
function linkRef(gigId, linkId) { return doc(db, 'gigs', gigId, 'links', linkId); }

// ── Songs (master list) ─────────────────────────────────────────────────────

export async function saveSong(song) {
  await setDoc(songRef(song.songId), stripUndefined(song), { merge: true });
}

export async function saveSongs(songs) {
  const batch = writeBatch(db);
  for (const song of Object.values(songs)) batch.set(songRef(song.songId), stripUndefined(song), { merge: true });
  await batch.commit();
}

export async function deleteSong(songId) {
  await deleteDoc(songRef(songId));
}

// Every song placement in every gig, as [{ gigId, instance }]. Throws if any
// gig can't be read, so callers never act on a partial picture.
export async function listAllInstances() {
  const out = [];
  for (const g of await listGigs()) {
    if (!g.gigId) continue;
    const bundle = await loadGigBundle(g.gigId, { withSongs: false });
    if (!bundle) continue;
    for (const instance of Object.values(bundle.instances)) out.push({ gigId: g.gigId, instance });
  }
  return out;
}

export async function getAllSongs() {
  const snap = await getDocs(collection(db, 'songs'));
  const songs = {};
  snap.forEach(d => { songs[d.id] = d.data(); });
  return songs;
}

// ── Whole-gig write (import / bulk save) ────────────────────────────────────

// A full REPLACE of the gig's own subtree (sets/instances/links) — clears
// whatever currently exists under this gigId first, so re-seeding/importing
// into an id that already has data (e.g. two tabs racing to seed the same
// fixed SEED_GIG_ID) can never leave duplicate leftover instance docs
// behind. `songs` are still merged, never cleared — the master list is
// shared across gigs and other gigs may depend on records this gig doesn't
// reference.
export async function saveGigBundle({ gig, sets, instances, links, songs }) {
  const existingSetsSnap = await getDocs(collection(db, 'gigs', gig.gigId, 'sets'));
  for (const existingSet of existingSetsSnap.docs) {
    const existingInstSnap = await getDocs(collection(db, 'gigs', gig.gigId, 'sets', existingSet.id, 'instances'));
    if (existingInstSnap.size) {
      const clearBatch = writeBatch(db);
      existingInstSnap.forEach(i => clearBatch.delete(i.ref));
      await clearBatch.commit();
    }
  }
  const existingLinksSnap = await getDocs(collection(db, 'gigs', gig.gigId, 'links'));

  const batch = writeBatch(db);

  batch.set(gigRef(gig.gigId), stripUndefined({ ...gig, updatedAt: serverTimestamp() }));

  for (const existingSet of existingSetsSnap.docs) batch.delete(existingSet.ref);
  for (const existingLink of existingLinksSnap.docs) batch.delete(existingLink.ref);

  for (const set of Object.values(sets)) {
    batch.set(setRef(gig.gigId, set.setId), stripUndefined(set));
  }
  for (const inst of Object.values(instances)) {
    batch.set(instanceRef(gig.gigId, inst.setId, inst.instanceId), stripUndefined(inst));
  }
  for (const link of Object.values(links)) {
    batch.set(linkRef(gig.gigId, link.linkId), stripUndefined(link));
  }
  for (const song of Object.values(songs)) {
    batch.set(songRef(song.songId), stripUndefined(song), { merge: true });
  }

  await batch.commit();
}

// Removes a gig and everything under it (instances, sets, links). The gig
// doc goes LAST, so a failure part-way leaves the gig still listed and the
// delete can simply be run again. Songs are never touched — they're shared.
export async function deleteGig(gigId) {
  const setsSnap = await getDocs(collection(db, 'gigs', gigId, 'sets'));
  for (const s of setsSnap.docs) {
    const instSnap = await getDocs(collection(db, 'gigs', gigId, 'sets', s.id, 'instances'));
    for (let i = 0; i < instSnap.docs.length; i += 400) {
      const batch = writeBatch(db);
      instSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
  const linksSnap = await getDocs(collection(db, 'gigs', gigId, 'links'));
  const rest = [...setsSnap.docs, ...linksSnap.docs];
  for (let i = 0; i < rest.length; i += 400) {
    const batch = writeBatch(db);
    rest.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(gigRef(gigId));
}

// ── Gig list (for "Open Saved Gig…") ────────────────────────────────────────

export async function listGigs() {
  const snap = await getDocs(collection(db, 'gigs'));
  return snap.docs.map(d => d.data()).sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() ?? 0;
    const tb = b.updatedAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

// ── Whole-gig read ───────────────────────────────────────────────────────────

export async function loadGigBundle(gigId, { withSongs = true } = {}) {
  const gigSnap = await getDoc(gigRef(gigId));
  if (!gigSnap.exists()) return null;
  const gig = gigSnap.data();

  const setsSnap = await getDocs(collection(db, 'gigs', gigId, 'sets'));
  const sets = {};
  const instances = {};
  for (const setDoc of setsSnap.docs) {
    sets[setDoc.id] = setDoc.data();
    const instSnap = await getDocs(collection(db, 'gigs', gigId, 'sets', setDoc.id, 'instances'));
    instSnap.forEach(i => { instances[i.id] = i.data(); });
  }

  const linksSnap = await getDocs(collection(db, 'gigs', gigId, 'links'));
  const links = {};
  linksSnap.forEach(l => { links[l.id] = l.data(); });

  const songs = {};
  if (withSongs) {
    const songIds = [...new Set(Object.values(instances).map(i => i.songId))];
    for (const songId of songIds) {
      const s = await getDoc(songRef(songId));
      if (s.exists()) songs[songId] = s.data();
    }
  }

  return { gig, sets, instances, links, songs };
}

// ── Full backup ──────────────────────────────────────────────────────────────

export const BACKUP_FORMAT = 'gig-setlists-backup';

// Every gig (sets, song placements, medley links) plus the whole song
// library, as one plain object ready for JSON.stringify. All-or-nothing: if
// any read fails this throws, so a half-empty backup can never be written
// out looking like a complete one.
export async function fetchFullBackup() {
  const gigList = await listGigs();
  const gigs = [];
  for (const g of gigList) {
    if (!g.gigId) continue;
    const bundle = await loadGigBundle(g.gigId, { withSongs: false });
    if (bundle) gigs.push({ gig: bundle.gig, sets: bundle.sets, instances: bundle.instances, links: bundle.links });
  }
  const songs = await getAllSongs();
  return { format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), gigs, songs };
}

// ── Incremental mutations (used once interactions are wired) ───────────────

export async function saveSet(gigId, set) {
  await setDoc(setRef(gigId, set.setId), stripUndefined(set));
}

export async function deleteSet(gigId, setId) {
  await deleteDoc(setRef(gigId, setId));
}

export async function saveInstance(gigId, instance) {
  await setDoc(instanceRef(gigId, instance.setId, instance.instanceId), stripUndefined(instance));
}

export async function deleteInstance(gigId, setId, instanceId) {
  await deleteDoc(instanceRef(gigId, setId, instanceId));
}

export async function saveLink(gigId, link) {
  await setDoc(linkRef(gigId, link.linkId), stripUndefined(link));
}

export async function deleteLink(gigId, linkId) {
  await deleteDoc(linkRef(gigId, linkId));
}

export async function saveGigMeta(gig) {
  await setDoc(gigRef(gig.gigId), stripUndefined({ ...gig, updatedAt: serverTimestamp() }), { merge: true });
}
