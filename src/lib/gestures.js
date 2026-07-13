// gestures.js — tap / double-tap disambiguation for song rows (§5.1).
// Dragging is no longer triggered by long-press on the row body (it
// competed too easily with tap) — see chain-drag.js's grip handle
// instead, which starts a drag immediately on its own pointerdown.

import { DOUBLE_TAP_MS } from '../config.js';

// Attaches tap/doubleTap handlers to a row element.
// handlers: { onTap(), onDoubleTap() }
export function bindRowGestures(el, handlers) {
  let tapTimer = null;
  let tapCount = 0;

  el.addEventListener('click', () => {
    tapCount += 1;
    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
        handlers.onTap?.();
      }, DOUBLE_TAP_MS);
    } else if (tapCount === 2) {
      clearTimeout(tapTimer);
      tapCount = 0;
      handlers.onDoubleTap?.();
    }
  });
}
