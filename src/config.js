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

// Player Mode streams audio from a Cloudflare R2 bucket (song.audioUrl,
// see src/features/player/audio-source.js) with local-file attachment as
// a same-session fallback — works on any device, including phones, so
// it's enabled everywhere now.
export const PLAYER_MODE_ENABLED = true;
