# architect wiki — log

Append-only history of this wiki, newest entry at the bottom. Every entry starts with `## [YYYY-MM-DD] op | Title`
(ops: `init`, `seed`, `ingest`, `query`, `lint`, `update`); see [SCHEMA.md](SCHEMA.md).

## [2026-11-02] init | Wiki created

## [2026-11-02] seed | Architect first version (survey photo, calibration, layered line drawing)
- updated: overview.md
- created: pages/plan-model.md, pages/editor-store.md, pages/canvas-and-tools.md
- created: pages/base-image-calibration.md, pages/snapping-and-connections.md
- created: pages/forge-h1-stack.md, pages/view-fitted-once.md
- created: pages/development-and-testing.md, pages/code-conventions.md
- created: pages/playwright-flow-checks.md, pages/bash-hook-key-paths.md

## [2026-11-02] update | Open edges, named areas and regions; floating notices
- created: pages/regions.md (planar arrangement, faces, holes, label point and its performance)
- created: pages/areas.md (areas as named points, derived.ts caching, Area tool and label dragging, limits)
- created: pages/segment-kind-not-layer.md (open edges as a segment attribute; locked layers only fade)
- created: pages/notices-float-over-canvas.md (notice bar shifted the canvas under the cursor)
- updated: pages/plan-model.md (segment kind, areas, area ids, refExists, additive change without a version bump)
- updated: pages/editor-store.md (lineKind, Prompt union and PromptDialog, selectAll with areas, derived.ts)
- updated: pages/canvas-and-tools.md (area tool, areas.ts, AreaFills/AreaLabels, dashed open edges, locked styling)
- updated: pages/snapping-and-connections.md (kinds survive split/merge/move; regions close without connections)
- updated: pages/code-conventions.md (derived data cached by identity, keep line maps on area edits, a<n> ids)
- updated: pages/development-and-testing.md (69 tests, areas flow check, selector changes)
- updated: pages/view-fitted-once.md (measure-check failure was the notice bar; store comment now current)
- updated: pages/base-image-calibration.md (recalibration after drawing, outlier in the user's draft)
- updated: pages/forge-h1-stack.md (derived.ts adapted, NoticeBar moved over the canvas)
- updated: overview.md (summary, architecture, open items)
- updated: index.md

## [2026-11-02] update | Doors and windows hosted by segments; Library panel
- created: pages/openings-hosted-by-segment.md (decision; segment-kind door rejected; nearer-end rule on stretch)
- created: pages/doors-and-windows.md (openings.ts, edits that keep openings on walls, tools, drag, drawing, panel)
- updated: pages/plan-model.md (OpeningSchema, opening refs, o<n> ids, integrity check, offset rounding, additive)
- updated: pages/canvas-and-tools.md (Openings.tsx, opening tool, WALL_REACH_PX, hit order, walls drawn around gaps)
- updated: pages/editor-store.md (placeOpeningAt/dropOpening, door/window ToolIds, width prefs, lineKind from library)
- updated: pages/code-conventions.md (state never imports ui, openings-only edits, o<n> ids, no `Window` type name)
- updated: pages/snapping-and-connections.md (openings follow split, merge, delete and length changes)
- updated: pages/segment-kind-not-layer.md (Library panel replaced the TopBar Wall / Open edge switch)
- updated: pages/notices-float-over-canvas.md (three-column grid; notice offsets tied to sidebar widths)
- updated: pages/areas.md (doors do not open areas)
- updated: pages/development-and-testing.md (84 tests, doors/windows flow, sidebar selector scoping)
- updated: overview.md (summary, architecture, Library panel, user's lots, open items: materials, door styles)
- updated: index.md

## [2026-11-02] update | Door and window styles
- created: pages/opening-styles.md (style field and defaults, STYLES table, hasSide/hasHinge, openingParts shared by plan and library icons)
- updated: pages/doors-and-windows.md (model fields, openingParts replaces doorLeaf, openingStyle, library groups, Style select, conditional flips)
- updated: pages/plan-model.md (style in OpeningSchema, hinge/swing common with defaults, additive at schemaVersion 1)
- updated: pages/editor-store.md (openingStyle not in the draft, dropOpening style, prefs widths per style and doorWidth migration)
- updated: pages/canvas-and-tools.md ("kind:style" drop data, OpeningShape/OpeningIcon, polyline in the non-scaling-stroke selector)
- updated: pages/development-and-testing.md (90 tests, openings 21, 15-check styles flow)
- updated: pages/playwright-flow-checks.md (.opening shared by icons, button names with counts, swing side vs drawing direction)
- updated: overview.md (Library groups, open items: materials questions recorded as open, door styles removed)
- updated: index.md

## [2026-11-02] update | Casement leaf and arc styling; compound .opening.<kind> selectors
- updated: pages/opening-styles.md (casement leaves lighter than door leaves, arcs dashed)
- updated: pages/code-conventions.md (CSS specificity section: .opening.<kind> .x, not .<kind> .x; summary, tags)
- updated: index.md (code-conventions summary)

## [2026-11-02] update | Outdoor gates; welcome card let clicks through
- created: pages/welcome-card-swallowed-clicks.md (.empty-state caught canvas clicks; pointer-events none, shown only with Select/Pan)
- updated: pages/opening-styles.md (title, gate styles and widths, hinge as slide direction, hasHinge per kind, slides, default direction, parkingRoom and cramped, dashed/posts parts, gate CSS)
- updated: pages/doors-and-windows.md (title, gate kind in any segment, Gate tool without a key, Gates group, Flip direction, parking hint, known limits)
- updated: pages/plan-model.md (GateSchema and GATE_STYLES, sliding-gate hinge, additive at schemaVersion 1)
- updated: pages/canvas-and-tools.md (gate drops and tool, cramped class, empty-state card, overlays let clicks through)
- updated: pages/editor-store.md (gate ToolId, openingStyle.gate default single)
- updated: pages/development-and-testing.md (95 tests, openings 26, gates flow, styles flow selector changes)
- updated: pages/playwright-flow-checks.md (sliding-gate direction, passing clicks may miss an overlay)
- updated: pages/openings-hosted-by-segment.md (gates hosted the same way)
- updated: pages/notices-float-over-canvas.md (link to the welcome card gotcha)
- updated: overview.md (summary, Gates group, pitfall link)
- updated: index.md

## [2026-11-02] update | Sun tool and collapsible panel sections
- created: pages/sun.md (sun.ts math and tests, site in the plan vs sun in prefs, North tool and the leveling offset, SunDial/SunShadows and their limits, Sun panel)
- updated: pages/plan-model.md (site schema and DEFAULT_SITE, updateSite, sun prefs not in the plan, additive at schemaVersion 1; summary, tags)
- updated: pages/editor-store.md (north ToolId, prefs.collapsed and prefs.sun validated on load; summary, tags)
- updated: pages/canvas-and-tools.md (Sun.tsx draw order, S key, north.ts; summary, tags)
- updated: pages/code-conventions.md (plan vs store vs prefs rule, Panels section: Box ids, data-box, folded Box unmounts children; summary, tags)
- updated: pages/development-and-testing.md (104 tests, sun 9, 17-check sun flow, all flows passing)
- updated: pages/playwright-flow-checks.md (start-plan autosave overwrites an injected draft, hidden photo, evolving draft, folded sections)
- updated: overview.md (summary, sun, Sun panel, foldable sections, open items: design tabs, shadows with real heights)
- updated: index.md

## [2026-11-02] update | Outline: a third segment kind for ground-level edges
- updated: pages/segment-kind-not-layer.md (retitled; outline kind, SEGMENT_KINDS, drafting-convention strokes, only walls cast shadows, wall wins merges, O cycles three kinds, measureSegments "not wall", area kinds not added; summary, tags)
- updated: pages/plan-model.md (kind "outline", SEGMENT_KINDS, additive at schemaVersion 1)
- updated: pages/regions.md (outline boundary length, wall wins over any kind; summary)
- updated: pages/sun.md (outlines and open edges cast no shadows; pool limit removed)
- updated: pages/canvas-and-tools.md (three LayerShapes paths, outline preview is solid, O cycles)
- updated: pages/development-and-testing.md (106 tests, outline tests, 7-check outline flow, Quincho not enclosed in the user's draft; summary)
- updated: pages/editor-store.md, pages/snapping-and-connections.md, pages/areas.md, pages/doors-and-windows.md, pages/code-conventions.md (stale wall/open-only wording)
- updated: overview.md (summary, outlines, Library line types, open items: area kinds, wall thickness and heights proposal pending the user)
- updated: index.md

## [2026-11-02] update | Wall thickness and heights
- created: pages/walls.md (centrelines kept, optional thickness/height and defaults, updateWalls, kind changes and addSegment like keep them, layerWalls joins/fills/edges/footprint, Thick walls pref, face hit tests via halfWidth callback, WallFields, caching)
- created: pages/indoor-reachability-rule.md (decision: indoor = unreachable from outside across open edges/outlines; "walled on every side" rejected after the open-plan kitchen case)
- updated: pages/regions.md (layerFaces, edges keep segment ids, Region floor/indoor/wallIds, insetRing floor; summary)
- updated: pages/areas.md (floor sizes everywhere, coveredArea and its 10 × 6 example, known limits; summary)
- updated: pages/plan-model.md (segment thickness/height, additive at schemaVersion 1, prefs list; summary, tags)
- updated: pages/canvas-and-tools.md (wall-fill/wall-edges in LayerShapes, face hit tests, thick prop; summary, tags)
- updated: pages/doors-and-windows.md (symbols at host thickness, no 3 px minimum when thick and why, openingTarget halfWidth, stale limit removed)
- updated: pages/sun.md (per-wall shadow heights, wallHeight pref and panel field removed, centreline limit)
- updated: pages/segment-kind-not-layer.md (thick wall drawing, kind changes keep thickness/height, open edges decide indoor, covered total)
- updated: pages/editor-store.md (faces cache, getWalls, coveredArea, drawnHalfWidth, thickWalls pref, sun.wallHeight dropped; summary)
- updated: pages/code-conventions.md (model takes callbacks for pref-dependent values; derived data list)
- updated: pages/playwright-flow-checks.md (outline flow strips the pool's kind: do not assume the saved plan's state)
- updated: pages/development-and-testing.md (122 tests, walls.test.ts, 21-check walls flow, older flow changes, draft figures, live module import; summary)
- updated: overview.md (summary, walls, indoor decision, open items: wall thickness done, semi-covered total, shadows)
- updated: index.md

## [2026-11-02] update | Tabs, View section and a basic 3-D Exterior tab
- created: pages/house-solids.md (solids.ts rules: roofed regions, wall tops, openings, beams/columns by position, z-fighting lip and layer lift, getSolids cache)
- created: pages/exterior-tab.md (ExteriorTab row 2, house.ts axes and shadows, engine.ts sun/sky/shadow box, presets, kept pose and StrictMode, lazy three.js chunk)
- created: pages/tabs-over-one-plan.md (decision: two-row bar, tab order, one plan and undo history, tab not saved, Canvas unmounts, toggles moved to View)
- created: pages/exterior-kept-basic.md (decision: fixed palette, roof toggle, materials catalogue and schema fields removed, Roof tab and Elevations next)
- updated: pages/editor-store.md (tab and setTab, not in the draft; View toggles, areaNames/areaSizes/roofs prefs; getSolids; summary, tags)
- updated: pages/canvas-and-tools.md (mounted by FloorTab, inert shortcuts elsewhere, LabelLines, areaLabelSize/areaLabelAt, Thick walls in View; summary, tags)
- updated: pages/code-conventions.md (three.js only in src/render, View mixes plan and prefs, Box id view, data-box over position; summary)
- updated: pages/forge-h1-stack.md (render engine adapted, three at the planner's versions; summary, tags)
- updated: pages/walls.md (LayerWalls.owners, Thick walls in View)
- updated: pages/sun.md (reused by the Exterior's 3-D sun, View toggle; summary, tags)
- updated: pages/areas.md (hidden labels cannot be grabbed)
- updated: pages/plan-model.md (tab and new prefs not in the plan, no fields for 3-D)
- updated: pages/development-and-testing.md (131 tests, solids 9, build check, 28-check exterior flow with SwiftShader, data-box selectors in older flows; summary, tags)
- updated: pages/playwright-flow-checks.md (positional box selectors, SwiftShader flags, blank WebGL readback, Ctrl+Z on focused checkbox; summary, tags)
- updated: pages/bash-hook-key-paths.md (retitled; path-followed-by-colon blocks; summary)
- updated: overview.md (summary, tabs, solids.ts, src/render, three dependency, build check, open items: Roof tab and Elevations next, materials deferred)
- updated: index.md

## [2026-11-02] update | Roof plan with drawn roofs, solids as faces, Elevations tab
- created: pages/roofs.md (RoofSchema in layer.roofs, r<n> ids, roof edits; roofs.ts planes as distance functions, faces by half-plane clipping and normalized, undersideAlong, nextEdge, newRoof defaults, unionOutlines)
- created: pages/roof-tab.md (RoofTab row 2, Canvas roof mode, Roofs.tsx, roof and roofSelect tools, RoofPanel, openTab/addRoofOutline/roofTheHouse, limits)
- created: pages/elevations.md (user's view-only choice, mainDirection, compass-named views, culling on normals, nearest-point sort and why, levels, layer toggles, standalone Save SVG)
- created: pages/roofs-drawn-outlines.md (decision: drawn outlines over per-area roofs, four types, planes; straight skeleton deferred; automatic roof removed)
- updated: pages/house-solids.md (faces with explicit normals, no automatic roof or roof lip, infill and parapet kinds, slab material, beams under drawn roofs with the 1 cm eaves rule, isCovered; 12 tests; summary, tags)
- updated: pages/exterior-tab.md (face triangulation wound to normals instead of ExtrudeGeometry and why, Roof toggle hides roofs and parapets; summary, tags)
- updated: pages/tabs-over-one-plan.md (Roof and Elevations built, openTab replaces setTab, Canvas on Floor and Roof; summary)
- updated: pages/exterior-kept-basic.md (automatic flat roof superseded by drawn roofs; Roof and Elevations built; summary)
- updated: pages/plan-model.md (roofs, Ref kind roof, r<n> ids, outline rounding, additive at schemaVersion 1, roofType not saved; summary, tags)
- updated: pages/editor-store.md (roofType, roof ToolIds, openTab and roof actions, setTab removed, getSolids for elevations; summary, tags)
- updated: pages/canvas-and-tools.md (mode roof, ROOF_SHORTCUTS, roof tools; summary, tags)
- updated: pages/code-conventions.md (explicit face normals, Box id roofs, r<n> ids, roof edits touch only roofs, allowConstantExport covers literals only; summary)
- updated: pages/development-and-testing.md (GitHub repo, 147 tests by file, Vitest "no tests" during Vite re-optimisation, exterior flow roofs first, 26-check roof flow; summary, tags)
- updated: pages/playwright-flow-checks.md (stale HMR module copies, vite child keeping port 5180, layer-name inputs, newline before tool keys; summary, tags)
- updated: overview.md (summary, tabs, roofs.ts/elevations.ts, RoofTab/ElevationsTab, roof decision, GitHub, reading order, open items for roofs and elevations)
- updated: index.md

## [2026-11-04] update | Colonnades on open edges; fireplaces with chimneys
- created: pages/colonnades.md (segment colonnade field, colonnades.ts sizes/columnSpots/layerColonnades/heldByWall, setColonnade, tool, library box, ColonnadeLayer, ColonnadeFields, 3-D beam and columns)
- created: pages/fireplaces.md (FireplaceSchema, cutsWall, besideWall/fireplaceShape, wall-only targets, openingAt half thickness gotcha, local point-in-polygon, symbol, roof-plan chimney, 3-D masonry and chimney height)
- created: pages/colonnade-setting-fireplace-opening.md (decision: open-edge attribute and opening kind; hosted collections rejected)
- updated: pages/plan-model.md (colonnade field, FireplaceSchema in the union, additive at schemaVersion 1; summary, tags)
- updated: pages/doors-and-windows.md (fireplace kind, wall-only targets, cutsWall spans, overlaps on either side, openingAt half, tool, Fireplaces group, LibraryItem.drag; summary, tags)
- updated: pages/opening-styles.md (masonry row, hasHinge explicit, cutsWall, hand-drawn icon; summary, tags)
- updated: pages/openings-hosted-by-segment.md (fireplaces hosted too)
- updated: pages/segment-kind-not-layer.md (open edges carry colonnades, kept across kind switches; fireplaces need walls)
- updated: pages/house-solids.md (fireplace/chimney kinds, stone/metal/brick/soot, round builders and smooth faces, colonnade beams and columns, plain open edges skip colonnade ends, fireplaces after roofs; 15 tests; summary, tags)
- updated: pages/elevations.md (facing and smooth per polygon, shading, smooth facets stroked in their fill and the black-bar columns; 4 tests; summary)
- updated: pages/roof-tab.md (chimney marks; summary, tags)
- updated: pages/canvas-and-tools.md (two drag types, ColonnadeLayer, symbols.ts, colonnade tool; summary, tags)
- updated: pages/editor-store.md (fireplace/colonnade ToolIds, openingStyle.fireplace, columnStyle, colonnade actions; summary, tags)
- updated: pages/code-conventions.md (library-fireplace/library-colonnade Box ids, no model import cycles, helpers in symbols.ts; summary)
- updated: pages/development-and-testing.md (159 tests by file, 5e2f614 committed and this batch not, 19-check flow, two older checks updated; summary)
- updated: overview.md (summary, what it does, colonnades.ts, Library groups, decision link, open items)
- updated: index.md

## [2026-11-04] update | Furniture: counters, sinks, bathtubs, beds, tables, chairs
- created: pages/furniture.md (layer.furniture schema, furniture.ts catalogue/placement/targets/shower head/symbols, edits and pruning, tool, library boxes, select drags, FurnitureDetails, furniture3d.ts, limits)
- created: pages/furniture-free-standing.md (decision: free-standing pieces; kitchen sink hosted by counter id + offset; wall hosting and absolute sink position rejected)
- updated: pages/plan-model.md (FurnitureSchema, Ref kind, f<n> ids, kitchen-sink integrity check, at/offset rounding, additive at schemaVersion 1; summary, tags)
- updated: pages/editor-store.md (furniturePick, furniture ToolId, not in the draft, settle prunes furniture, selectAll, placeFurnitureAt/dropFurniture/FURNITURE_DRAG_TYPE; summary, tags)
- updated: pages/canvas-and-tools.md (third drag type, Furniture.tsx, ghost in Overlay, furniture tool, hit order with the shower mark, R on Floor vs Roof, library-icon non-scaling rule, roof-mode fade; summary, tags)
- updated: pages/house-solids.md (faces.ts split and why, furniture kind and ceramic/wood/fabric, furniture built last; summary, tags)
- updated: pages/code-conventions.md (faces.ts against an import cycle, furniture Box ids, furniture edits touch only their map, pruneFurniture, f<n> ids, rounding)
- updated: pages/development-and-testing.md (166 tests, furniture.test.ts, 19-check furniture flow, four older flows broken by the user's edits and passing on a cleaned fixture, outline flow's two old-pool checks, commit status; summary)
- updated: pages/playwright-flow-checks.md (pinned fixture for the live plan, heredoc escapes, drag_to for library drops; summary)
- updated: pages/openings-hosted-by-segment.md (furniture deliberately not hosted)
- updated: overview.md (summary, what it does, furniture.ts/furniture3d.ts/faces.ts, Library groups, decision link, open items)
- updated: index.md

## [2026-11-04] update | Toilet, bidet, shower and a corner bathtub
- updated: pages/furniture.md (new schemas, hasShower/isCorner, corner tub's quarter disc and curved rim, showerAt steps, head defaults, symbols, 3-D riser/tray/screen/toilet/bidet, FURNITURE_GROUPS kinds and box ids, corner-snap limit; summary)
- updated: pages/development-and-testing.md (169 tests, furniture 10, 24-check furniture flow, 3014137, "no tests" glitch again; summary)
- updated: pages/plan-model.md (furniture kinds, shower field)
- updated: pages/code-conventions.md (library-shower/library-toilet Box ids, id from first kind)
- updated: pages/canvas-and-tools.md (shower mark hit on showers too)
- updated: overview.md (summary, what it does, Library groups)
- updated: index.md

## [2026-11-04] update | Kitchen island
- updated: pages/furniture.md (island = counter style island, snap none, ISLAND_OVERHANG, sinkAcross, plan symbol, Style field guard, 3-D cabinets and toe kick; summary)
- updated: pages/furniture-free-standing.md (island as a counter style; new island kind rejected; summary)
- updated: pages/plan-model.md (CounterSchema's optional style)
- updated: pages/development-and-testing.md (170 tests, furniture 11, island tests, 26-check furniture flow, 0acdce9; summary)
- updated: overview.md (what it does, Library groups)
- updated: index.md

## [2026-11-04] update | Sofas
- updated: pages/furniture.md (SofaSchema styles, SOFA sizes, sofaOutline L and sofa-only mirror with its reason, symbol, library-sofa, Flip, 3-D parts; summary)
- updated: pages/plan-model.md (sofa kind, optional mirror)
- updated: pages/code-conventions.md (library-sofa Box id)
- updated: pages/development-and-testing.md (171 tests, furniture 12, sofa tests, 28-check furniture flow, 3657510, recurring "no tests" gotcha restated; summary)
- updated: overview.md (summary, what it does, Library groups)
- updated: index.md

## [2026-11-04] update | Coffee table
- updated: pages/furniture.md (table style coffee, snap sofa, COFFEE_GAP and the sectional's main seat, chairs skip it, Style field grouping and title, 3-D top/shelf/legs, limit; summary)
- updated: pages/development-and-testing.md (172 tests, furniture 13, coffee table tests, 29-check furniture flow, round table looked up by style, 4cf872f; summary)
- updated: index.md

## [2026-11-04] update | Wall and floor materials; Library in three groups
- created: pages/materials-and-finishes.md (MATERIALS catalogue and helpers, pattern only in swatches, left/right sides and sideNormal, outdoor unless indoor, finish/floor fields, edits surviving splits, suitability checked only on apply, Material tool, finishTarget/applyFinish/dropMaterial, FinishLayer, Selection fields, Library group)
- updated: pages/house-solids.md (Face.finish/Solid.finish, per-material meshes, finishing pass with the 0.99 normal test, reveals split by clipFace and the pale-stripe reason, tops/bottoms in base material; summary, tags)
- updated: pages/plan-model.md (segment finish, area floor, ids unchecked, additive at schemaVersion 1, materialPick not saved; summary, tags)
- updated: pages/exterior-kept-basic.md (superseded in part by 839dce5; palette stays as base; summary)
- updated: pages/canvas-and-tools.md (fourth drag type, Finishes.tsx, tinted AreaFills, material tool; summary, tags)
- updated: pages/editor-store.md (materialPick, material ToolId, not in the draft, finish actions; summary, tags)
- updated: pages/exterior-tab.md (meshes per material key, finishMaterial; tags)
- updated: pages/elevations.md (finish colour fills; summary)
- updated: pages/areas.md (area floor finish)
- updated: pages/furniture.md (boxes nested in the Objects group)
- updated: pages/code-conventions.md (library-drawing replaces library-lines, group and nested Box ids, Box className, nested boxes)
- updated: pages/playwright-flow-checks.md (nested .box has_text, "Wall" matching the "Walls" toggle, any SVG tag needs text_content, furniture flow on the fixture; summary)
- updated: pages/development-and-testing.md (184 tests, finishes 12, 839dce5, furniture flow on the cleaned fixture; summary)
- updated: overview.md (summary, what it does, materials.ts/finishes.ts, Library groups, decision wording, open items)
- updated: index.md

## [2026-11-04] update | Checkered tile, lots, View > Materials toggle
- created: pages/lots.md (AreaSchema.lot and setAreaLot, why: walled-in lots counted as rooms; outdoor in wallSide/finishTarget, areaSize, totals and FOS, GROUND cover, planAreas label boxes and the 17 vs 3 ms reason, tests)
- updated: pages/materials-and-finishes.md (29 materials, checker field, lots outdoor, FinishPatterns and url(#finish-id) fills, View > Materials, .library-name ellipsis; summary, tags)
- updated: pages/areas.md (lot flag, planAreas/visibleAreas/editableAreas, areaSize, coveredArea skips lots, Lots and Lot covered rows; summary, tags)
- updated: pages/house-solids.md (lots get no slab unless finished, GROUND cover; tags)
- updated: pages/exterior-tab.md (checkerTexture, uv attribute from addFace)
- updated: pages/canvas-and-tools.md (checkered AreaFills, materials prop, FinishPatterns, FinishLayer behind prefs.materials, area labels from planAreas; summary)
- updated: pages/editor-store.md (planAreas, areaSize, coveredArea without lots, prefs.materials; tags)
- updated: pages/plan-model.md (area lot field, additive at schemaVersion 1; summary, tags)
- updated: pages/regions.md (labelPoint takes extra obstacles)
- updated: pages/development-and-testing.md (190 tests, finishes 16, derived.test.ts, 64f59b7, make_fixture.py hides the photo and marks lots, e2e_outline empty-canvas click; summary)
- updated: pages/playwright-flow-checks.md (empty style="", shortcuts ignored on a focused checkbox, visible photo frames the survey, computed empty-canvas click, stale Vite modules again; summary quotes escaped, tags)
- updated: overview.md (summary, what it does, open items)
- updated: index.md (Lots added; summaries)

## [2026-11-05] update | Brick, wood and lawn textures in 3-D
- updated: pages/materials-and-finishes.md (src/render/textures.ts: real-size canvas textures and normal maps for brick, planks, grass; why normal not bump maps; lawn 8 m repeat; cached per session; ground and chimneys textured; summary, tags)
- updated: pages/exterior-tab.md (textures.ts replaces checkerTexture, textured helper, maps cached not disposed, upside-down wall UVs and normal-map green, ground in lawn clones; summary, tags)
- updated: pages/development-and-testing.md (194 tests, textures.test.ts, 69111af, iteration mode: no new tests until asked, cheap visual checks; summary)
- updated: index.md

## [2026-11-05] update | Roof covering and soffit, standing seam metal
- updated: pages/materials-and-finishes.md (30 materials, metal-standing-seam, seams texture, roof and ceiling surfaces in use, roof.finish/soffit, MaterialField in fields.tsx, RoofPanel fields; summary, tags)
- updated: pages/house-solids.md (roof faces tagged by normal.z: covering on top, soffit underneath incl. gallery ceilings, fascia covered only on pitched roofs)
- updated: pages/exterior-tab.md (seams texture; addFace u = n × up unless |n.y| ≥ 0.999, was 0.9, which turned seams sideways under ~26°)
- updated: pages/plan-model.md (RoofSchema finish and soffit, additive at version 1)
- updated: pages/roofs.md (finish and soffit fields, updateRoof deletes them when undefined; summary, tags)
- updated: pages/roof-tab.md (Covering and Soffit fields, covered roofs tinted, Roof the house with hip on a non-convex house: draw convex pieces per wing; tags)
- updated: index.md (Materials and finishes, Roofs summaries)

## [2026-11-05] update | Galleries get their own near-flat roof; walls stop at roofs
- updated: pages/roofs.md (galleryRoof and GALLERY_PITCH: low edge at the open front, height tucked 0.1 m under the wall tops; tags)
- updated: pages/roof-tab.md (roofTheHouse roofs rooms and galleries separately, and why; tags)
- updated: pages/house-solids.md (wall and lintel tops cut to ceiling(p), the two-rule choice and the rejected alternatives, white-patch gable infill is not a bug; tags)

## [2026-11-05] update | Gallery roof no longer runs into the house walls
- updated: pages/roofs.md (offsetEdges; galleryRoof on the centreline ring, in to the house wall face, out 0.5 m on free sides, overhang 0 and why, Overhang-field caveat, user's r2 rebuilt; summary)
- updated: pages/house-solids.md (wall trimming per wall by roofOver(midpoint), per-point rule rejected and why; "not a bug" note corrected into a debugging lesson: probe houseSolids before trusting screenshots)
- updated: index.md (Roofs summary)

## [2026-11-05] update | Parrilla, stone pool, stone slabs, tile and stacked-stone textures
- updated: pages/fireplaces.md (parrilla style, PARRILLA_DEPTH/CHEEK and fireplaceDepth, parrilla solids, fireplace finish on brick parts only, Selection panel field, limits; summary, tags)
- updated: pages/materials-and-finishes.md (32 materials, tile and water fields, stone-slab and pool-stone, tiles and stone textures, no sunken pool; fireplace finish; summary, tags)
- updated: pages/house-solids.md (Solid.finish on fireplace brick parts, parrilla heights; summary)
- updated: pages/exterior-tab.md (tile and stacked stone textures, pool painted into its floor; summary)
- updated: pages/opening-styles.md (parrilla row in STYLES; summary)
- updated: index.md (Fireplaces, Door/window/gate styles, Materials and finishes, House solids, Exterior tab summaries)

## [2026-11-05] update | Pool depth, trees, dirt road, parrilla firewood and hearth fix
- updated: pages/furniture.md (trees: TreeSchema, shade/slender, symbol, 3-D trunk and crown; summary, tags)
- updated: pages/materials-and-finishes.md (33 materials, dirt and paintDirt; "no sunken pool" replaced by pool basins; summary, tags)
- updated: pages/house-solids.md (pool basin, water slab, Solid.hole, lawn covers cut over pools; foliage/bark palette; parrilla hearth z-fight; summary, tags)
- updated: pages/exterior-tab.md (HouseModel.holes; ground rebuilt as a ShapeGeometry with pool holes, lawn repeat px/width; dirt texture; summary, tags)
- updated: pages/fireplaces.md (firewood logs; hearth at FLOOR + 0.02 and why)
- updated: pages/areas.md (area depth and setAreaDepth; overlapping roads: crossing owned by one road; tags)
- updated: pages/lots.md (lawn cover open over pools; tags)
- updated: pages/elevations.md (solids topping out at ≤ 0.01 m skipped, why not 0, layer-4 caveat; FILL foliage/bark; tags)
- updated: index.md (Furniture, Materials and finishes, House solids, Exterior tab summaries)

## [2026-11-05] update | Elevations leave out pools on any layer
- updated: pages/elevations.md (underground rule bottom < 0 and top ≤ 0.05 replaces the 0.01 threshold and its layer-4 caveat)

## [2026-11-06] update | Floor level per layer with plinth and steps; pool steps
- updated: pages/house-solids.md (layer level: raise, groundworks plinth and steps, corner notch; pool lining with risers between parts, union-ring holes; tags)
- updated: pages/plan-model.md (optional layer level, format history; tags)
- updated: pages/areas.md (pool steps by outline and depth, not walls)
- updated: pages/exterior-tab.md (one union hole per pool, Set dedupe, touching holes break triangulation)

## [2026-11-06] update | A door's own height
- updated: pages/plan-model.md (optional door height), pages/opening-styles.md (Height field, capped at the wall), pages/house-solids.md (door head, lintel only above 1 mm)

## [2026-11-06] update | Roof skylights
- updated: pages/roofs.md (skylights field and layout), pages/roof-tab.md (plan paths, panel fields), pages/house-solids.md (holes, sides, glass pane, no shadow), pages/plan-model.md (roof skylights, format history)

## [2026-11-06] update | Oak trestle table
- updated: pages/furniture.md (trestle style, boards/frames, 3-D parts), pages/materials-and-finishes.md (oak-solid, grain texture), pages/exterior-tab.md (Face.grain sets texture u; parallel-grain pitfall), pages/house-solids.md (Face.grain, furniture part finish), index.md (three summaries)

## [2026-11-06] update | Teak outdoor living set and potted plants
- updated: pages/furniture.md (teak sofa, armchair and coffee table, isCoffee, plants, 3-D parts), pages/materials-and-finishes.md (teak, 35 materials), pages/house-solids.md (linen, olive palettes), pages/elevations.md (FILL linen/olive), pages/exterior-tab.md (467b865 grain fallback replaces the pitfall), index.md (two summaries)

## [2026-11-06] update | Bushes, agapanthus, lavender, climbers; mulch beds
- updated: pages/furniture.md (in-ground plant styles, potted(), seeded blob 3-D, Jardín beds, aerial-camera check), pages/materials-and-finishes.md (mulch, 36 materials), pages/house-solids.md (flower, lavender, blossom palettes), pages/elevations.md (FILL), index.md (two summaries)

## [2026-11-06] update | Pergola roof type, polycarbonate
- updated: pages/roofs.md, pages/roof-tab.md, pages/house-solids.md, pages/materials-and-finishes.md, pages/plan-model.md (pergola type, rafters, sheet, polycarbonate), pages/code-conventions.md (no formatter), pages/development-and-testing.md and pages/furniture.md (user save overwrote the Jardín edit), overview.md, index.md (five summaries)

## [2026-11-07] update | Fit a roof to the walls; timber columns
- updated: pages/roofs.md (fitRoof, carport recipe), pages/roof-tab.md (fitRoofToWalls, Fit to the walls), pages/colonnades.md, pages/house-solids.md (timber style, timberPost), pages/plan-model.md (COLUMN_STYLES), overview.md and index.md (three summaries: timber colonnades)

## [2026-11-07] update | Exterior zoom, orbit and pan keep their pace close up
- updated: pages/exterior-tab.md (own wheel zoom to the cursor, keepAhead, panSpeed by distance)

## [2026-11-07] update | Upper floors, lofts and stairs
- created: pages/storeys.md
- updated: pages/plan-model.md (storey, level up to 20, stair), pages/house-solids.md (upperworks), pages/canvas-and-tools.md (storeyView), overview.md, index.md

## [2026-11-07] update | Floors: cross-links on related pages
- updated: pages/furniture.md (stair kind, library-stair box, stair hint, furnitureParts rise)
- updated: pages/areas.md (coveredArea storey param, panel grouped by floor, Lot built)
- updated: pages/lots.md (FOS ground floor only, Lot built FOT row)
- updated: pages/sun.md (wall shadow height adds layer level)
- updated: pages/editor-store.md (setActiveLayer pruning, floor actions, storeyView)
- updated: pages/elevations.md (slab tops as level marks)
- updated: pages/roof-tab.md (Floor switcher, floor below's roofs faded and not pickable)
- updated: pages/canvas-and-tools.md (edits use the store's plan, not the view)
- updated: pages/code-conventions.md (read through storeyView, edit the store's plan; library-stair id)
- updated: index.md (furniture, lots and code-conventions summaries)

## [2026-11-07] update | Exterior: hide the floors over a chosen one
- updated: pages/exterior-tab.md (Up to floor filter by ref.layer, top floor stored as MAX_STOREY, summary)
- updated: pages/storeys.md (pointer to Up to)
- updated: pages/editor-store.md (topStorey pref, summary)
- updated: pages/plan-model.md (Up to among per-browser prefs)
- updated: index.md (exterior-tab and editor-store summaries)

## [2026-11-07] update | Walls rise to a higher roof beside them or on the floor above
- updated: pages/house-solids.md (infill via ceiling/Overhead: interior steps, roofs of higher floors unless floored, why; chimney through a roof on the floor above; summary)
- updated: pages/storeys.md (double-height rooms; chimney open item)
- updated: pages/roofs-drawn-outlines.md (consequence: interior steps, double-height walls)
- updated: pages/development-and-testing.md (rolldown-bundled node probe; summary)
- updated: index.md (house-solids and development-and-testing summaries)

## [2026-11-08] update | Walls rise to the roof over each 10 cm stretch of them
- updated: pages/house-solids.md (infill per stretch via runsAlong/roofAt replacing the midpoint choice, why, ceiling now chimney-only)
- updated: pages/storeys.md (double-height walls decided per stretch)
- updated: pages/development-and-testing.md (probe used for b3a61f0)
- updated: pages/playwright-flow-checks.md (Exterior wheel zoom goes through the house; summary)
- updated: index.md (playwright-flow-checks summary)

## [2026-11-08] update | A chimney rises through upper floors to the roof drawn above it
- updated: pages/house-solids.md (chimney roof = own layer's, else highest on any floor above; ceiling helper removed; why)
- updated: pages/storeys.md (chimney rule; how-to for a balcony and a flat band under a double-height space; open item)
- updated: pages/fireplaces.md (chimney roof rule)

## [2026-11-08] update | A window's own top and sill
- updated: pages/plan-model.md (WindowSchema `height` and `sill`; format history, still version 1)
- updated: pages/opening-styles.md (window top/sill defaults, `windowSill`, Selection panel Top and Sill fields and clamps)
- updated: pages/doors-and-windows.md (Selection panel lists Height / Top and Sill)
- updated: pages/house-solids.md (Openings rule: a window's own head and sill, sill 0 builds no wall under it)
