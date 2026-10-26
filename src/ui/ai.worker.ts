// L'IA tourne dans un Web Worker pour que l'interface reste fluide pendant qu'elle réfléchit.
import { chooseMove, type AiLevel } from '../engine/ai'
import type { GameState } from '../engine/rules'

export interface AiRequest {
  id: number
  state: GameState
  level: AiLevel
  reliable: boolean[]
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, state, level, reliable } = e.data
  self.postMessage({ id, ...chooseMove(state, level, Math.random, reliable) })
}
