import './style.css'
import { BreathSensor } from './breath'
import { playOrin, unlockAudio } from './orin'
import { SmokeEngine } from './smoke/engine'
import { bindWheels } from './wheels'

const BURN_OUT_SEC = 0.35
/** Allow short timers (e.g. 10 seconds) for testing / brief sits */
const MIN_SEC = 5
const MAX_SEC = 60 * 60
const DURATION_KEY = 'isshu-duration-sec'
const SOUND_KEY = 'isshu-sound-on'

function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function formatDurationLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (r === 0) return `${m}分`
  return `${m}分${r}秒`
}

function clampDuration(n: number): number {
  return Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(n)))
}

function loadDuration(): number {
  const n = Number(localStorage.getItem(DURATION_KEY) ?? 180)
  return Number.isFinite(n) ? clampDuration(n) : 180
}

function loadSoundOn(): boolean {
  const raw = localStorage.getItem(SOUND_KEY)
  return raw === null ? true : raw === '1'
}

function mount(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  const initialDuration = loadDuration()
  let soundOn = loadSoundOn()

  app.innerHTML = `
    <main class="altar" data-lit="true" data-breath="off" data-sound="${soundOn ? 'on' : 'off'}">
      <div class="altar__grain" aria-hidden="true"></div>
      <div class="altar__glow" aria-hidden="true"></div>

      <header class="topbar">
        <div class="brand">
          <div class="brand__mark">一炷</div>
          <div class="brand__ruby">いっしゅ</div>
        </div>
        <div class="actions">
          <button type="button" class="toggle" id="sound-toggle" aria-pressed="${soundOn}">${soundOn ? '音オン' : '音オフ'}</button>
          <button type="button" class="toggle" id="breath-toggle" aria-pressed="false">息を聴く</button>
          <button type="button" class="toggle" id="lit-toggle" aria-pressed="true">消す</button>
        </div>
      </header>

      <section class="stage" aria-label="線香タイマー">
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
        <p>線香が燃え尽きるまでを、ひとつの時間に。</p>
        <div class="picker" id="time-picker" aria-label="時間設定"></div>
        <p class="hint" id="hint">分・秒を回して時間を合わせ、点すと始まります</p>
      </footer>

      <div class="timer" aria-live="polite">
        <span class="timer__label" id="timer-label">残り</span>
        <span class="timer__remain" id="timer-remain">${formatTime(initialDuration)}</span>
      </div>
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
  const soundToggle = app.querySelector<HTMLButtonElement>('#sound-toggle')!
  const breathMeter = app.querySelector<HTMLElement>('#breath-meter')!
  const breathFill = app.querySelector<HTMLElement>('#breath-fill')!
  const hint = app.querySelector<HTMLElement>('#hint')!
  const timerRemain = app.querySelector<HTMLElement>('#timer-remain')!
  const timerLabel = app.querySelector<HTMLElement>('#timer-label')!
  const pickerRoot = app.querySelector<HTMLElement>('#time-picker')!

  let durationSec = initialDuration
  let leftSec = initialDuration
  let burnedOut = false
  let lastFrame = performance.now()
  let lastDisplayedSec = -1

  const fractionLeft = () => (durationSec > 0 ? leftSec / durationSec : 0)

  const applyStickLength = () => {
    const frac = burnedOut ? 0.04 : Math.max(fractionLeft(), 0.04)
    stick.style.setProperty('--remain', String(frac))
    const burned = 1 - Math.min(1, Math.max(0, fractionLeft()))
    ashTip.style.width = `${3 + burned * 5}px`
    ashTip.style.height = `${(3 + burned * 5) * 0.9}px`
    stickChar.style.height = `${2 + burned * 6}px`
    stickChar.style.opacity = burned > 0.02 ? '1' : '0'
  }

  const updateTimerDisplay = () => {
    const shown = burnedOut ? 0 : leftSec
    const rounded = Math.ceil(Math.max(0, shown))
    if (rounded !== lastDisplayedSec) {
      lastDisplayedSec = rounded
      timerRemain.textContent = formatTime(shown)
    }
    if (burnedOut) {
      timerLabel.textContent = '完了'
      altar.dataset.timer = 'done'
    } else if (engine.isLit()) {
      timerLabel.textContent = '残り'
      altar.dataset.timer = 'running'
    } else {
      timerLabel.textContent = leftSec < durationSec - 0.2 ? '一時停止' : '設定'
      altar.dataset.timer = leftSec < durationSec - 0.2 ? 'paused' : 'idle'
    }
  }

  const defaultHint = () => {
    if (breath.isActive()) {
      hint.textContent = 'マイクに向かって、そっと息を吹きかけてみてください'
    } else {
      hint.textContent = '分・秒を回して時間を合わせ、点すと始まります'
    }
  }

  const notifyDone = () => {
    try {
      navigator.vibrate?.([100, 50, 140])
    } catch {
      /* ignore */
    }
    if (soundOn) {
      void playOrin().catch((err) => console.warn('orin failed', err))
    }
  }

  const setSoundUi = (on: boolean) => {
    soundOn = on
    localStorage.setItem(SOUND_KEY, on ? '1' : '0')
    altar.dataset.sound = on ? 'on' : 'off'
    soundToggle.setAttribute('aria-pressed', String(on))
    soundToggle.textContent = on ? '音オン' : '音オフ'
  }

  const setLitUi = (lit: boolean) => {
    engine.setLit(lit)
    altar.dataset.lit = String(lit)
    toggle.setAttribute('aria-pressed', String(lit))
    toggle.textContent = lit ? '消す' : '点す'
    if (!lit && burnedOut) {
      hint.textContent = soundOn
        ? 'おりんが響きました。点すと新しい線香で再開できます'
        : '時間が終わりました。点すと新しい線香で再開できます'
    } else if (!lit) {
      hint.textContent = '一時停止中。点すと続きから計測します'
    } else {
      defaultHint()
    }
    updateTimerDisplay()
  }

  const commitDuration = (sec: number) => {
    durationSec = clampDuration(sec)
    leftSec = durationSec
    burnedOut = false
    lastDisplayedSec = -1
    localStorage.setItem(DURATION_KEY, String(durationSec))
    applyStickLength()
    updateTimerDisplay()
    hint.textContent = engine.isLit()
      ? `${formatDurationLabel(durationSec)}で計測中`
      : `${formatDurationLabel(durationSec)}に設定しました。点すと始まります`
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

  const wheels = bindWheels({
    root: pickerRoot,
    minSec: MIN_SEC,
    maxSec: MAX_SEC,
    valueSec: initialDuration,
    onChange: commitDuration,
  })

  applyStickLength()
  updateTimerDisplay()

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
      hint.textContent = '時間が終わりました。点すと新しい線香で再開できます'
    } else {
      hint.textContent = '分・秒を回して時間を合わせ、点すと始まります'
    }
  }

  const armAudio = () => {
    void unlockAudio().catch(() => undefined)
  }
  ;[soundToggle, toggle, breathToggle].forEach((el) => {
    el.addEventListener('touchstart', armAudio, { passive: true })
    el.addEventListener('pointerdown', armAudio)
  })

  breathToggle.addEventListener('click', async () => {
    void unlockAudio()
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

  soundToggle.addEventListener('click', async () => {
    const next = !soundOn
    if (next) {
      try {
        await unlockAudio()
        setSoundUi(true)
        await playOrin()
        hint.textContent = '終了時におりんが鳴ります'
      } catch {
        setSoundUi(false)
        hint.textContent =
          '音を再生できませんでした。消音スイッチ／本体音量を確認してください'
      }
    } else {
      setSoundUi(false)
      hint.textContent = '音をオフにしました'
    }
  })

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now

    if (engine.isLit() && !burnedOut) {
      leftSec = Math.max(0, leftSec - dt)
      applyStickLength()
      engine.setSpawnRate(18 + fractionLeft() * 36)
      updateTimerDisplay()
      if (leftSec <= BURN_OUT_SEC) {
        burnedOut = true
        leftSec = 0
        applyStickLength()
        setLitUi(false)
        notifyDone()
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
    void unlockAudio()
    if (engine.isLit()) {
      setLitUi(false)
      return
    }
    if (burnedOut || leftSec <= BURN_OUT_SEC) {
      burnedOut = false
      leftSec = durationSec
      lastDisplayedSec = -1
      wheels.setValue(durationSec)
      applyStickLength()
    }
    setLitUi(true)
  })

  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now()
  })

  window.addEventListener('pagehide', () => breath.stop())
}

mount()
