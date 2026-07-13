// colors.js — link color pool assignment/return, per §7.4

import { LINK_COLORS } from '../config.js';

export function assignColor(usedColors) {
  const used = new Set(usedColors);
  const next = LINK_COLORS.find(c => !used.has(c));
  return next || LINK_COLORS[usedColors.length % LINK_COLORS.length];
}
