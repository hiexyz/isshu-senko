import { curlNoise, fbm2 } from './noise'

export interface SmokeParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  seed: number
}

export interface WindField {
  x: number
  y: number
  strength: number
}

export interface SmokeEngineOptions {
  canvas: HTMLCanvasElement
  getOrigin: () => { x: number; y: number }
  spawnRate?: number
  lit?: boolean
}

export class SmokeEngine {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly getOrigin: () => { x: number; y: number }
  private particles: SmokeParticle[] = []
  private wind: WindField = { x: 0, y: 0, strength: 0 }
  /** 0..1 breath / blow intensity from microphone */
  private breath = 0
  private breathDir = 1
  private lit = true
  private spawnRate: number
  private spawnAcc = 0
  private time = 0
  private raf = 0
  private lastTs = 0
  private dpr = 1
  private width = 0
  private height = 0
  private running = false

  constructor(options: SmokeEngineOptions) {
    this.canvas = options.canvas
    const ctx = options.canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('2D canvas unavailable')
    this.ctx = ctx
    this.getOrigin = options.getOrigin
    this.spawnRate = options.spawnRate ?? 48
    this.lit = options.lit ?? true
  }

  setLit(lit: boolean): void {
    this.lit = lit
    if (!lit) this.particles = []
  }

  isLit(): boolean {
    return this.lit
  }

  setWind(x: number, y: number, strength: number): void {
    this.wind = { x, y, strength }
  }

  /** Blow into the mic — level 0..1. Optional signed direction (-1 left .. 1 right). */
  setBreath(level: number, direction = 1): void {
    this.breath = Math.max(0, Math.min(1, level))
    this.breathDir = direction >= 0 ? 1 : -1
  }

  setSpawnRate(rate: number): void {
    this.spawnRate = Math.max(0, rate)
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr))
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr))
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.resize()
    this.lastTs = performance.now()
    const loop = (ts: number) => {
      if (!this.running) return
      const dt = Math.min(0.033, (ts - this.lastTs) / 1000)
      this.lastTs = ts
      this.update(dt)
      this.draw()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private spawn(count: number): void {
    const origin = this.getOrigin()
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return
    if (origin.x === 0 && origin.y === 0) return

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: origin.x + (Math.random() - 0.5) * 0.4,
        y: origin.y + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(32 + Math.random() * 12),
        life: 0,
        maxLife: 3.6 + Math.random() * 2.4,
        size: 0.55 + Math.random() * 0.45,
        seed: Math.random() * 1000,
      })
    }
  }

  private update(dt: number): void {
    this.time += dt

    if (this.lit) {
      this.spawnAcc += this.spawnRate * dt
      const n = Math.floor(this.spawnAcc)
      if (n > 0) {
        this.spawnAcc -= n
        this.spawn(n)
      }
    }

    const origin = this.getOrigin()
    const next: SmokeParticle[] = []

    for (const p of this.particles) {
      p.life += dt
      if (p.life >= p.maxLife) continue

      const age = p.life / p.maxLife
      const rise = Math.max(0, origin.y - p.y)
      // Stay almost vertical for the first stretch above the tip
      const free = Math.min(1, Math.max(0, (rise - 10) / 50))

      const curl = curlNoise(
        p.x * 0.009 + p.seed * 0.01,
        p.y * 0.007,
        this.time * 0.25,
        p.seed,
      )
      const drift = fbm2(p.x * 0.006, this.time * 0.2 + p.seed * 0.02, 5)

      const breath = this.breath
      const breathFree = Math.min(1, Math.max(0, (rise - 4) / 28))

      p.vy += -(26 + (1 - age) * 16) * dt
      // Strong blow flattens the plume (less rise, more scatter)
      p.vy += breath * breathFree * 18 * dt
      p.vx += (curl.x * 38 + drift * 16) * free * free * (1 + breath * 2.2) * dt
      p.vy += curl.y * 10 * free * dt
      // Directional gust from breath
      p.vx += this.breathDir * breath * breathFree * (95 + age * 55) * dt
      p.vx += (Math.random() - 0.5) * breath * breathFree * 55 * dt

      if (this.wind.strength > 0.02 && free > 0.25 && breath < 0.12) {
        const pull = (this.wind.x - origin.x) * 0.012 * this.wind.strength * free
        p.vx += pull * 24 * dt
      }

      // Re-center slightly near the tip so the stream roots at the ember
      // (skip when blowing — smoke leaves the tip immediately)
      if (free < 0.2 && breath < 0.06) {
        p.x += (origin.x - p.x) * Math.min(1, 10 * dt)
        p.vx *= 0.85
      } else {
        p.vx *= 1 - (0.45 - breath * 0.25) * dt
      }
      p.vy *= 1 - 0.08 * dt

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.size += (0.4 + age * 1.3) * (0.25 + free) * dt

      if (p.y > -60 && p.x > -40 && p.x < this.width + 40) next.push(p)
    }

    this.particles = next
  }

  private draw(): void {
    const { ctx, width, height } = this
    ctx.clearRect(0, 0, width, height)
    if (this.width < 2 || this.height < 2) return

    const origin = this.getOrigin()
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return

    if (this.lit) {
      // Continuous ribbon from the exact tip — makes the source obvious
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath()
      ctx.moveTo(origin.x, origin.y)
      let px = origin.x
      let py = origin.y
      const breath = this.breath
      for (let i = 1; i <= 18; i++) {
        const t = i / 18
        const wobble =
          fbm2(this.time * 0.7, i * 0.35, 9) * t * t * (7 + breath * 28) +
          Math.sin(this.time * 1.1 + i * 0.4) * t * t * 2 +
          this.breathDir * breath * t * t * 36
        px = origin.x + wobble
        py = origin.y - i * (4.2 - breath * 1.6)
        ctx.lineTo(px, py)
      }
      ctx.strokeStyle = 'rgba(236, 232, 224, 0.22)'
      ctx.lineWidth = 1.1
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()

      // Soft tip bloom right on the ember
      const tipGlow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 6)
      tipGlow.addColorStop(0, 'rgba(255, 230, 200, 0.2)')
      tipGlow.addColorStop(1, 'rgba(255, 200, 150, 0)')
      ctx.fillStyle = tipGlow
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
    for (const p of this.particles) {
      const age = p.life / p.maxLife
      const envelope =
        age < 0.05 ? age / 0.05 : age > 0.55 ? Math.pow(1 - (age - 0.55) / 0.45, 1.4) : 1
      const alpha = envelope * (0.16 + (1 - age) * 0.2)
      if (alpha < 0.015) continue

      const r = Math.max(0.6, p.size * (0.55 + age * 1.4))
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
      g.addColorStop(0, `rgba(245, 242, 235, ${alpha})`)
      g.addColorStop(0.4, `rgba(220, 216, 208, ${alpha * 0.35})`)
      g.addColorStop(1, 'rgba(200, 198, 190, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
