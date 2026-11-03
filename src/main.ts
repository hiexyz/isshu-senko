import './style.css'
import { BreathSensor } from './breath'
import { SmokeEngine } from './smoke/engine'

/** Full stick lifetime while lit (seconds). */
const BURN_DURATION_SEC = 180
/** Remaining fraction below this auto-extinguishes. */
const BURN_OUT = 0.06

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
              <div class="stick__char" id="stick-char"></div>
              <div class="stick__ash-tip" id="ash-tip"></div>
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
        <p class="hint" id="hint">線香は静かに燃え、やがて短くなって消えます</p>
      </footer>
    </main>
  `

  const altar = app.querySelector<HTMLElement>('.altar')!
  const scene = app.querySelector<HTMLElement>('#scene')!
  const canvas = app.querySelector<HTMLCanvasElement>('#smoke')!
  const stick = app.querySelector<HTMLElement>('#stick')!
  const ashTip = app.querySelector<HTMLElement>('#ash-tip')!
  const stickChar = app.querySelector<HTMLElement>('#stick-char')!
  const ember = app.querySelector<HTMLElement>('.ember')!
  const toggle = app.querySelector<HTMLButtonElement>('#lit-toggle')!
  const breathToggle = app.querySelector<HTMLButtonElement>('#breath-toggle')!
  const breathMeter = app.querySelector<HTMLElement>('#breath-meter')!
  const breathFill = app.querySelector<HTMLElement>('#breath-fill')!
  const hint = app.querySelector<HTMLElement>('#hint')!

  /** 1 = fresh stick, 0 = burned out */
  let remain = 1
  let burnedOut = false
  let lastFrame = performance.now()

  const applyStickLength = () => {
    // Keep a tiny stub in the holder at the end
    const visible = Math.max(remain, burnedOut ? 0.04 : BURN_OUT * 0.5)
    stick.style.setProperty('--remain', String(visible))
    // Ash tip grows a little as it burns
    const ash = 3 + (1 - remain) * 5
    ashTip.style.width = `${ash}px`
    ashTip.style.height = `${ash * 0.9}px`
    // Charred band just below the ember
    const charH = 2 + (1 - remain) * 6
    stickChar.style.height = `${charH}px`
    stickChar.style.opacity = remain < 0.98 ? '1' : '0'
  }

  const defaultHint = () => {
    if (breath.isActive()) {
      hint.textContent = 'マイクに向かって、そっと息を吹きかけてみてください'
    } else {
      hint.textContent = '線香は静かに燃え、やがて短くなって消えます'
    }
  }

  const setLitUi = (lit: boolean) => {
    engine.setLit(lit)
    altar.dataset.lit = String(lit)
    toggle.setAttribute('aria-pressed', String(lit))
    toggle.textContent = lit ? '消す' : '点す'
    if (!lit && burnedOut) {
      hint.textContent = '燃え尽きました。点すと新しい線香になります'
    } else if (!lit) {
      hint.textContent = '火を止めました。点すと続きから燃えます'
    } else {
      defaultHint()
    }
  }

  const getOrigin = () => {
    const sceneRect = scene.getBoundingClientRect()
    const emberRect = ember.getBoundingClientRect()
    if (emberRect.width < 1 || altar.dataset.lit !== 'true') {
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

  applyStickLength()

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
    } else if (!engine.isLit() && burnedOut) {
      hint.textContent = '燃え尽きました。点すと新しい線香になります'
    } else {
      hint.textContent = '線香は静かに燃え、やがて短くなって消えます'
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

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now

    if (engine.isLit() && !burnedOut) {
      remain = Math.max(0, remain - dt / BURN_DURATION_SEC)
      applyStickLength()
      engine.setSpawnRate(18 + remain * 36)
      if (remain <= BURN_OUT) {
        burnedOut = true
        remain = 0
        applyStickLength()
        setLitUi(false)
      }
    }

    windStrength += (targetStrength - windStrength) * 0.08
    const origin = getOrigin()
    const t = now / 1000
    const ambientX = hasPointer ? windX : origin.x + Math.sin(t * 0.18) * 12

    const sample = breath.sample()
    if (sample.active) {
      if (!hasPointer && sample.blowing) {
        breathDir = Math.sin(t * 0.7) >= 0 ? 1 : -1
      }
      const gust = Math.min(1, sample.level * 1.25)
      engine.setBreath(engine.isLit() ? gust : 0, breathDir)
      breathFill.style.transform = `scaleX(${gust})`
      altar.dataset.blowing = sample.blowing ? 'true' : 'false'
      const strength = Math.max(windStrength * (1 - gust), gust * 1.7)
      engine.setWind(ambientX, origin.y - 100, engine.isLit() ? strength : 0)
    } else {
      engine.setBreath(0)
      engine.setWind(
        ambientX,
        origin.y - 100,
        engine.isLit() ? Math.max(windStrength, 0.06 + Math.sin(t * 0.3) * 0.03) : 0,
      )
    }

    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  toggle.addEventListener('click', () => {
    if (engine.isLit()) {
      setLitUi(false)
      return
    }

    // Fresh stick after burnout; otherwise resume
    if (burnedOut || remain <= BURN_OUT) {
      burnedOut = false
      remain = 1
      applyStickLength()
    }
    setLitUi(true)
  })

  window.addEventListener('pagehide', () => breath.stop())
}

mount()
