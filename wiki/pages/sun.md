---
title: Sun and shadows
type: component
summary: "The sun over the plan: pure solar math in src/model/sun.ts (position, sunrise/sunset, plan angle, shadow offset, hemisphere-aware seasons), the plan's saved site (north, latitude, longitude, UTC offset), the North tool, SunDial and SunShadows in src/ui/canvas/Sun.tsx and the Sun panel; season, time and clouds are per-browser prefs, shared with the Exterior tab's 3-D sun."
tags: [sun, model, canvas, ui, prefs, 3d]
sources: []
updated: 2026-11-07
---

# Sun and shadows

Added in the sixth session (2026-11-02). The user expected to reuse the sun in design tabs, so the math depends only
on a `Site`, not on layers or React. In the eighth session the [Exterior tab](exterior-tab.md) reused it: its 3-D
sun light comes from the same `sunPosition`/`planAngle`, the plan's site and `prefs.sun`, and its season and time
controls share those prefs with the Sun panel.

## Model (`src/model/sun.ts`)

- `declination` and `equationOfTime` use Spencer's series. A plain cosine declination fit was ~0.9° off at the
  equinoxes; a test caught it.
- `sunPosition(site, day, clock)` gives `altitude` and `azimuth` in degrees, azimuth clockwise from true north. Clock
  hours become solar hours through `longitude`, `utcOffset` and the equation of time (`clockToSolar`/`solarToClock`).
- `sunTimes` uses −0.833° (refraction and the disc) and returns null on a polar day or night.
- `planAngle` = azimuth + `site.north`; `planDirection` makes it a unit vector (+y down).
- `shadowOffset`: `height / tan(altitude)` away from the sun, capped at 80 m, null at 0.5° altitude or below.
- `SEASONS` `dec`/`mar`/`jun`/`sep` are days 355/79/172/265 (`SEASON_DAY`); `seasonTitle` names them by hemisphere
  (December is summer when latitude < 0).

`sun.test.ts` (9 tests) checks noon heights per season and hemisphere, solstice sunrise azimuths (~29° from east),
day lengths, a polar night and published Buenos Aires times (within 9 min).

## Decision: site in the plan, sun in prefs

North and location describe the plot, so they are `plan.site` (`north`, `latitude`, `longitude`, `utcOffset`):
saved and undoable through `updateSite` ([Plan model and file format](plan-model.md)). What the user plays with is a
view setting: `prefs.sun` (`visible`, `season`, `time`, `cloudiness`, `shadows`), per browser and
validated on load ([Editor store and state](editor-store.md)). The default site is Buenos Aires, north 0. Wall
heights are facts about the house, so they are on each wall segment ([Walls](walls.md)); the former
`prefs.sun.wallHeight` and the panel's *Wall height* field were removed when they came.

## North tool (`src/ui/canvas/tools/north.ts`)

ToolId `north`, no key; *From the plan's arrow* in the panel arms it. Click the tail of the survey's north arrow,
then its tip: `north` is the bearing clockwise from plan-up, rounded to 0.1°. It is measured on the plan, so it
includes the photo's leveling: on the user's draft it gives 38.6° where the arrow measures ~39.5° in the photo,
which was leveled by −0.85°. Nothing updates `north` when the image is re-leveled later; set it again.

## Canvas (`src/ui/canvas/Sun.tsx`)

- `SunShadows`, after the area fills and under the lines: one quad per `wall` segment of the visible layers, in one
  nonzero path so overlaps do not darken, opacity `0.42 · (1 − cloudiness)`. Open edges and outlines cast none: a pool, paving or deck should
  be drawn as outlines, which is why that kind exists
  ([Open edges and outlines are segment kinds](segment-kind-not-layer.md)). Each wall's shadow uses its top above
  the ground: its layer's `level` (a plinth or an upper floor, [Floors](storeys.md)) plus its own `wallHeight(s)`
  (default 2.70 m). Limits: shadows are cast from the centreline, not the faces; no roofs; door gaps
  are ignored.
- `SunDial`, above the area labels: a dotted circle around the visible vertices (1.12 × half the diagonal), the
  day's arc sampled from the sun's own azimuths between sunrise and sunset (so it bends through noon the right way),
  sunrise/sunset ticks with clock times, an N mark, and the sun as a dotted 13 px disc at `planAngle` with a ray to
  the centre and a time/altitude label; grey and hollow below the horizon.
- `S` (Floor tab only) and the View section's *Sun* toggle `prefs.sun.visible`. Colour token `--sun`
  (`src/index.css`).

## Panel (`src/ui/panels/SunPanel.tsx`)

Last section on the right: Show checkbox in the header, Season, Time slider (0–24 h, 5 min steps), a readout
(sunrise, noon, sunset, altitude, compass point), Cloudiness, Wall shadows, and a *Site* `<details>`
with North, *From the plan's arrow*, latitude, longitude and UTC offset.

Related: [Canvas and tools](canvas-and-tools.md), [Development and testing](development-and-testing.md).
