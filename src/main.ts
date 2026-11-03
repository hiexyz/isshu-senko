import './style.css'
import { BreathSensor } from './breath'
import { dictionaries, loadLang, saveLang, type Dict, type Lang } from './i18n'
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

function clampDuration(n: number): number {
  return Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(n)))
}

function loadDuration(): number {
  const n = Number(localStorage.getItem(DURATION_KEY) ?? 180)
  return Number.isFinite(n) ? clampDuration(n) : 180
}

function loadSoundOn(): boolean {
  const raw = localStorage.getItem(SOUND_KEY)
  return raw === null ? false : raw === '1'
}

function mount(): void {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) return

  const initialDuration = loadDuration()
  let soundOn = loadSoundOn()
  let lang: Lang = loadLang()
  let t: Dict = dictionaries[lang]

  app.innerHTML = `
    <main class="altar" data-lit="true" data-breath="off" data-sound="${soundOn ? 'on' : 'off'}" data-lang="${lang}">
      <div class="altar__grain" aria-hidden="true"></div>
      <div class="altar__glow" aria-hidden="true"></div>

      <header class="topbar">
        <div class="brand">
          <div class="brand__mark">一炷</div>
          <div class="brand__ruby" id="brand-ruby">${t.ruby}</div>
        </div>
        <div class="actions">
          <button type="button" class="toggle" id="lang-toggle">${t.langSwitch}</button>
          <button type="button" class="toggle" id="sound-toggle" aria-pressed="${soundOn}">${soundOn ? t.soundOn : t.soundOff}</button>
          <button type="button" class="toggle" id="breath-toggle" aria-pressed="false">${t.breathOff}</button>
          <button type="button" class="toggle" id="lit-toggle" aria-pressed="true">${t.extinguish}</button>
        </div>
      </header>

      <section class="stage" id="stage" aria-label="${t.stageLabel}">
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
        <h1 id="copy-title">${t.title}</h1>
        <p id="copy-body">${t.body}</p>
        <div class="picker" id="time-picker" aria-label="${t.timerSet}"></div>
        <p class="hint" id="hint">${t.hintDefault}</p>
      </footer>

      <div class="timer" aria-live="polite">
        <span class="timer__label" id="timer-label">${t.timerLeft}</span>
        <span class="timer__remain" id="timer-remain">${formatTime(initialDuration)}</span>
      </div>
    </main>
  `

  const altar = app.querySelector<HTMLElement>('.altar')!
  const stage = app.querySelector<HTMLElement>('#stage')!
  const scene = app.querySelector<HTMLElement>('#scene')!
  const canvas = app.querySelector<HTMLCanvasElement>('#smoke')!
  const stick = app.querySelector<HTMLElement>('#stick')!
  const ashTip = app.querySelector<HTMLElement>('#ash-tip')!
  const stickChar = app.querySelector<HTMLElement>('#stick-char')!
  const ember = app.querySelector<HTMLElement>('.ember')!
  const toggle = app.querySelector<HTMLButtonElement>('#lit-toggle')!
  const breathToggle = app.querySelector<HTMLButtonElement>('#breath-toggle')!
  const soundToggle = app.querySelector<HTMLButtonElement>('#sound-toggle')!
  const langToggle = app.querySelector<HTMLButtonElement>('#lang-toggle')!
  const brandRuby = app.querySelector<HTMLElement>('#brand-ruby')!
  const copyTitle = app.querySelector<HTMLElement>('#copy-title')!
  const copyBody = app.querySelector<HTMLElement>('#copy-body')!
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
      timerLabel.textContent = t.timerDone
      altar.dataset.timer = 'done'
    } else if (engine.isLit()) {
      timerLabel.textContent = t.timerLeft
      altar.dataset.timer = 'running'
    } else {
      timerLabel.textContent = leftSec < durationSec - 0.2 ? t.timerPaused : t.timerSet
      altar.dataset.timer = leftSec < durationSec - 0.2 ? 'paused' : 'idle'
    }
  }

  const defaultHint = () => {
    if (breath.isActive()) {
      hint.textContent = t.hintBreath
    } else {
      hint.textContent = t.hintDefault
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
    soundToggle.textContent = on ? t.soundOn : t.soundOff
  }

  const setLitUi = (lit: boolean) => {
    engine.setLit(lit)
    altar.dataset.lit = String(lit)
    toggle.setAttribute('aria-pressed', String(lit))
    toggle.textContent = lit ? t.extinguish : t.light
    if (!lit && burnedOut) {
      hint.textContent = soundOn ? t.hintDoneSound : t.hintDoneSilent
    } else if (!lit) {
      hint.textContent = t.hintPaused
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
    const label = t.durationLabel(durationSec)
    hint.textContent = engine.isLit() ? t.hintRunning(label) : t.hintSet(label)
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
    spawnRate: 12,
    lit: true,
  })

  const wheels = bindWheels({
    root: pickerRoot,
    minSec: MIN_SEC,
    maxSec: MAX_SEC,
    valueSec: initialDuration,
    unitMin: t.unitMin,
    unitSec: t.unitSec,
    onChange: commitDuration,
  })

  const applyLang = (next: Lang) => {
    lang = next
    t = dictionaries[lang]
    saveLang(lang)
    document.documentElement.lang = lang
    document.title = t.docTitle
    altar.dataset.lang = lang
    brandRuby.textContent = t.ruby
    langToggle.textContent = t.langSwitch
    soundToggle.textContent = soundOn ? t.soundOn : t.soundOff
    breathToggle.textContent = breath.isActive() ? t.breathOn : t.breathOff
    toggle.textContent = engine.isLit() ? t.extinguish : t.light
    stage.setAttribute('aria-label', t.stageLabel)
    copyTitle.textContent = t.title
    copyBody.textContent = t.body
    pickerRoot.setAttribute('aria-label', t.timerSet)
    wheels.setUnits(t.unitMin, t.unitSec)
    lastDisplayedSec = -1
    updateTimerDisplay()

    if (breath.isActive()) {
      hint.textContent = t.hintBreath
    } else if (!engine.isLit() && burnedOut) {
      hint.textContent = soundOn ? t.hintDoneSound : t.hintDoneSilent
    } else if (!engine.isLit() && leftSec < durationSec - 0.2) {
      hint.textContent = t.hintPaused
    } else if (engine.isLit()) {
      hint.textContent = t.hintRunning(t.durationLabel(durationSec))
    } else {
      hint.textContent = t.hintDefault
    }
  }

  applyStickLength()
  updateTimerDisplay()
  document.documentElement.lang = lang
  document.title = t.docTitle

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
    breathToggle.textContent = on ? t.breathOn : t.breathOff
    breathMeter.hidden = !on
    if (error) {
      hint.textContent = error
    } else if (on) {
      hint.textContent = t.hintBreath
    } else if (!engine.isLit() && burnedOut) {
      hint.textContent = t.hintDoneSimple
    } else {
      hint.textContent = t.hintDefault
    }
  }

  const armAudio = () => {
    void unlockAudio().catch(() => undefined)
  }
  ;[soundToggle, toggle, breathToggle, langToggle].forEach((el) => {
    el.addEventListener('touchstart', armAudio, { passive: true })
    el.addEventListener('pointerdown', armAudio)
  })

  langToggle.addEventListener('click', () => {
    applyLang(lang === 'ja' ? 'en' : 'ja')
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
      setBreathUi(false, t.hintMicFail)
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
        hint.textContent = t.hintSoundReady
      } catch {
        setSoundUi(false)
        hint.textContent = t.hintSoundFail
      }
    } else {
      setSoundUi(false)
      hint.textContent = t.hintSoundOff
    }
  })

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now

    if (engine.isLit() && !burnedOut) {
      leftSec = Math.max(0, leftSec - dt)
      applyStickLength()
      engine.setSpawnRate(8 + fractionLeft() * 8)
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
    const nowSec = now / 1000
    const ambientX = hasPointer ? windX : origin.x + Math.sin(nowSec * 0.18) * 12

    const sample = breath.sample()
    if (sample.active) {
      if (!hasPointer && sample.blowing) {
        breathDir = Math.sin(nowSec * 0.7) >= 0 ? 1 : -1
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
        engine.isLit() ? Math.max(windStrength, 0.06 + Math.sin(nowSec * 0.3) * 0.03) : 0,
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
