---
title: Plumbing tab
type: component
summary: "The Plumbing tab places shared service equipment and derives cold-water, hot-water and waste trees, selection overlays, quantities, prices and 3-D fixtures; supply, DHW and condensate links are explicit rather than inferred."
tags: [component, plumbing, water, waste, services, canvas, takeoff]
sources: []
updated: 2026-11-16
---

# Plumbing tab

The Plumbing tab draws over the common plan and uses the shared service library and selection tools. The user places
equipment and declares its connections; cold water, hot water and waste runs are then derived through
[`routing.ts`](service-routing.md), not stored as independent geometry.

Boiler domestic-hot-water and fill, heat-pump fill, and split condensate are explicit cross-tab links. Plumbing
equipment and derived runs contribute bilingual Materials rows and local prices, and equipment appears in elevations
and 3-D. The tab does not guess a machine room, source or system layout.
