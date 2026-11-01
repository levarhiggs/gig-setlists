const CACHE = 'gig-setlists-v12';
const SHELL = [
  '/gig-setlists/',
  '/gig-setlists/index.html',
  '/gig-setlists/style.css',
  '/gig-setlists/manifest.json',
  '/gig-setlists/icon-192.png',
  '/gig-setlists/icon-512.png',
  '/gig-setlists/favicon.png',
  '/gig-setlists/src/config.js',
  '/gig-setlists/src/data/importer.js',
  '/gig-setlists/src/data/models.js',
  '/gig-setlists/src/data/seed-july12.json',
  '/gig-setlists/src/data/store.js',
  '/gig-setlists/src/features/activity/activity-view.js',
  '/gig-setlists/src/features/add-song/add-song-modal.js',
  '/gig-setlists/src/features/attribute-modal/attribute-modal.js',
  '/gig-setlists/src/features/backup/backup.js',
  '/gig-setlists/src/features/bulk-audio/bulk-audio-upload.js',
  '/gig-setlists/src/features/bulk-audio/bulk-local-attach.js',
  '/gig-setlists/src/features/export/export-gig.js',
  '/gig-setlists/src/features/export/export-songs.js',
  '/gig-setlists/src/features/gig-view/gig-view.js',
  '/gig-setlists/src/features/identity/identity.js',
  '/gig-setlists/src/features/identity/name-prompt.js',
  '/gig-setlists/src/features/import-help/import-help.js',
  '/gig-setlists/src/features/linking/link-picker.js',
  '/gig-setlists/src/features/linking/linking.js',
  '/gig-setlists/src/features/merge-songs/merge-songs.js',
  '/gig-setlists/src/features/new-gig/new-gig-modal.js',
  '/gig-setlists/src/features/player/attach-audio-modal.js',
  '/gig-setlists/src/features/player/audio-source.js',
  '/gig-setlists/src/features/player/auto-attach.js',
  '/gig-setlists/src/features/player/folder-access.js',
  '/gig-setlists/src/features/player/local-audio-library.js',
  '/gig-setlists/src/features/player/mini-player.js',
  '/gig-setlists/src/features/player/player-engine.js',
  '/gig-setlists/src/features/player/player-lyrics.js',
  '/gig-setlists/src/features/save-gig/save-gig.js',
  '/gig-setlists/src/features/sets/set-menu.js',
  '/gig-setlists/src/features/settings/settings-modal.js',
  '/gig-setlists/src/features/song-names/tidy-song-names.js',
  '/gig-setlists/src/firebase/activity-log.js',
  '/gig-setlists/src/firebase/audio-storage.js',
  '/gig-setlists/src/firebase/init.js',
  '/gig-setlists/src/firebase/sync.js',
  '/gig-setlists/src/lib/audio-match.js',
  '/gig-setlists/src/lib/chain-drag.js',
  '/gig-setlists/src/lib/chain-group-drag.js',
  '/gig-setlists/src/lib/colors.js',
  '/gig-setlists/src/lib/gestures.js',
  '/gig-setlists/src/lib/ordering.js',
  '/gig-setlists/src/lib/set-drag.js',
  '/gig-setlists/src/lib/set-header-gestures.js',
  '/gig-setlists/src/lib/settings.js',
  '/gig-setlists/src/lib/song-names.js',
  '/gig-setlists/src/lib/xlsx.js',
  '/gig-setlists/src/main.js',
  '/gig-setlists/src/ui/add-menu.js',
  '/gig-setlists/src/ui/editable-text.js',
  '/gig-setlists/src/ui/output-helpers.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for same-origin app files so updates show up promptly;
// falls back to cache when offline. Firestore/CDN requests pass through
// untouched (never cached here — Firestore has its own offline layer).
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
