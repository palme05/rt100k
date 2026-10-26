'use client'

import styles from './confetti.module.css'

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  spin: number
  angle: number
  flip: number
  color: string
  round: boolean
}

const TOKENS = ['--accent', '--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-8']
const DURATION_MS = 3200

/**
 * Konfetti aus zwei Ecken unten – ein Canvas über der Seite, das sich nach
 * gut drei Sekunden selbst entfernt. Farben aus den Design-Tokens (hell und
 * dunkel), keine Inline-Styles (CSP), klickt nichts weg (pointer-events:
 * none). Aufrufer prüft „Bewegung reduzieren“.
 */
export function confetti(amount = 160): void {
  const canvas = document.createElement('canvas')
  canvas.className = styles.confetti ?? ''
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  document.body.append(canvas)

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.scale(dpr, dpr)

  const css = getComputedStyle(document.documentElement)
  const colors = TOKENS.map((t) => css.getPropertyValue(t).trim()).filter(Boolean)
  const speed = Math.max(h, 520) / 52
  const pieces: Piece[] = Array.from({ length: amount }, (_, i) => {
    const left = i % 2 === 0
    // schräg nach oben zur Mitte, etwas Streuung
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7
    const v = speed * (0.65 + Math.random() * 0.55)
    return {
      x: left ? -8 : w + 8,
      y: h * 0.82,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      size: 5 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.35,
      angle: Math.random() * Math.PI,
      flip: Math.random() * Math.PI,
      color: colors[i % colors.length] ?? 'currentColor',
      round: Math.random() < 0.22,
    }
  })

  const start = performance.now()
  let last = start
  const frame = (now: number) => {
    const t = now - start
    // Schritte in „60-Hz-Frames“, damit es auf 120-Hz-Displays gleich fällt
    const k = Math.min((now - last) / 16.67, 3)
    last = now
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = t > DURATION_MS - 600 ? Math.max(0, (DURATION_MS - t) / 600) : 1
    for (const p of pieces) {
      p.vx *= 0.985 ** k
      p.vy = p.vy * 0.985 ** k + 0.32 * k
      p.x += p.vx * k
      p.y += p.vy * k
      p.angle += p.spin * k
      p.flip += 0.12 * k
      if (p.y > h + 20) continue
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.scale(1, Math.cos(p.flip))
      ctx.fillStyle = p.color
      if (p.round) {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2)
        ctx.fill()
      } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    if (t < DURATION_MS) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
