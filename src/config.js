// config.js — app-wide constants

// §5.1: "click" = single/double-tap + long-press-drag. "explicit" = tap-only
// with a Link button inside the attribute modal. Flip this to A/B test.
export const INTERACTION_MODE = 'click'; // "click" | "explicit"

// §7.4: link (medley) colors — 12 quaternary + neutrals, assigned in order
// and returned to the pool when a link dissolves. Chosen so adjacent entries
// are visually distinguishable at a glance on a small phone screen.
export const LINK_COLORS = [
  '#E4572E', '#3A7CA5', '#8A5CF6', '#2E933C',
  '#D6A429', '#C43F8D', '#1B998B', '#B5484E',
  '#4C6EF5', '#E08E45', '#6B8E23', '#A64AC9',
];

export const DOUBLE_TAP_MS = 300;
export const LONG_PRESS_MS = 400;

// Player Mode currently only supports local-file audio (no cloud
// storage/streaming wired up yet — see project notes). Fully functional
// on localhost for continued development; shows a "Coming Soon" message
// on the deployed site so it isn't exposed half-finished to real users.
export const PLAYER_MODE_ENABLED =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';
