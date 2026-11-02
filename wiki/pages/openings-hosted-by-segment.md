---
title: Doors and windows are hosted by a segment
type: decision
summary: "A door or window is an opening in layer.openings hosted by one segment at a centre offset from its a end, not a segment kind between two vertices on the wall line (which would fragment the wall and not follow a moved corner); when the wall's length changes it keeps its distance to the nearer end."
tags: [decision, model, openings, doors, windows]
sources: []
updated: 2026-11-02
---

# Doors and windows are hosted by a segment

## Context

Doors and windows must sit in a wall, leave a gap in its drawn line, follow the wall when it moves, and not break
the rooms around them ([Areas](areas.md)).

## Decision

- An opening is a record in `layer.openings` (`OpeningSchema` in `src/model/plan.ts`) that names its host `segment`
  and the `offset` of its centre from that segment's `a` end ([Doors and windows](doors-and-windows.md)).
- The wall stays one segment. The gap exists only in the drawing (`openingSpans`). Regions ignore openings, so a room
  stays closed through its doors ([Regions](regions.md)).
- Gates (fifth session) are a third kind of the same record, hosted by any segment, usually an open-edge fence.

## Alternative rejected

A door as a segment kind (like `kind: 'open'`, [Open edges are a segment kind](segment-kind-not-layer.md)) between
two extra vertices on the wall line. That fragments the wall into three segments, and a door made of free vertices
would not follow along the wall when one of its corners moves.

## Following length changes

When a segment's length changes (`setVertices`, `setSegmentLength`), `followOpenings` in `src/model/edit.ts` keeps
each opening's distance to the **nearer** end of its segment. Keeping the offset from `a` was rejected: the a/b
orientation of a segment is invisible to the user, so stretching a wall moved some openings and not others,
unpredictably.

## Consequences

- Every edit that changes segments must keep openings consistent (split, merge, delete, move to another layer); see
  [Doors and windows](doors-and-windows.md).
- Because offsets, `hinge` and `swing` are relative to a/b, the UI never shows them raw: the Selection panel names
  the free wall on each side by its position on screen.
- The format change is additive (`openings` defaults to `{}`), so `schemaVersion` stayed 1
  ([Plan model and file format](plan-model.md)).
