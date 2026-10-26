// Règles de J'emme : chaque joueur pose une gemme par tour ; deux gemmes adverses de même couleur
// encadrées sur une ligne sont gobées ; on gagne par lignes (6, ou N lignes de 5, ou N lignes de 4)
// ou par gemmes gobées, selon le nombre de joueurs.

import { GEOMETRY as G } from './board'

export const EMPTY = -1
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
/** 300 gemmes dans la boîte, 50 par couleur. */
export const GEMS_PER_PLAYER = 50

export type WinReason = 'six' | 'five' | 'four' | 'captured'

export interface WinTargets {
  five: number
  four: number
  captured: number
}

/** Tableau de la notice. Une ligne de 6 gagne toujours. */
export const WIN_TARGETS: Record<number, WinTargets> = {
  2: { five: 3, four: 8, captured: 24 },
  3: { five: 3, four: 6, captured: 20 },
  4: { five: 2, four: 5, captured: 18 },
  5: { five: 2, four: 4, captured: 14 },
  6: { five: 2, four: 4, captured: 12 },
}

export interface GameState {
  playerCount: number
  /** Contenu de chaque intersection : EMPTY ou numéro du joueur. */
  cells: Int8Array
  /**
   * Lignes présentes sur le plateau, par joueur : [p * 3] lignes de 4, [p * 3 + 1] lignes de 5,
   * [p * 3 + 2] lignes de 6 ou plus. Une ligne compte uniquement pour sa longueur exacte.
   */
  lines: Int16Array
  /** Gemmes gobées par chaque joueur. */
  captured: Int16Array
  /** Gemmes qu'il reste à poser à chaque joueur. */
  reserve: Int16Array
  emptyCount: number
  current: number
  /** -1 tant que personne n'a gagné (et en cas de partie nulle). */
  winner: number
  winReason: WinReason | null
  over: boolean
  lastMove: number
  turn: number
}

export interface MoveRecord {
  cell: number
  player: number
  /** Intersections gobées pendant ce coup et propriétaire de chacune. */
  gobbled: number[]
  gobbledOwner: number[]
}

export function newGame(playerCount: number): GameState {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Nombre de joueurs invalide : ${playerCount}`)
  }
  return {
    playerCount,
    cells: new Int8Array(G.size).fill(EMPTY),
    lines: new Int16Array(playerCount * 3),
    captured: new Int16Array(playerCount),
    reserve: new Int16Array(playerCount).fill(GEMS_PER_PLAYER),
    emptyCount: G.size,
    current: 0,
    winner: -1,
    winReason: null,
    over: false,
    lastMove: -1,
    turn: 0,
  }
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    cells: s.cells.slice(),
    lines: s.lines.slice(),
    captured: s.captured.slice(),
    reserve: s.reserve.slice(),
  }
}

/** Nombre de gemmes de p alignées à partir de la voisine de `from` dans la direction `dir`. */
export function runFrom(cells: Int8Array, dir: number, from: number, p: number): number {
  const step = G.step[dir]
  let n = 0
  for (let i = step[from]; i !== -1 && cells[i] === p; i = step[i]) n++
  return n
}

function bump(lines: Int16Array, p: number, length: number, delta: number): void {
  if (length >= 6) lines[p * 3 + 2] += delta
  else if (length === 5) lines[p * 3 + 1] += delta
  else if (length === 4) lines[p * 3] += delta
}

// Poser ou retirer une gemme ne modifie que les 3 lignes qui passent par l'intersection,
// ce qui permet de tenir le compte des lignes à jour sans rescanner le plateau.

function addGem(s: GameState, cell: number, p: number): void {
  for (let axis = 0; axis < 3; axis++) {
    const back = runFrom(s.cells, axis + 3, cell, p)
    const fwd = runFrom(s.cells, axis, cell, p)
    bump(s.lines, p, back, -1)
    bump(s.lines, p, fwd, -1)
    bump(s.lines, p, back + fwd + 1, 1)
  }
  s.cells[cell] = p
  s.emptyCount--
}

function removeGem(s: GameState, cell: number): void {
  const p = s.cells[cell]
  for (let axis = 0; axis < 3; axis++) {
    const back = runFrom(s.cells, axis + 3, cell, p)
    const fwd = runFrom(s.cells, axis, cell, p)
    bump(s.lines, p, back + fwd + 1, -1)
    bump(s.lines, p, back, 1)
    bump(s.lines, p, fwd, 1)
  }
  s.cells[cell] = EMPTY
  s.emptyCount++
}

/**
 * Directions (masque de bits) dans lesquelles poser p en `cell` goberait une paire :
 * exactement deux gemmes d'un même adversaire, puis une gemme de p.
 */
export function gobbleMask(cells: Int8Array, cell: number, p: number): number {
  let mask = 0
  for (let d = 0; d < 6; d++) {
    const step = G.step[d]
    const a = step[cell]
    if (a === -1) continue
    const q = cells[a]
    if (q === EMPTY || q === p) continue
    const b = step[a]
    if (b === -1 || cells[b] !== q) continue
    const c = step[b]
    if (c !== -1 && cells[c] === p) mask |= 1 << d
  }
  return mask
}

/** Intersections que goberait p en posant en `cell`. */
export function gobbledBy(cells: Int8Array, cell: number, p: number): number[] {
  const mask = gobbleMask(cells, cell, p)
  const out: number[] = []
  for (let d = 0; d < 6; d++) {
    if (!(mask & (1 << d))) continue
    const a = G.step[d][cell]
    out.push(a, G.step[d][a])
  }
  return out
}

export interface Run {
  player: number
  /** Intersections de la série, dans l'ordre de la ligne. */
  cells: number[]
}

/** Séries d'au moins 4 gemmes de p, c'est-à-dire les lignes qui comptent pour gagner. */
export function findRuns(cells: Int8Array, p: number): Run[] {
  const runs: Run[] = []
  for (const line of G.lines) {
    let current: number[] = []
    for (const c of line.cells) {
      if (cells[c] === p) {
        current.push(c)
        continue
      }
      if (current.length >= 4) runs.push({ player: p, cells: current })
      current = []
    }
    if (current.length >= 4) runs.push({ player: p, cells: current })
  }
  return runs
}

/**
 * Pose une gemme de p et applique les captures, sans gérer le tour ni la victoire.
 * Modifie `s` ; `undo` remet l'état exactement comme avant.
 */
export function play(s: GameState, cell: number, p: number): MoveRecord {
  const mask = gobbleMask(s.cells, cell, p)
  addGem(s, cell, p)
  s.reserve[p]--
  const gobbled: number[] = []
  const gobbledOwner: number[] = []
  for (let d = 0; d < 6; d++) {
    if (!(mask & (1 << d))) continue
    const a = G.step[d][cell]
    const b = G.step[d][a]
    for (const g of [a, b]) {
      gobbled.push(g)
      gobbledOwner.push(s.cells[g])
      removeGem(s, g)
    }
  }
  s.captured[p] += gobbled.length
  return { cell, player: p, gobbled, gobbledOwner }
}

export function undo(s: GameState, rec: MoveRecord): void {
  for (let i = rec.gobbled.length - 1; i >= 0; i--) addGem(s, rec.gobbled[i], rec.gobbledOwner[i])
  s.captured[rec.player] -= rec.gobbled.length
  removeGem(s, rec.cell)
  s.reserve[rec.player]++
}

export function winReason(s: GameState, p: number): WinReason | null {
  const t = WIN_TARGETS[s.playerCount]
  const o = p * 3
  if (s.lines[o + 2] > 0) return 'six'
  if (s.lines[o + 1] >= t.five) return 'five'
  if (s.lines[o] >= t.four) return 'four'
  if (s.captured[p] >= t.captured) return 'captured'
  return null
}

/** Prochain joueur à qui il reste des gemmes, ou -1 si plus personne ne peut jouer. */
export function nextPlayer(s: GameState, from: number): number {
  for (let k = 1; k <= s.playerCount; k++) {
    const q = (from + k) % s.playerCount
    if (s.reserve[q] > 0) return q
  }
  return -1
}

export function isLegal(s: GameState, cell: number): boolean {
  return !s.over && cell >= 0 && cell < G.size && s.cells[cell] === EMPTY
}

/** Joue le coup du joueur courant sur une copie de l'état : captures, victoire, puis joueur suivant. */
export function playTurn(prev: GameState, cell: number): { state: GameState; record: MoveRecord } {
  if (!isLegal(prev, cell)) throw new Error(`Coup illégal : ${cell}`)
  const s = cloneState(prev)
  const p = s.current
  const record = play(s, cell, p)
  s.lastMove = cell
  s.turn++

  const reason = winReason(s, p)
  if (reason) {
    s.winner = p
    s.winReason = reason
    s.over = true
    return { state: s, record }
  }

  const next = nextPlayer(s, p)
  if (next === -1 || s.emptyCount === 0) s.over = true
  else s.current = next
  return { state: s, record }
}
