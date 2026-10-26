// IA de J'emme.
//
// À 2 joueurs : minimax avec élagage alpha-bêta. À plus de 2 : max-n, où chaque joueur cherche son
// propre intérêt dans l'ordre réel du tour (une recherche où tous les adversaires se liguent contre
// l'IA la rend si défensive que plus personne ne gagne).
// Les coups sont d'abord triés par une évaluation rapide (quickScore) et seuls les meilleurs sont
// explorés ; les feuilles sont évaluées par un balayage complet du plateau (analyse).

import { GEOMETRY as G } from './board'
import {
  EMPTY,
  WIN_TARGETS,
  cloneState,
  gobbleMask,
  nextPlayer,
  play,
  runFrom,
  undo,
  winReason,
  type GameState,
} from './rules'

export type AiLevel = 'easy' | 'medium' | 'hard'

interface LevelConfig {
  maxDepth: number
  /** Coups explorés à la racine, puis à chaque nœud de la recherche. */
  rootWidth: number
  width: number
  timeMs: number
}

const LEVELS: Record<Exclude<AiLevel, 'easy'>, LevelConfig> = {
  medium: { maxDepth: 2, rootWidth: 10, width: 8, timeMs: 1500 },
  hard: { maxDepth: 6, rootWidth: 12, width: 9, timeMs: 1800 },
}

const WIN = 1e9
/** Score rapide d'un coup qui gagne immédiatement. */
const WIN_MOVE = 1e8
/** Score rapide d'un coup qui empêche un adversaire de faire une ligne de 6 au coup suivant. */
const BLOCK_SIX = 1e7

/** Valeur d'une série selon sa longueur après le coup (1 à 5). */
const RUN_VALUE = [0, 1, 6, 40, 250, 900]
/** Valeur d'une fenêtre de 6 intersections qui ne contient que k gemmes d'un même joueur. */
const SIX_WINDOW = [0, 1, 8, 50, 300, 2000]

export type Rng = () => number

// Poids de quickScore : ce qu'un coup construit, ce qu'il bloque chez les autres, et la pénalité d'une
// paire exposée à la capture. Ceux du multijoueur ont été trouvés en faisant jouer les IA entre elles :
// avec ceux du duel, elles éparpillent leurs gemmes, bloquent tout, et presque toutes les parties à 6
// finissent nulles.
const DUEL = { build: 1, block: 0.7, exposedPair: 1.5 }
const MULTI = { build: 3, block: 0.15, exposedPair: 0.2 }

function popcount(x: number): number {
  let n = 0
  for (; x; x &= x - 1) n++
  return n
}

/** Intersection à k pas de `from` dans la direction `dir`, ou -1. */
function walk(dir: number, from: number, k: number): number {
  const step = G.step[dir]
  let i = from
  for (let n = 0; n < k && i !== -1; n++) i = step[i]
  return i
}

function candidates(s: GameState): number[] {
  const out: number[] = []
  const cells = s.cells
  for (let i = 0; i < G.size; i++) {
    if (cells[i] !== EMPTY) continue
    const around = G.near[i]
    for (let k = 0; k < around.length; k++) {
      if (cells[around[k]] !== EMPTY) {
        out.push(i)
        break
      }
    }
  }
  if (out.length > 0) return out
  for (let i = 0; i < G.size; i++) if (cells[i] === EMPTY) out.push(i)
  return out
}

function captureValue(s: GameState, p: number): number {
  return 60 * (1 + (3 * s.captured[p]) / WIN_TARGETS[s.playerCount].captured)
}

/**
 * Évaluation rapide d'un coup de p en x : ce qu'il construit, ce qu'il bloque, ce qu'il gobe,
 * les paires qu'il protège ou expose. Vaut WIN_MOVE si le coup gagne sur-le-champ.
 */
function quickScore(s: GameState, x: number, p: number): number {
  const cells = s.cells
  const multi = s.playerCount > 2
  const t = WIN_TARGETS[s.playerCount]
  const w = multi ? MULTI : DUEL
  let score = 0
  let mayWin = false

  for (let axis = 0; axis < 3; axis++) {
    const fwdDir = axis
    const backDir = axis + 3
    const back = runFrom(cells, backDir, x, p)
    const fwd = runFrom(cells, fwdDir, x, p)
    const length = back + fwd + 1
    if (length >= 6) return WIN_MOVE
    if (length >= 4) mayWin = true

    const endBack = walk(backDir, x, back + 1)
    const endFwd = walk(fwdDir, x, fwd + 1)
    const vBack = endBack === -1 ? -2 : cells[endBack]
    const vFwd = endFwd === -1 ? -2 : cells[endFwd]
    const open = (vBack === EMPTY ? 1 : 0) + (vFwd === EMPTY ? 1 : 0)
    score += w.build * RUN_VALUE[length] * (open === 2 ? 1 : open === 1 ? 0.5 : 0.15)

    // En multijoueur, prime aux lignes de 4 et de 5 gagnées ou perdues par ce coup (fusionner deux
    // séries peut en défaire), à la mesure de l'objectif du nombre de joueurs.
    if (multi && length >= 4) {
      const fours = (length === 4 ? 1 : 0) - (back === 4 ? 1 : 0) - (fwd === 4 ? 1 : 0)
      const fives = (length === 5 ? 1 : 0) - (back === 5 ? 1 : 0) - (fwd === 5 ? 1 : 0)
      score += (fours * 1200) / t.four + (fives * 1500) / t.five
    }

    // Une paire exactement, avec un adversaire d'un côté et du vide de l'autre : elle peut se faire gober.
    if (length === 2) {
      if (vBack === EMPTY && vFwd >= 0 && vFwd !== p) score -= w.exposedPair * captureValue(s, vFwd)
      if (vFwd === EMPTY && vBack >= 0 && vBack !== p) score -= w.exposedPair * captureValue(s, vBack)
    }

    // Séries adverses que ce coup coupe ou borne.
    const a = G.step[backDir][x]
    const b = G.step[fwdDir][x]
    const qa = a === -1 ? EMPTY : cells[a]
    const qb = b === -1 ? EMPTY : cells[b]
    for (const q of qa === qb ? [qa] : [qa, qb]) {
      if (q === EMPTY || q === p) continue
      const qLength = runFrom(cells, backDir, x, q) + runFrom(cells, fwdDir, x, q) + 1
      score += qLength >= 6 ? BLOCK_SIX : w.block * RUN_VALUE[qLength]
    }
  }

  const mask = gobbleMask(cells, x, p)
  if (mask) {
    const gobbled = 2 * popcount(mask)
    score += gobbled * captureValue(s, p)
    if (s.captured[p] + gobbled >= WIN_TARGETS[s.playerCount].captured) return WIN_MOVE
  }

  // x est la case d'où un adversaire goberait une de nos paires : l'occuper la protège.
  for (let d = 0; d < 6; d++) {
    const a = G.step[d][x]
    if (a === -1 || cells[a] !== p) continue
    const b = G.step[d][a]
    if (b === -1 || cells[b] !== p) continue
    const c = G.step[d][b]
    if (c === -1) continue
    const q = cells[c]
    if (q !== EMPTY && q !== p) score += 1.6 * captureValue(s, q)
  }

  if (mayWin) {
    const rec = play(s, x, p)
    const won = winReason(s, p) !== null
    undo(s, rec)
    if (won) return WIN_MOVE
  }

  return score - 0.01 * Math.max(Math.abs(G.q[x]), Math.abs(G.r[x]), Math.abs(G.q[x] + G.r[x]))
}

interface ScoredMove {
  cell: number
  player: number
  score: number
}

function orderMoves(s: GameState, cells: number[], players: number[], rng?: Rng): ScoredMove[] {
  const moves: ScoredMove[] = []
  for (const player of players) {
    for (const cell of cells) {
      const jitter = rng ? rng() * 0.5 : 0
      moves.push({ cell, player, score: quickScore(s, cell, player) + jitter })
    }
  }
  return moves.sort((m, n) => n.score - m.score)
}

// Tampons réutilisés par evaluate pour éviter les allocations dans la recherche.
const scores = new Float64Array(6)
const capOps = new Int16Array(6)
const threatCell = new Int16Array(6)
const threats = new Int8Array(6)

function noteThreat(p: number, cell: number): void {
  if (threats[p] === 0) {
    threats[p] = 1
    threatCell[p] = cell
  } else if (threats[p] === 1 && threatCell[p] !== cell) {
    threats[p] = 2
  }
}

function progress(x: number, target: number): number {
  const f = x / target
  return 3000 * f * f + 600 * f
}

/**
 * Balayage complet du plateau : remplit `scores` (plus c'est haut, plus le joueur est proche de
 * gagner) et `threats` (0, 1 ou 2 cases d'où le joueur gagnerait au coup suivant).
 */
function analyse(s: GameState): void {
  const n = s.playerCount
  const cells = s.cells
  const t = WIN_TARGETS[n]
  scores.fill(0, 0, n)
  capOps.fill(0, 0, n)
  threats.fill(0, 0, n)

  for (const line of G.lines) {
    const c = line.cells
    const len = c.length

    for (let start = 0; start + 6 <= len; start++) {
      let owner = EMPTY
      let k = 0
      let gap = -1
      let mixed = false
      for (let j = start; j < start + 6; j++) {
        const v = cells[c[j]]
        if (v === EMPTY) {
          gap = c[j]
          continue
        }
        if (owner === EMPTY) owner = v
        else if (v !== owner) {
          mixed = true
          break
        }
        k++
      }
      if (mixed || k === 0) continue
      scores[owner] += SIX_WINDOW[k]
      if (k === 5) noteThreat(owner, gap)
    }

    // Motifs « p q q _ » : p peut gober la paire de q en jouant sur le vide.
    for (let start = 0; start + 4 <= len; start++) {
      const b = cells[c[start + 1]]
      if (b === EMPTY || cells[c[start + 2]] !== b) continue
      const a = cells[c[start]]
      const d = cells[c[start + 3]]
      if (a !== EMPTY && a !== b && d === EMPTY) {
        capOps[a]++
        if (s.captured[a] + 2 >= t.captured) noteThreat(a, c[start + 3])
      } else if (d !== EMPTY && d !== b && a === EMPTY) {
        capOps[d]++
        if (s.captured[d] + 2 >= t.captured) noteThreat(d, c[start])
      }
    }
  }

  for (let p = 0; p < n; p++) {
    const o = p * 3
    scores[p] +=
      progress(s.lines[o], t.four) +
      progress(s.lines[o + 1], t.five) +
      progress(s.captured[p], t.captured) +
      capOps[p] * 0.6 * captureValue(s, p)
  }
}

/** Évaluation à 2 joueurs, du point de vue de `me`. */
function evaluate(s: GameState, me: number, meToMove: boolean): number {
  analyse(s)
  const n = s.playerCount
  let maxOther = -Infinity
  let opponentThreat = 0
  for (let o = 0; o < n; o++) {
    if (o === me) continue
    if (scores[o] > maxOther) maxOther = scores[o]
    if (s.reserve[o] > 0 && threats[o] > opponentThreat) opponentThreat = threats[o]
  }

  // Celui qui a le trait gagne s'il a une menace ; sinon il ne peut parer qu'une menace adverse.
  if (meToMove) {
    if (threats[me] > 0) return WIN / 2
    if (opponentThreat === 2) return -WIN / 2
  } else {
    if (opponentThreat > 0) return -WIN / 2
    if (threats[me] === 2) return WIN / 4
  }
  return scores[me] - maxOther
}

function winVector(n: number, winner: number, ply: number): Float64Array {
  const u = new Float64Array(n).fill(-(WIN - ply))
  u[winner] = WIN - ply
  return u
}

/**
 * Évaluation à plus de 2 joueurs : chacun ne regarde que son propre score. Le comparer à celui des
 * adversaires pousse toutes les IA à freiner le joueur en tête, et plus personne ne gagne.
 * Seules comptent comme décisives la menace du joueur qui a le trait, et la double menace du
 * joueur suivant (qu'un seul coup ne peut pas parer).
 */
function evaluateAll(s: GameState, toMove: number, ply: number): Float64Array {
  analyse(s)
  const n = s.playerCount
  if (threats[toMove] > 0) return winVector(n, toMove, ply + 1)
  const after = nextPlayer(s, toMove)
  if (after !== -1 && after !== toMove && threats[after] === 2) return winVector(n, after, ply + 2)
  return scores.slice(0, n)
}

class Timeout extends Error {}

interface SearchContext {
  me: number
  width: number
  deadline: number
  nodes: number
}

function tick(ctx: SearchContext): void {
  if ((++ctx.nodes & 127) === 0 && performance.now() > ctx.deadline) throw new Timeout()
}

/** À 2 joueurs : minimax avec élagage alpha-bêta, du point de vue de ctx.me. */
function searchDuel(
  s: GameState,
  ctx: SearchContext,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  myTurn: boolean,
): number {
  tick(ctx)
  if (depth === 0) return evaluate(s, ctx.me, myTurn)

  const player = myTurn ? ctx.me : 1 - ctx.me
  if (s.reserve[player] <= 0 || s.emptyCount === 0) return evaluate(s, ctx.me, myTurn)

  const moves = orderMoves(s, candidates(s), [player])
  if (moves[0].score >= WIN_MOVE) return myTurn ? WIN - ply : -(WIN - ply)

  let best = myTurn ? -Infinity : Infinity
  const count = Math.min(ctx.width, moves.length)
  for (let i = 0; i < count; i++) {
    const m = moves[i]
    const rec = play(s, m.cell, m.player)
    const v = searchDuel(s, ctx, depth - 1, ply + 1, alpha, beta, !myTurn)
    undo(s, rec)
    if (myTurn) {
      if (v > best) best = v
      if (best > alpha) alpha = best
    } else {
      if (v < best) best = v
      if (best < beta) beta = best
    }
    if (alpha >= beta) break
  }
  return best
}

/**
 * À plus de 2 joueurs : max-n. Les joueurs jouent dans l'ordre réel du tour et chacun choisit le coup
 * le meilleur pour lui-même. Une menace est donc parée par le joueur qui joue juste avant celui qui
 * menace, et les autres en profitent pour avancer leur propre jeu au lieu de tout bloquer.
 */
function searchMaxN(s: GameState, ctx: SearchContext, depth: number, ply: number, toMove: number): Float64Array {
  tick(ctx)
  if (depth === 0 || s.emptyCount === 0) return evaluateAll(s, toMove, ply)

  const moves = orderMoves(s, candidates(s), [toMove])
  if (moves[0].score >= WIN_MOVE) return winVector(s.playerCount, toMove, ply)

  let best: Float64Array | null = null
  const count = Math.min(ctx.width, moves.length)
  for (let i = 0; i < count; i++) {
    const rec = play(s, moves[i].cell, toMove)
    const next = nextPlayer(s, toMove)
    const u = next === -1 ? new Float64Array(s.playerCount) : searchMaxN(s, ctx, depth - 1, ply + 1, next)
    undo(s, rec)
    if (best === null || u[toMove] > best[toMove]) best = u
  }
  return best!
}

/** Valeur pour `me` du coup qu'il vient de jouer, en cherchant `depth - 1` coups plus loin. */
function rootValue(s: GameState, ctx: SearchContext, depth: number): number {
  const me = ctx.me
  if (winReason(s, me)) return WIN
  if (s.playerCount === 2) return searchDuel(s, ctx, depth - 1, 1, -Infinity, Infinity, false)
  const next = nextPlayer(s, me)
  return next === -1 ? 0 : searchMaxN(s, ctx, depth - 1, 1, next)[me]
}

/** Joueur qui joue juste avant p (le dernier à pouvoir parer une menace de p). */
function previousPlayer(s: GameState, p: number): number {
  for (let k = 1; k < s.playerCount; k++) {
    const q = (p - k + s.playerCount) % s.playerCount
    if (s.reserve[q] > 0) return q
  }
  return p
}

/**
 * Cases d'où un adversaire de `me` gagnerait en y jouant. Avec `mine`, seulement celles que `me`
 * est le dernier à pouvoir parer ; sans, seulement celles dont le dernier joueur à pouvoir les parer
 * n'est pas fiable.
 */
function winningCells(s: GameState, me: number, reliable: boolean[], mine: boolean): number[] {
  const out: number[] = []
  let cands: number[] | null = null
  for (let o = 0; o < s.playerCount; o++) {
    if (o === me || s.reserve[o] <= 0) continue
    const blocker = previousPlayer(s, o)
    if (mine ? blocker !== me : blocker === me || reliable[blocker]) continue
    cands ??= candidates(s)
    for (const c of cands) if (quickScore(s, c, o) >= WIN_MOVE) out.push(c)
  }
  return out
}

function openingMove(rng: Rng): number {
  const options = [G.center, ...G.step.map((step) => step[G.center])]
  return options[Math.floor(rng() * options.length)]
}

function pickWeighted(moves: ScoredMove[], rng: Rng): number {
  const top = moves.slice(0, 4)
  const weights = top.map((_, i) => 1 / (i + 1))
  let r = rng() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]
    if (r <= 0) return top[i].cell
  }
  return top[0].cell
}

export interface AiResult {
  cell: number
  depth: number
  nodes: number
  ms: number
}

/**
 * Choisit le coup du joueur courant. Ne modifie pas `state`.
 * `reliable[p]` indique si le joueur p pare à coup sûr les menaces immédiates (IA moyenne ou
 * difficile) ; par défaut, personne d'autre que l'IA elle-même n'est considéré comme fiable.
 */
export function chooseMove(
  state: GameState,
  level: AiLevel,
  rng: Rng = Math.random,
  reliable: boolean[] = [],
): AiResult {
  const started = performance.now()
  const s = cloneState(state)
  const me = s.current
  const done = (cell: number, depth = 0, nodes = 0): AiResult => ({
    cell,
    depth,
    nodes,
    ms: Math.round(performance.now() - started),
  })

  if (s.emptyCount === G.size) return done(openingMove(rng))

  const ordered = orderMoves(s, candidates(s), [me], rng)
  if (ordered[0].score >= WIN_MOVE) return done(ordered[0].cell)

  // Facile : un regard sur le coup lui-même, avec une bonne part de hasard.
  if (level === 'easy') return done(pickWeighted(ordered, rng))

  const cfg = LEVELS[level]
  const ctx: SearchContext = { me, width: cfg.width, deadline: started + cfg.timeMs, nodes: 0 }
  let root = ordered.slice(0, cfg.rootWidth).map((m) => ({ cell: m.cell, value: m.score }))
  let completedDepth = 0

  // À plus de 2 joueurs, max-n suppose que le joueur placé juste avant un adversaire qui menace de
  // gagner le bloquera. Si ce joueur n'est pas fiable (humain, IA facile), on pare soi-même.
  // Dans tous les cas, les cases à parer font partie des coups examinés.
  const multi = s.playerCount > 2
  const dangers = multi ? winningCells(s, me, reliable, false) : []
  const toExamine = multi ? [...dangers, ...winningCells(s, me, reliable, true)] : []
  for (const cell of toExamine) {
    if (!root.some((m) => m.cell === cell)) root.push({ cell, value: -Infinity })
  }

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    try {
      const values: { cell: number; value: number }[] = []
      for (const m of root) {
        const rec = play(s, m.cell, me)
        const v = rootValue(s, ctx, depth)
        undo(s, rec)
        values.push({ cell: m.cell, value: v })
      }
      // Tri stable : à valeur égale, l'ordre de l'itération précédente départage.
      root = values.sort((a, b) => b.value - a.value)
      completedDepth = depth
      if (root[0].value >= WIN / 4 || root[0].value <= -WIN / 4) break
    } catch (e) {
      if (!(e instanceof Timeout)) throw e
      break
    }
  }

  if (dangers.length > 0) {
    // Une recherche interrompue laisse `s` modifié : on repart de l'état reçu.
    const fresh = cloneState(state)
    let best = root[0]
    let fewest = Infinity
    for (const m of root) {
      const rec = play(fresh, m.cell, me)
      const left = winningCells(fresh, me, reliable, false).length
      undo(fresh, rec)
      // `root` est trié par valeur : à menaces restantes égales, le premier est le meilleur.
      if (left < fewest) {
        fewest = left
        best = m
      }
    }
    return done(best.cell, completedDepth, ctx.nodes)
  }

  // Moyen : hésite entre les coups presque aussi bons que le meilleur.
  if (level === 'medium' && Math.abs(root[0].value) < WIN / 4) {
    const close = root.filter((m) => m.value >= root[0].value - 40)
    return done(close[Math.floor(rng() * close.length)].cell, completedDepth, ctx.nodes)
  }
  return done(root[0].cell, completedDepth, ctx.nodes)
}
