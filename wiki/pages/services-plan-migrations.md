---
title: Services plan migrations to schema v3
type: decision
summary: "The services integration raises the plan schema to v3: 1→2 converts legacy layer.points plumbing markers into footprint services and removes obsolete machine settings; 2→3 moves heating material ownership from Plumbing to HVAC, preserving v1 electrical content."
tags: [decision, plan-format, migration, services, plumbing, hvac, electricity]
sources: []
updated: 2026-11-16
---

# Services plan migrations to schema v3

The services model required saved footprint equipment and a clean ownership boundary between Plumbing and HVAC, so
the file schema advances to version 3.

- Migration 1→2 converts legacy `layer.points` plumbing markers into footprint service records and drops obsolete
  plumbing-machine settings.
- Migration 2→3 moves heating material from Plumbing to HVAC, the discipline that owns it.
- Existing schema-v1 electrical boards, points, circuits and routes are retained; migration and round-trip tests cover
  that compatibility.

Plumbing and HVAC remain separate tabs even though they share equipment and routing primitives. Electrical data stays
under `layer.electrical`, and service power links do not create or rewrite it.
