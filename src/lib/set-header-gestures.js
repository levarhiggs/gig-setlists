// set-header-gestures.js — single tap collapses/expands a set block;
// double tap renames it. Long-press+drag is handled separately by
// set-drag.js (reordering whole set blocks), not by this module.

import { DOUBLE_TAP_MS } from '../config.js';

// Attaches tap/doubleTap handlers to a set header element.
// handlers: { onTap(), onDoubleTap() }
export function bindSetHeaderGestures(el, handlers) {
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
