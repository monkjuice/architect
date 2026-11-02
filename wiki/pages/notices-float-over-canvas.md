---
title: Notices float over the canvas
type: gotcha
summary: "NoticeBar used to sit in the page layout above the canvas, so an info notice auto-dismissing after 7 s moved the canvas ~40 px under the cursor and clicks mid-drawing landed elsewhere; notices now float over it (position absolute inside .app-main)."
tags: [gotcha, ui, canvas, layout, css]
sources: []
updated: 2026-11-02
---

# Notices float over the canvas

## What broke

`src/ui/NoticeBar.tsx` used to render in the page layout above the canvas. Info notices without an action dismiss
themselves after 7 s (`INFO_MS`). Each time a notice appeared or went away, the whole canvas moved by about 40 px
under the cursor, so a click aimed at a point while drawing landed somewhere else.

This made the measure step of the browser flow check fail
([Development and testing](development-and-testing.md)). The first session blamed that failure on the view refit
([View fitted once and stored](view-fitted-once.md)).

## Fix

`.notice` is `position: absolute` inside `.app-main` (`src/App.css`, which is `position: relative`). It floats over
the canvas and never changes the canvas's size or position.

`.app-main` is a grid of three columns: the Library panel (220px), the canvas, and the right sidebar (320px). The
notice's `left: 232px` and `right: 332px` are those widths plus a 12 px margin, so change them together with
`grid-template-columns`.

## Rule

Keep UI that comes and goes on its own (notices, hints) out of the layout flow around the canvas. Tools map each
pointer event to world coordinates through the canvas's current position on screen
([Canvas and tools](canvas-and-tools.md)). Floating over the canvas has its own pitfall: an overlay that takes
pointer events swallows clicks ([Welcome card swallowed canvas clicks](welcome-card-swallowed-clicks.md)).
