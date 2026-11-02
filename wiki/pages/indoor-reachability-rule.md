---
title: Indoor means unreachable from outside
type: decision
summary: "A region is indoor unless the outside reaches it by crossing open edges or outlines (a walk over regions from the unbounded face); a wall with a non-indoor region or the outside on either side is exterior (automatic 0.30 m). Chosen over \"walled on every side\", which turned an open-plan kitchen and living room into outdoors."
tags: [decision, regions, walls, areas]
sources: []
updated: 2026-11-02
---

# Indoor means unreachable from outside

## Context

Automatic wall thickness ([Walls](walls.md)) and the covered-area total ([Areas](areas.md)) both need to know which
regions are rooms and which are outdoors (galleries, porches, the quincho, pools, paving). Regions only know the
kinds of their boundary pieces ([Regions](regions.md)).

## Decision

In `layerFaces` (`src/model/regions.ts`):

- Walk from the unbounded face to neighbouring regions across open edges and outlines, never across walls. Every
  region reached has `indoor: false`. An island's outer cycle counts as the region it sits in.
- Arrangement edges carry the ids of the segments they are pieces of. A wall piece with a non-indoor region or the
  outside on either side puts its segments in `exterior`.
- Rooms may open onto each other across open edges and stay indoor.

## Alternative rejected

"Indoor = walled on every side", the first version. The user's plan has an open edge between Living Comedor and
Cocina (open-plan kitchen), so both rooms counted as outdoors: their walls to the bedrooms became 0.30 m and they
dropped out of the covered total. With reachability, galleries, the quincho and pools still come out as outdoors.

## Consequences

- The wall between a room and a gallery is exterior: it faces a region the outside reaches.
- Thickness is per segment, so a segment partly facing outside is 0.30 m along its whole length; split it or set its thickness by hand.
- `indoor` depends on the lines only, but `coveredArea` counts only regions that a named area marks.
