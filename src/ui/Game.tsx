import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AiLevel } from '../engine/ai'
import { WIN_TARGETS, findRuns, newGame, playTurn, type GameState, type Run } from '../engine/rules'
import { askAi } from './aiClient'
import { Board, type Ghosts } from './Board'
import { Rules } from './Rules'
import { COLORS, KIND_LABELS, isSoloHuman, playerName, winText, type GameConfig } from './players'

/** Durée minimale d'un coup de l'IA, pour qu'on ait le temps de le voir arriver. */
const MIN_AI_DELAY = 450

interface LogEntry {
  key: number
  /** Couleur du joueur concerné, ou -1. */
  color: number
  text: string
}

let logKey = 0

function initialState(config: GameConfig): GameState {
  const s = newGame(config.seats.length)
  s.current = config.first === -1 ? Math.floor(Math.random() * config.seats.length) : config.first
  return s
}

interface GameProps {
  config: GameConfig
  onRestart(): void
  onSetup(): void
}

export function Game({ config, onRestart, onSetup }: GameProps) {
  const [state, setState] = useState(() => initialState(config))
  const [history, setHistory] = useState<GameState[]>([])
  const [ghosts, setGhosts] = useState<Ghosts | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [thinking, setThinking] = useState(false)
  const [endDismissed, setEndDismissed] = useState(false)

  const n = config.seats.length
  const targets = WIN_TARGETS[n]
  const name = (seat: number) => playerName(config, seat)
  const humanTurn = !state.over && config.seats[state.current] === 'human'

  function apply(from: GameState, cell: number) {
    const { state: next, record } = playTurn(from, cell)
    setHistory((h) => [...h, from])
    setState(next)
    setGhosts(
      record.gobbled.length > 0
        ? { key: next.turn, cells: record.gobbled, owners: record.gobbledOwner }
        : null,
    )

    const isYou = (seat: number) => name(seat) === 'Vous'
    const entries: LogEntry[] = []
    const byOwner = new Map<number, number>()
    for (const owner of record.gobbledOwner) byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1)
    for (const [owner, count] of byOwner) {
      const by = record.player
      entries.push({
        key: ++logKey,
        color: by,
        text: isYou(by)
          ? `Vous gobez ${count} gemmes de ${name(owner)}`
          : isYou(owner)
            ? `${name(by)} vous gobe ${count} gemmes`
            : `${name(by)} gobe ${count} gemmes de ${name(owner)}`,
      })
    }
    if (next.over) {
      const w = next.winner
      entries.push({
        key: ++logKey,
        color: w,
        text:
          w === -1
            ? 'Partie nulle'
            : `${name(w)} ${isYou(w) ? 'gagnez' : 'gagne'} avec ${winText(next.winReason!, n)}`,
      })
    }
    if (entries.length > 0) setLog((l) => [...entries.reverse(), ...l].slice(0, 8))
  }

  useEffect(() => {
    if (state.over || config.seats[state.current] === 'human') return
    const level = config.seats[state.current] as AiLevel
    const started = performance.now()
    let cancelled = false
    setThinking(true)
    const reliable = config.seats.map((k) => k === 'medium' || k === 'hard')
    askAi(state, level, reliable).then(({ cell }) => {
      const wait = Math.max(0, MIN_AI_DELAY - (performance.now() - started))
      setTimeout(() => {
        if (cancelled) return
        setThinking(false)
        apply(state, cell)
      }, wait)
    })
    return () => {
      cancelled = true
      setThinking(false)
    }
    // apply ne dépend que de setters et de config : inutile de relancer l'IA quand il change.
  }, [state, config])

  const undoIndex = history.findLastIndex((h) => config.seats[h.current] === 'human')

  function undoMove() {
    if (undoIndex === -1) return
    setState(history[undoIndex])
    setHistory(history.slice(0, undoIndex))
    setGhosts(null)
    setEndDismissed(false)
    setLog((l) => [{ key: ++logKey, color: -1, text: 'Coup annulé' }, ...l].slice(0, 8))
  }

  const { counted, winningRuns } = useMemo(() => {
    const counted = new Set<number>()
    let winningRuns: Run[] = []
    for (let p = 0; p < n; p++) {
      const runs = findRuns(state.cells, p)
      for (const run of runs) for (const c of run.cells) counted.add(c)
      if (p === state.winner) {
        const keep = { six: (l: number) => l >= 6, five: (l: number) => l === 5, four: (l: number) => l === 4 }
        const reason = state.winReason
        if (reason && reason !== 'captured') winningRuns = runs.filter((r) => keep[reason](r.cells.length))
      }
    }
    return { counted, winningRuns }
  }, [state, n])

  const soloHumanWon =
    state.winner !== -1 && config.seats[state.winner] === 'human' && isSoloHuman(config)

  let status: ReactNode
  if (state.over) {
    status =
      state.winner === -1
        ? 'Partie nulle'
        : soloHumanWon
          ? 'Vous avez gagné'
          : `${COLORS[state.winner].name} a gagné`
  } else if (humanTurn) {
    status = isSoloHuman(config) ? 'À vous de jouer' : `À ${COLORS[state.current].name} de jouer`
  } else {
    status = (
      <span>
        {COLORS[state.current].name} réfléchit
        <span className="dots" aria-hidden="true" />
      </span>
    )
  }

  return (
    <div className="game">
      <header className="topbar">
        <button className="logo-button" onClick={onSetup} title="Retour à la configuration">
          J'emme
        </button>
        <div className="status" aria-live="polite">
          <span
            className={`turn-dot${thinking ? ' pulsing' : ''}`}
            style={{ background: state.over && state.winner === -1 ? 'var(--muted)' : COLORS[state.over ? state.winner : state.current].base }}
          />
          {status}
        </div>
        <div className="actions">
          <button onClick={undoMove} disabled={undoIndex === -1}>
            Annuler
          </button>
          <button onClick={onRestart}>Recommencer</button>
        </div>
      </header>

      <main className="game-main">
        <div className="board-wrap">
          <Board
            state={state}
            interactive={humanTurn}
            onPlay={(cell) => apply(state, cell)}
            counted={counted}
            winningRuns={winningRuns}
            ghosts={ghosts}
          />
          {state.over && !endDismissed && (
            <div className="end-card" role="dialog" aria-label="Fin de partie">
              {state.winner !== -1 && (
                <span className="end-gem" style={{ background: COLORS[state.winner].base, color: COLORS[state.winner].base }} />
              )}
              <h2>
                {state.winner === -1
                  ? 'Partie nulle'
                  : soloHumanWon
                    ? 'Vous avez gagné !'
                    : `${COLORS[state.winner].name} gagne !`}
              </h2>
              <p>
                {state.winner === -1
                  ? 'Plus personne ne peut jouer.'
                  : `Avec ${winText(state.winReason!, n)}, en ${state.turn} coups.`}
              </p>
              <div className="end-actions">
                <button className="primary" onClick={onRestart}>
                  Rejouer
                </button>
                <button onClick={onSetup}>Changer les joueurs</button>
                <button className="ghost" onClick={() => setEndDismissed(true)}>
                  Voir le plateau
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="panel">
          <section>
            <h3>Pour gagner</h3>
            <p className="goal">
              1 ligne de 6, ou {targets.five} lignes de 5, ou {targets.four} lignes de 4, ou{' '}
              {targets.captured} gemmes gobées.
            </p>
            <table className="scores">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th title="Lignes de 6">6</th>
                  <th title="Lignes de 5">5</th>
                  <th title="Lignes de 4">4</th>
                  <th title="Gemmes gobées">Gobées</th>
                  <th title="Gemmes restant à poser">Réserve</th>
                </tr>
              </thead>
              <tbody>
                {config.seats.map((kind, p) => {
                  const four = state.lines[p * 3]
                  const five = state.lines[p * 3 + 1]
                  const six = state.lines[p * 3 + 2]
                  const hot = (value: number, target: number) =>
                    value >= target ? 'done' : target > 1 && value === target - 1 ? 'hot' : ''
                  return (
                    <tr
                      key={p}
                      className={
                        (!state.over && p === state.current ? 'current ' : '') +
                        (p === state.winner ? 'winner' : '')
                      }
                    >
                      <td>
                        <span className="dot" style={{ background: COLORS[p].base }} />
                        <span className="player-name">{name(p)}</span>
                        <span className="kind">{KIND_LABELS[kind]}</span>
                      </td>
                      <td className={hot(six, 1)}>{six}</td>
                      <td className={hot(five, targets.five)}>
                        {five}
                        <small>/{targets.five}</small>
                      </td>
                      <td className={hot(four, targets.four)}>
                        {four}
                        <small>/{targets.four}</small>
                      </td>
                      <td className={state.captured[p] + 2 >= targets.captured ? 'hot' : ''}>
                        {state.captured[p]}
                        <small>/{targets.captured}</small>
                      </td>
                      <td className="reserve">{state.reserve[p]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section>
            <h3>Journal</h3>
            {log.length === 0 ? (
              <p className="muted">Les captures et la fin de partie s'afficheront ici.</p>
            ) : (
              <ul className="log">
                {log.map((e) => (
                  <li key={e.key}>
                    <span className="dot" style={{ background: e.color === -1 ? 'var(--muted)' : COLORS[e.color].base }} />
                    {e.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Rules />
        </aside>
      </main>
    </div>
  )
}
