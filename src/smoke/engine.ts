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
  phase: number
}

export interface WindField {
  x: number
  y: number
  strength: number
}

export interface SmokeEngineOptions {
  canvas: HTMLCanvasElement
  /** Emitter position in canvas CSS pixels */
  getOrigin: () => { x: number; y: number }
  /** Particles spawned per second while lit */
  spawnRate?: number
  lit?: boolean
}

export class SmokeEngine {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly getOrigin: () => { x: number; y: number }
  private particles: SmokeParticle[] = []
  private wind: WindField = { x: 0, y: 0, strength: 0 }
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
    this.spawnRate = options.spawnRate ?? 28
    this.lit = options.lit ?? true
  }

  setLit(lit: boolean): void {
    this.lit = lit
  }

  isLit(): boolean {
    return this.lit
  }

  /** Pointer / ambient wind in canvas CSS pixels */
  setWind(x: number, y: number, strength: number): void {
    this.wind = { x, y, strength }
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
    for (let i = 0; i < count; i++) {
      const maxLife = 3.8 + Math.random() * 3.2
      this.particles.push({
        x: origin.x + (Math.random() - 0.5) * 1.1,
        y: origin.y + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 2.2,
        vy: -(22 + Math.random() * 16),
        life: 0,
        maxLife,
        size: 0.7 + Math.random() * 1.1,
        seed: Math.random() * 1000,
        phase: Math.random() * Math.PI * 2,
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
      const rise = 1 - age

      // Layered curl + FBM for thin meandering wisps
      const nx = p.x * 0.012
      const ny = p.y * 0.01
      const curl = curlNoise(nx + p.seed * 0.01, ny, this.time * 0.35, p.seed)
      const drift = fbm2(nx * 0.8, this.time * 0.25 + p.seed * 0.02, 7)

      // Smoke starts nearly vertical, then gains turbulence with height/age
      const turbulence = 0.15 + age * age * 2.4
      const buoyancy = 22 + rise * 18 + fbm2(p.seed, this.time * 0.4, 3) * 6

      p.vx += curl.x * 55 * turbulence * dt
      p.vx += drift * 28 * turbulence * dt
      p.vy += -buoyancy * dt
      p.vy += curl.y * 18 * turbulence * dt

      // Soft pointer wind — stronger when nearby and higher up
      if (this.wind.strength > 0.01) {
        const dx = p.x - this.wind.x
        const dy = p.y - this.wind.y
        const dist = Math.hypot(dx, dy) + 1
        const influence = this.wind.strength * Math.exp(-dist / 140) * (0.35 + age)
        const wx = (this.wind.x - origin.x) * 0.02
        p.vx += (wx + dx * 0.01) * influence * 40 * dt
        p.vy += dy * 0.004 * influence * 20 * dt
      }

      // Gentle damping keeps wisps delicate
      p.vx *= 1 - 0.55 * dt
      p.vy *= 1 - 0.12 * dt

      // Cap runaway velocity
      const speed = Math.hypot(p.vx, p.vy)
      if (speed > 120) {
        p.vx = (p.vx / speed) * 120
        p.vy = (p.vy / speed) * 120
      }

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.size += (0.55 + age * 1.6) * dt

      if (p.y > -40 && p.x > -80 && p.x < this.width + 80) {
        next.push(p)
      }
    }

    this.particles = next
  }

  private draw(): void {
    const { ctx, width, height } = this
    ctx.clearRect(0, 0, width, height)

    // Soft additive-ish look via light strokes
    ctx.globalCompositeOperation = 'lighter'

    for (const p of this.particles) {
      const age = p.life / p.maxLife
      // Thin near tip, then soft bloom, then fade
      const envelope =
        age < 0.08
          ? age / 0.08
          : age > 0.55
            ? Math.pow(1 - (age - 0.55) / 0.45, 1.6)
            : 1

      const alpha = envelope * (0.08 + (1 - age) * 0.16)
      if (alpha < 0.01) continue

      const r = p.size * (0.55 + age * 1.35)
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
      gradient.addColorStop(0, `rgba(248, 245, 238, ${alpha})`)
      gradient.addColorStop(0.28, `rgba(228, 224, 216, ${alpha * 0.4})`)
      gradient.addColorStop(1, 'rgba(200, 198, 190, 0)')

      ctx.beginPath()
      ctx.fillStyle = gradient
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Extra thin core stream near the ember for realism
    if (this.lit) {
      const origin = this.getOrigin()
      ctx.globalCompositeOperation = 'source-over'
      for (let i = 0; i < 8; i++) {
        const t = this.time * 0.9 + i * 0.2
        const wobble = fbm2(t, i * 0.5, 11) * (4 + i * 1.2)
        const y = origin.y - i * 7
        const x = origin.x + wobble * (i / 8)
        const a = 0.14 * (1 - i / 8)
        ctx.beginPath()
        ctx.fillStyle = `rgba(236, 232, 224, ${a})`
        ctx.arc(x, y, 0.7 + i * 0.15, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.globalCompositeOperation = 'source-over'
  }
}
