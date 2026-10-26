import { describe, expect, it } from 'vitest'
import { GEOMETRY as G } from './board'
import { chooseMove, type AiLevel } from './ai'
import { newGame, play, playTurn, type GameState } from './rules'

const at = (q: number, r: number) => G.indexOf(q, r)
const put = (s: GameState, q: number, r: number, p: number) => play(s, at(q, r), p)

function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
}

const LEVELS: AiLevel[] = ['easy', 'medium', 'hard']

describe('IA', () => {
  it('ouvre au centre ou juste à côté', () => {
    const cell = chooseMove(newGame(2), 'hard').cell
    expect(Math.max(Math.abs(G.q[cell]), Math.abs(G.r[cell]))).toBeLessThanOrEqual(1)
  })

  it.each(LEVELS)('complète une ligne de 6 (%s)', (level) => {
    const s = newGame(2)
    for (let q = 0; q < 5; q++) put(s, q, 0, 0)
    put(s, -1, 0, 1)
    put(s, 3, 3, 1)
    expect(chooseMove(s, level).cell).toBe(at(5, 0))
  })

  it.each(LEVELS)('gobe la paire qui fait gagner (%s)', (level) => {
    const s = newGame(2)
    s.captured[0] = 22
    put(s, 0, 0, 0)
    put(s, 1, 0, 1)
    put(s, 2, 0, 1)
    put(s, -3, 4, 0)
    expect(chooseMove(s, level).cell).toBe(at(3, 0))
  })

  it.each(['medium', 'hard'] as AiLevel[])('bloque une ligne de 6 adverse (%s)', (level) => {
    const s = newGame(2)
    // Rouge (1) a 5 gemmes alignées bloquées d'un côté : une seule case pour gagner.
    for (let r = -2; r < 3; r++) put(s, 2, r, 1)
    put(s, 2, -3, 0)
    put(s, -2, 0, 0)
    expect(chooseMove(s, level).cell).toBe(at(2, 3))
  })

  it('bloque aussi en partie à 4 quand le joueur suivant menace', () => {
    const s = newGame(4)
    for (let q = -1; q < 3; q++) put(s, q, 1, 1)
    put(s, 4, 1, 1)
    put(s, -2, 1, 2)
    put(s, 0, -3, 0)
    put(s, -4, 4, 3)
    expect(chooseMove(s, 'hard').cell).toBe(at(3, 1))
  })

  describe('à 3 joueurs, quand Bleu (2) menace de faire 6 et que Rouge (1) joue juste avant lui', () => {
    function position() {
      const s = newGame(3)
      for (let q = -2; q <= 2; q++) put(s, q, -6, 2)
      put(s, -3, -6, 1)
      put(s, 0, 5, 1)
      put(s, 0, 2, 0)
      put(s, 1, 2, 0)
      return s
    }
    const winningCell = at(3, -6)

    it.each(['medium', 'hard'] as AiLevel[])('pare elle-même si Rouge n’est pas fiable (%s)', (level) => {
      expect(chooseMove(position(), level, seeded(1), [true, false, true]).cell).toBe(winningCell)
    })

    it.each(['medium', 'hard'] as AiLevel[])('laisse Rouge parer s’il est fiable (%s)', (level) => {
      expect(chooseMove(position(), level, seeded(1), [true, true, true]).cell).not.toBe(winningCell)
    })
  })

  it('termine des parties IA contre IA sans erreur, de 2 à 6 joueurs', () => {
    const rng = seeded(7)
    for (let players = 2; players <= 6; players++) {
      let s = newGame(players)
      while (!s.over) {
        const level: AiLevel = s.turn % 2 === 0 ? 'easy' : 'medium'
        s = playTurn(s, chooseMove(s, level, rng).cell).state
      }
      expect(s.turn).toBeGreaterThan(5)
    }
  }, 120_000)
})
