// main.js — app entry point

import { fileToRows } from './lib/xlsx.js';
import { importGigFromRows } from './data/importer.js';
import { loadGig, loadLocalCache, subscribe, getState } from './data/store.js';
import { renderGigView } from './features/gig-view/gig-view.js';
import { loadGigBundle, saveGigBundle, listGigs } from './firebase/sync.js';
import { initExportMenu } from './features/export/export-gig.js';
import { initAddMenu } from './ui/add-menu.js';
import { initLinking, isLinkModeOn, cancelLinkMode } from './features/linking/linking.js';
import { openLinkPicker } from './features/linking/link-picker.js';
import { openSaveDialog, openLoadGigPicker } from './features/save-gig/save-gig.js';
import { isPlayerModeOn, togglePlayerMode, onTrackChange } from './features/player/player-engine.js';
import { mountMiniPlayer } from './features/player/mini-player.js';
import { initPlayerLyrics, isPlayerLyricsOpen } from './features/player/player-lyrics.js';
import { autoAttachMissingAudio, invalidateFileListCache } from './features/player/auto-attach.js';
import { isFolderAccessSupported, getStoredMusicFolder, chooseMusicFolder } from './features/player/folder-access.js';
import { hasPlayableAudio } from './features/player/audio-source.js';
import { ensureUserName } from './features/identity/identity.js';
import { openActivityView } from './features/activity/activity-view.js';
import { PLAYER_MODE_ENABLED } from './config.js';

const SEED_GIG_ID = 'gig_july_12';

const gigViewEl = document.getElementById('gig-view');
const importInput = document.getElementById('import-file');
const linkModeBtn = document.getElementById('link-mode-btn');
const playerModeBtn = document.getElementById('player-mode-btn');
const saveBtn = document.getElementById('save-btn');
const appTitleEl = document.querySelector('.app-title');

ensureUserName();

// Discreet admin entry point: 5 taps on the app title within 2s opens the
// Activity Log. Not hinted anywhere in the UI — singers never need it,
// and it stays out of their way entirely.
let titleTapCount = 0;
let titleTapTimer = null;
appTitleEl?.addEventListener('click', () => {
  titleTapCount += 1;
  clearTimeout(titleTapTimer);
  if (titleTapCount >= 5) {
    titleTapCount = 0;
    openActivityView();
    return;
  }
  titleTapTimer = setTimeout(() => { titleTapCount = 0; }, 2000);
});

// Reopen whichever gig was last on screen (per device) instead of always
// jumping back to the seed gig.
const LAST_GIG_KEY = 'setlist_last_gig_id';

subscribe(() => {
  renderGigView(gigViewEl);
  const gigId = getState().gig?.gigId;
  if (gigId) {
    try { localStorage.setItem(LAST_GIG_KEY, gigId); } catch { /* storage full/blocked — non-fatal */ }
  }
});

async function loadSeedGigFromFile(gigId = null) {
  const res = await fetch('./src/data/seed-july12.json');
  const { sheetName, rows } = await res.json();
  return importGigFromRows(rows, sheetName, gigId);
}

// A banner that sits above the gig view (renderGigView replaces the gig
// view's own contents, so it can't live in there).
function showConnectionBanner(message) {
  let banner = document.getElementById('connection-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'connection-banner';
    banner.className = 'connection-banner';
    banner.innerHTML = '<span class="connection-banner-text"></span><button class="connection-banner-retry">Retry</button>';
    banner.querySelector('button').addEventListener('click', () => bootstrap());
    gigViewEl.before(banner);
  }
  banner.querySelector('.connection-banner-text').textContent = message;
}

function hideConnectionBanner() {
  document.getElementById('connection-banner')?.remove();
}

// Safe-failure path: when Firestore can't be read we show the copy cached on
// this device (or an error) and NEVER write anything. Treating a failed read
// as "no data" and re-seeding is what overwrote the real reunion gig on
// 2026-07-22.
function showLoadFailure() {
  if (loadLocalCache()) {
    showConnectionBanner("Couldn't reach the cloud — showing the copy saved on this device. Changes may not sync until you're back online.");
  } else {
    gigViewEl.innerHTML = '<p class="empty-hint">Couldn\'t load your gigs, and there\'s no saved copy on this device yet.</p>';
    showConnectionBanner("Couldn't reach the cloud.");
  }
}

async function bootstrap() {
  let preferredId = SEED_GIG_ID;
  try { preferredId = localStorage.getItem(LAST_GIG_KEY) || SEED_GIG_ID; } catch { /* blocked storage */ }

  let bundle = null;
  try {
    bundle = await loadGigBundle(preferredId);
    if (!bundle && preferredId !== SEED_GIG_ID) bundle = await loadGigBundle(SEED_GIG_ID);
    if (!bundle) {
      // That gig is gone, but others may exist — open the most recently
      // saved one rather than ever overwriting anything.
      const gigs = await listGigs();
      if (gigs[0]?.gigId) bundle = await loadGigBundle(gigs[0].gigId);
    }
  } catch (err) {
    console.error('Firestore load failed — not touching the database:', err);
    showLoadFailure();
    return;
  }

  hideConnectionBanner();

  if (bundle) {
    loadGig(bundle);
    console.log('Loaded gig from Firestore:', bundle.gig);
    return;
  }

  // Reads succeeded and the database has no gigs at all: genuine first run.
  const data = await loadSeedGigFromFile(SEED_GIG_ID);
  loadGig(data);
  try {
    await saveGigBundle(data);
    console.log('First run: seeded Firestore with the starter gig.');
  } catch (err) {
    console.error('Failed to seed Firestore (working from local state only):', err);
  }
}

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const { sheetName, rows } = await fileToRows(file);
    const data = importGigFromRows(rows, sheetName);
    loadGig(data);
    console.log('Imported gig:', data.gig, data);
    try {
      await saveGigBundle(data);
    } catch (err) {
      console.error('Failed to save imported gig to Firestore:', err);
    }
  } catch (err) {
    console.error('Import failed:', err);
    alert('Import failed — see console for details.');
  } finally {
    importInput.value = '';
  }
});

initAddMenu({
  onBulkImport: () => importInput.click(),
  onOpenSaved: () => openLoadGigPicker({
    onLoad: bundle => {
      loadGig(bundle);
      console.log('Loaded saved gig:', bundle.gig);
    },
  }),
});

saveBtn.addEventListener('click', () => {
  openSaveDialog({
    onSaved: ({ mode, gig }) => {
      console.log(`Gig ${mode === 'overwrite' ? 'overwritten' : 'saved as copy'}`, gig?.name);
    },
  });
});

initExportMenu();

initLinking({
  onChange: () => {
    linkModeBtn.setAttribute('aria-pressed', String(isLinkModeOn()));
    renderGigView(gigViewEl);
  },
});
document.addEventListener('linkSelectionChanged', () => renderGigView(gigViewEl));

linkModeBtn.addEventListener('click', () => {
  if (isLinkModeOn()) {
    cancelLinkMode();
  } else {
    openLinkPicker();
  }
});

playerModeBtn.addEventListener('click', async () => {
  if (!PLAYER_MODE_ENABLED) {
    alert('Player Mode — coming soon!');
    return;
  }

  const turningOn = !isPlayerModeOn();
  togglePlayerMode();
  if (!turningOn) return;

  // Fire-and-forget: don't block Player Mode turning on while this runs —
  // songs just fill in with audio as matches are found.
  fillInMissingAudio();
});

async function fillInMissingAudio() {
  if (!isFolderAccessSupported()) return; // Firefox/Safari, phones — manual attach is still available

  // Most songs stream from R2 already (see audio-source.js) — only bother
  // with the local-folder flow (and its one-time link prompt) when
  // something is actually still missing audio.
  const anyMissing = Object.values(getState().songs).some(s => !hasPlayableAudio(s));
  if (!anyMissing) return;

  let folder = await getStoredMusicFolder();
  if (!folder) {
    const wantsToLink = confirm(
      'Some songs still need audio.\n\nLink your D:\\Music Downloads\\ folder once, and Player Mode will find and load the rest automatically from now on — no more re-selecting files after every refresh.'
    );
    if (!wantsToLink) return;
    try {
      folder = await chooseMusicFolder();
      invalidateFileListCache();
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Folder link failed:', err);
      return;
    }
  }

  try {
    const count = await autoAttachMissingAudio();
    if (count > 0) {
      console.log(`Auto-attached audio for ${count} song(s) from the linked music folder.`);
      renderGigView(gigViewEl); // no-audio dimming/glyphs depend on this
    }
  } catch (err) {
    console.error('Auto-attach failed:', err);
  }
}

onTrackChange(state => {
  playerModeBtn.setAttribute('aria-pressed', String(state.playerModeOn));
  playerModeBtn.classList.toggle('play-lit', state.playerModeOn);
  if (!isPlayerLyricsOpen()) mountMiniPlayer(document.body);
  renderGigView(gigViewEl); // now-playing row highlight + no-audio dimming depend on this
});

initPlayerLyrics();

bootstrap();
