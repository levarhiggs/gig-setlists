// ordering.js — alpha vs custom set ordering, reindexing (§5.4)

import { ORDER_STEP } from '../data/models.js';

export function sortInstancesForDisplay(instances, songOrderMode, songsById) {
  const list = [...instances];
  if (songOrderMode === 'alpha') {
    list.sort((a, b) => {
      const ta = (songsById[a.songId]?.title || '').toLowerCase();
      const tb = (songsById[b.songId]?.title || '').toLowerCase();
      return ta.localeCompare(tb);
    });
  } else {
    list.sort((a, b) => a.order - b.order);
  }
  return list;
}

// Reassigns spaced order values (10, 20, 30…) to a list of instances in
// their current array order — used after a drag-and-drop reorder.
export function reindex(instances) {
  return instances.map((inst, i) => ({ ...inst, order: (i + 1) * ORDER_STEP }));
}
