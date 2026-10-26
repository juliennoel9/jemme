import { useState } from 'react'
import { GEOMETRY as G } from '../engine/board'
import { EMPTY, gobbledBy, type GameState, type Run } from '../engine/rules'
import { COLORS } from './players'

// Coordonnées à l'écran : les lignes de l'axe 0 sont horizontales, les deux autres à ±60°.
const D = 40
const H = (Math.sqrt(3) / 2) * D
const X = Float64Array.from({ length: G.size }, (_, i) => D * (G.q[i] + G.r[i] / 2))
const Y = Float64Array.from({ length: G.size }, (_, i) => H * G.r[i])
const RADIUS = G.side - 1

const GRID_PATH = G.lines
  .filter((l) => l.cells.length > 1)
  .map((l) => {
    const a = l.cells[0]
    const b = l.cells[l.cells.length - 1]
    return `M${X[a].toFixed(1)} ${Y[a].toFixed(1)}L${X[b].toFixed(1)} ${Y[b].toFixed(1)}`
  })
  .join('')

function hexagon(scale: number): string {
  const corners: [number, number][] = [
    [RADIUS, 0],
    [0, RADIUS],
    [-RADIUS, RADIUS],
    [-RADIUS, 0],
    [0, -RADIUS],
    [RADIUS, -RADIUS],
  ]
  return corners
    .map(([q, r]) => `${(D * (q + r / 2) * scale).toFixed(1)},${(H * r * scale).toFixed(1)}`)
    .join(' ')
}

const FRAME = hexagon((RADIUS + 0.85) / RADIUS)
const SURFACE = hexagon((RADIUS + 0.6) / RADIUS)
const VIEW_BOX = `${-11.2 * D} ${-9.8 * D} ${22.4 * D} ${19.6 * D}`

export interface Ghosts {
  key: number
  cells: number[]
  owners: number[]
}

interface BoardProps {
  state: GameState
  interactive: boolean
  onPlay(cell: number): void
  /** Gemmes qui forment une ligne comptée (4 ou plus). */
  counted: Set<number>
  winningRuns: Run[]
  ghosts: Ghosts | null
}

function Gem({ player, className }: { player: number; className?: string }) {
  return (
    <g className={className}>
      <circle r={D * 0.37} fill={`url(#gem-${player})`} className="gem-body" />
      <ellipse cx={-D * 0.11} cy={-D * 0.15} rx={D * 0.13} ry={D * 0.07} className="gem-shine" />
    </g>
  )
}

export function Board({ state, interactive, onPlay, counted, winningRuns, ghosts }: BoardProps) {
  const [hover, setHover] = useState(-1)
  const previewing = interactive && hover !== -1 && state.cells[hover] === EMPTY
  const threatened = previewing ? gobbledBy(state.cells, hover, state.current) : []

  const gems: number[] = []
  for (let i = 0; i < G.size; i++) if (state.cells[i] !== EMPTY) gems.push(i)

  return (
    <svg
      className={`board${interactive ? ' interactive' : ''}`}
      viewBox={VIEW_BOX}
      role="img"
      aria-label="Plateau de jeu"
      onPointerLeave={() => setHover(-1)}
    >
      <defs>
        {COLORS.map((c, p) => (
          <radialGradient key={p} id={`gem-${p}`} cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="45%" stopColor={c.base} />
            <stop offset="100%" stopColor={c.dark} />
          </radialGradient>
        ))}
        <radialGradient id="board-surface" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#1b2434" />
          <stop offset="100%" stopColor="#0a0e16" />
        </radialGradient>
        <linearGradient id="board-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d98b" />
          <stop offset="50%" stopColor="#a8813a" />
          <stop offset="100%" stopColor="#e8c873" />
        </linearGradient>
      </defs>

      <polygon points={FRAME} fill="url(#board-frame)" />
      <polygon points={SURFACE} fill="url(#board-surface)" />
      <path d={GRID_PATH} className="grid" />

      {winningRuns.map((run, k) => {
        const a = run.cells[0]
        const b = run.cells[run.cells.length - 1]
        return <line key={k} x1={X[a]} y1={Y[a]} x2={X[b]} y2={Y[b]} className="win-line" />
      })}

      {gems.map((i) => {
        const p = state.cells[i]
        const classes = ['gem']
        if (i === state.lastMove) classes.push('gem-new')
        if (threatened.includes(i)) classes.push('gem-threatened')
        return (
          <g key={i} transform={`translate(${X[i]} ${Y[i]})`}>
            {counted.has(i) && <circle r={D * 0.47} className="gem-halo" stroke={COLORS[p].base} />}
            <Gem player={p} className={classes.join(' ')} />
            {i === state.lastMove && <circle r={D * 0.47} className="last-ring" />}
          </g>
        )
      })}

      {ghosts?.cells.map((cell, k) => (
        <g key={`${ghosts.key}-${cell}`} transform={`translate(${X[cell]} ${Y[cell]})`}>
          <Gem player={ghosts.owners[k]} className="gem gem-ghost" />
        </g>
      ))}

      {previewing && (
        <g transform={`translate(${X[hover]} ${Y[hover]})`} className="preview">
          <Gem player={state.current} />
        </g>
      )}

      {interactive &&
        Array.from({ length: G.size }, (_, i) =>
          state.cells[i] === EMPTY ? (
            <circle
              key={i}
              cx={X[i]}
              cy={Y[i]}
              r={D * 0.5}
              className="hit"
              onPointerEnter={() => setHover(i)}
              onClick={() => {
                setHover(-1)
                onPlay(i)
              }}
            />
          ) : null,
        )}
    </svg>
  )
}
