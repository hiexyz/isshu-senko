/** Circular dial mapping angle → discrete seconds. */

export type DialOptions = {
  el: HTMLElement
  minSec: number
  maxSec: number
  stepSec: number
  valueSec: number
  onChange: (sec: number) => void
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function snap(sec: number, min: number, max: number, step: number): number {
  const snapped = Math.round(sec / step) * step
  return clamp(snapped, min, max)
}

/** Map seconds → rotation degrees (0 at top, clockwise). */
export function secToDeg(sec: number, min: number, max: number): number {
  const t = (sec - min) / (max - min)
  return t * 360
}

export function degToSec(deg: number, min: number, max: number, step: number): number {
  let d = ((deg % 360) + 360) % 360
  const t = d / 360
  return snap(min + t * (max - min), min, max, step)
}

export function bindDial(options: DialOptions): {
  setValue: (sec: number) => void
  getValue: () => number
} {
  const { el, minSec, maxSec, stepSec, onChange } = options
  const knob = el.querySelector<HTMLElement>('.dial__knob')!
  let value = snap(options.valueSec, minSec, maxSec, stepSec)
  let dragging = false

  const apply = (sec: number, emit: boolean) => {
    value = snap(sec, minSec, maxSec, stepSec)
    const deg = secToDeg(value, minSec, maxSec)
    knob.style.transform = `rotate(${deg}deg)`
    el.style.setProperty('--dial-deg', `${deg}`)
    el.dataset.sec = String(value)
    if (emit) onChange(value)
  }

  const angleFromEvent = (clientX: number, clientY: number): number => {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // atan2: 0 at right; convert so 0 is top, clockwise positive
    const rad = Math.atan2(clientX - cx, cy - clientY)
    let deg = (rad * 180) / Math.PI
    if (deg < 0) deg += 360
    return deg
  }

  const onPointer = (clientX: number, clientY: number, emit: boolean) => {
    apply(degToSec(angleFromEvent(clientX, clientY), minSec, maxSec, stepSec), emit)
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true
    el.setPointerCapture(e.pointerId)
    onPointer(e.clientX, e.clientY, true)
  })
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return
    onPointer(e.clientX, e.clientY, true)
  })
  el.addEventListener('pointerup', () => {
    dragging = false
  })
  el.addEventListener('pointercancel', () => {
    dragging = false
  })

  // Keyboard fine adjust
  el.tabIndex = 0
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      apply(value + stepSec, true)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      apply(value - stepSec, true)
    }
  })

  apply(value, false)

  return {
    setValue: (sec: number) => apply(sec, false),
    getValue: () => value,
  }
}
