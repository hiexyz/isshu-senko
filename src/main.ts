import './style.css'
import { BreathSensor } from './breath'
import { SmokeEngine } from './smoke/engine'

function mount(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  app.innerHTML = `
    <main class="altar" data-lit="true" data-breath="off">
      <div class="altar__grain" aria-hidden="true"></div>
      <div class="altar__glow" aria-hidden="true"></div>

      <header class="topbar">
        <div class="brand">
          <div class="brand__mark">一炷</div>
          <div class="brand__ruby">いっしゅ</div>
        </div>
        <div class="actions">
          <button type="button" class="toggle" id="breath-toggle" aria-pressed="false">息を聴く</button>
          <button type="button" class="toggle" id="lit-toggle" aria-pressed="true">消す</button>
        </div>
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
          <div class="breath-meter" id="breath-meter" hidden aria-hidden="true">
            <div class="breath-meter__fill" id="breath-fill"></div>
          </div>
        </div>
      </section>

      <footer class="copy">
        <h1>静かに、祈る。</h1>
        <p>線香の煙に心を預け、いまこのひと息を味わう。</p>
        <p class="hint" id="hint">「息を聴く」をオンにして、そっと吹きかけると煙が揺れます</p>
      </footer>
    </main>
  `

  const altar = app.querySelector<HTMLElement>('.altar')!
  const scene = app.querySelector<HTMLElement>('#scene')!
  const canvas = app.querySelector<HTMLCanvasElement>('#smoke')!
  const stick = app.querySelector<HTMLElement>('#stick')!
  const ember = app.querySelector<HTMLElement>('.ember')!
  const toggle = app.querySelector<HTMLButtonElement>('#lit-toggle')!
  const breathToggle = app.querySelector<HTMLButtonElement>('#breath-toggle')!
  const breathMeter = app.querySelector<HTMLElement>('#breath-meter')!
  const breathFill = app.querySelector<HTMLElement>('#breath-fill')!
  const hint = app.querySelector<HTMLElement>('#hint')!

  const getOrigin = () => {
    const sceneRect = scene.getBoundingClientRect()
    const emberRect = ember.getBoundingClientRect()
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

  requestAnimationFrame(() => {
    engine.resize()
    engine.start()
  })

  window.addEventListener('resize', () => engine.resize())

  let windStrength = 0
  let windX = 0
  let targetStrength = 0
  let hasPointer = false
  let breathDir = 1
  const breath = new BreathSensor()

  const updatePointerWind = (clientX: number, active: boolean) => {
    const rect = scene.getBoundingClientRect()
    windX = clientX - rect.left
    hasPointer = true
    targetStrength = active ? 0.9 : 0.35
    const origin = getOrigin()
    breathDir = windX >= origin.x ? 1 : -1
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

  const setBreathUi = (on: boolean, error?: string) => {
    altar.dataset.breath = on ? 'on' : 'off'
    breathToggle.setAttribute('aria-pressed', String(on))
    breathToggle.textContent = on ? '息を止める' : '息を聴く'
    breathMeter.hidden = !on
    if (error) {
      hint.textContent = error
    } else if (on) {
      hint.textContent = 'マイクに向かって、そっと息を吹きかけてみてください'
    } else {
      hint.textContent = '「息を聴く」をオンにして、そっと吹きかけると煙が揺れます'
    }
  }

  breathToggle.addEventListener('click', async () => {
    if (breath.isActive()) {
      breath.stop()
      engine.setBreath(0)
      breathFill.style.transform = 'scaleX(0)'
      setBreathUi(false)
      return
    }

    breathToggle.disabled = true
    try {
      await breath.start()
      setBreathUi(true)
    } catch {
      setBreathUi(false, 'マイクを許可すると、息で煙を揺らせます')
    } finally {
      breathToggle.disabled = false
    }
  })

  const windLoop = () => {
    windStrength += (targetStrength - windStrength) * 0.08
    const origin = getOrigin()
    const t = performance.now() / 1000
    const ambientX = hasPointer ? windX : origin.x + Math.sin(t * 0.18) * 12

    const sample = breath.sample()
    if (sample.active) {
      // Alternate default blow direction slowly if no pointer bias
      if (!hasPointer && sample.blowing) {
        breathDir = Math.sin(t * 0.7) >= 0 ? 1 : -1
      }
      engine.setBreath(sample.level, breathDir)
      breathFill.style.transform = `scaleX(${sample.level})`
      altar.dataset.blowing = sample.blowing ? 'true' : 'false'
      // Breath overrides gentle pointer wind
      const strength = Math.max(windStrength * (1 - sample.level), sample.level * 1.4)
      engine.setWind(ambientX, origin.y - 100, strength)
    } else {
      engine.setBreath(0)
      engine.setWind(ambientX, origin.y - 100, Math.max(windStrength, 0.06 + Math.sin(t * 0.3) * 0.03))
    }

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

  window.addEventListener('pagehide', () => breath.stop())
}

mount()
