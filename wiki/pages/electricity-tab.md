---
title: Electricity tab
type: component
summary: "The electrical plan: wall, ceiling and floor points; main boards by layer and sub-boards by named area; explicit circuits with automatic fallback grouping; editable runs; calculated cable, protection, conduit and voltage drop; 3-D fixtures and materials takeoff."
tags: [component, electricity, boards, circuits, wiring, canvas, takeoff]
sources: []
updated: 2026-11-16
---

# Electricity tab

The Electricity tab stores boards, switches, lights and sockets in each layer's `electrical` map. Main boards feed
layers; sub-boards feed named areas and may either occupy their parent's enclosure or stand separately. Points are
placed explicitly and normally join the circuit selected in the toolbar; older or unassigned points retain automatic
grouping as a fallback.

Circuit membership is saved, while cable trees, protection sizes, voltage drop and most routes are derived by
[`wiring.ts`](wiring.md). A route the user moves is saved on the point it feeds. Electrical fixtures also appear in
elevations and 3-D, and their cable, conduit, boxes and board gear enter the Materials takeoff.

The calculations are ordinary dwelling-planning assumptions, not a certified design. Plumbing and HVAC power
requirements link back to this tab, but they never invent electrical points or circuits.
