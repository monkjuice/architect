import type { ToolId } from '../../../state/store'
import { createAreaTool } from './area'
import { createColonnadeTool } from './colonnade'
import { createFoundationSelectTool } from './foundationSelect'
import { createFurnitureTool } from './furniture'
import { createMaterialTool } from './material'
import { createCalibrateTool, createCropTool, createImageMoveTool, createLevelTool } from './image'
import { createNorthTool } from './north'
import { createLineTool } from './line'
import { createMeasureTool } from './measure'
import { createOpeningTool } from './opening'
import { createRoofTool } from './roof'
import { createRoofSelectTool } from './roofSelect'
import { createSelectTool } from './select'
import type { Tool, ToolContext } from './types'

export function createTools(ctx: ToolContext): Record<ToolId, Tool> {
  return {
    select: createSelectTool(ctx),
    line: createLineTool(ctx),
    area: createAreaTool(ctx),
    door: createOpeningTool(ctx, 'door'),
    window: createOpeningTool(ctx, 'window'),
    gate: createOpeningTool(ctx, 'gate'),
    fireplace: createOpeningTool(ctx, 'fireplace'),
    colonnade: createColonnadeTool(ctx),
    furniture: createFurnitureTool(ctx),
    material: createMaterialTool(ctx),
    measure: createMeasureTool(ctx),
    // the canvas pans with a left drag while this tool is active
    pan: { cursor: () => 'grab', overlay: () => ({}) },
    'image-move': createImageMoveTool(ctx),
    level: createLevelTool(ctx),
    crop: createCropTool(ctx),
    calibrate: createCalibrateTool(ctx),
    north: createNorthTool(ctx),
    roof: createRoofTool(ctx),
    'roof-select': createRoofSelectTool(ctx),
    'foundation-select': createFoundationSelectTool(ctx),
  }
}

/** Titles, shortcut keys and status-bar hints for the toolbar and the canvas. */
export const TOOL_INFO: Record<ToolId, { title: string; key?: string; hint: string }> = {
  select: {
    title: 'Select',
    key: 'V',
    hint: 'Click a line, point or area (or box-select) · drag to move; drop a point on another to connect, drag a label into another room · Shift: add / 45° · Del: delete',
  },
  line: {
    title: 'Line',
    key: 'L',
    hint: 'Click to add points · O: wall / open edge / outline · Shift: 45° · type a length + Enter · Alt: no snap · click twice, Esc or right-click: finish',
  },
  area: {
    title: 'Area',
    key: 'A',
    hint: 'Click inside a closed outline to name it (walls, open edges and outlines all close it) · click a named one to select it',
  },
  door: {
    title: 'Door',
    key: 'D',
    hint: 'Hover a wall and click to put a door in it (style: pick it in the library); it opens to the side the cursor is on · type a width · X: hinge at the other end · Alt: no snap',
  },
  window: {
    title: 'Window',
    key: 'W',
    hint: 'Hover a wall and click to put a window in it (style: pick it in the library); casements and awnings open to the side the cursor is on · type a width · X: hinge · Alt: no snap',
  },
  gate: {
    title: 'Gate',
    hint: 'Hover a fence or wall and click to put a gate in it (style: pick it in the library); it swings to the side the cursor is on, a sliding gate parks towards the side with more fence · type a width · X: other way · Alt: no snap',
  },
  fireplace: {
    title: 'Fireplace',
    hint: 'Hover a wall and click to put a fireplace against it, on the side the cursor is on; its chimney goes up through the roof over it · type a width · Alt: no snap',
  },
  colonnade: {
    title: 'Colonnade',
    hint: "Click an open edge (a gallery's front) to stand columns along it, the style picked in the library; set their spacing in the Selection panel",
  },
  furniture: {
    title: 'Furniture',
    hint: 'Click to put the piece picked in the library down: near a wall it backs up to it, a kitchen sink goes in a counter, a chair faces a table · R: turn · Alt: no snap',
  },
  material: {
    title: 'Material',
    hint: 'Click the side of a wall (a wall material) or inside a named area (a floor material) to finish it with the material picked in the library',
  },
  measure: {
    title: 'Measure',
    key: 'M',
    hint: 'Click points for a total · click the first point to close and get the area · Enter or right-click: done · Esc: clear',
  },
  pan: { title: 'Pan', key: 'H', hint: 'Drag to pan · wheel to zoom · Space or middle button pans with any tool' },
  'image-move': { title: 'Move image', hint: 'Drag the base plan to position it' },
  level: { title: 'Level', hint: 'Click two points along a line that should be horizontal or vertical' },
  crop: { title: 'Crop', hint: 'Drag the handles or the inside of the frame · Esc or V when done' },
  north: { title: 'North', hint: "Click the tail of the plan's north arrow, then its tip · Shift: 45°" },
  calibrate: {
    title: 'Calibrate',
    hint: 'Click both ends of a length written on the plan, then type its real value · zoom in for precision · Shift: 45°',
  },
  roof: {
    title: 'Roof',
    key: 'R',
    hint: 'Click the corners of what the roof covers (they snap to the plan) · click the first corner or Enter to close · Shift: 45° · Backspace: undo a corner · Esc: cancel',
  },
  'roof-select': {
    title: 'Select',
    key: 'V',
    hint: 'Click a roof (Shift: add) · drag it to move it · drag a corner of a selected roof to reshape it · Del: delete',
  },
  'foundation-select': {
    title: 'Select',
    key: 'V',
    hint: "Click a wall's footing (Shift: add) to set its width and depth in the Foundation section · Esc: clear",
  },
}
