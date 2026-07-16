// mini-player.js — the persistent playback bar shown at the bottom of the
// screen while Player Mode has an active track, per the approved mock.

import {
  getPlayerState, onPlayerChange, togglePlayPause, seekBy, seekTo, stop,
  playNext, playPrevious, setLoopStart, setLoopEnd, toggleLoopActive, clearLoop,
} from './player-engine.js';
import { getState, getSongsForSet } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';

let barEl = null;
let unsubscribe = null;

export function mountMiniPlayer(container) {
  unmountMiniPlayer();
  unsubscribe = onPlayerChange(state => render(container, state));
  render(container, getPlayerState());
}

export function unmountMiniPlayer() {
  unsubscribe?.();
  unsubscribe = null;
  barEl?.remove();
  barEl = null;
}

function render(container, playerState) {
  if (!playerState.currentInstanceId || !playerState.song) {
    barEl?.remove();
    barEl = null;
    return;
  }

  if (!barEl) {
    barEl = document.createElement('div');
    barEl.className = 'mini-player';
    container.appendChild(barEl);
  }

  const state = getState();
  const instance = state.instances[playerState.currentInstanceId];
  const set = instance ? state.sets[instance.setId] : null;
  const seq = instance && set ? indexInSet(instance, set) : null;

  const dur = playerState.duration || 0;
  const cur = playerState.currentTime || 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  const { loopStart, loopEnd, loopActive } = playerState;
  const loopStartPct = loopStart != null && dur > 0 ? (loopStart / dur) * 100 : null;
  const loopEndPct = loopEnd != null && dur > 0 ? (loopEnd / dur) * 100 : null;
  const loopReady = loopStart != null && loopEnd != null;

  barEl.innerHTML = `
    <div class="mp-track">
      <div class="mp-art">🎵</div>
      <div class="mp-info">
        <div class="mp-title">${escapeHtml(playerState.song.title)}</div>
        <div class="mp-sub">${escapeHtml(set?.name || '')}${seq ? ` · Track ${seq}` : ''}</div>
      </div>
      <button class="mp-stop" aria-label="Stop">&#9632;</button>
    </div>
    <div class="mp-scrub">
      <span class="mp-time">${formatTime(cur)}</span>
      <div class="mp-bar">
        <div class="mp-bar-fill" style="width:${pct}%"></div>
        ${loopStartPct != null ? `<div class="mp-loop-marker mp-loop-marker-start" style="left:${loopStartPct}%"></div>` : ''}
        ${loopEndPct != null ? `<div class="mp-loop-marker mp-loop-marker-end" style="left:${loopEndPct}%"></div>` : ''}
        ${loopStartPct != null && loopEndPct != null ? `<div class="mp-loop-region" style="left:${loopStartPct}%;width:${loopEndPct - loopStartPct}%"></div>` : ''}
        <div class="mp-bar-knob" style="left:${pct}%"></div>
        <input type="range" class="mp-bar-input" min="0" max="${dur || 0}" step="0.1" value="${cur}" aria-label="Seek">
      </div>
      <span class="mp-time end">${formatTime(dur)}</span>
    </div>
    <div class="mp-controls">
      <button class="mp-btn secondary" aria-label="Rewind 10 seconds" data-action="rw">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
      <button class="mp-btn secondary" aria-label="Previous song" data-action="prev">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button class="mp-btn play-pause" aria-label="${playerState.isPlaying ? 'Pause' : 'Play'}" data-action="play-pause">
        ${playerState.isPlaying
          ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'}
      </button>
      <button class="mp-btn secondary" aria-label="Next song" data-action="next">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>
      </button>
      <button class="mp-btn secondary" aria-label="Forward 10 seconds" data-action="ff">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
      </button>
    </div>
    <div class="mp-loop-controls">
      <button class="mp-loop-btn" data-action="loop-start" aria-label="Set loop start at current position">Set Start${loopStart != null ? ` (${formatTime(loopStart)})` : ''}</button>
      <button class="mp-loop-btn" data-action="loop-end" aria-label="Set loop end at current position">Set End${loopEnd != null ? ` (${formatTime(loopEnd)})` : ''}</button>
      <button class="mp-loop-btn mp-loop-toggle${loopActive ? ' active' : ''}" data-action="loop-toggle" aria-pressed="${loopActive}" ${loopReady ? '' : 'disabled'}>&#8635; Loop</button>
      ${(loopStart != null || loopEnd != null) ? '<button class="mp-loop-btn mp-loop-clear" data-action="loop-clear" aria-label="Clear loop points">Clear</button>' : ''}
    </div>
  `;

  barEl.querySelector('[data-action="play-pause"]').addEventListener('click', togglePlayPause);
  barEl.querySelector('[data-action="rw"]').addEventListener('click', () => seekBy(-10));
  barEl.querySelector('[data-action="ff"]').addEventListener('click', () => seekBy(10));
  barEl.querySelector('[data-action="prev"]').addEventListener('click', () => playPrevious());
  barEl.querySelector('[data-action="next"]').addEventListener('click', () => playNext());
  barEl.querySelector('.mp-stop').addEventListener('click', () => stop());
  barEl.querySelector('.mp-bar-input').addEventListener('input', e => seekTo(Number(e.target.value)));
  barEl.querySelector('[data-action="loop-start"]').addEventListener('click', () => setLoopStart());
  barEl.querySelector('[data-action="loop-end"]').addEventListener('click', () => setLoopEnd());
  barEl.querySelector('[data-action="loop-toggle"]').addEventListener('click', () => toggleLoopActive());
  barEl.querySelector('[data-action="loop-clear"]')?.addEventListener('click', () => clearLoop());
}

function indexInSet(instance, set) {
  const state = getState();
  const raw = getSongsForSet(set.setId);
  const ordered = sortInstancesForDisplay(raw, set.songOrderMode, state.songs);
  const idx = ordered.findIndex(i => i.instanceId === instance.instanceId);
  return idx < 0 ? null : idx + 1;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
