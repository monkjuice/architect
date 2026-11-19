import type { ToolId } from '../../../state/store'
import { createAreaTool } from './area'
import { createColonnadeTool } from './colonnade'
import { createElectricTool } from './electric'
import { createElectricSelectTool } from './electricSelect'
import { createFoundationSelectTool } from './foundationSelect'
import { createFurnitureTool } from './furniture'
import { createMaterialTool } from './material'
import { createCalibrateTool, createCropTool, createImageMoveTool, createLevelTool } from './image'
import { createNorthTool } from './north'
import { createLineTool } from './line'
import { createMeasureTool } from './measure'
import { createOpeningTool } from './opening'
import { createRadiantTool } from './radiant'
import { createServicesSelectTool } from './servicesSelect'
import { createServiceTool } from './service'
import { createMepSelectTool } from './mepSelect'
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
    'electric-select': createElectricSelectTool(ctx),
    board: createElectricTool(ctx, 'board'),
    switch: createElectricTool(ctx, 'switch'),
    light: createElectricTool(ctx, 'light'),
    socket: createElectricTool(ctx, 'socket'),
    'plumbing-select': createServicesSelectTool(ctx, 'plumbing'),
    'hvac-select': createServicesSelectTool(ctx, 'hvac'),
    'gas-select': createServicesSelectTool(ctx, 'gas'),
    'mep-select': createMepSelectTool(ctx),
    service: createServiceTool(ctx),
    radiant: createRadiantTool(ctx),
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
  'electric-select': {
    title: 'Select',
    key: 'V',
    hint: "Click a board or point (Shift: add) · a point's circuit becomes the one new points go on · drag it along its wall · click a cable run, then drag a stretch sideways or a bend anywhere · Del: delete",
  },
  board: {
    title: 'Board',
    key: 'B',
    hint: 'Click a wall to put a board on it (biphasic or triphasic, in the toolbar): name it, and pick the meter (a main board, feeding layers) or a board (a sub-board, feeding areas)',
  },
  switch: { title: 'Switch', key: 'S', hint: 'Click a wall to put a light switch on it, on the side the cursor is on; it goes on the circuit picked in the bar, or a new one you name' },
  light: {
    title: 'Light',
    key: 'L',
    hint: "Ceiling: click inside a room (it snaps to the room's centre lines and in line with other lights; Alt: not); Wall: click a wall; Floor: click in a room or outdoors (a garden light, fed underground). It goes on the circuit picked in the bar, or a new one you name",
  },
  socket: {
    title: 'Socket',
    key: 'O',
    hint: 'Click a wall, or for a floor socket in a room or outdoors (fed underground); it goes on the circuit picked in the bar, or a new one you name (a special socket asks each time)',
  },
  'plumbing-select': {
    title: 'Select',
    key: 'V',
    hint: 'Click a piece of equipment (Shift: add, or drag a box round several) · drag to move it · R: turn · Del: delete · its size and rating are in the Selection section · hover a pipe or a fixture to see what it is',
  },
  'hvac-select': {
    title: 'Select',
    key: 'V',
    hint: 'Click a piece of equipment (Shift: add, or drag a box round several) · drag to move it · R: turn · Del: delete · click a pipe or a duct to pick it, a room to see its loads · hover anything to see what it is',
  },
  'gas-select': {
    title: 'Select',
    key: 'V',
    hint: 'Click gas equipment, a cooker or a pipe · drag equipment or a pipe stretch · R: turn · Del: delete · hover to inspect',
  },
  'mep-select': {
    title: 'Inspect',
    key: 'V',
    hint: 'Hover a line, clash or wall crossing to inspect it · edit each installation on its own tab',
  },
  radiant: {
    title: 'Radiant floor',
    hint: "Click a named room to give it a radiant floor, fed from the nearest underfloor manifold on its floor · click it again to take it off",
  },
  service: {
    title: 'Place',
    hint: 'Click where the piece picked in the library goes; it backs up to the nearest wall where that suits it · Alt: no snap · Esc: back to Select',
  },
}
