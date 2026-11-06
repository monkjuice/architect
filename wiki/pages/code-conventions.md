---
title: Code conventions
type: convention
summary: "Rules inherited from the Forge H1 planner: pure model layer with no import cycles, state never imports ui, three.js only in src/render, explicit face normals in 3-D, immutable edits through layer drafts (same plan = no undo step), derived data cached by object identity, saved data in the plan, UI state in the store and view settings in prefs, foldable panel sections with Box ids, erasable-only TypeScript, tools without React refs, compound .opening.<kind> CSS selectors, oxlint rules (helpers out of component files), no formatter (indent by hand), ids and rounding."
tags: [convention, model, state, ui, lint, typescript, css, formatting]
sources: []
updated: 2026-11-06
---

# Code conventions

These follow the Forge H1 planner's conventions (`../forge-h1/wiki/pages/planner-code-conventions.md`, outside this
repo), adapted to this codebase ([Stack adapted from the Forge H1 planner](forge-h1-stack.md)).

## Layers

- `src/model/` is pure TypeScript: no React and no DOM. It is unit-tested in Vitest's `node` environment
  ([Development and testing](development-and-testing.md)), and geometry stays there, not in views.
- The model never reads prefs or caches. When it needs a value that depends on them, it takes a callback that
  state supplies: `hitTest` and `openingTarget` take `halfWidth(layer, segment)`, and tools pass `drawnHalfWidth`
  from `derived.ts` ([Walls](walls.md)).
- `src/state/actions.ts` holds user-level operations. Components call those, `store.edit`, or `store.update` for
  state that is not undoable.
- `src/render/` (three.js) depends only on `src/model` and is the only code that imports `three`; only the lazily
  loaded `ExteriorTab` uses it, so three.js stays out of the main chunk ([Exterior tab](exterior-tab.md)).
- 3-D geometry carries explicit outward normals on every face ([House solids](house-solids.md)); consumers (the
  renderer, the elevations' culling) use them and never infer facing from winding, because plan x, y (down) with z
  up is left-handed.
- Dependencies point `src/ui` → `src/state` → `src/model`, never back. Logic that a tool and a panel share goes in
  `actions.ts` (`placeOpeningAt`, `dropOpening`, `applyColonnade`); an early version of the doors work had state
  import it from a tool, which was fixed.
- Model modules must not import in a cycle. `regions.ts` imports `walls.ts`, which imports `openings.ts`, so
  `openings.ts` keeps its own small point-in-polygon test instead of importing `regions.ts`
  ([Fireplaces](fireplaces.md)). Likewise the face types and builders moved from `solids.ts` to `faces.ts`, because
  `solids.ts` imports `furniture3d.ts`, which needs them; `furniture3d.ts` takes only a type from `solids.ts`
  ([House solids](house-solids.md)).
- What is saved goes in `Plan`. Editor state (active layer, tool, line kind, view, selection, prompt) goes in the
  store ([Editor store and state](editor-store.md)). View settings a user plays with and expects to find again in
  this browser (grid, opening widths, folded sections, the sun's season, time and clouds) go in prefs; facts about
  the plot (its north and location) go in the plan, even when only the sun uses them ([Sun and shadows](sun.md)).
  The View section mixes both: its *Base plan* box is `plan.image.visible` (saved, undoable), the rest are prefs.

## Panels

A panel section is a `Box` (`src/ui/fields.tsx`). Give it a stable `id`: its title then folds it, the id is stored
in `prefs.collapsed` and set as `data-box` on the `<section>` (ids so far: `view`, `base-plan`, `layers`,
`selection`, `areas`, `sun`, `roofs`, and in the Library the groups `library-drawing` (formerly `library-lines`),
`library-materials` and `library-objects`, with nested `library-material-wall`, `library-material-floor`,
`library-door`, `library-window`, `library-gate`, `library-fireplace`, `library-colonnade`, `library-counter`,
`library-sink`, `library-bathtub`, `library-shower`, `library-toilet`, `library-bed`, `library-sofa`,
`library-table`, `library-chair`; a furniture box's id is its first kind). `Box`'s `className` is `group` for a
top-level Library group and `nested` for a box inside one. Boxes nest, so a `.box` matched by its text also matches
its enclosing group. A folded `Box` does not render its children, so their local state (a half-typed field) is
dropped. Tests should find sections by
`[data-box="<id>"]`, not by position: adding `view` first shifted every index
([Playwright flow-check pitfalls](playwright-flow-checks.md)).

## Immutable edits

- Edits in `src/model/edit.ts` never mutate a plan. They return a new plan that replaces only the layers they change,
  or the same plan when nothing changed, and then `store.edit` records no undo step.
- Inside an operation, a layer is edited through `draftLayer`, which makes private copies of the vertex and segment
  maps. Points and segments are replaced, never mutated, because the objects inside the maps are still shared with
  the previous plan.
- Identity matters: the dirty check is `plan !== file.saved`, and the autosave re-serializes only when the plan
  object changed.
- Derived data (regions, wall thicknesses, wall shapes, placed areas) is cached in WeakMaps keyed on plan objects
  in `src/state/derived.ts`, not stored in the plan. An edit that does not change a layer's lines must keep its `vertices` and `segments` maps:
  the area edits replace only the `areas` map, the opening edits only the `openings` map, the roof edits only
  the `roofs` map and the furniture edits only the `furniture` map, so regions are not recomputed ([Areas](areas.md),
  [Doors and windows](doors-and-windows.md), [Roofs](roofs.md), [Furniture](furniture.md)).
- Edits that change segments must keep the layer's openings consistent (`splitSegment`, `followOpenings`,
  `pruneOpenings`, `moveSegments`). Edits that delete furniture must drop orphaned kitchen sinks (`pruneFurniture`).
- Edits that can be refused return an error string instead of throwing (`removeLayer`). File parsing returns
  `{ ok: false, errors }`.

## TypeScript

`tsconfig.app.json` sets `erasableSyntaxOnly`, which rules out enums and constructor parameter properties. It also
sets `verbatimModuleSyntax` (use `import type`), `noUnusedLocals` and `noUnusedParameters`.

Model type names avoid DOM globals: a window is a `WindowSchema` member of `Opening`, never a type named `Window`.

## Canvas tools

Tools are plain controllers that get `px` (world units per screen pixel) with every pointer event. They do not read
React refs, which oxlint's `react/refs` rule would flag ([Canvas and tools](canvas-and-tools.md)).

## CSS specificity

The `.opening` rules in `src/App.css` are order-sensitive at equal specificity. A rule for one kind or style that must
beat a generic `.opening .x` rule (0,2,0) uses the compound `.opening.<kind> .x` (0,3,0), not a bare `.<kind> .x`.
On 2026-11-02 `.window .opening-leaf` sat before `.opening .opening-leaf` and lost to it, so casement leaves drew as
heavy as door leaves ([Door and window styles](opening-styles.md)). `.opening.selected .opening-leaf` is also 0,3,0
and comes later, so selection still wins. Per App.css, 0,3,0 also beats the library-icon overrides
(`.library-icon .opening :is(...)`, 0,2,1), so casement icons keep the 1.25 px leaf.

## Lint

`.oxlintrc.json` enables the `react`, `typescript` and `oxc` plugins. `react/rules-of-hooks` is an error;
`react/only-export-components` is a warning, with `allowConstantExport`, which covers literal constants only: a
table such as `ROOF_TITLES` goes in the model (`src/model/roofs.ts`), not in a component file. A drawing helper
two components share goes in a plain module, such as `flueMark` in `src/ui/canvas/symbols.ts`. `npm run lint` prints
nothing when the code is clean.

There is no formatter: no Prettier config, and many files would not conform to one. Indent edits by hand to match the
surrounding code; do not reformat whole files.

## Numbers and ids

- Units are meters. Vertex coordinates, opening offsets, roof outlines, furniture positions and kitchen-sink offsets
  are rounded to 0.1 mm only when saving ([Plan model and file format](plan-model.md)).
- Ids are `v<n>`, `s<n>`, `a<n>`, `o<n>`, `r<n>`, `f<n>` (per layer) and `L<n>`, using the next free number.
- A wall has no `kind` key: `addSegment` and `setSegmentKind` write `kind` only for the other kinds (open edges and
  outlines).
