// editable-text.js — turns a text element into an inline input on demand;
// Enter or blur commits, Escape cancels. Used for gig title + set names.

// Attaches click-to-edit behavior (used for the gig title, which has no
// competing single/double-tap gestures on it).
export function makeEditable(el, { getValue, onCommit, ariaLabel }) {
  prepareEditable(el, ariaLabel);
  el.addEventListener('click', () => enterEditMode(el, { getValue, onCommit }));
}

// Marks up the element as editable without wiring any trigger — the
// caller decides when to invoke enterEditMode() (e.g. on double-click).
export function prepareEditable(el, ariaLabel) {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  el.classList.add('editable-text');
}

export function enterEditMode(el, { getValue, onCommit }) {
  const current = getValue();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = el.className + ' editable-text-input';
  input.maxLength = 80;

  el.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  function commit() {
    if (done) return;
    done = true;
    const next = input.value.trim();
    input.replaceWith(el);
    if (next && next !== current) onCommit(next);
  }
  function cancel() {
    if (done) return;
    done = true;
    input.replaceWith(el);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}
