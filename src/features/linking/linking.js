// linking.js — Link Mode: a top-bar toggle that reveals selection
// checkboxes on song rows so the user can build one medley (Link) at a
// time. Tapping the link icon first shows a small picker: "New Group" or
// "Edit Group" (listing existing groups to choose from). Whichever is
// picked, Link Mode becomes active scoped to exactly ONE group at a time —
// this keeps multiple groups in the same set from ever interfering with
// each other, since only one group's selection is ever being built.
//
// Design note: this replaces both the original double-tap "linking
// submenu" spec (§4.3/§6) and an earlier "all groups editable
// simultaneously" version of this file that had a bug where two different
// new groups in the same set could merge into one on finalize.

import { getState, createLink, dissolveLink } from '../../data/store.js';

let linkModeOn = false;
let activeLinkId = null; // set when editing an existing group; null when building a new one
let activeSetId = null;  // the set this session is scoped to (locked in once the first song is checked)
const selected = new Set(); // instanceIds currently checked this session
let onModeChange = null;

export function isLinkModeOn() {
  return linkModeOn;
}

export function initLinking({ onChange }) {
  onModeChange = onChange;
}

// Returns existing groups (links), each with its set name and member
// titles, for the "Edit Group" picker.
export function listExistingGroups() {
  const state = getState();
  return Object.values(state.links).map(link => {
    const members = link.memberInstanceIds
      .map(id => state.instances[id])
      .filter(Boolean);
    const setId = members[0]?.setId;
    const setName = state.sets[setId]?.name || '(unknown set)';
    const titles = members.map(inst => state.songs[inst.songId]?.title || '(unknown song)');
    return { linkId: link.linkId, color: link.color, setName, titles };
  });
}

// Begin building a brand-new group. Scope (which set) is locked in as
// soon as the first song is checked.
export function startNewGroup() {
  activeLinkId = null;
  activeSetId = null;
  selected.clear();
  linkModeOn = true;
  onModeChange?.();
}

// Begin editing an existing group — pre-checks its current members and
// scopes the session to its set.
export function startEditGroup(linkId) {
  const state = getState();
  const link = state.links[linkId];
  if (!link) return;
  activeLinkId = linkId;
  selected.clear();
  for (const id of link.memberInstanceIds) selected.add(id);
  activeSetId = state.instances[link.memberInstanceIds[0]]?.setId || null;
  linkModeOn = true;
  onModeChange?.();
}

export function cancelLinkMode() {
  linkModeOn = false;
  activeLinkId = null;
  activeSetId = null;
  selected.clear();
  onModeChange?.();
}

// The set this session is scoped to, or null if not yet locked in (no
// selection made yet — any set's checkboxes are still eligible).
export function getActiveSetId() {
  return activeSetId;
}

export function isSelected(instanceId) {
  return selected.has(instanceId);
}

// Returns the linkId+color of a link this instance already belongs to —
// used to render "already linked elsewhere" indicators, and to block
// picking up a song mid-New-Group-build that's already claimed by a
// DIFFERENT group than the one currently being edited.
export function existingLinkFor(instanceId) {
  const state = getState();
  return state.instances[instanceId]?.linkId
    ? state.links[state.instances[instanceId].linkId]
    : null;
}

// §6.2/§6.6: toggling a checkbox. Scoped to one set (locks in on first
// pick) and blocks picking up a song that already belongs to a DIFFERENT
// group than the one being edited right now.
export function toggleSelection(instanceId, setId) {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return { blocked: false };

  if (selected.has(instanceId)) {
    selected.delete(instanceId);
    if (selected.size === 0) activeSetId = null;
    return { blocked: false };
  }

  if (activeSetId && setId !== activeSetId) {
    return { blocked: true, reason: 'different-set' };
  }

  // An instance's linkId only counts as "still linked" if that Link
  // record actually still exists — a stale/orphaned linkId (left behind
  // by a bug, or a link deleted through some other path) must never block
  // re-linking.
  const otherLink = instance.linkId && state.links[instance.linkId] ? instance.linkId : null;
  if (otherLink && otherLink !== activeLinkId) {
    return { blocked: true, reason: 'already-in-other-group' };
  }

  selected.add(instanceId);
  activeSetId = setId;
  return { blocked: false };
}

// Finalize the current session: dissolve the link being edited (if any)
// and, if 2+ songs remain selected, (re)create it clustered contiguously.
// Dropping below 2 during an edit dissolves the group entirely (§6.5).
export function finalizeLinkMode() {
  const state = getState();
  const setId = activeSetId;
  const finalSelected = [...selected];

  if (activeLinkId && state.links[activeLinkId]) {
    dissolveLink(activeLinkId);
  }

  if (setId && finalSelected.length >= 2) {
    const setOrder = Object.values(state.instances)
      .filter(i => i.setId === setId)
      .sort((a, b) => a.order - b.order)
      .map(i => i.instanceId)
      .filter(id => finalSelected.includes(id));
    createLink(setId, setOrder);
  }

  linkModeOn = false;
  activeLinkId = null;
  activeSetId = null;
  selected.clear();
  onModeChange?.();
}
