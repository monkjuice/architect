---
title: Electrical wiring
type: component
summary: "src/model/wiring.ts derives board ownership, circuit trees and phases, wall-following or buried runs, cable and earth sections, breakers, RCDs, conduit, voltage drop and board enclosures; it remains specialized instead of sharing the generic service router."
tags: [component, electricity, wiring, routing, sizing, aea]
sources: []
updated: 2026-11-16
---

# Electrical wiring

`src/model/wiring.ts` builds a routing graph from each floor's walls and open edges, assigns points to their explicit
or default board, and grows a tree for every circuit. It derives phase allocation, breakers, cable and earth sections,
conduit, voltage drop, risers and board enclosure sizes. Outdoor floor points and disconnected buildings use buried
runs and subterranean cable.

The graph is cached separately from point placement so dragging a point does not rebuild the walls. Manual circuit
definitions come first; points without one are grouped into lighting, general-socket or single special-load circuits.
These figures are checkable planning estimates and still require a registered electrician's design.

Electricity intentionally keeps this wall-aware router. Plumbing and HVAC use the separate generic rectilinear
[service router](service-routing.md), whose constraints and run identities differ.
