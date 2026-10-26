import type { AiLevel, AiResult } from '../engine/ai'
import type { GameState } from '../engine/rules'
import type { AiRequest } from './ai.worker'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (result: AiResult) => void>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<AiResult & { id: number }>) => {
    pending.get(e.data.id)?.(e.data)
    pending.delete(e.data.id)
  }
  return worker
}

/** `reliable[p]` : le joueur p pare à coup sûr les menaces immédiates (voir chooseMove). */
export function askAi(state: GameState, level: AiLevel, reliable: boolean[]): Promise<AiResult> {
  return new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    const request: AiRequest = { id, state, level, reliable }
    getWorker().postMessage(request)
  })
}
