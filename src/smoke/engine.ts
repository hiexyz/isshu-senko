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
  /** Softness / opacity multiplier */
  dens: number
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
    this.spawnRate = options.spawnRate ?? 55
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
      // Tight cluster at the ember — looks like vapor leaving the tip
      const ang = Math.random() * Math.PI * 2
      const rad = Math.random() * 1.1
      this.particles.push({
        x: origin.x + Math.cos(ang) * rad * 0.35,
        y: origin.y + Math.sin(ang) * rad * 0.2 - Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(14 + Math.random() * 10),
        life: 0,
        maxLife: 4.5 + Math.random() * 3.5,
        size: 1.6 + Math.random() * 1.8,
        seed: Math.random() * 1000,
        dens: 0.55 + Math.random() * 0.45,
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
      // Laminar near tip → turbulent as it rises (real incense behavior)
      const free = Math.min(1, Math.max(0, (rise - 8) / 70))

      const curl = curlNoise(
        p.x * 0.008 + p.seed * 0.01,
        p.y * 0.006,
        this.time * 0.22,
        p.seed,
      )
      const drift = fbm2(p.x * 0.005, this.time * 0.18 + p.seed * 0.02, 5)
      const meander = fbm2(p.seed * 0.01, this.time * 0.35 + rise * 0.02, 11)

      const breath = this.breath
      const breathFree = Math.min(1, Math.max(0, (rise - 3) / 24))

      // Buoyancy slows as plume cools / ages
      p.vy += -(12 + (1 - age) * 18 + free * 6) * dt
      p.vy += breath * breathFree * 14 * dt

      // Gentle lateral meander grows with height
      const turb = 0.15 + free * free * (1.1 + breath * 1.8)
      p.vx += (curl.x * 22 + drift * 10 + meander * 8) * turb * dt
      p.vy += curl.y * 7 * turb * dt

      p.vx += this.breathDir * breath * breathFree * (70 + age * 40) * dt
      p.vx += (Math.random() - 0.5) * breath * breathFree * 35 * dt

      if (this.wind.strength > 0.02 && free > 0.2 && breath < 0.12) {
        const pull = (this.wind.x - origin.x) * 0.01 * this.wind.strength * free
        p.vx += pull * 20 * dt
      }

      // Keep plume rooted near tip without looking like a hard string
      if (free < 0.15 && breath < 0.08) {
        p.x += (origin.x - p.x) * Math.min(1, 4 * dt)
        p.vx *= 0.9
      } else {
        p.vx *= 1 - 0.35 * dt
      }
      p.vy *= 1 - 0.06 * dt

      const speed = Math.hypot(p.vx, p.vy)
      if (speed > 90) {
        p.vx = (p.vx / speed) * 90
        p.vy = (p.vy / speed) * 90
      }

      p.x += p.vx * dt
      p.y += p.vy * dt
      // Expand into soft haze
      p.size += (1.1 + age * 3.2 + free * 1.4) * dt

      if (p.y > -80 && p.x > -60 && p.x < this.width + 60) next.push(p)
    }

    this.particles = next
  }

  private draw(): void {
    const { ctx, width, height } = this
    ctx.clearRect(0, 0, width, height)
    if (this.width < 2 || this.height < 2) return

    const origin = this.getOrigin()
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return

    // Soft ember heat haze only — no white thread/line
    if (this.lit) {
      ctx.globalCompositeOperation = 'source-over'
      const tipGlow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 10)
      tipGlow.addColorStop(0, 'rgba(255, 190, 140, 0.16)')
      tipGlow.addColorStop(0.45, 'rgba(220, 200, 180, 0.05)')
      tipGlow.addColorStop(1, 'rgba(200, 190, 180, 0)')
      ctx.fillStyle = tipGlow
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, 10, 0, Math.PI * 2)
      ctx.fill()
    }

    // Soft volumetric puffs (cool grey, low alpha — realistic incense)
    ctx.globalCompositeOperation = 'source-over'
    for (const p of this.particles) {
      const age = p.life / p.maxLife
      const fadeIn = age < 0.04 ? age / 0.04 : 1
      const fadeOut = age > 0.45 ? Math.pow(1 - (age - 0.45) / 0.55, 1.35) : 1
      const alpha = fadeIn * fadeOut * p.dens * (0.045 + (1 - age) * 0.07)
      if (alpha < 0.008) continue

      const r = Math.max(2.2, p.size * (0.85 + age * 1.6))
      // Stretch slightly along motion for wispy look
      const speed = Math.hypot(p.vx, p.vy) + 0.001
      const stretch = 1 + Math.min(0.55, speed * 0.012)
      const angle = Math.atan2(p.vy, p.vx)

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(angle)
      ctx.scale(stretch, 1 / Math.sqrt(stretch))

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
      // Warm near tip (young), cooler grey as it rises
      const warm = Math.max(0, 1 - age * 2.2)
      const cr = Math.round(210 + warm * 25)
      const cg = Math.round(208 + warm * 18)
      const cb = Math.round(205 + warm * 8)
      g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`)
      g.addColorStop(0.35, `rgba(190, 188, 184, ${alpha * 0.4})`)
      g.addColorStop(1, 'rgba(170, 168, 164, 0)')

      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
}
