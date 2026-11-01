// gig-view.js — renders set blocks + song rows for the active gig (§4.1)

import { getState, getOrderedSets, getSongsForSet, renameGig, renameSet, toggleCompleted, addSet } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { getShowArtists } from '../../lib/settings.js';
import { makeEditable, prepareEditable, enterEditMode } from '../../ui/editable-text.js';
import { bindRowGestures } from '../../lib/gestures.js';
import { startChainDrag } from '../../lib/chain-drag.js';
import { startChainGroupDrag } from '../../lib/chain-group-drag.js';
import { openAttributeModal } from '../attribute-modal/attribute-modal.js';
import { isLinkModeOn, isSelected, toggleSelection, getActiveSetId, finalizeLinkMode, cancelLinkMode } from '../linking/linking.js';
import { openSetMenu } from '../sets/set-menu.js';
import { bindSetHeaderGestures } from '../../lib/set-header-gestures.js';
import { bindSetDragHandle } from '../../lib/set-drag.js';
import { isPlayerModeOn, getPlayerState, playInstance, onPlayerChange } from '../player/player-engine.js';
import { hasPlayableAudio } from '../player/audio-source.js';
import { promptAttachLocalAudio } from '../player/attach-audio-modal.js';
import { autoAttachMissingAudio } from '../player/auto-attach.js';
import { notifyExplicitPlayRequested } from '../player/player-lyrics.js';

let gigViewContainerEl = null;
const collapsedSetIds = new Set(); // session-only UI state, not persisted
const hideStrikethroughSetIds = new Set(); // session-only UI state, not persisted

// Whether the per-set "hide completed/skipped" toggle is currently on —
// Export mirrors this so a printout matches what's on screen.
export function isStruckHiddenInSet(setId) {
  return hideStrikethroughSetIds.has(setId);
}

// The secondary text shown on a song row, per the set's Attribute Display.
export function rowMetaText(instance, attributeDisplay) {
  if (attributeDisplay === 'lead') return instance.lead || '';
  if (attributeDisplay === 'none') return '';
  return [instance.key, instance.bpm ? `${instance.bpm} bpm` : null].filter(Boolean).join(' · ');
}

export function renderGigView(container) {
  const state = getState();
  if (!state.gig) {
    container.innerHTML = '<p class="empty-hint">No gig loaded yet. Import a setlist to begin.</p>';
    return;
  }

  container.innerHTML = '';
  gigViewContainerEl = container;

  const header = document.createElement('div');
  header.className = 'gig-header';
  const titleEl = document.createElement('h1');
  titleEl.textContent = state.gig.name;
  makeEditable(titleEl, {
    getValue: () => state.gig.name,
    onCommit: name => renameGig(name),
    ariaLabel: 'Edit gig name',
  });
  header.appendChild(titleEl);
  container.appendChild(header);

  for (const set of getOrderedSets()) {
    container.appendChild(renderSetBlock(set, state));
  }

  const addSetBtn = document.createElement('button');
  addSetBtn.className = 'btn-add-set';
  addSetBtn.textContent = '+ Add Set';
  addSetBtn.addEventListener('click', () => addSet());
  container.appendChild(addSetBtn);

  if (isLinkModeOn()) {
    container.appendChild(renderLinkModeBar());
  }
}

function renderLinkModeBar() {
  const bar = document.createElement('div');
  bar.className = 'link-mode-bar';
  bar.innerHTML = `
    <span>Select songs to link</span>
    <button class="link-mode-cancel">Cancel</button>
    <button class="link-mode-done">Done</button>
  `;
  bar.querySelector('.link-mode-cancel').addEventListener('click', () => cancelLinkMode());
  bar.querySelector('.link-mode-done').addEventListener('click', () => finalizeLinkMode());
  return bar;
}

function renderSetBlock(set, state) {
  const block = document.createElement('section');
  block.className = 'set-block';
  block.dataset.setId = set.setId;

  const collapsed = collapsedSetIds.has(set.setId);
  if (collapsed) block.classList.add('set-collapsed');

  const header = document.createElement('div');
  header.className = 'set-header';

  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'set-collapse-icon';
  collapseIcon.innerHTML = collapsed ? '&#9656;' : '&#9662;'; // ▶ / ▼
  header.appendChild(collapseIcon);

  const nameEl = document.createElement('span');
  nameEl.className = 'set-name';
  nameEl.textContent = set.name;
  prepareEditable(nameEl, 'Set name — double-click to rename');
  header.appendChild(nameEl);

  bindSetHeaderGestures(header, {
    onTap: () => {
      if (collapsedSetIds.has(set.setId)) collapsedSetIds.delete(set.setId);
      else collapsedSetIds.add(set.setId);
      renderGigView(gigViewContainerEl);
    },
    onDoubleTap: () => {
      enterEditMode(nameEl, {
        getValue: () => set.name,
        onCommit: name => renameSet(set.setId, name),
      });
    },
  });
  bindSetDragHandle(header, { container: gigViewContainerEl });

  const hideStrikethrough = hideStrikethroughSetIds.has(set.setId);
  const hideToggle = document.createElement('button');
  hideToggle.className = 'strike-toggle';
  hideToggle.setAttribute('role', 'switch');
  hideToggle.setAttribute('aria-checked', String(hideStrikethrough));
  hideToggle.setAttribute('aria-label', 'Hide completed and skipped songs');
  hideToggle.title = hideStrikethrough ? 'Show completed/skipped songs' : 'Hide completed/skipped songs';
  hideToggle.innerHTML = '<span class="strike-toggle-knob"></span>';
  hideToggle.addEventListener('click', e => {
    e.stopPropagation();
    if (hideStrikethroughSetIds.has(set.setId)) hideStrikethroughSetIds.delete(set.setId);
    else hideStrikethroughSetIds.add(set.setId);
    renderGigView(gigViewContainerEl);
  });
  header.appendChild(hideToggle);

  const menuBtn = document.createElement('button');
  menuBtn.className = 'set-menu-btn';
  menuBtn.setAttribute('aria-label', 'Set options');
  menuBtn.innerHTML = '&#8942;';
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    openSetMenu(menuBtn, { ...set, gigId: state.gig.gigId });
  });
  header.appendChild(menuBtn);

  block.appendChild(header);

  if (!collapsed) {
    const list = document.createElement('ul');
    list.className = 'song-list';

    const rawInstances = getSongsForSet(set.setId);
    const ordered = sortInstancesForDisplay(rawInstances, set.songOrderMode, state.songs);

    const linkMode = isLinkModeOn();
    const playerMode = isPlayerModeOn();
    const activeSetId = getActiveSetId();
    const setLocked = linkMode && activeSetId && activeSetId !== set.setId;
    const nowPlayingInstanceId = getPlayerState().currentInstanceId;
    ordered.forEach((inst, i) => {
      const row = renderSongRow(inst, state, i + 1, linkMode, set.setId, setLocked, set.attributeDisplay, hideStrikethrough, playerMode, nowPlayingInstanceId);
      if (linkMode) wireLinkModeRow(row, set.setId, setLocked);
      else if (playerMode) wirePlayerModeRow(row);
      else wireRowGestures(row);
      list.appendChild(row);
    });

    block.appendChild(list);
  }

  return block;
}

function renderSongRow(instance, state, seq, linkMode, setId, setLocked, attributeDisplay, hideStrikethrough, playerMode, nowPlayingInstanceId) {
  const song = state.songs[instance.songId] || {};
  const li = document.createElement('li');
  li.className = 'song-row';
  const isStruckThrough = instance.completed === 'done' || instance.completed === 'cut';
  if (instance.completed === 'done') li.classList.add('song-completed');
  if (instance.completed === 'cut') li.classList.add('song-cut');
  if (setLocked) li.classList.add('link-row-locked');
  if (hideStrikethrough && isStruckThrough) li.classList.add('song-row-hidden');
  li.dataset.instanceId = instance.instanceId;

  const link = instance.linkId ? state.links[instance.linkId] : null;
  const dot = link
    ? `<span class="link-dot" style="background:${link.color}" title="Drag to move the whole medley"></span>`
    : '';

  const statusIcon = instance.completed === 'done' ? '✅' : instance.completed === 'cut' ? '❌' : '';

  const meta = rowMetaText(instance, attributeDisplay);

  const checkbox = linkMode
    ? `<input type="checkbox" class="link-checkbox" ${setLocked ? 'disabled' : ''} ${isSelected(instance.instanceId) ? 'checked' : ''}>`
    : '';

  const grip = linkMode ? '' : '<span class="song-grip" aria-label="Drag to reorder">&#9776;</span>';

  let playGlyph = '';
  if (playerMode) {
    const hasAudio = hasPlayableAudio(song);
    const isNowPlaying = instance.instanceId === nowPlayingInstanceId;
    if (!hasAudio) li.classList.add('no-audio');
    if (isNowPlaying) li.classList.add('now-playing');
    playGlyph = isNowPlaying
      ? '<span class="player-eq"><span></span><span></span><span></span></span>'
      : `<span class="song-play-glyph">${hasAudio ? '&#9654;' : '&#65291;'}</span>`;
  }

  li.innerHTML = `
    ${checkbox}
    <span class="song-seq">${seq}</span>
    ${dot}
    ${playGlyph}
    ${statusIcon ? `<span class="song-status-icon">${statusIcon}</span>` : ''}
    <span class="song-title">${escapeHtml(song.title || '(unknown song)')}${song.artist && getShowArtists() ? ` <span class="song-artist">${escapeHtml(song.artist)}</span>` : ''}</span>
    ${meta ? `<span class="song-meta">${escapeHtml(meta)}</span>` : ''}
    ${grip}
  `;
  return li;
}

function wireRowGestures(row) {
  bindRowGestures(row, {
    onTap: () => toggleCompleted(row.dataset.instanceId),
    onDoubleTap: () => openAttributeModal(row.dataset.instanceId),
  });

  const grip = row.querySelector('.song-grip');
  if (grip) {
    grip.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (!gigViewContainerEl) return;
      startChainDrag(grip, row, e.pointerId, e, { container: gigViewContainerEl });
    });
  }

  const dot = row.querySelector('.link-dot');
  if (dot) {
    dot.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (!gigViewContainerEl) return;
      startChainGroupDrag(dot, row, e.pointerId, e, { container: gigViewContainerEl });
    });
  }
}

function wirePlayerModeRow(row) {
  const instanceId = row.dataset.instanceId;
  row.addEventListener('click', async () => {
    const state = getState();
    const instance = state.instances[instanceId];
    if (!instance) return;
    const song = state.songs[instance.songId];
    notifyExplicitPlayRequested();

    if (hasPlayableAudio(song)) {
      playInstance(instanceId);
      return;
    }

    // Try the linked music folder before falling back to a manual picker —
    // covers songs added/renamed since the last folder scan this session.
    // (Only relevant on desktop; on a phone with no folder linked this is
    // a fast no-op and falls straight through to the manual picker.)
    await autoAttachMissingAudio().catch(() => {});
    if (hasPlayableAudio(state.songs[instance.songId])) {
      renderGigView(gigViewContainerEl);
      playInstance(instanceId);
      return;
    }

    promptAttachLocalAudio(instance.songId, song?.title || 'this song', () => playInstance(instanceId));
  });
}

function wireLinkModeRow(row, setId, setLocked) {
  if (setLocked) return; // rows in a non-active set are inert while a group session is scoped elsewhere
  const instanceId = row.dataset.instanceId;
  const checkbox = row.querySelector('.link-checkbox');
  checkbox.addEventListener('click', e => e.stopPropagation());
  checkbox.addEventListener('change', () => {
    const { blocked, reason } = toggleSelection(instanceId, setId);
    if (blocked) {
      checkbox.checked = false;
      if (reason === 'already-in-other-group') {
        alert('This song is already linked in another group. Edit that group instead.');
      } else if (reason === 'different-set') {
        alert('A medley group stays within one set.');
      }
      return;
    }
    row.classList.toggle('link-selected', checkbox.checked);
    // Locking/unlocking the active set changes which rows are selectable
    // elsewhere on the page, so re-render.
    document.dispatchEvent(new CustomEvent('linkSelectionChanged'));
  });
  row.addEventListener('click', () => {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
