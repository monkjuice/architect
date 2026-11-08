---
title: Playwright flow-check pitfalls
type: gotcha
summary: "Python Playwright against the SVG canvas: SVG elements have no innerText, python -I ignores PYTHONIOENCODING, clicks land on whole CSS pixels (assert stored values), library icons share the .opening class, library button names include their counts, an opening's swing side depends on the wall's drawing direction, a passing click may only have missed an overlay, the start plan's autosave overwrites an injected draft, the user's draft may show or hide its photo (shown, F frames the whole survey and area labels take clicks) and keeps changing, folded sections render nothing, panel sections must be found by data-box not position or text (Library boxes nest), a role name \"Wall\" also matches the \"Walls\" toggle and \"Materials\" both the tab and the Library group (scope to nav.tabs), WebGL needs SwiftShader flags and reads back blank (measure screenshots), keyboard shortcuts are ignored while a checkbox has focus, React leaves an empty style=\"\" (check e.style.fill), a long-running dev server serves stale HMR module copies, a stopped background vite can keep its port, layer names are inputs, tool buttons' text has a newline before the key, flows on the user's live plan need a pinned fixture, bash heredocs mangle escapes in inline Python, the Exterior's wheel zoom goes through the house (four 250-unit wheel events from the aerial preset frame it), and segmented controls' buttons have role radio."
tags: [gotcha, testing, playwright, python, webgl, vite, react, exterior]
sources: []
updated: 2026-11-08
---

# Playwright flow-check pitfalls

Found while writing the browser flow checks on Windows, 2026-11-02 ([Development and testing](development-and-testing.md)):

- **SVG elements have no `innerText`.** Length labels, tags and calibration labels are SVG text
  ([Canvas and tools](canvas-and-tools.md)). Read any SVG tag with `text_content()` or `all_text_contents()`, never
  `inner_text()`.
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
- **The user's draft may hide the photo.** Their draft had the base image hidden then, so waiting for
  `.base-image image` hangs. Wait for `.layer-lines`, tick *Visible* in the Base plan section if the photo is needed,
  then press `F` so its features are on screen. Since `64f59b7` the photo is visible again (see below), so set the
  photo's visibility in the fixture rather than assuming either state.
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
- **Keyboard shortcuts are ignored while a checkbox has focus**: `useShortcuts` in `src/App.tsx` skips keys aimed
  at inputs, by design. This covers Ctrl+Z and the single-key tool shortcuts. After ticking a View box, blur it
  first, or click *Undo* instead.

Found later in the eighth session, with the roof flow ([Roof tab](roof-tab.md)):

- **Restart the dev server before running flows.** One left running across many edits served the app a newer HMR
  copy (`?t=…`) of a module than a test's `await import('/src/state/store.ts')` got, so the test's copy threw "The
  editor store is not initialised". It struck twice more on 2026-11-04 after modules were edited mid-session, and
  restarting the server fixed it both times.
- **Stopping a background `npx vite` task can leave its node child running**, still holding port 5180, so the next
  `--strictPort` start fails. Find the process by its port and kill it by PID.
- **Layer names in the Layers panel are inputs**, so text matching finds nothing: find a row by the value of its
  `input.layer-name`.
- **A tool button's inner text has a newline before its key** (the `<kbd>`), e.g. "Roof\nR": match the start of the
  text, not the whole of it.

Found on 2026-11-04, with the furniture flow ([Furniture and fixtures](furniture.md)):

- **Flows on the user's live plan need a pinned fixture.** The user keeps editing their saved plan (roofs,
  fireplaces, colonnades, layers, wall heights), so four older flows that injected it failed on stale expectations
  ([Development and testing](development-and-testing.md)). Inject a frozen copy built by a script that strips or
  re-adds what each flow assumes, and assert values read from that copy, not the plan's figures of the day.
- **Bash heredocs mangle escapes in inline Python**: `'\\n'` became a real newline and broke the scripts. Write such
  scripts to files and run the files, as for the
  [Bash hook](bash-hook-key-paths.md).
- Playwright's `drag_to` does perform the library's HTML5 drag-and-drop onto the SVG canvas.

Found on 2026-11-04, with the Library split into Drawing, Materials and Objects groups
([Materials and finishes](materials-and-finishes.md)):

- **Library boxes nest**, so a `.box` filtered with `has_text` also matches the group box around it. Select boxes
  by `[data-box="<id>"]` ([Code conventions](code-conventions.md)).
- **`get_by_role('button', name='Wall')` also matches the "Walls" fold toggle** of the Materials group, because
  role names match by substring. Scope to `[data-box="library-drawing"]` or match exactly.
- **The user's plan keeps drifting** (they furnished the house and resized the pool), so the furniture flow now also
  runs on the cleaned fixture.

Found on 2026-11-04 (`64f59b7`), with the checkered tile, lots and View > Materials
([Materials and finishes](materials-and-finishes.md), [Lots](lots.md)):

- **React leaves an empty `style=""`** when a style prop goes to `undefined`, so a `[style]` selector still
  matches. Check `e.style.fill` in `evaluate` instead.
- **With the photo visible, `F` frames the whole 109 × 68 m survey.** Area labels then span metres on screen and
  take wall and furniture clicks, because labels are hit first. `make_fixture.py` now hides the image and marks the
  Pared exterior areas as lots ([Development and testing](development-and-testing.md)).
- An "empty canvas" click must be computed to be clear of the plan, e.g. just outside all vertices (as
  `e2e_outline` now does), not taken from a fixed screen position.

Found on 2026-11-08, taking Exterior screenshots ([Exterior tab](exterior-tab.md)):

- **Exterior wheel zoom carries on through the model** (by design, near the cursor's hit point it flies along the
  ray). From the aerial preset, ten 400-unit `mouse.wheel` events ended inside the house; four 250-unit events
  framed it.

Found on 2026-11-08, with the Materials tab ([Materials list](materials-list.md)):

- **`get_by_role('button', name='Materials')` matches two buttons**: the tab and the Library's Materials group
  toggle. Scope it to `nav.tabs`.
- **Printing "≈" (or other non-ASCII) crashes on the Windows console** with a cp1252 `UnicodeEncodeError`; in
  `e6f545c` it struck after the screenshots were saved. Print ASCII, or `sys.stdout.reconfigure(encoding="utf-8")`
  first (see `python -I` above).

Found on 2026-11-08, with the Foundation tab ([Foundation tab](foundation-tab.md)):

- **A segmented control's buttons have role `radio`, not `button`** (e.g. the System choice, Roof's *New roofs*):
  use `get_by_role('radio', name=…)`.
