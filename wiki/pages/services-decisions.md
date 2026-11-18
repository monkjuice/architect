---
title: "Services: decisions for the coming tabs"
type: decision
summary: "Foundation, Electricity, Plumbing and HVAC now share one plan; service equipment and links are placed explicitly, routes and quantities are derived, power requirements link to authored electrical circuits, and Gas remains pending."
tags: [decision, services, electricity, plumbing, gas, heating, tabs, prices]
sources: []
updated: 2026-11-16
---

# Services: decisions for the coming tabs

## Context

On 2026-11-08 the user asked to "get started with the plumbing, gas, electricity and foundation tabs". Asked about
the order, they chose "Foundation, then services": the [Foundation tab](foundation-tab.md) was built first. Electricity,
[Plumbing](plumbing-tab.md) and [HVAC](hvac-tab.md) now work on the same plan; Gas remains pending.

## Decisions

- **Machine room**: the ground-floor "Guardador" area (in the *Casa Principal* layer). The electrical board goes on
  its outside wall.
- **What reaches the lots**: natural gas and three-phase power. There is no mains water and no sewer, so the plan
  needs a well with a pump for water and a biodigestor for waste.
- **Heating is not chosen yet.** The user wants the alternatives compared, with prices, before choosing:
  1. underfloor heating with a gas boiler;
  2. heat-pump split ACs;
  3. radiators with a gas boiler;
  4. gas room heaters.
- **Points** (lights, outlets, water, drain and gas points) are to be suggested from the rooms and fixtures, and then
  edited by hand. This is the same pattern as the foundation plan, worked out from the walls with sizes set by hand.

## Implementation update

- Plumbing and HVAC share explicitly placed [service equipment](service-equipment-and-links.md), while their routes
  are derived by the [generic service router](service-routing.md).
- Equipment power requirements point to the [Electricity tab](electricity-tab.md); the app does not create points or
  circuits automatically.
- HVAC loads are planning estimates, and neither the machine room nor a heating system is guessed.

## Prices

Installation and heating prices in `PRICES` now feed the Electricity, Plumbing and HVAC Materials rows where a local
price matches the derived item. Gas prices remain staged for the future Gas tab ([Local prices](local-prices.md)).
