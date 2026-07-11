import { useEffect } from 'react'
import { Scene } from './scene/Scene'
import { Hud } from './hud/Hud'
import { startWebSocket } from './ws/wsClient'

export default function App() {
  useEffect(() => {
    startWebSocket()
  }, [])

  return (
    <div className="app">
      <Scene />
      <Hud />
    </div>
  )
}
