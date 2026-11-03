/** iOS-style scroll wheels for minutes + seconds. */

export type WheelsOptions = {
  root: HTMLElement
  minSec: number
  maxSec: number
  valueSec: number
  onChange: (sec: number) => void
}

const ITEM_H = 36

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function buildColumn(values: number[], unit: string): HTMLElement {
  const col = document.createElement('div')
  col.className = 'wheel-col'
  col.dataset.unit = unit

  const scroller = document.createElement('div')
  scroller.className = 'wheel-col__scroller'
  scroller.setAttribute('role', 'listbox')
  scroller.tabIndex = 0

  const pad = document.createElement('div')
  pad.className = 'wheel-col__pad'
  scroller.append(pad)

  for (const v of values) {
    const item = document.createElement('div')
    item.className = 'wheel-col__item'
    item.setAttribute('role', 'option')
    item.dataset.value = String(v)
    item.textContent = String(v)
    scroller.append(item)
  }

  const pad2 = document.createElement('div')
  pad2.className = 'wheel-col__pad'
  scroller.append(pad2)

  col.append(scroller)
  return col
}

function scrollToValue(scroller: HTMLElement, value: number, smooth: boolean): void {
  const item = scroller.querySelector<HTMLElement>(`.wheel-col__item[data-value="${value}"]`)
  if (!item) return
  const top = item.offsetTop - scroller.clientHeight / 2 + item.clientHeight / 2
  scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
}

function readValue(scroller: HTMLElement): number {
  const center = scroller.scrollTop + scroller.clientHeight / 2
  const items = [...scroller.querySelectorAll<HTMLElement>('.wheel-col__item')]
  let best = items[0]
  let bestDist = Infinity
  for (const item of items) {
    const mid = item.offsetTop + item.clientHeight / 2
    const d = Math.abs(mid - center)
    if (d < bestDist) {
      bestDist = d
      best = item
    }
  }
  return Number(best?.dataset.value ?? 0)
}

export function bindWheels(options: WheelsOptions): {
  setValue: (sec: number) => void
  getValue: () => number
} {
  const { root, minSec, maxSec, onChange } = options
  root.innerHTML = ''
  root.classList.add('wheels')

  const mins = Array.from({ length: 61 }, (_, i) => i) // 0..60
  const secs = Array.from({ length: 60 }, (_, i) => i) // 0..59

  const minCol = buildColumn(mins, 'min')
  const secCol = buildColumn(secs, 'sec')

  const labelMin = document.createElement('div')
  labelMin.className = 'wheels__unit'
  labelMin.textContent = '分'

  const labelSec = document.createElement('div')
  labelSec.className = 'wheels__unit'
  labelSec.textContent = '秒'

  const frame = document.createElement('div')
  frame.className = 'wheels__frame'
  frame.setAttribute('aria-hidden', 'true')

  root.append(minCol, labelMin, secCol, labelSec, frame)

  const minScroller = minCol.querySelector<HTMLElement>('.wheel-col__scroller')!
  const secScroller = secCol.querySelector<HTMLElement>('.wheel-col__scroller')!

  let value = clamp(options.valueSec, minSec, maxSec)
  let emitTimer = 0
  let suppress = false

  const totalFromUi = () => {
    let m = readValue(minScroller)
    let s = readValue(secScroller)
    if (m >= 60) {
      m = 60
      s = 0
    }
    let total = m * 60 + s
    total = clamp(total, minSec, maxSec)
    return total
  }

  const apply = (sec: number, smooth: boolean, emit: boolean) => {
    value = clamp(sec, minSec, maxSec)
    let m = Math.floor(value / 60)
    let s = value % 60
    if (m >= 60) {
      m = 60
      s = 0
    }
    suppress = true
    scrollToValue(minScroller, m, smooth)
    scrollToValue(secScroller, s, smooth)
    window.setTimeout(() => {
      suppress = false
    }, smooth ? 280 : 40)
    if (emit) onChange(value)
  }

  const onScrollEnd = (scroller: HTMLElement) => {
    if (suppress) return
    const v = readValue(scroller)
    scrollToValue(scroller, v, true)
    const total = totalFromUi()
    // Snap columns if clamped (e.g. 0分10秒 → 1分0秒)
    if (total !== value) {
      value = total
      apply(total, true, false)
    } else {
      value = total
    }
    window.clearTimeout(emitTimer)
    emitTimer = window.setTimeout(() => onChange(value), 120)
  }

  const bindScroller = (scroller: HTMLElement) => {
    let timeout = 0
    scroller.addEventListener(
      'scroll',
      () => {
        window.clearTimeout(timeout)
        timeout = window.setTimeout(() => onScrollEnd(scroller), 80)
      },
      { passive: true },
    )
  }

  bindScroller(minScroller)
  bindScroller(secScroller)

  // Initial layout then jump
  requestAnimationFrame(() => {
    apply(value, false, false)
  })

  return {
    setValue: (sec: number) => apply(sec, false, false),
    getValue: () => value,
  }
}

export const WHEEL_ITEM_H = ITEM_H
