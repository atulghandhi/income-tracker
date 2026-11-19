# Arc-style pass on the ledger web app: plan

Scope: the React app (`src/App.tsx`, `src/styles.css` and the views). Not the iOS app, and not the static pages, which got their pass in the same PR as this document.

## The one sentence

**Novelty goes on import: drop any bank file anywhere and watch it become a categorised month, privately. Everything else is familiar.**

Import with no bank login is the reason someone picks this app over Emma or YNAB. It gets the motion, the colour and the one rich first-run moment. The ledger table, month switcher, settings and navigation should become the nicest version of what people already know, and none of them should become something new.

## What is already in good shape

- **Tokens.** `src/styles.css` is fully tokenised, light and dark included, with `-rgb` triplets for alpha washes. That makes most of this plan token work and keeps rewrites small.
- **Theme continuity.** The theme is stored in `it_theme`, and the static pages now read that same value.
- **Undo for imports.** `undoImportBatch` and its toast are the pattern to copy everywhere else.
- **Keyboard routes.** Cmd/Ctrl+K, `/`, `n` and Alt+arrows already exist.
- **Mobile shell.** There's a tab bar plus a More sheet on phones, a side rail on foldables and a sidebar on desktop (`tests/mobileShell.spec.ts`).

## Phases

Each phase is its own PR, so it can be reviewed and reverted on its own.

### 1. Frame and canvas (about 2 days)

- Add `--hue` and frame tokens (`--frame-a`, `--frame-b`, `--frame-ink`, `--frame-ink-soft`, `--frame-hover`, `--frame-active`) to `:root` and `[data-theme="dark"]`. Generate them with the same contrast-checked function the static build uses (`framePalette` in `scripts/build-content.mjs`). Move it into a shared module so a frame colour can't ship below 4.5:1.
- The sidebar sits on the frame. The main column becomes the canvas: inset 8px, rounded 12px, one shadow.
- Inside the canvas, cards stop floating. Point `--shadow-sm` and `--shadow-md` at `none` inside `.canvas` and let borders do the work. Popovers, sheets and the palette keep their shadows because they're temporary surfaces.
- On phones the canvas runs edge to edge, and the frame shows only in the top bar and the tab bar. An inset on a 390px screen would waste width the ledger needs.
- Risk: lots of screenshot-sensitive tests. Run `npm run test:calc` and the full Playwright suite before and after.

### 2. Personal colour (about 1 day)

- Add a hue picker in Settings → Appearance: a drag strip across the hue range, a live preview of the frame, and a grain slider. Store it in `it_hue` next to `it_theme`.
- Also read `it_hue` on the static pages, so the marketing site takes on the person's colour once they have one. That costs one line in `themeScript`.
- **Don't build Spaces.** Arc gives each context its own colour, but this app has one budget per person, and the only thing that looks like a context is UK vs US (`region.ts`). Inventing workspaces just to justify colour coding would spend novelty for nothing. If households or shared budgets ever ship, colour-per-budget should come with them.

### 3. A real command palette (about 3 days)

At the moment Cmd/Ctrl+K only jumps to the ledger and focuses search (`focusSearch`, `src/App.tsx:3225`). That's a missed opportunity, and it's the clearest "familiar but elevated" upgrade available.

- **One field with grouped results:** Go to (the 8 views in `routes.ts` plus any month), Transactions (all months, fuzzy on merchant, note and amount), Categories, and Actions (new transaction, import a file, toggle theme, export, sync now, start the guided tour).
- **Show each shortcut beside its action** so people learn them from the palette.
- **Keep `/` as "search this ledger"**, the familiar in-page find.
- Open instantly, animate only the palette's arrival, and never animate results while someone types.
- Route every keyboard shortcut through one registry, so the palette and the handler can't drift apart.

### 4. Look before you commit (about 3 days)

- **Transaction detail opens as a peek:** a side sheet on desktop, a bottom sheet on phones. It grows from the row with `startViewTransition` and a shared `view-transition-name`. Esc closes it and it shrinks back into the row. "Open month" promotes it.
- **Category drill-downs** (`flowDrilldown.ts`) grow from the chart segment or widget that was clicked.
- The page underneath stays visible and dimmed.

### 5. Undo everywhere it's reversible (about 2 days)

Use the import toast pattern for:
- deleting a transaction
- bulk recategorise
- applying a name or category rule to past transactions
- dedupe merges
- deleting a goal or account

Keep the confirm step only for "delete all data", which really can't be undone.

**Do not copy Arc's auto-archive.** Arc tidies tabs on its own, but financial records must never move or vanish without the person doing it. The Arc idea that does fit is "warn before automatic changes": auto-categorisation and transfer rules should say what they changed and offer undo.

### 6. Focus mode (half a day)

- Cmd/Ctrl+\ hides the sidebar with a 260ms slide, and the canvas takes the full width. On a 13" laptop the ledger table needs that room.
- Also put a visible toggle in the app bar, so the feature has a route people can see.

### 7. The import moment, the one delight (about 3 days)

- **Drop a file anywhere** on the app, not only on the import screen. The frame lights up while it's dragged over.
- After parsing, rows arrive in a short stagger and sort into their category groups. The month's surplus lands last.
- **This runs once per file and can be skipped** with Esc. It's off under reduced motion, where the result just appears.
- The same moment closes the static-page handoff: the calculator card or drop zone grows into the app, and this is what plays next.

A second, smaller moment could be choosing a colour during onboarding (`Onboarding.tsx`). That's the limit. Dashboards, goals and the rest stay calm.

### 8. Words and calm pass (about 1 day)

- Show the cleaned merchant name (`nameRules.ts`, `merchantMemory.ts`), and reveal the raw bank string on hover or focus in the detail peek.
- **Audit duplicate routes:**
  - sidebar plus tab bar plus More sheet
  - any action that appears both in a row menu and in a toolbar
  - the many `commandButton` instances
- Any row action that appears only on hover must also show on keyboard focus and stay visible on touch.

## Order and size

| Phase | Effort | Why this position |
| --- | --- | --- |
| 1 Frame and canvas | 2d | Everything else sits on it |
| 3 Command palette | 3d | Highest daily value, no visual risk |
| 5 Undo | 2d | Trust; cheap, using an existing pattern |
| 2 Personal colour | 1d | Needs phase 1 |
| 4 Peeks | 3d | Needs phase 1's surfaces |
| 6 Focus mode | 0.5d | Small, any time after phase 1 |
| 7 Import moment | 3d | Last, so it lands on the finished frame |
| 8 Calm pass | 1d | Ongoing; formally at the end |

That's about 15 working days. If time is tight, do 3 and 5 first. They change how the app *works* and need no design sign-off.

## How we'll know it helped

These are PostHog events, using the existing privacy contract (no amounts, no merchant names):
- `palette_opened`, `palette_action` (by action id)
- `undo_used` (by kind)
- `peek_opened` / `peek_promoted`
- `import_completed` rate for first-time visitors, compared before and after phase 7
- handoff → `import_completed` for visitors arriving from `/tools/` and `/import/`

## Review checklist (from the skill)

- Can we name where novelty went? It went on import.
- Could someone use the ledger at 10am on a Tuesday with no tour?
- Is the content the only raised surface, resting on the frame?
- Does one token recolour the frame, with readable text on every stop?
- Is every action in the palette, with a keyboard route?
- Do peeks grow from where they were triggered, and does reduced motion still feel right?
- Can every reversible change be undone?
- Are there two delight moments or fewer, and can people skip them?
