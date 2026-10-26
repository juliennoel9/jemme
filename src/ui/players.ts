import type { AiLevel } from '../engine/ai'
import { WIN_TARGETS, type WinReason } from '../engine/rules'

export type SeatKind = 'human' | AiLevel

export interface GameConfig {
  /** Un siège par joueur, dans l'ordre du jeu ; le siège i joue la couleur i. */
  seats: SeatKind[]
  /** Siège qui commence, ou -1 pour tirer au sort. */
  first: number
}

export interface GemColor {
  name: string
  base: string
  light: string
  dark: string
}

/** Couleurs dans l'ordre où elles sont disposées autour du plateau. */
export const COLORS: GemColor[] = [
  { name: 'Jaune', base: '#f2c230', light: '#fff4b8', dark: '#9a7300' },
  { name: 'Rouge', base: '#e5383b', light: '#ffc2c2', dark: '#7d0d10' },
  { name: 'Bleu', base: '#2f80ed', light: '#c4dcff', dark: '#0c3880' },
  { name: 'Vert', base: '#27ae60', light: '#bff2d3', dark: '#0a5428' },
  { name: 'Violet', base: '#9b51e0', light: '#e6d0ff', dark: '#45177a' },
  { name: 'Orange', base: '#f2884a', light: '#ffdcc4', dark: '#9a4100' },
]

export const KIND_LABELS: Record<SeatKind, string> = {
  human: 'Humain',
  easy: 'IA facile',
  medium: 'IA moyenne',
  hard: 'IA difficile',
}

export const DEFAULT_CONFIG: GameConfig = { seats: ['human', 'medium'], first: 0 }

export function isSoloHuman(config: GameConfig): boolean {
  return config.seats.filter((k) => k === 'human').length === 1
}

export function playerName(config: GameConfig, seat: number): string {
  return config.seats[seat] === 'human' && isSoloHuman(config) ? 'Vous' : COLORS[seat].name
}

export function winText(reason: WinReason, playerCount: number): string {
  const t = WIN_TARGETS[playerCount]
  switch (reason) {
    case 'six':
      return 'une ligne de 6 gemmes'
    case 'five':
      return `${t.five} lignes de 5 gemmes`
    case 'four':
      return `${t.four} lignes de 4 gemmes`
    case 'captured':
      return `${t.captured} gemmes gobées`
  }
}

const STORAGE_KEY = 'jemme.config'

export function loadConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as GameConfig
    const valid =
      Array.isArray(parsed.seats) &&
      parsed.seats.length >= 2 &&
      parsed.seats.length <= 6 &&
      parsed.seats.every((k) => k in KIND_LABELS) &&
      Number.isInteger(parsed.first) &&
      parsed.first >= -1 &&
      parsed.first < parsed.seats.length
    return valid ? parsed : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: GameConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Stockage indisponible (navigation privée…) : on garde simplement la config en mémoire.
  }
}
