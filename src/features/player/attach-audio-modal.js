// attach-audio-modal.js — tapping a song with no local audio in Player
// Mode prompts to pick a local MP3 file for it (session-only attachment).

import { attachLocalAudio } from './local-audio-library.js';

export function promptAttachLocalAudio(songId, title, onAttached) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,.mp3,audio/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    attachLocalAudio(songId, file);
    onAttached?.();
  });

  input.addEventListener('cancel', () => input.remove());

  const confirmed = confirm(`No audio attached to "${title}" yet. Choose a local MP3 file for this song? (This is temporary — only lasts for this browser session.)`);
  if (!confirmed) {
    input.remove();
    return;
  }
  input.click();
}
