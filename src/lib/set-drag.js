// set-drag.js — long-press-drag reordering of whole set blocks within the
// gig view. Mirrors drag-reorder.js's song-row pattern but operates one
// level up: dragging a .set-block header moves the entire block (name +
// all its songs) to a new position among sibling set blocks.

import { reorderSets } from '../data/store.js';

const AUTOSCROLL_EDGE = 60;
const AUTOSCROLL_SPEED = 12;
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD_PX = 10;

// Attaches a long-press-to-drag gesture to a set header; a plain click
// (no hold, no movement) falls through untouched so tap/double-tap on the
// header still work.
export function bindSetDragHandle(headerEl, { container }) {
  let pressTimer = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  headerEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;

    pressTimer = setTimeout(() => {
      dragging = true;
      startSetDrag(headerEl.closest('.set-block'), e.pointerId, e, { container });
    }, LONG_PRESS_MS);
  });

  headerEl.addEventListener('pointermove', e => {
    if (dragging) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) clearTimeout(pressTimer);
  });

  headerEl.addEventListener('pointerup', () => clearTimeout(pressTimer));
  headerEl.addEventListener('pointercancel', () => clearTimeout(pressTimer));
}

function startSetDrag(setBlockEl, pointerId, initialEvent, { container }) {
  if (!setBlockEl) return;

  const rect = setBlockEl.getBoundingClientRect();
  const offsetY = initialEvent.clientY - rect.top;

  const ghost = setBlockEl.cloneNode(true);
  ghost.classList.add('drag-ghost', 'set-drag-ghost');
  ghost.style.width = rect.width + 'px';
  ghost.style.maxHeight = '160px';
  ghost.style.overflow = 'hidden';
  document.body.appendChild(ghost);
  positionGhost(ghost, initialEvent.clientX, initialEvent.clientY, offsetY, rect.left);

  setBlockEl.classList.add('drag-source-hidden');

  const placeholder = document.createElement('div');
  placeholder.className = 'set-block drag-placeholder set-drag-placeholder';
  placeholder.style.height = rect.height + 'px';
  setBlockEl.parentNode.insertBefore(placeholder, setBlockEl);

  let autoscrollFrame = null;

  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    positionGhost(ghost, e.clientX, e.clientY, offsetY, rect.left);
    handleAutoscroll(e.clientY);

    const beforeEl = findDropTarget(container, e.clientY);
    if (beforeEl !== placeholder) {
      container.insertBefore(placeholder, beforeEl);
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

    placeholder.replaceWith(setBlockEl);
    setBlockEl.classList.remove('drag-source-hidden');
    ghost.remove();

    const orderedSetIds = [...container.querySelectorAll('.set-block')]
      .map(el => el.dataset.setId)
      .filter(Boolean);

    reorderSets(orderedSetIds);
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
  const blocks = [...container.querySelectorAll('.set-block:not(.drag-placeholder)')];
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return block;
  }
  return container.querySelector('.btn-add-set'); // insertBefore the add-set button = append at end
}
