// export-gig.js — the top-bar Export menu: print, save as image (PNG), save
// as text (.txt), or copy the text. Every format is built from ONE model of
// the gig (buildExportModel) so they always agree, and that model mirrors
// the screen: songs marked done/cut are included (struck through) unless
// that set's "hide completed/skipped" toggle is on, in which case they're
// left out exactly as they are in the app. Row numbers, the secondary
// key/lead text and medley links are the app's own.

import { getState, getOrderedSets, getSongsForSet } from '../../data/store.js';
import { sortInstancesForDisplay } from '../../lib/ordering.js';
import { isStruckHiddenInSet, rowMetaText } from '../gig-view/gig-view.js';

const STATUS_ICON = { done: '✅', cut: '❌' };

// ── Model ───────────────────────────────────────────────────────────────────

export function buildExportModel() {
  const state = getState();
  if (!state.gig) return null;

  const sets = getOrderedSets().map(set => {
    const hideStruck = isStruckHiddenInSet(set.setId);
    const ordered = sortInstancesForDisplay(getSongsForSet(set.setId), set.songOrderMode, state.songs);

    const rows = [];
    ordered.forEach((inst, i) => {
      const status = inst.completed === 'done' || inst.completed === 'cut' ? inst.completed : null;
      if (hideStruck && status) return;
      const link = inst.linkId ? state.links[inst.linkId] : null;
      rows.push({
        seq: i + 1, // same numbering the app shows (gaps where songs are hidden)
        title: state.songs[inst.songId]?.title || '(unknown song)',
        meta: rowMetaText(inst, set.attributeDisplay),
        status,
        linkId: link ? link.linkId : null,
        linkColor: link ? link.color : null,
      });
    });
    // A song flows into the next visible row when both share a medley.
    rows.forEach((row, i) => {
      row.flowsIntoNext = !!row.linkId && rows[i + 1]?.linkId === row.linkId;
    });

    return { name: set.name, rows };
  });

  return {
    title: state.gig.name || 'Setlist',
    description: state.gig.description || '',
    sets,
    hasStatus: sets.some(s => s.rows.some(r => r.status)),
  };
}

// ── Plain text ──────────────────────────────────────────────────────────────

export function modelToText(model) {
  const lines = [model.title.toUpperCase()];
  if (model.description) lines.push(model.description);

  for (const set of model.sets) {
    lines.push('', set.name.toUpperCase());
    if (!set.rows.length) {
      lines.push('  (no songs)');
      continue;
    }
    const numWidth = String(Math.max(...set.rows.map(r => r.seq))).length;
    for (const row of set.rows) {
      const num = `${String(row.seq).padStart(numWidth)}.`;
      const icon = row.status ? `${STATUS_ICON[row.status]} ` : '';
      const meta = row.meta ? ` — ${row.meta}` : '';
      const arrow = row.flowsIntoNext ? ' →' : '';
      lines.push(`${num} ${icon}${row.title}${meta}${arrow}`);
    }
  }

  const notes = [];
  if (model.hasStatus) notes.push('✅ played   ❌ skipped');
  if (model.sets.some(s => s.rows.some(r => r.flowsIntoNext))) notes.push('→ plays straight into the next song (medley)');
  if (notes.length) lines.push('', ...notes);

  return lines.join('\n') + '\n';
}

// ── Image (canvas, no external libs so it works offline) ────────────────────

const IMG = {
  width: 800,
  pad: 44,
  scale: 2,
  rowH: 34,
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

export function modelToCanvas(model) {
  const { width, pad, scale, rowH, font } = IMG;

  // Height pass.
  let height = pad + 44 + (model.description ? 28 : 0) + 18;
  for (const set of model.sets) {
    height += 26 /* gap */ + 36 /* header */ + Math.max(set.rows.length, 1) * rowH;
  }
  const notesCount = (model.hasStatus ? 1 : 0)
    + (model.sets.some(s => s.rows.some(r => r.flowsIntoNext)) ? 1 : 0);
  height += (notesCount ? 24 + notesCount * 22 : 0) + pad;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = Math.ceil(height) * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  let y = pad;
  ctx.fillStyle = '#111111';
  ctx.font = `700 32px ${font}`;
  ctx.fillText(fitText(ctx, model.title, width - pad * 2), pad, y + 18);
  y += 44;
  if (model.description) {
    ctx.fillStyle = '#555555';
    ctx.font = `400 17px ${font}`;
    ctx.fillText(fitText(ctx, model.description, width - pad * 2), pad, y + 8);
    y += 28;
  }
  y += 18;

  const seqRight = pad + 30;
  const dotX = seqRight + 16;
  const titleX = seqRight + 34;

  for (const set of model.sets) {
    y += 26;
    ctx.fillStyle = '#111111';
    ctx.font = `700 21px ${font}`;
    ctx.fillText(set.name.toUpperCase(), pad, y + 12);
    ctx.fillStyle = '#111111';
    ctx.fillRect(pad, y + 30, width - pad * 2, 2);
    y += 36;

    if (!set.rows.length) {
      ctx.fillStyle = '#888888';
      ctx.font = `italic 400 17px ${font}`;
      ctx.fillText('(no songs)', titleX, y + rowH / 2);
      y += rowH;
      continue;
    }

    for (const row of set.rows) {
      const cy = y + rowH / 2;
      const struck = !!row.status;
      const titleColor = row.status === 'cut' ? '#b5484e' : struck ? '#8a8f9c' : '#111111';

      ctx.textAlign = 'right';
      ctx.fillStyle = '#8a8f9c';
      ctx.font = `400 15px ${font}`;
      ctx.fillText(String(row.seq), seqRight, cy);

      if (row.linkColor) {
        ctx.fillStyle = row.linkColor;
        ctx.beginPath();
        ctx.arc(dotX, cy, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Meta (right-aligned) first so the title can be truncated around it.
      let metaWidth = 0;
      if (row.meta) {
        ctx.textAlign = 'right';
        ctx.fillStyle = struck ? '#aaaaaa' : '#666666';
        ctx.font = `400 15px ${font}`;
        ctx.fillText(row.meta, width - pad, cy);
        metaWidth = ctx.measureText(row.meta).width + 16;
      }

      ctx.textAlign = 'left';
      let x = titleX;
      if (struck) {
        ctx.font = `400 15px ${font}`;
        ctx.fillStyle = '#000000';
        ctx.fillText(STATUS_ICON[row.status], x, cy);
        x += 26;
      }
      ctx.font = `400 19px ${font}`;
      ctx.fillStyle = titleColor;
      const title = fitText(ctx, row.title, width - pad - metaWidth - x);
      ctx.fillText(title, x, cy);
      if (struck) {
        const w = ctx.measureText(title).width;
        ctx.fillStyle = titleColor;
        ctx.fillRect(x, cy, w, 1.5);
      }
      y += rowH;
    }
  }

  ctx.textAlign = 'left';
  const notes = [];
  if (model.hasStatus) notes.push('✅ played   ❌ skipped');
  if (model.sets.some(s => s.rows.some(r => r.flowsIntoNext))) notes.push('Colored dots mark songs that play straight through as a medley');
  if (notes.length) {
    y += 24;
    ctx.fillStyle = '#777777';
    ctx.font = `400 14px ${font}`;
    notes.forEach((n, i) => ctx.fillText(n, pad, y + i * 22));
  }

  return canvas;
}

// ── Print ───────────────────────────────────────────────────────────────────

function modelToPrintDom(model) {
  const root = document.createElement('div');
  root.id = 'print-root';

  const h1 = document.createElement('h1');
  h1.textContent = model.title;
  root.appendChild(h1);
  if (model.description) {
    const p = document.createElement('p');
    p.className = 'print-desc';
    p.textContent = model.description;
    root.appendChild(p);
  }

  for (const set of model.sets) {
    const section = document.createElement('section');
    section.className = 'print-set';
    const h2 = document.createElement('h2');
    h2.textContent = set.name;
    section.appendChild(h2);

    if (!set.rows.length) {
      const empty = document.createElement('p');
      empty.className = 'print-empty';
      empty.textContent = '(no songs)';
      section.appendChild(empty);
    }
    for (const row of set.rows) {
      const div = document.createElement('div');
      div.className = 'print-row' + (row.status ? ` print-${row.status}` : '');
      const seq = document.createElement('span');
      seq.className = 'print-seq';
      seq.textContent = row.seq;
      const dot = document.createElement('span');
      dot.className = 'print-dot';
      if (row.linkColor) dot.style.background = row.linkColor;
      const title = document.createElement('span');
      title.className = 'print-title';
      title.textContent = row.title;
      div.append(seq, dot);
      if (row.status) {
        const icon = document.createElement('span');
        icon.className = 'print-icon';
        icon.textContent = STATUS_ICON[row.status];
        div.appendChild(icon);
      }
      div.appendChild(title);
      if (row.meta) {
        const meta = document.createElement('span');
        meta.className = 'print-meta';
        meta.textContent = row.meta;
        div.appendChild(meta);
      }
      section.appendChild(div);
    }
    root.appendChild(section);
  }
  return root;
}

function printModel(model) {
  document.getElementById('print-root')?.remove();
  const root = modelToPrintDom(model);
  document.body.appendChild(root);
  document.body.classList.add('printing-export');

  const cleanup = () => {
    document.body.classList.remove('printing-export');
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Let layout settle before the print dialog snapshots the page.
  setTimeout(() => window.print(), 50);
}

// ── Delivery helpers ────────────────────────────────────────────────────────

function fileSlug(title) {
  return (title || 'setlist').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'setlist';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function toast(message) {
  document.getElementById('export-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'export-toast';
  el.className = 'export-toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function saveImage(model) {
  const canvas = modelToCanvas(model);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { toast("Couldn't create the image."); return; }
  const filename = `${fileSlug(model.title)}.png`;

  // On a phone/tablet, the share sheet is the way to reach Photos/Files;
  // on desktop a plain download is what's wanted.
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
  const file = new File([blob], filename, { type: 'image/png' });
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: model.title });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user closed the sheet
    }
  }
  downloadBlob(blob, filename);
  toast('Image saved');
}

// ── Menu ────────────────────────────────────────────────────────────────────

export function initExportMenu() {
  const btn = document.getElementById('export-btn');
  const menu = document.getElementById('export-menu');
  if (!btn || !menu) return;

  function closeMenu() {
    menu.classList.add('hidden');
    document.removeEventListener('click', onOutsideClick);
  }
  function onOutsideClick(e) {
    if (!menu.contains(e.target) && e.target !== btn) closeMenu();
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) {
      menu.classList.remove('hidden');
      document.addEventListener('click', onOutsideClick);
    } else {
      closeMenu();
    }
  });

  menu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', async () => {
      closeMenu();
      const model = buildExportModel();
      if (!model) { toast('No gig loaded yet.'); return; }

      switch (item.dataset.action) {
        case 'print':
          printModel(model);
          break;
        case 'image':
          await saveImage(model);
          break;
        case 'text':
          downloadBlob(new Blob([modelToText(model)], { type: 'text/plain;charset=utf-8' }), `${fileSlug(model.title)}.txt`);
          toast('Text file saved');
          break;
        case 'copy':
          toast((await copyText(modelToText(model))) ? 'Copied — paste it anywhere' : "Couldn't copy to the clipboard");
          break;
      }
    });
  });
}
