---
title: Stack adapted from the Forge H1 planner
type: decision
summary: "Architect uses the Forge H1 planner's stack (React, TypeScript, Vite, zod, Vitest, oxlint, and three.js for 3-D) and adapts its store, prefs, files, fields, NoticeBar, CSS tokens, SVG canvas and render engine, instead of the no-build vanilla JS app it started as."
tags: [decision, stack, forge-h1, three]
sources: []
updated: 2026-11-02
---

# Stack adapted from the Forge H1 planner

## Context

The first version (2026-11-02) was started as a no-build vanilla JS app. The user pointed to their other project,
`../forge-h1/planner` (relative to this repo's root), as the reference, and the work switched to that project's stack.

## Decision

Architect uses the same stack and structure as the planner: React 19, TypeScript 6, Vite 8, zod 4 for the file
schema, Vitest 4 for the model tests and oxlint. The following were adapted from the planner:

- the `EditorStore`, with an immutable plan and `edit`/`preview`/`endGesture` undo (`src/state/store.ts`);
- `src/state/derived.ts`, data derived from the plan and cached per object ([Areas](areas.md));
- `src/state/prefs.ts`;
- `src/state/files.ts` (File System Access API with fallbacks);
- `src/ui/fields.tsx` and `src/ui/NoticeBar.tsx`;
- the dark CSS tokens in `src/index.css`;
- the SVG canvas approach ([Canvas and tools](canvas-and-tools.md));
- the three.js render engine (`../forge-h1/planner/src/render/engine.ts` → `src/render/engine.ts`, eighth session:
  renderer, `RoomEnvironment`, on-demand `OrbitControls`, `fitDistance`, snapshot), with `three` ^0.186.1 and
  `@types/three` ^0.186.0 at the planner's versions and integrity hashes ([Exterior tab](exterior-tab.md)).

## Alternative rejected

The no-build vanilla JS app. The switch was made because the user pointed to the planner; no other reasons were
recorded.

## Consequences

- There is a build step, and it needs Node 20.19+ or 22.12+ ([Development and testing](development-and-testing.md)).
- The planner's code conventions apply here ([Code conventions](code-conventions.md)).
- Architect differs from the planner where its data differs: plans embed a photo, so the draft lives in IndexedDB
  rather than localStorage ([Editor store and state](editor-store.md)).
- The adapted `NoticeBar` first sat in the page layout above the canvas, which shifted the canvas; it now floats
  over it ([Notices float over the canvas](notices-float-over-canvas.md)).
