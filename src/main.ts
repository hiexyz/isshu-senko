import './style.css'
import { SmokeEngine } from './smoke/engine'

const BUDDHA_SVG = `
<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="glaze" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d5e4df"/>
      <stop offset="45%" stop-color="#9bb8b0"/>
      <stop offset="100%" stop-color="#6f9188"/>
    </linearGradient>
    <linearGradient id="glaze-deep" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#b7ccc6"/>
      <stop offset="100%" stop-color="#5f847b"/>
    </linearGradient>
  </defs>
  <!-- lotus base -->
  <ellipse cx="60" cy="138" rx="38" ry="8" fill="url(#glaze-deep)" opacity="0.85"/>
  <path d="M28 128c8 10 24 14 32 14s24-4 32-14c-10 4-22 6-32 6s-22-2-32-6z" fill="url(#glaze)"/>
  <!-- robe / body -->
  <path d="M36 78c2 28 10 42 24 48 14-6 22-20 24-48-8 6-16 9-24 9s-16-3-24-9z" fill="url(#glaze)"/>
  <path d="M40 76c6 10 14 14 20 14s14-4 20-14c-6 3-13 5-20 5s-14-2-20-5z" fill="url(#glaze-deep)" opacity="0.55"/>
  <!-- arms in anjali mudra -->
  <path d="M48 86c-2 8 2 16 8 20 2-8 4-14 4-20-4 2-8 2-12 0z" fill="url(#glaze)"/>
  <path d="M72 86c2 8-2 16-8 20-2-8-4-14-4-20 4 2 8 2 12 0z" fill="url(#glaze)"/>
  <ellipse cx="60" cy="98" rx="7" ry="5" fill="url(#glaze-deep)"/>
  <!-- head -->
  <circle cx="60" cy="52" r="22" fill="url(#glaze)"/>
  <ellipse cx="60" cy="34" rx="10" ry="7" fill="url(#glaze-deep)"/>
  <circle cx="60" cy="28" r="4" fill="url(#glaze)"/>
  <!-- calm face suggestion -->
  <path d="M52 54c2 4 6 6 8 6s6-2 8-6" fill="none" stroke="#6a8780" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/>
  <circle cx="53" cy="50" r="1.2" fill="#6a8780" opacity="0.45"/>
  <circle cx="67" cy="50" r="1.2" fill="#6a8780" opacity="0.45"/>
</svg>
`

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

      <section class="stage" aria-label="線香の祭壇">
        <div class="scene" id="scene">
          <canvas class="smoke-layer" id="smoke" aria-hidden="true"></canvas>
          <div class="scene__art" aria-hidden="true">
            <div class="table"></div>
            <div class="tray">
              <div class="tray__rim"></div>
              <span class="ash ash--1"></span>
              <span class="ash ash--2"></span>
              <span class="ash ash--3"></span>
            </div>
            <div class="rock" id="rock"></div>
            <div class="stick" id="stick">
              <div class="stick__shaft"></div>
              <div class="stick__ash-tip"></div>
              <div class="ember" id="ember">
                <div class="ember__core"></div>
              </div>
            </div>
            <div class="buddha">${BUDDHA_SVG}</div>
          </div>
        </div>
      </section>

      <footer class="copy">
        <h1>静かに、祈る。</h1>
        <p>線香の煙に心を預け、いまこのひと息を味わうための小さな祭壇です。</p>
        <p class="hint">画面をゆっくり動かすと、煙が空気に応じて揺らぎます</p>
      </footer>
    </main>
  `

  const altar = app.querySelector<HTMLElement>('.altar')!
  const scene = app.querySelector<HTMLElement>('#scene')!
  const canvas = app.querySelector<HTMLCanvasElement>('#smoke')!
  const ember = app.querySelector<HTMLElement>('#ember')!
  const toggle = app.querySelector<HTMLButtonElement>('#lit-toggle')!

  const getOrigin = () => {
    const sceneRect = scene.getBoundingClientRect()
    const emberRect = ember.getBoundingClientRect()
    return {
      x: emberRect.left + emberRect.width / 2 - sceneRect.left,
      y: emberRect.top + emberRect.height * 0.2 - sceneRect.top,
    }
  }

  const engine = new SmokeEngine({
    canvas,
    getOrigin,
    spawnRate: 42,
    lit: true,
  })

  engine.start()

  const onResize = () => engine.resize()
  window.addEventListener('resize', onResize)

  let windStrength = 0
  let windX = 0
  let windY = 0
  let targetStrength = 0

  const updatePointerWind = (clientX: number, clientY: number, active: boolean) => {
    const rect = scene.getBoundingClientRect()
    windX = clientX - rect.left
    windY = clientY - rect.top
    targetStrength = active ? 1 : 0.22
  }

  scene.addEventListener('pointermove', (e) => {
    updatePointerWind(e.clientX, e.clientY, e.buttons > 0 || e.pointerType === 'touch')
  })
  scene.addEventListener('pointerdown', (e) => {
    scene.setPointerCapture(e.pointerId)
    updatePointerWind(e.clientX, e.clientY, true)
  })
  scene.addEventListener('pointerup', () => {
    targetStrength = 0.15
  })
  scene.addEventListener('pointerleave', () => {
    targetStrength = 0
  })

  // Soft ambient wind so smoke never looks frozen
  const windLoop = () => {
    windStrength += (targetStrength - windStrength) * 0.08
    const t = performance.now() / 1000
    const ambientX = windX || scene.clientWidth * (0.42 + Math.sin(t * 0.15) * 0.04)
    const ambientY = windY || scene.clientHeight * 0.35
    const ambientBoost = 0.18 + Math.sin(t * 0.27) * 0.08
    engine.setWind(ambientX, ambientY, Math.max(windStrength, ambientBoost))
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
