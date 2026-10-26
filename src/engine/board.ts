// Géométrie du plateau : un hexagone de 11 intersections de côté sur une grille triangulaire.
// Chaque intersection est repérée en coordonnées axiales (q, r) ; elle a jusqu'à 6 voisines
// et appartient à 3 lignes (une par axe).

export const BOARD_SIDE = 11

/** Les 3 axes de ligne. Les directions 0..2 suivent ces axes, 3..5 sont leurs opposées (d et d + 3). */
export const AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 1],
]

export interface Line {
  axis: number
  /** Intersections de la ligne, dans l'ordre de l'axe. */
  cells: number[]
}

export interface Geometry {
  side: number
  size: number
  q: Int8Array
  r: Int8Array
  center: number
  /** step[d][i] : voisine de i dans la direction d (0..5), ou -1 hors du plateau. */
  step: Int16Array[]
  lines: Line[]
  /** Intersections à 2 pas ou moins de chaque intersection (elle-même exclue). */
  near: Int16Array[]
  indexOf(q: number, r: number): number
}

export function hexDistance(dq: number, dr: number): number {
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

export function createGeometry(side: number = BOARD_SIDE): Geometry {
  const radius = side - 1
  const span = 2 * radius + 1
  const lookup = new Int16Array(span * span).fill(-1)
  const qs: number[] = []
  const rs: number[] = []

  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (hexDistance(q, r) > radius) continue
      lookup[(q + radius) * span + (r + radius)] = qs.length
      qs.push(q)
      rs.push(r)
    }
  }

  const size = qs.length
  const indexOf = (q: number, r: number): number =>
    hexDistance(q, r) > radius ? -1 : lookup[(q + radius) * span + (r + radius)]

  const step: Int16Array[] = []
  for (let d = 0; d < 6; d++) {
    const [dq, dr] = AXES[d % 3]
    const sign = d < 3 ? 1 : -1
    const s = new Int16Array(size)
    for (let i = 0; i < size; i++) s[i] = indexOf(qs[i] + sign * dq, rs[i] + sign * dr)
    step.push(s)
  }

  const lines: Line[] = []
  for (let axis = 0; axis < 3; axis++) {
    for (let i = 0; i < size; i++) {
      if (step[axis + 3][i] !== -1) continue
      const cells: number[] = []
      for (let j = i; j !== -1; j = step[axis][j]) cells.push(j)
      lines.push({ axis, cells })
    }
  }

  const near: Int16Array[] = []
  for (let i = 0; i < size; i++) {
    const around: number[] = []
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = -2; dr <= 2; dr++) {
        if ((dq === 0 && dr === 0) || hexDistance(dq, dr) > 2) continue
        const j = indexOf(qs[i] + dq, rs[i] + dr)
        if (j !== -1) around.push(j)
      }
    }
    near.push(Int16Array.from(around))
  }

  return {
    side,
    size,
    q: Int8Array.from(qs),
    r: Int8Array.from(rs),
    center: indexOf(0, 0),
    step,
    lines,
    near,
    indexOf,
  }
}

export const GEOMETRY = createGeometry()
