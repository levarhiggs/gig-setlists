// main.js — app entry point

import { fileToRows } from './lib/xlsx.js';
import { importGigFromRows } from './data/importer.js';
import { loadGig, subscribe } from './data/store.js';
import { renderGigView } from './features/gig-view/gig-view.js';
import { loadGigBundle, saveGigBundle } from './firebase/sync.js';
import { initAddMenu } from './ui/add-menu.js';
import { initLinking, isLinkModeOn, cancelLinkMode } from './features/linking/linking.js';
import { openLinkPicker } from './features/linking/link-picker.js';
import { openSaveDialog, openLoadGigPicker } from './features/save-gig/save-gig.js';

const SEED_GIG_ID = 'gig_july_12';

const gigViewEl = document.getElementById('gig-view');
const importInput = document.getElementById('import-file');
const linkModeBtn = document.getElementById('link-mode-btn');
const saveBtn = document.getElementById('save-btn');

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

bootstrap();
