import { describe, expect, it } from 'vitest'
import { GEOMETRY as G } from './board'
import {
  EMPTY,
  GEMS_PER_PLAYER,
  cloneState,
  newGame,
  play,
  playTurn,
  undo,
  winReason,
  type GameState,
} from './rules'

const at = (q: number, r: number): number => {
  const i = G.indexOf(q, r)
  if (i === -1) throw new Error(`hors plateau : ${q},${r}`)
  return i
}

/** Pose une gemme de p en (q, r), captures comprises. */
const put = (s: GameState, q: number, r: number, p: number) => play(s, at(q, r), p)

/** Recompte les lignes de p en parcourant tout le plateau. */
function linesFromScratch(cells: Int8Array, p: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0]
  for (const line of G.lines) {
    let run = 0
    for (const c of [...line.cells, -1]) {
      if (c !== -1 && cells[c] === p) {
        run++
        continue
      }
      if (run >= 6) out[2]++
      else if (run === 5) out[1]++
      else if (run === 4) out[0]++
      run = 0
    }
  }
  return out
}

const linesOf = (s: GameState, p: number) => [...s.lines.slice(p * 3, p * 3 + 3)]

describe('plateau', () => {
  it('a 11 intersections de côté, soit 331 intersections', () => {
    expect(G.size).toBe(331)
    expect(G.lines.filter((l) => l.axis === 0)).toHaveLength(21)
    for (let axis = 0; axis < 3; axis++) {
      const total = G.lines.filter((l) => l.axis === axis).reduce((n, l) => n + l.cells.length, 0)
      expect(total).toBe(331)
    }
  })

  it('donne 6 voisines au centre et 3 aux coins', () => {
    const neighbours = (i: number) => G.step.filter((s) => s[i] !== -1).length
    expect(neighbours(G.center)).toBe(6)
    expect(neighbours(at(10, 0))).toBe(3)
    expect(neighbours(at(-10, 10))).toBe(3)
    expect(neighbours(at(5, -10))).toBe(4)
  })
})

describe('gober', () => {
  it('gobe deux gemmes adverses encadrées', () => {
    const s = newGame(2)
    put(s, 0, 0, 0)
    put(s, 1, 0, 1)
    put(s, 2, 0, 1)
    const rec = put(s, 3, 0, 0)
    expect(rec.gobbled.sort()).toEqual([at(1, 0), at(2, 0)].sort())
    expect(s.cells[at(1, 0)]).toBe(EMPTY)
    expect(s.cells[at(2, 0)]).toBe(EMPTY)
    expect(s.captured[0]).toBe(2)
  })

  it('fonctionne sur les 3 axes', () => {
    for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1]]) {
      const s = newGame(2)
      put(s, 0, 0, 0)
      put(s, dq, dr, 1)
      put(s, 2 * dq, 2 * dr, 1)
      expect(put(s, 3 * dq, 3 * dr, 0).gobbled).toHaveLength(2)
    }
  })

  it('ne gobe pas trois gemmes', () => {
    const s = newGame(2)
    put(s, 0, 0, 0)
    put(s, 1, 0, 1)
    put(s, 2, 0, 1)
    put(s, 3, 0, 1)
    expect(put(s, 4, 0, 0).gobbled).toHaveLength(0)
  })

  it('ne gobe pas une gemme seule', () => {
    const s = newGame(2)
    put(s, 0, 0, 0)
    put(s, 1, 0, 1)
    expect(put(s, 2, 0, 0).gobbled).toHaveLength(0)
  })

  it('ne gobe pas deux gemmes de couleurs différentes', () => {
    const s = newGame(3)
    put(s, 0, 0, 0)
    put(s, 1, 0, 1)
    put(s, 2, 0, 2)
    expect(put(s, 3, 0, 0).gobbled).toHaveLength(0)
  })

  it('ne gobe pas avec la gemme d’un autre adversaire au bout', () => {
    const s = newGame(3)
    put(s, 0, 0, 2)
    put(s, 1, 0, 1)
    put(s, 2, 0, 1)
    expect(put(s, 3, 0, 0).gobbled).toHaveLength(0)
  })

  it('laisse se placer entre deux gemmes adverses sans se faire gober', () => {
    const s = newGame(2)
    put(s, 0, 0, 0)
    put(s, 3, 0, 0)
    put(s, 1, 0, 1)
    const rec = put(s, 2, 0, 1)
    expect(rec.gobbled).toHaveLength(0)
    expect(s.cells[at(1, 0)]).toBe(1)
    expect(s.cells[at(2, 0)]).toBe(1)
  })

  it('peut gober plusieurs paires d’un coup', () => {
    const s = newGame(2)
    put(s, 0, 0, 0)
    put(s, 1, 0, 1)
    put(s, 2, 0, 1)
    put(s, 3, 3, 0)
    put(s, 3, 1, 1)
    put(s, 3, 2, 1)
    const rec = put(s, 3, 0, 0)
    expect(rec.gobbled).toHaveLength(4)
    expect(s.captured[0]).toBe(4)
  })
})

describe('lignes', () => {
  it('compte une ligne de 4, puis de 5, puis de 6', () => {
    const s = newGame(2)
    for (let q = 0; q < 4; q++) put(s, q, 0, 0)
    expect(linesOf(s, 0)).toEqual([1, 0, 0])
    put(s, 4, 0, 0)
    expect(linesOf(s, 0)).toEqual([0, 1, 0])
    put(s, 5, 0, 0)
    expect(linesOf(s, 0)).toEqual([0, 0, 1])
    expect(winReason(s, 0)).toBe('six')
  })

  it('compte une ligne de 7 comme une ligne de 6', () => {
    const s = newGame(2)
    for (const q of [0, 1, 2, 4, 5, 6]) put(s, q, 0, 0)
    expect(linesOf(s, 0)).toEqual([0, 0, 0])
    put(s, 3, 0, 0)
    expect(linesOf(s, 0)).toEqual([0, 0, 1])
  })

  it('compte deux lignes de 4 qui se croisent', () => {
    const s = newGame(2)
    for (let q = 0; q < 4; q++) put(s, q, 0, 0)
    for (let r = 1; r < 4; r++) put(s, 0, r, 0)
    expect(linesOf(s, 0)).toEqual([2, 0, 0])
  })

  it('perd une ligne cassée par une capture', () => {
    const s = newGame(2)
    // Ligne de 5 rouge sur l'axe (0, 1), coupée par une paire gobée sur l'axe (1, 0).
    for (let r = 0; r < 5; r++) put(s, 0, r, 1)
    put(s, 1, 2, 1)
    put(s, -1, 2, 0)
    expect(linesOf(s, 1)).toEqual([0, 1, 0])
    put(s, 2, 2, 0)
    expect(linesOf(s, 1)).toEqual([0, 0, 0])
    expect(s.cells[at(0, 2)]).toBe(EMPTY)
  })

  it('gagne avec le nombre de lignes de 5 du tableau', () => {
    const s = newGame(4)
    for (let q = 0; q < 5; q++) put(s, q - 5, 2, 0)
    expect(winReason(s, 0)).toBeNull()
    for (let q = 0; q < 5; q++) put(s, q - 5, 5, 0)
    expect(winReason(s, 0)).toBe('five')
  })

  it('gagne en gobant le nombre de gemmes du tableau', () => {
    const s = newGame(6)
    s.captured[0] = 10
    put(s, 0, 0, 0)
    put(s, 1, 0, 3)
    put(s, 2, 0, 3)
    expect(winReason(s, 0)).toBeNull()
    put(s, 3, 0, 0)
    expect(winReason(s, 0)).toBe('captured')
  })
})

describe('suivi incrémental et annulation', () => {
  it('reste identique à un recomptage complet sur des parties aléatoires, et undo restaure tout', () => {
    let seed = 42
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    let gamesWithCaptures = 0
    for (let game = 0; game < 30; game++) {
      const players = 2 + (game % 5)
      const s = newGame(players)
      const history: { rec: ReturnType<typeof play>; before: GameState }[] = []
      for (let move = 0; move < 200; move++) {
        // Coups groupés autour du centre pour provoquer lignes et captures.
        const empties = [...s.cells.keys()].filter(
          (i) => s.cells[i] === EMPTY && Math.abs(G.q[i]) <= 4 && Math.abs(G.r[i]) <= 4,
        )
        if (empties.length === 0) break
        const cell = empties[Math.floor(rand() * empties.length)]
        const before = cloneState(s)
        const rec = play(s, cell, move % players)
        history.push({ rec, before })
        for (let p = 0; p < players; p++) expect(linesOf(s, p)).toEqual(linesFromScratch(s.cells, p))
      }
      if (history.some((h) => h.rec.gobbled.length > 0)) gamesWithCaptures++
      for (const { rec, before } of history.reverse()) {
        undo(s, rec)
        expect(s.cells).toEqual(before.cells)
        expect(s.lines).toEqual(before.lines)
        expect(s.captured).toEqual(before.captured)
        expect(s.reserve).toEqual(before.reserve)
        expect(s.emptyCount).toBe(before.emptyCount)
      }
    }
    expect(gamesWithCaptures).toBeGreaterThan(10)
  })
})

describe('déroulement', () => {
  it('passe au joueur suivant et refuse une intersection occupée', () => {
    const s0 = newGame(3)
    const { state: s1 } = playTurn(s0, G.center)
    expect(s1.current).toBe(1)
    expect(s0.cells[G.center]).toBe(EMPTY)
    expect(() => playTurn(s1, G.center)).toThrow()
  })

  it('termine la partie sur une victoire', () => {
    let s = newGame(2)
    for (let i = 0; i < 6; i++) {
      s = playTurn(s, at(i, 0)).state
      if (!s.over) s = playTurn(s, at(i, 5)).state
    }
    expect(s.over).toBe(true)
    expect(s.winner).toBe(0)
    expect(s.winReason).toBe('six')
  })

  it('saute un joueur sans gemme et déclare la partie nulle quand plus personne ne peut jouer', () => {
    let s = newGame(2)
    s.reserve[1] = 0
    s = playTurn(s, G.center).state
    expect(s.current).toBe(0)
    s.reserve[0] = 1
    s = playTurn(s, at(5, 5)).state
    expect(s.over).toBe(true)
    expect(s.winner).toBe(-1)
  })

  it('donne 50 gemmes à chaque joueur', () => {
    expect([...newGame(6).reserve]).toEqual(Array(6).fill(GEMS_PER_PLAYER))
  })
})
