import { useState } from 'react'
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/rules'
import { Rules } from './Rules'
import { COLORS, KIND_LABELS, type GameConfig, type SeatKind } from './players'

interface SetupProps {
  initial: GameConfig
  onStart(config: GameConfig): void
}

const KINDS = Object.keys(KIND_LABELS) as SeatKind[]

export function Setup({ initial, onStart }: SetupProps) {
  const [count, setCount] = useState(initial.seats.length)
  // On garde 6 sièges en mémoire pour ne pas perdre les choix quand on change le nombre de joueurs.
  const [seats, setSeats] = useState<SeatKind[]>(() =>
    Array.from({ length: MAX_PLAYERS }, (_, i) => initial.seats[i] ?? 'medium'),
  )
  const [first, setFirst] = useState(initial.first)

  const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)

  return (
    <div className="setup">
      <header className="setup-header">
        <h1>J'emme</h1>
        <div className="gem-row" aria-hidden="true">
          {COLORS.map((c) => (
            <span key={c.name} style={{ background: c.base, color: c.base }} />
          ))}
        </div>
        <p className="tagline">Alignez vos gemmes ou gobez celles de vos adversaires.</p>
      </header>

      <section className="card">
        <h2>Nombre de joueurs</h2>
        <div className="segmented" role="radiogroup" aria-label="Nombre de joueurs">
          {counts.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={c === count}
              className={c === count ? 'selected' : ''}
              onClick={() => {
                setCount(c)
                if (first >= c) setFirst(0)
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <h2>Joueurs</h2>
        <ul className="seats">
          {seats.slice(0, count).map((kind, i) => (
            <li key={i}>
              <span className="dot large" style={{ background: COLORS[i].base }} />
              <label htmlFor={`seat-${i}`}>{COLORS[i].name}</label>
              <select
                id={`seat-${i}`}
                value={kind}
                onChange={(e) => setSeats(seats.map((k, j) => (j === i ? (e.target.value as SeatKind) : k)))}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>

        <h2>
          <label htmlFor="first">Qui commence ?</label>
        </h2>
        <select id="first" value={first} onChange={(e) => setFirst(Number(e.target.value))}>
          <option value={-1}>Tirage au sort</option>
          {COLORS.slice(0, count).map((c, i) => (
            <option key={i} value={i}>
              {c.name}
            </option>
          ))}
        </select>

        <button className="primary play" onClick={() => onStart({ seats: seats.slice(0, count), first })}>
          Jouer
        </button>
      </section>

      <section className="card">
        <Rules />
      </section>
    </div>
  )
}
