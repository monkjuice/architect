import type { Vec } from '../../model/geometry'

/** A flue as plans mark one: its outline, crossed (an SVG path; the outline is a quadrilateral). */
export const flueMark = (f: readonly Vec[]): string =>
  `M${f.map((p) => `${p.x} ${p.y}`).join('L')}ZM${f[0].x} ${f[0].y}L${f[2].x} ${f[2].y}M${f[1].x} ${f[1].y}L${f[3].x} ${f[3].y}`
