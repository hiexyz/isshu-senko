import './style.css'
import { SmokeEngine } from './smoke/engine'

function mount(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  app.innerHTML = `
    <main class="altar" data-lit="true">
      <div class="altar__grain" aria-hidden="true"></div>
      <div class="altar__glow" aria-hidden="true"></div>

      <header class="topbar">
        <div class="brand">
          <div class="brand__mark">一炷</div>
          <div class="brand__ruby">いっしゅ</div>
        </div>
        <button type="button" class="toggle" id="lit-toggle" aria-pressed="true">消す</button>
      </header>

      <section class="stage" aria-label="線香">
        <div class="scene" id="scene">
          <canvas class="smoke-layer" id="smoke" aria-hidden="true"></canvas>
          <div class="scene__art" aria-hidden="true">
            <div class="table"></div>
            <div class="holder">
              <div class="holder__body"></div>
              <div class="holder__rim"></div>
              <div class="holder__ash"></div>
            </div>
            <div class="stick" id="stick">
              <div class="stick__shaft"></div>
              <div class="stick__ash-tip"></div>
              <div class="ember" aria-hidden="true">
                <div class="ember__core"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="copy">
        <h1>静かに、祈る。</h1>
        <p>線香の煙に心を預け、いまこのひと息を味わう。</p>
        <p class="hint">画面をゆっくり動かすと、煙が空気に応じて揺らぎます</p>
      </footer>
    </main>
  `

  const altar = app.querySelector<HTMLElement>('.altar')!
  const scene = app.querySelector<HTMLElement>('#scene')!
  const canvas = app.querySelector<HTMLCanvasElement>('#smoke')!
  const stick = app.querySelector<HTMLElement>('#stick')!
  const ember = app.querySelector<HTMLElement>('.ember')!
  const toggle = app.querySelector<HTMLButtonElement>('#lit-toggle')!

  /** Smoke leaves from the visual center of the glowing ember. */
  const getOrigin = () => {
    const sceneRect = scene.getBoundingClientRect()
    const emberRect = ember.getBoundingClientRect()
    // Fallback to stick top if ember is hidden (extinguished layout still keeps element)
    if (emberRect.width < 1) {
      const stickRect = stick.getBoundingClientRect()
      return {
        x: stickRect.left + stickRect.width / 2 - sceneRect.left,
        y: stickRect.top - sceneRect.top,
      }
    }
    return {
      x: emberRect.left + emberRect.width / 2 - sceneRect.left,
      y: emberRect.top + emberRect.height / 2 - sceneRect.top,
    }
  }

  const engine = new SmokeEngine({
    canvas,
    getOrigin,
    spawnRate: 48,
    lit: true,
  })

  // Wait one frame so layout is ready before measuring / drawing
  requestAnimationFrame(() => {
    engine.resize()
    engine.start()
  })

  window.addEventListener('resize', () => engine.resize())

  let windStrength = 0
  let windX = 0
  let targetStrength = 0
  let hasPointer = false

  const updatePointerWind = (clientX: number, active: boolean) => {
    const rect = scene.getBoundingClientRect()
    windX = clientX - rect.left
    hasPointer = true
    targetStrength = active ? 0.9 : 0.35
  }

  scene.addEventListener('pointermove', (e) => {
    updatePointerWind(e.clientX, e.buttons > 0 || e.pointerType === 'touch')
  })
  scene.addEventListener('pointerdown', (e) => {
    scene.setPointerCapture(e.pointerId)
    updatePointerWind(e.clientX, true)
  })
  scene.addEventListener('pointerup', () => {
    targetStrength = 0.18
  })
  scene.addEventListener('pointerleave', () => {
    targetStrength = 0
    hasPointer = false
  })

  const windLoop = () => {
    windStrength += (targetStrength - windStrength) * 0.08
    const origin = getOrigin()
    const t = performance.now() / 1000
    const ambientX = hasPointer ? windX : origin.x + Math.sin(t * 0.18) * 12
    engine.setWind(ambientX, origin.y - 100, Math.max(windStrength, 0.06 + Math.sin(t * 0.3) * 0.03))
    requestAnimationFrame(windLoop)
  }
  requestAnimationFrame(windLoop)

  toggle.addEventListener('click', () => {
    const next = !engine.isLit()
    engine.setLit(next)
    altar.dataset.lit = String(next)
    toggle.setAttribute('aria-pressed', String(next))
    toggle.textContent = next ? '消す' : '点す'
  })
}

mount()
