// output-helpers.js — small shared helpers for features that hand something
// back to the user as a file or a message (Export, Backup).

export function fileSlug(title, fallback = 'setlist') {
  return (title || fallback).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || fallback;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function toast(message, ms = 2600) {
  document.getElementById('export-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'export-toast';
  el.className = 'export-toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
