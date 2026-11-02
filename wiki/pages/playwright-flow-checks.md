---
title: Playwright flow-check pitfalls
type: gotcha
summary: "Python Playwright against the SVG canvas: <text> has no innerText, python -I ignores PYTHONIOENCODING, clicks land on whole CSS pixels (assert stored values), library icons share the .opening class, library button names include their counts, an opening's swing side depends on the wall's drawing direction, a passing click may only have missed an overlay, the start plan's autosave overwrites an injected draft, the user's draft hides its photo and keeps changing, folded sections render nothing, panel sections must be found by data-box not position, WebGL needs SwiftShader flags and reads back blank (measure screenshots), and Ctrl+Z is ignored while a checkbox has focus."
tags: [gotcha, testing, playwright, python, webgl]
sources: []
updated: 2026-11-02
---

# Playwright flow-check pitfalls

Found while writing the browser flow checks on Windows, 2026-11-02 ([Development and testing](development-and-testing.md)):

- **SVG `<text>` has no `innerText`.** Length labels, tags and calibration labels are SVG text
  ([Canvas and tools](canvas-and-tools.md)). Read them with `text_content()` or `all_text_contents()`.
- **`python -I` ignores `PYTHONIOENCODING`.** Isolated mode skips `PYTHON*` environment variables. The labels contain
  non-ASCII characters (`²`, `°`, `▏`, `↵`), so printing them can fail on the Windows console. Call
  `sys.stdout.reconfigure(encoding="utf-8")` at the top of the script instead.
- **Clicks land on whole CSS pixels.** A click aimed at an exact image or world coordinate lands a fraction of a pixel
  off, so a calibration or a drawn point differs slightly from the intended value. Assert against the values the app
  stored, not against the coordinates you meant to click.
- **Library icons reuse the `.opening` class** (fourth session). The door, window and gate icons render the same
  `OpeningShape` as the plan ([Door, window and gate styles](opening-styles.md)), so to count plan symbols use
  `.openings .opening`, not `.opening`.
- **Library buttons' accessible names include their detail text**, for example "Single 0 · 0.80 m". Matching by role
  and name with `exact=True` on "Single" fails, so match the start of the name or the `.library-name` span.
- **"Outside" depends on the direction a wall was drawn.** `swing` is left or right of a→b, so a test that draws a
  room cannot predict the stored value. Assert the drawn geometry (the sash or leaf lies outside the room) instead.
  The same holds for a sliding gate's `hinge` (its direction): assert where the parked outline is drawn.
- **A passing click may only have missed an overlay.** Until the fifth session the empty-plan welcome card swallowed
  clicks in the middle of the canvas, and the earlier flows passed only because their clicks landed elsewhere
  ([Welcome card swallowed canvas clicks](welcome-card-swallowed-clicks.md)). Draw through the canvas centre at
  least once.

Found in the sixth session, with the sun flow on the user's real draft ([Sun and shadows](sun.md)):

- **The empty start plan overwrites an injected draft.** On first load `App.tsx` autosaves the new plan ~400 ms
  later ([Editor store and state](editor-store.md)), so a draft written into IndexedDB right away is lost. Wait about
  1 s after the first load, then inject the draft and reload.
- **The user's draft may hide the photo.** Their latest draft has the base image hidden, so waiting for
  `.base-image image` hangs. Wait for `.layer-lines`, tick *Visible* in the Base plan section if the photo is needed,
  then press `F` so its features are on screen.
- **The user's draft keeps changing.** Checks tied to its content (the areas flow named its largest room,
  86.68 m²) break as the user edits it. Assert things that stay true. The outline flow turned the pool's walls into
  outlines, then the user saved the pool as outlines, so the flow now strips the pool's `kind` in its injected copy
  to start from walls. Do not assume the saved plan's state; set up what the flow needs.
- **Folded sections are empty.** A folded `Box` renders no children and stays folded after a reload
  ([Code conventions](code-conventions.md)); find sections by `[data-box="<id>"]` and unfold them before using their
  fields.

Found in the eighth session, with the exterior flow ([Exterior tab](exterior-tab.md)):

- **Never pick a panel section by position.** Adding the View section first on the right shifted every
  `.sidebar:not(.sidebar-left) .box` `.nth(n)`, which broke the older flows that used it; use `[data-box="<id>"]`.
- **Headless Chromium needs software WebGL**: launch it with `--use-angle=swiftshader --enable-unsafe-swiftshader`,
  or the Exterior shows its no-WebGL message.
- **A WebGL canvas reads back blank** through `drawImage` (or similar) because the renderer has no
  `preserveDrawingBuffer`. To compare renders (night darker than noon), take Playwright screenshots and measure
  them with PIL.
- **Ctrl+Z is ignored while a checkbox has focus**: `useShortcuts` in `src/App.tsx` skips keys aimed at inputs, by
  design. After ticking a View box, click *Undo* instead.
