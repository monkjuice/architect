---
title: Generic service routing
type: component
summary: "src/model/routing.ts derives stable rectilinear trees and split runs for Plumbing and HVAC from placed service equipment and links; routes are recalculated rather than saved or manually nudged, while Electricity retains its wall-specific graph."
tags: [component, services, routing, plumbing, hvac, derived]
sources: []
updated: 2026-11-16
---

# Generic service routing

`src/model/routing.ts` is the shared pure router for Plumbing and HVAC. It derives rectilinear trees from the placed
service terminals, splits them into identifiable runs, and keeps run identity stable enough for selection, reporting
and tests. Cold, hot, waste, heating, radiant, refrigerant and duct quantities consume these derived runs.

Routes are not saved and cannot be nudged by hand: changing equipment or a declared link recalculates them. This is a
deliberate constraint, not unfinished persistence. Electrical cable routing remains in `wiring.ts`, because it follows
walls, boards, circuit trees, risers and buried transitions rather than the generic service topology.
