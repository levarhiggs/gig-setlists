// chain-drag.js — grip-driven single-song drag reorder, chain-aware.
//
// Rules (per user spec):
//  - Dragging always moves exactly ONE song (its own grip), never a whole
//    chain — moving a whole chain is done via the link-dot handle instead
//    (see chain-group-drag.js).
//  - Dropping an unlinked (orphan) song strictly BETWEEN two members of an
//    existing chain is not allowed silently — it prompts "join this
//    medley?" Yes clusters it in at that position; No reverts the drag.
//  - Dropping a linked song somewhere that keeps it adjacent to at least
//    one of its own chain-mates (including reordering within the chain)
//    is silent — no prompt.
//  - Dropping a linked song somewhere that separates it from all of its
//    chain-mates prompts "unlink from medley?" Yes extracts it from the
//    chain and leaves it at the new position; No reverts the drag.
//  - A song that is itself part of a chain can never be dropped into the
//    middle of a DIFFERENT chain (chains cannot merge/nest) — that drop
//    is simply rejected/reverted with no prompt, since there's no legal
//    action to offer.

import { getState, moveSingleInstance, addOrphanToChain, extractFromChain, syncChainMemberOrder } from '../data/store.js';

const AUTOSCROLL_EDGE = 60;
const AUTOSCROLL_SPEED = 12;

export function startChainDrag(gripEl, rowEl, pointerId, initialEvent, { container }) {
  const instanceId = rowEl.dataset.instanceId;
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return;

  const rect = rowEl.getBoundingClientRect();
  const offsetY = initialEvent.clientY - rect.top;

  const ghost = rowEl.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = rect.width + 'px';
  document.body.appendChild(ghost);
  positionGhost(ghost, initialEvent.clientX, initialEvent.clientY, offsetY, rect.left);

  rowEl.classList.add('drag-source-hidden');

  const placeholder = document.createElement('li');
  placeholder.className = 'song-row drag-placeholder';
  placeholder.style.height = rect.height + 'px';
  rowEl.parentNode.insertBefore(placeholder, rowEl);

  let autoscrollFrame = null;

  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    positionGhost(ghost, e.clientX, e.clientY, offsetY, rect.left);
    handleAutoscroll(e.clientY);

    const target = findDropTarget(container, e.clientY);
    if (target && target.list && target.beforeEl !== placeholder) {
      target.list.insertBefore(placeholder, target.beforeEl);
    }
  }

  function handleAutoscroll(clientY) {
    cancelAnimationFrame(autoscrollFrame);
    const vh = window.innerHeight;
    if (clientY < AUTOSCROLL_EDGE) {
      autoscrollFrame = requestAnimationFrame(() => window.scrollBy(0, -AUTOSCROLL_SPEED));
    } else if (clientY > vh - AUTOSCROLL_EDGE) {
      autoscrollFrame = requestAnimationFrame(() => window.scrollBy(0, AUTOSCROLL_SPEED));
    }
  }

  function revert() {
    placeholder.remove();
    rowEl.classList.remove('drag-source-hidden');
    ghost.remove();
  }

  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    cleanup();

    const newList = placeholder.parentNode;
    const newSetId = newList.closest('.set-block')?.dataset.setId;
    if (!newSetId) { revert(); return; }

    const siblingIds = [...newList.querySelectorAll('.song-row:not(.drag-placeholder)')]
      .map(li => li.dataset.instanceId)
      .filter(id => id && id !== instanceId);
    const insertIndex = [...newList.children].indexOf(placeholder);
    const finalOrderIds = [
      ...siblingIds.slice(0, insertIndex),
      instanceId,
      ...siblingIds.slice(insertIndex),
    ];

    resolveDrop({
      instance, finalOrderIds, newSetId, insertIndex, siblingIds,
      onCommit: () => { placeholder.remove(); rowEl.classList.remove('drag-source-hidden'); ghost.remove(); },
      onRevert: revert,
    });
  }

  function cleanup() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    cancelAnimationFrame(autoscrollFrame);
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// Figures out which case applies and either commits immediately, prompts
// the user, or reverts.
function resolveDrop({ instance, finalOrderIds, newSetId, insertIndex, siblingIds, onCommit, onRevert }) {
  const state = getState();
  const instanceId = instance.instanceId;
  const myLinkId = instance.linkId || null;

  // Find the chain (if any) that instanceId would land inside the middle
  // of, per finalOrderIds — "inside the middle" means there are members
  // of that chain both before AND after instanceId's position among
  // *that chain's own members' relative order*, i.e. instanceId splits it.
  const dropIndex = finalOrderIds.indexOf(instanceId);
  const before = finalOrderIds[dropIndex - 1];
  const after = finalOrderIds[dropIndex + 1];
  const beforeLink = before ? state.instances[before]?.linkId : null;
  const afterLink = after ? state.instances[after]?.linkId : null;

  if (!myLinkId) {
    // Orphan song. Landing between two members of the SAME other chain
    // (beforeLink === afterLink, and it's a real chain) means we've been
    // dropped into that chain's middle.
    if (beforeLink && beforeLink === afterLink) {
      const chainInsertIndex = chainIndexFor(state, beforeLink, before) + 1;
      const chainName = chainLabel(state, beforeLink);
      const ok = confirm(`This is a medley chain (${chainName}) and cannot be broken. Would you like to add this song to the chain?`);
      if (ok) {
        // Commit position first (plain single-instance move), then fold
        // it into the chain's membership at the matching internal spot.
        moveSingleInstance(instanceId, newSetId, insertIndex, siblingIds);
        addOrphanToChain(instanceId, beforeLink, chainInsertIndex);
        onCommit();
      } else {
        onRevert();
      }
      return;
    }
    // Otherwise: plain legal position (not splitting any chain). Commit.
    moveSingleInstance(instanceId, newSetId, insertIndex, siblingIds);
    onCommit();
    return;
  }

  // Linked song being dragged.
  const stillAdjacentToOwnChain = beforeLink === myLinkId || afterLink === myLinkId;

  if (stillAdjacentToOwnChain) {
    // Reordering within its own chain (or landing right at its edge) —
    // silent. Move the instance, then fix up the chain's internal member
    // order to match its new relative position among its chain-mates.
    moveSingleInstance(instanceId, newSetId, insertIndex, siblingIds);
    reorderWithinChain(state, myLinkId, finalOrderIds);
    onCommit();
    return;
  }

  if (beforeLink && afterLink && beforeLink === afterLink) {
    // Would land inside a DIFFERENT chain's middle — chains can't merge
    // or nest, and a chain member can't join another chain either.
    // No legal action to offer; just revert.
    onRevert();
    return;
  }

  // Landed somewhere with no chain adjacency to its own group at all —
  // ask to unlink.
  const chainName = chainLabel(state, myLinkId);
  const ok = confirm(`"${state.songs[instance.songId]?.title || 'This song'}" is part of the medley "${chainName}". Move it out and unlink it from the medley?`);
  if (ok) {
    moveSingleInstance(instanceId, newSetId, insertIndex, siblingIds);
    extractFromChain(instanceId);
    onCommit();
  } else {
    onRevert();
  }
}

// Returns the index of `memberInstanceId` within its link's own internal
// memberInstanceIds order (used to compute where a joining orphan should
// be spliced into that array).
function chainIndexFor(state, linkId, memberInstanceId) {
  const link = state.links[linkId];
  if (!link) return 0;
  const idx = link.memberInstanceIds.indexOf(memberInstanceId);
  return idx < 0 ? link.memberInstanceIds.length - 1 : idx;
}

function chainLabel(state, linkId) {
  const link = state.links[linkId];
  if (!link) return 'this medley';
  const titles = link.memberInstanceIds
    .map(id => state.songs[state.instances[id]?.songId]?.title)
    .filter(Boolean);
  return titles.join(' / ') || 'this medley';
}

// After a silent within-chain reorder, re-derive the link's own
// memberInstanceIds order from the set's new physical order, so the
// chain's internal sequence (used for export/display ordering) stays in
// sync with where the songs actually now sit.
function reorderWithinChain(state, linkId, finalOrderIds) {
  const link = state.links[linkId];
  if (!link) return;
  const newMemberOrder = finalOrderIds.filter(id => link.memberInstanceIds.includes(id));
  if (newMemberOrder.length === link.memberInstanceIds.length) {
    syncChainMemberOrder(linkId, newMemberOrder);
  }
}

function positionGhost(ghost, clientX, clientY, offsetY, left) {
  ghost.style.position = 'fixed';
  ghost.style.left = left + 'px';
  ghost.style.top = (clientY - offsetY) + 'px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '1000';
}

function findDropTarget(container, clientY) {
  const lists = [...container.querySelectorAll('.song-list')];
  for (const list of lists) {
    const rect = list.getBoundingClientRect();
    if (clientY < rect.top - 20 || clientY > rect.bottom + 20) continue;
    const rows = [...list.querySelectorAll('.song-row:not(.drag-placeholder)')];
    for (const row of rows) {
      const rowRect = row.getBoundingClientRect();
      if (clientY < rowRect.top + rowRect.height / 2) {
        return { list, beforeEl: row };
      }
    }
    return { list, beforeEl: null };
  }
  return null;
}
