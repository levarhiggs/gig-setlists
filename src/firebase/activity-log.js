// activity-log.js — append-only record of who changed what and when,
// for the admin-only Activity view. Writes are fire-and-forget from the
// caller's perspective (never block or fail a mutation just because
// logging hiccups) — this is an audit trail, not part of the core data
// model, so it degrades gracefully if it can't write.

import { db } from './init.js';
import {
  collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const COLLECTION = 'activityLog';
const DEFAULT_LIMIT = 200;

// action: short machine tag, e.g. "rename-song", "move-instance".
// description: human-readable summary, e.g. 'Renamed "Ascension" to "Ascension (Live)"'.
export function logActivity({ who, action, description, gigId = null }) {
  addDoc(collection(db, COLLECTION), {
    who: who || 'Unknown',
    action,
    description,
    gigId,
    createdAt: serverTimestamp(),
  }).catch(err => console.error('logActivity failed (non-fatal):', err));
}

export async function fetchRecentActivity(max = DEFAULT_LIMIT) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
