import type { ToolId } from '../../../state/store'
import { createAreaTool } from './area'
import { createCalibrateTool, createCropTool, createImageMoveTool, createLevelTool } from './image'
import { createNorthTool } from './north'
import { createLineTool } from './line'
import { createMeasureTool } from './measure'
import { createOpeningTool } from './opening'
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
    measure: createMeasureTool(ctx),
    // the canvas pans with a left drag while this tool is active
    pan: { cursor: () => 'grab', overlay: () => ({}) },
    'image-move': createImageMoveTool(ctx),
    level: createLevelTool(ctx),
    crop: createCropTool(ctx),
    calibrate: createCalibrateTool(ctx),
    north: createNorthTool(ctx),
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
}
