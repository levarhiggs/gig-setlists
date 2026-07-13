# Setlist Organizer — MVP Handoff Spec

**For:** Claude Code
**Author of concept:** Levar (working musician)
**Purpose:** A mobile-first web app for organizing gig setlists and preparing them for the band. This document is the implementation brief. Build the MVP described here; the "Post-MVP" section is context only — do **not** build it yet.

---

## 0. Reference projects (read these first)

- **Basketball Coaching App** — located in the same `Claude Code Projects` folder. **Use it as the reference implementation for Firestore + localStorage persistence, auth scaffolding, and project structure.** Match its patterns for data sync, offline behavior, and how it wires Firestore to local state. Do not reinvent the persistence layer — mirror what already works there.
- **Import data** — `D:\Claude Code Projects\setlists\Setlist Import.xlsx` (a.k.a. `Setlist_Import.xlsx`). One sheet named `July 12` = one existing gig with 3 sets and 42 songs. **For the MVP, the songs in this sheet ARE the master song list** — every distinct title becomes a reusable `Song` record. Levar will add more titles over time (in-app via "create new song," §5.3). Schema documented in §3; JSON data model in §13.

---

## 1. What this app is (one paragraph)

A phone-first tool where a musician arranges songs into **sets** within a **gig**, reorders them by dragging, inspects/edits per-song attributes in a modal, and **links** groups of songs into medleys that move together as a unit. The app eliminates the manual labor of laying out and re-sequencing a gig. Sharing and multi-user editing are explicitly **out of scope** for the MVP.

---

## 2. Core domain model

Hierarchy: **Gig → Sets → Songs**, plus **Links** (medley groups) that live inside a gig.

```
Gig
  id, name, description, createdAt, updatedAt
  sets: [Set]            // ordered
  links: [Link]          // medley groups scoped to this gig

Set
  id, name (header label, e.g. "Set 1"), order (int)
  songOrderMode: "alpha" | "custom"
  songs: [SongInstance]  // ordered

SongInstance                         // a song's PLACEMENT in a set
  instanceId          // unique per placement (NOT the song's DB id)
  songId              // FK to the Song record in the song database
  setId
  order (int)         // position within the set
  linkId | null       // which Link group this instance belongs to (max one)

Song                                 // the reusable database record
  songId, title, key, bpm, lead, notes
  // see §3 for exact fields and multi-value handling

Link                                 // a medley / no-break sequence
  linkId, gigId
  color                // assigned from palette (§7.4)
  memberInstanceIds: [instanceId]   // ORDERED; this order is the medley order
```

**Critical distinction: `Song` vs `SongInstance`.**
- A `Song` is a database record (title, key, bpm, etc.), reusable across gigs.
- A `SongInstance` is *one placement* of that song in *one set*. The same `songId` can appear as **multiple instances** (see §5.3 duplicate handling). Links, order, and set membership all operate on **instances**, never on the underlying `Song`.

---

## 3. Import schema (the source table)

The import sheet columns (exact headers from `July 12`):

| Column | Meaning | Notes |
|---|---|---|
| `SET` | Which set (1, 2, 3) | Integer. Defines set membership on import. |
| `COUNT` | Running index across the whole gig | Ignore for logic; do not persist. |
| `SEQUENCE` | Intended per-set order | **Currently empty** in the import. On import, if blank, fall back to sheet row order within the set. |
| `SONGS` | Song title | The display title. May include artist prefix (e.g. `Al Green - Let's Stay Together`). Store verbatim. |
| `KEY` | Key | **Free text, may hold modulations** like `A > Bb` or `D > G > Bb > D`. Do not parse or validate — store and display as-is. |
| `NOTES` | Per-song notes | Free text. Often contains transition/medley intentions (see §3.1). |
| `LEAD` | Assigned singer | **May list multiple** (e.g. `Clarence / Tatiana`). Store verbatim; display as-is. |
| `BPM` | Tempo | **Currently empty.** Nullable integer. |
| `EST.DURATION` | Estimated song length | **Currently empty.** Nullable. Not used in MVP UI beyond display if present. |

### 3.1 Import behavior

- Parse the sheet into: one **Gig** (name it from the sheet tab, e.g. `July 12`), the **Sets** implied by distinct `SET` values (in ascending order), and one **SongInstance** per row placed in the matching set.
- For each row, **upsert a `Song` record** keyed on normalized title. If two rows share the same title, they reference the same `Song` but produce distinct `SongInstance`s.
- **Do NOT auto-create links from the `NOTES` column.** Several notes describe medley/transition intent in prose (e.g. "transition directly into Killing me Softly", "comes immediately after Candy", "Clarence requested paired after Before I Let Go"). These are human hints only. Surface them in the note field; the user will create links manually.
- On import, set each set's `songOrderMode` to `"custom"` (the sheet already has an intentional order; do not re-alphabetize it).
- Empty `BPM`, `SEQUENCE`, `EST.DURATION`, and `KEY` cells import as null/blank — never as the string "NaN".

---

## 4. Screens & layout

Mobile-first, single-column, thumb-reachable. Three primary surfaces:

### 4.1 Gig view (the main screen)
- Vertical stack of **Set blocks**.
- Each Set block: a **header row** (set name, e.g. "Set 1", plus a small overflow menu: rename set, delete set, add song).
- Below the header: the ordered list of song titles in that set.
- Each song row shows: **title**, and a **colored dot** if it belongs to a link group. Optionally show key/BPM inline as secondary text (small, muted) — nice-to-have, not required.
- A persistent **"+ Add Set"** control at the bottom.
- An **Export** button (§8) in the top bar.

### 4.2 Attribute modal (single tap)
Full-screen overlay showing/editing the tapped instance's attributes:
- Title (from Song)
- Key (editable)
- BPM (editable)
- Lead / singer (editable)
- Notes (editable)
- Shared comments — **display a field for it, but note it is non-functional in MVP** (no multi-user yet). Render as a plain editable text field stored locally so the schema is ready; label it clearly.
- Close returns to the gig view.

### 4.3 Linking submenu (double tap)
See §6. A focused overlay for building/editing the medley group of the tapped instance.

---

## 5. Interactions

### 5.1 Tap disambiguation — build BOTH, gate with a flag

Levar's primary design uses **single-tap / double-tap / drag** and has confirmed this disambiguation worked acceptably in a prior Claude Code app. Implement that as the default. **But also implement an alternate interaction scheme behind a config flag** so it can be swapped if the triple-gesture model tests poorly on-device.

- **`INTERACTION_MODE = "click"` (default):**
  - **Single tap** on a song → Attribute modal (§4.2)
  - **Double tap** on a song → Linking submenu (§4.3)
  - **Long-press + drag** → reorder (see §5.2)
- **`INTERACTION_MODE = "explicit"` (fallback):**
  - **Tap** → Attribute modal
  - A **"Link" button inside the attribute modal** → Linking submenu
  - **Long-press + drag** → reorder

Both modes must be fully functional. The flag should be a single constant that's trivial to flip. Use a well-tested tap/gesture library rather than hand-rolling timing thresholds; ensure double-tap does not fire a spurious single-tap first, and that a drag never fires a tap.

### 5.2 Drag to reorder
- Long-press initiates drag; song can move **up/down within its set** and **across into other sets**.
- On drop, the moved instance's `order` updates; the target set switches `songOrderMode` to `"custom"` permanently (§5.4).
- **Dragging a linked instance drags the entire link group.** The whole group relocates together, preserving its internal order (§6.4). The group inserts as a contiguous block at the drop point.
- Reordering must be persisted immediately (per reference app's sync pattern).

### 5.3 Adding songs to a set
- From a set's overflow menu → "Add song."
- User can pick an existing `Song` from the database, **or create a brand-new song** (with its own attribute record: title, key, bpm, lead, notes).
- **Duplicate warning:** if the chosen song's `songId` already exists **anywhere in the current gig**, prompt: *"'{title}' is already in this gig, in {Set name}. Add it again anyway?"* — Continue / Cancel.
  - If the user continues, create a **second, independent `SongInstance`**. The two instances are treated as fully separate: each can be ordered, linked, and edited-in-placement independently. (Attribute edits to the shared underlying `Song` record still affect both — see §5.5.)
- When a song is added into a set that is currently **empty**, that set uses **alphabetical** order (§5.4).

### 5.4 Order mode rules
- A set with songs added but never manually dragged: **alphabetical by title** (default).
- Alphabetical ordering applies **only when adding songs into a set that had none**. Once populated, dragging any song switches the set permanently to **custom** order. There is no "revert to alphabetical" action in MVP.
- Imported sets start in **custom** mode (§3.1).

### 5.5 Editing attributes
- Attribute edits in the modal write to the underlying `Song` record and therefore reflect on **all instances** of that song across the gig/app. This is intended. (Per-instance overrides are Post-MVP.)

---

## 6. Linking (medleys) — detailed spec

A **Link** marks a set of song instances as a medley / no-break sequence that always stays together and moves together.

### 6.1 Entering the submenu
Double-tap (or the modal "Link" button in explicit mode) on an instance = the **activating instance**. The submenu opens scoped to the activating instance's **set**.

### 6.2 What the submenu shows
- A list of **all song instances in the same set** as the activating instance.
- Each row shows **title, KEY, and BPM** (BPM may be blank).
- The activating instance is pre-selected.
- Instances already in the activating instance's link group are shown selected. Instances in *other* link groups should be visibly marked (e.g. their own colored dot) — see §6.6 for the rule on cross-group selection.

### 6.3 Selecting & ordering
- User selects/deselects instances via checkbox/tap.
- User can **reorder the selected instances** within the submenu (drag). This order **is** the medley order.
- Constraint: linked members must end up **contiguous, back-to-back** in the set (the app enforces this on exit by clustering them — see §6.4).

### 6.4 On exit (save)
- All selected instances become members of a single `Link` with one shared `color`.
- The app **reorders the set** so the link members sit contiguously, in the order set in the submenu. Insert the cluster at the position of the topmost selected member (or the activating instance — pick one rule and keep it consistent; recommend: at the position of the earliest currently-ordered member).
- Non-member songs flow around the cluster.
- All members display the **same colored dot**.

### 6.5 Unlinking
- Re-open the submenu and **deselect** instances to remove them from the group.
- Deselecting down to one (or zero) members dissolves the link (a link needs ≥2 members to exist). Free the color back to the palette.

### 6.6 Membership constraints
- **One instance belongs to at most one link** in the gig. If a user tries to add an instance that's already in another link, either (a) block with a brief message, or (b) move it out of the old group into the new one. **Recommend (a): block and show which group it's in.** Keep it simple.
- Because links operate on **instances**, a song added twice (§5.3) has two independent instances that can live in two different links — this is allowed and expected.

### 6.7 Moving linked groups
- Covered in §5.2: dragging any member drags the whole contiguous block, across sets if needed, preserving internal order. On landing in a new set, the group stays clustered and keeps its link + color.

---

## 7. Visuals

### 7.1 Aesthetic
Clean, high-contrast, phone-legible. Large tap targets. This is used on stage / in rehearsal — prioritize glanceability over density.

### 7.2 Set blocks
Clear header separation; the set name is prominent. Songs are comfortably tappable rows.

### 7.3 Link indicator
A filled **colored dot** on each linked row. All members of one link share the exact same color. Different links use visibly distinct colors.

### 7.4 Color palette
- We will **never run out of colors**: gigs rarely exceed ~10 links.
- Provide a palette of **at least 12 distinct quaternary colors + 3 neutrals**. Assign the next unused color when a link is created; return it to the pool when a link dissolves.
- Ensure adjacent-in-list colors are distinguishable; avoid near-duplicates in the active set.

---

## 8. Export (MVP sharing substitute)

No real sharing in MVP. Instead, an **Export** button that produces a clean, sequenced rendering of the **entire gig** — all sets, all songs in final order, with link groupings visually indicated (dots/brackets), keys, leads, and BPM.

- **Print path:** a print-optimized layout (browser print → PDF).
- **Phone path:** support saving a screenshot / image of the sequenced gig.
- Export is read-only output; no editing.

---

## 9. Persistence

- **Follow the Basketball Coaching App's approach.** Use **Firestore** for the source of truth and **localStorage** for offline/local caching, mirroring that app's sync and conflict patterns.
- All mutations (reorder, link/unlink, set add/rename/delete, attribute edits, add song) persist immediately.
- **Save gig:** the user can **save the current gig to their account as a copy or an overwrite**, providing a **name** and **description**.
  - "Save as copy" → new gig doc, new id, name/description from user.
  - "Overwrite" → updates the current gig doc in place (name/description editable).
- Gigs, sets, song instances, links, and the song database all persist.

### 9.1 Auth note
Full personal-account login + importing/browsing a saved song library is **Post-MVP** (§11). For MVP, scaffold auth per the reference app but the functional requirement is only: local + Firestore persistence and the save-copy/overwrite flow. If the reference app already gives you a working auth model for free, wire it; otherwise a single-user local profile is acceptable for MVP.

---

## 10. Acceptance criteria (MVP is done when…)

1. The `July 12` sheet imports into one gig with 3 sets and 42 song instances, order preserved, keys/leads/notes intact, empty cells blank (not "NaN").
2. Set blocks render with headers; songs list under them; sets can be added, renamed, deleted.
3. Single tap opens the attribute modal; edits persist and reflect across instances of the same song.
4. Double tap opens the linking submenu (in `click` mode); the alternate `explicit` mode works when the flag is flipped.
5. Long-press drag reorders within and across sets; dropping switches a set to custom order permanently.
6. Linking: selecting ≥2 instances in a set creates a colored group; members cluster contiguously in submenu order; all show the same dot; distinct links get distinct colors.
7. Dragging any linked member moves the whole group together, preserving internal order, across sets.
8. Deselecting in the submenu unlinks; dropping below 2 members dissolves the link and frees the color.
9. Adding an existing gig song triggers the duplicate warning naming the set; continuing creates an independent instance.
10. Adding into an empty set orders alphabetically; a populated dragged set stays custom.
11. Export renders the full sequenced gig with link indicators; print-to-PDF and image-save both work on phone.
12. Save-as-copy and overwrite both work with name + description; state survives reload via Firestore + localStorage.

---

## 11. Post-MVP (context only — DO NOT BUILD)

- Personal account login with a persistent **song library**; import new song titles; build new setlists from previously saved songs.
- Real multi-user **sharing** and functional **shared comments** (collaborative).
- Per-instance attribute overrides (edit a song's key/notes for one placement only).
- Auto-suggested links from `NOTES` transition hints.
- BPM/duration-aware set-length estimation using `EST.DURATION`.
- Alternate link-editing UX (Levar noted he may revisit the select/deselect model).

---

## 12. Open items for Levar to confirm during build

- Confirm whether inline key/BPM should show on the gig-view song rows or only in the modal.
- Confirm the exact cluster-insertion rule in §6.4 (topmost member vs. activating instance) — pick one and note it in code.
- Confirm whether "Shared comments" should be visible at all in MVP or hidden until the collaborative version exists.

---

## 13. Starter data model (JSON)

Canonical shapes. `Song` records are the **master song list** (§0); `SongInstance`s are placements. IDs are strings; use short stable ids (e.g. nanoid/uuid). Timestamps are ISO 8601. `null` where noted.

### 13.1 Song (master list record)

```json
{
  "songId": "sng_ascension",
  "title": "Ascension",
  "key": "Am",
  "bpm": null,
  "lead": "Tatiana",
  "notes": "good",
  "createdAt": "2026-07-11T00:00:00Z",
  "updatedAt": "2026-07-11T00:00:00Z"
}
```

- `title` stored verbatim, artist prefix and all (`"Al Green - Let's Stay Together"`).
- `key` is free text; may hold modulations (`"A > Bb"`, `"D > G > Bb > D"`). Never parsed.
- `bpm` nullable integer.
- `lead` free text; may list multiple singers (`"Clarence / Tatiana"`).
- `songId` derived from a normalized title on import (lowercased, spaces→`_`, punctuation stripped) so re-importing the same title upserts rather than duplicates.

### 13.2 SongInstance (a placement of a song in a set)

```json
{
  "instanceId": "inst_a1b2c3",
  "songId": "sng_ascension",
  "setId": "set_1",
  "order": 5,
  "linkId": null
}
```

- `order` is the integer position within its set (gaps allowed; sort by it). Use spaced integers (10, 20, 30…) or reindex on write — pick one and be consistent.
- `linkId` is `null` unless the instance is in a medley.
- The same `songId` may appear in multiple `instanceId`s (duplicate-add, §5.3).

### 13.3 Link (medley group, gig-scoped)

```json
{
  "linkId": "lnk_x9",
  "gigId": "gig_july12",
  "color": "#E4572E",
  "memberInstanceIds": ["inst_kk1", "inst_kk2", "inst_kk3"]
}
```

- `memberInstanceIds` is **ordered** — this array *is* the medley order.
- A Link must have **≥2** members; dropping to <2 dissolves it and frees `color`.
- Every `instanceId` here must also carry this `linkId` on its own record (keep both sides in sync).

### 13.4 Set

```json
{
  "setId": "set_1",
  "name": "Set 1",
  "order": 0,
  "songOrderMode": "custom"
}
```

- `songOrderMode`: `"alpha"` | `"custom"`. Imported sets start `"custom"` (§3.1). A set populated from empty starts `"alpha"` and flips to `"custom"` permanently on first drag (§5.4).

### 13.5 Gig (top-level document)

```json
{
  "gigId": "gig_july12",
  "name": "July 12",
  "description": "",
  "createdAt": "2026-07-11T00:00:00Z",
  "updatedAt": "2026-07-11T00:00:00Z",
  "sets": ["set_1", "set_2", "set_3"],
  "links": ["lnk_x9"]
}
```

### 13.6 Storage layout (Firestore — mirror the Basketball Coaching App)

Suggested collections (adapt to whatever the reference app already does):

```
/songs/{songId}                      // master list, shared across gigs
/gigs/{gigId}                        // gig doc (name, description, set order)
/gigs/{gigId}/sets/{setId}
/gigs/{gigId}/sets/{setId}/instances/{instanceId}
/gigs/{gigId}/links/{linkId}
```

- `songs` is a **top-level** collection (reusable master list), not nested under a gig.
- `instances` and `links` are **nested under the gig** because they only exist within one gig.
- localStorage mirrors the active gig + the full `songs` list for offline use; sync per the reference app's pattern.
- **Save-as-copy** (§9): deep-clone the gig doc, its sets, instances, and links under a **new `gigId`** with **fresh `instanceId`s and `linkId`s** (remap `memberInstanceIds` to the new ids). Do **not** clone `songs` — copies reference the same master records. **Overwrite** updates the existing gig subtree in place.

### 13.7 One worked example (from the real sheet)

`Set 1` after import, showing a hypothetical link between "Through the fire" and "Fugees - Killing Me Softly" (the NOTES hint transition — created manually by Levar, not auto-generated):

```json
{
  "set": { "setId": "set_1", "name": "Set 1", "order": 0, "songOrderMode": "custom" },
  "instances": [
    { "instanceId": "inst_01", "songId": "sng_just_the_two_of_us", "setId": "set_1", "order": 10, "linkId": null },
    { "instanceId": "inst_05", "songId": "sng_through_the_fire",   "setId": "set_1", "order": 50, "linkId": "lnk_1" },
    { "instanceId": "inst_06", "songId": "sng_killing_me_softly",  "setId": "set_1", "order": 60, "linkId": "lnk_1" }
  ],
  "link": {
    "linkId": "lnk_1",
    "gigId": "gig_july12",
    "color": "#3A7CA5",
    "memberInstanceIds": ["inst_05", "inst_06"]
  }
}
```

Note the two linked instances are contiguous (`order` 50, 60) and both carry `linkId: "lnk_1"`; dragging either moves both, preserving the `memberInstanceIds` order.

---

## 14. Suggested file structure

A starting skeleton — **defer to the Basketball Coaching App's conventions** wherever they differ.

```
setlists/
├─ SETLIST_APP_HANDOFF.md          // this doc
├─ Setlist Import.xlsx             // seed data
├─ src/
│  ├─ main.{js,ts,jsx,tsx}
│  ├─ config.js                    // INTERACTION_MODE flag (§5.1), color palette (§7.4)
│  ├─ firebase/                    // init + sync — mirror Basketball Coaching App
│  │  ├─ init.js
│  │  └─ sync.js
│  ├─ data/
│  │  ├─ importer.js               // xlsx → Songs + Gig + Sets + Instances (§3.1)
│  │  ├─ models.js                 // shapes/validators from §13
│  │  └─ store.js                  // local state + localStorage cache
│  ├─ features/
│  │  ├─ gig-view/                 // set blocks, song rows, drag reorder (§4.1, §5.2)
│  │  ├─ attribute-modal/          // §4.2
│  │  ├─ linking/                  // submenu + link/unlink logic (§4.3, §6)
│  │  ├─ sets/                     // add/rename/delete (§5, §4.1)
│  │  └─ export/                   // print + image (§8)
│  ├─ lib/
│  │  ├─ gestures.js               // tap/double-tap/long-press-drag disambiguation (§5.1)
│  │  ├─ ordering.js               // alpha vs custom, reindex, cluster linked block (§5.4, §6.4)
│  │  └─ colors.js                 // palette assignment/return (§7.4)
│  └─ ui/                          // shared components
└─ tests/
   ├─ import.test.js               // 42 instances, 3 sets, no "NaN" (§10.1)
   ├─ linking.test.js              // cluster, move-together, dissolve <2 (§10.6–8)
   └─ ordering.test.js             // alpha-on-empty, custom-on-drag (§10.10)
```

**Build order suggestion:** importer + data model → gig view with set blocks → attribute modal → drag reorder → linking → export → save-copy/overwrite. Get import + read-only gig view solid before layering interactions.
