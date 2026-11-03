import './style.css'
import { SmokeEngine } from './smoke/engine'

const BUDDHA_SVG = `
<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="glaze" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#e4f0ec"/>
      <stop offset="40%" stop-color="#a8c4bc"/>
      <stop offset="100%" stop-color="#6d9188"/>
    </linearGradient>
    <linearGradient id="glaze-side" x1="0" y1="0.2" x2="1" y2="0.9">
      <stop offset="0%" stop-color="#c5d9d2"/>
      <stop offset="100%" stop-color="#587a72"/>
    </linearGradient>
  </defs>
  <ellipse cx="50" cy="128" rx="34" ry="7" fill="url(#glaze-side)" opacity="0.9"/>
  <path d="M22 118c10 12 20 16 28 16s18-4 28-16c-9 5-19 8-28 8s-19-3-28-8z" fill="url(#glaze)"/>
  <path d="M18 108c8 8 18 14 32 14s24-6 32-14c-12 8-22 10-32 10s-20-2-32-10z" fill="url(#glaze-side)"/>
  <ellipse cx="32" cy="108" rx="14" ry="7" fill="url(#glaze)"/>
  <ellipse cx="68" cy="108" rx="14" ry="7" fill="url(#glaze)"/>
  <path d="M34 70c1 22 7 34 16 40 9-6 15-18 16-40-5 5-11 8-16 8s-11-3-16-8z" fill="url(#glaze)"/>
  <path d="M42 78c-1 10 3 18 8 22v-22c-3 1-6 1-8 0z" fill="url(#glaze-side)"/>
  <path d="M58 78c1 10-3 18-8 22v-22c3 1 6 1 8 0z" fill="url(#glaze-side)"/>
  <ellipse cx="50" cy="92" rx="5.5" ry="4" fill="#8aa9a0"/>
  <circle cx="50" cy="48" r="20" fill="url(#glaze)"/>
  <ellipse cx="50" cy="32" rx="9" ry="6" fill="url(#glaze-side)"/>
  <circle cx="50" cy="26" r="3.5" fill="url(#glaze)"/>
  <ellipse cx="30" cy="50" rx="3.5" ry="6" fill="url(#glaze-side)"/>
  <ellipse cx="70" cy="50" rx="3.5" ry="6" fill="url(#glaze-side)"/>
  <circle cx="43" cy="47" r="1.1" fill="#5f7f76" opacity="0.5"/>
  <circle cx="57" cy="47" r="1.1" fill="#5f7f76" opacity="0.5"/>
  <path d="M44 55c2 3.5 5 5 6 5s4-1.5 6-5" fill="none" stroke="#5f7f76" stroke-width="1.1" stroke-linecap="round" opacity="0.45"/>
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
    spawnRate: 30,
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
