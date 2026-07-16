// main.js — app entry point

import { fileToRows } from './lib/xlsx.js';
import { importGigFromRows } from './data/importer.js';
import { loadGig, subscribe, getState } from './data/store.js';
import { renderGigView } from './features/gig-view/gig-view.js';
import { loadGigBundle, saveGigBundle } from './firebase/sync.js';
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

subscribe(() => renderGigView(gigViewEl));

async function loadSeedGigFromFile(gigId = null) {
  const res = await fetch('./src/data/seed-july12.json');
  const { sheetName, rows } = await res.json();
  return importGigFromRows(rows, sheetName, gigId);
}

async function bootstrap() {
  try {
    const existing = await loadGigBundle(SEED_GIG_ID);
    if (existing) {
      loadGig(existing);
      console.log('Loaded gig from Firestore:', existing.gig);
      return;
    }
  } catch (err) {
    console.error('Firestore load failed, falling back to local seed:', err);
  }

  const data = await loadSeedGigFromFile(SEED_GIG_ID);
  loadGig(data);

  try {
    await saveGigBundle(data);
    console.log('Seeded Firestore with imported gig.');
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
