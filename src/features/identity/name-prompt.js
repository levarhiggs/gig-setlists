// name-prompt.js — a tiny modal standing in for prompt(), which Electron's
// renderer does not support at all (throws "prompt() is and will not be
// supported"). Used once, on first launch, to capture a name for the
// activity log (see identity.js).

export function openNamePrompt({ onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Enter your name">
      <div class="modal-header">
        <h2 class="modal-title">Welcome!</h2>
      </div>
      <div class="modal-body">
        <p class="field-hint">What's your name? This is shown next to changes you make (song edits, reordering, etc.) so the gig organizer can see who changed what. You only need to enter this once on this device.</p>
        <label class="field">
          <span class="field-label">Your name</span>
          <input type="text" id="name-prompt-input" placeholder="e.g. Tatiana" maxlength="60">
        </label>
        <button class="btn-link-open" id="name-prompt-submit">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const input = overlay.querySelector('#name-prompt-input');
  input.focus();

  const submit = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    overlay.remove();
    document.body.classList.remove('modal-open');
    onSubmit(name);
  };

  overlay.querySelector('#name-prompt-submit').addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  // Deliberately no backdrop-click-to-close and no close button — a name
  // is required before the app can attribute any changes.
}
