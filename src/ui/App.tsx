import { useState } from 'react'
import { Game } from './Game'
import { Setup } from './Setup'
import { loadConfig, saveConfig, type GameConfig } from './players'

export function App() {
  const [config, setConfig] = useState<GameConfig>(loadConfig)
  const [screen, setScreen] = useState<'setup' | 'game'>('setup')
  const [gameId, setGameId] = useState(0)

  if (screen === 'setup') {
    return (
      <Setup
        initial={config}
        onStart={(c) => {
          saveConfig(c)
          setConfig(c)
          setGameId((id) => id + 1)
          setScreen('game')
        }}
      />
    )
  }

  return (
    <Game
      key={gameId}
      config={config}
      onRestart={() => setGameId((id) => id + 1)}
      onSetup={() => setScreen('setup')}
    />
  )
}
