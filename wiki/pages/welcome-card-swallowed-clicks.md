---
title: Welcome card swallowed canvas clicks
type: gotcha
summary: "On an empty plan the centred welcome card (.empty-state, \"Start from a photo…\") caught canvas clicks, so a first line drawn through the middle lost its second point; the card now has pointer-events: none except its button and shows only while Select or Pan is active."
tags: [gotcha, ui, canvas, css, testing]
sources: []
updated: 2026-11-02
---

# Welcome card swallowed canvas clicks

## What broke

`Canvas.tsx` shows a welcome card (`.empty-state`: "Start from a photo or scan of the plan.", with a button) centred
over the canvas while the plan has no image and no segments. The card is a 340 px box in the middle of the canvas
and took pointer events, so a click on it never reached the line tool: a first line drawn through the middle of the
canvas lost its second point.

The earlier browser flow checks passed only because their clicks happened to miss the card. It was found in the
fifth session (2026-11-02) while checking gates ([Development and testing](development-and-testing.md)).

## Fix

- `src/App.css`: `.empty-state` has `pointer-events: none`, and `.empty-state button` has `pointer-events: auto`.
- `Canvas.tsx` (`empty`): the card shows only while the Select or Pan tool is active, so it disappears as soon as a
  drawing tool is picked.

## Rule

Anything layered over the canvas (cards, hints, notices) must let pointer events through except on its own
controls, and must not shift the canvas ([Notices float over the canvas](notices-float-over-canvas.md),
[Canvas and tools](canvas-and-tools.md)). A browser check that passes may only be missing the overlay
([Playwright flow-check pitfalls](playwright-flow-checks.md)).
