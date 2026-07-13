// chain-group-drag.js — dragging a chain's colored link-dot moves the
// WHOLE medley (all its members, contiguous, internal order preserved) to
// a new position — the counterpart to chain-drag.js, which always moves
// just one song via its own grip.

import { getState, moveInstance } from '../data/store.js';

const AUTOSCROLL_EDGE = 60;
const AUTOSCROLL_SPEED = 12;

export function startChainGroupDrag(dotEl, rowEl, pointerId, initialEvent, { container }) {
  const instanceId = rowEl.dataset.instanceId;
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance || !instance.linkId) return;

  const rect = rowEl.getBoundingClientRect();
  const offsetY = initialEvent.clientY - rect.top;

  const ghost = rowEl.cloneNode(true);
  ghost.classList.add('drag-ghost', 'chain-group-drag-ghost');
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

  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    cleanup();

    const newList = placeholder.parentNode;
    const newSetId = newList.closest('.set-block')?.dataset.setId;
    if (newSetId) {
      const siblingIds = [...newList.querySelectorAll('.song-row:not(.drag-placeholder)')]
        .map(li => li.dataset.instanceId)
        .filter(Boolean);
      const insertIndex = [...newList.children].indexOf(placeholder);
      moveInstance(instanceId, newSetId, insertIndex, siblingIds);
    }

    placeholder.remove();
    rowEl.classList.remove('drag-source-hidden');
    ghost.remove();
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
