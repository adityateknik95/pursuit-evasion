/**
 * Canvas-based distance-over-time sparkline with a soft gradient fill.
 * Redraws whenever the distance history snapshot changes.
 */

import { useEffect, useRef } from 'react'
import { useSim } from '../store/simStore'

const W = 248
const H = 64

export function Sparkline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { distanceHistory, captureRadius } = useSim()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    if (distanceHistory.length < 2) return

    const max = Math.max(...distanceHistory, captureRadius * 4)
    const stepX = W / (distanceHistory.length - 1)
    const toY = (d: number) => H - 4 - (d / max) * (H - 10)

    // capture-radius reference line
    ctx.strokeStyle = 'rgba(255, 90, 60, 0.45)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, toY(captureRadius))
    ctx.lineTo(W, toY(captureRadius))
    ctx.stroke()
    ctx.setLineDash([])

    // gradient fill under the curve
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.30)')
    grad.addColorStop(1, 'rgba(34, 211, 238, 0)')
    ctx.beginPath()
    ctx.moveTo(0, H)
    distanceHistory.forEach((d, i) => ctx.lineTo(i * stepX, toY(d)))
    ctx.lineTo(W, H)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // the curve itself
    ctx.beginPath()
    distanceHistory.forEach((d, i) => {
      const x = i * stepX
      const y = toY(d)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 1.6
    ctx.stroke()

    // live head dot
    const lastD = distanceHistory[distanceHistory.length - 1]
    ctx.beginPath()
    ctx.arc(W - 1.5, toY(lastD), 2.4, 0, Math.PI * 2)
    ctx.fillStyle = '#7ef7ff'
    ctx.fill()
  }, [distanceHistory, captureRadius])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: W, height: H, display: 'block' }}
      aria-label="distance over time chart"
    />
  )
}
