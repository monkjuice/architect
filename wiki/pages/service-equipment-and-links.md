---
title: Service equipment and cross-tab links
type: component
summary: "layer.services is the shared saved catalogue for explicitly placed Plumbing and HVAC equipment; declared links connect DHW, fill, condensate and power requirements, while routes, quantities and electrical points remain derived or explicitly authored in their owning tabs."
tags: [component, services, plumbing, hvac, electricity, links, model]
sources: []
updated: 2026-11-16
---

# Service equipment and cross-tab links

Plumbing and HVAC share `layer.services`: footprint equipment placed explicitly on the plan. The saved records are
the physical sources, terminals and appliances; pipe, duct and refrigerant trees are derived by
[service routing](service-routing.md). Equipment also contributes solids to elevations and 3-D and rows to the
Materials takeoff.

Links across the tabs are declared rather than guessed: boiler domestic hot water and fill, heat-pump fill, split
condensate, and equipment power requirements. A power link tells the user what rated point or circuit is needed on
the [Electricity tab](electricity-tab.md); it never silently creates one. This keeps each discipline's authored data
and validation in its own tab.

The model deliberately does not infer a machine room, system style or equipment choice. Placement and system choices
remain user decisions.
