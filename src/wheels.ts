/** iOS-style time wheels — pointer drag + momentum (no native overflow scroll). */

export type WheelsOptions = {
  root: HTMLElement
  minSec: number
  maxSec: number
  valueSec: number
  onChange: (sec: number) => void
}

const ITEM_H = 36
const VISIBLE = 3

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

type Column = {
  values: number[]
  index: number
  y: number
  vy: number
  el: HTMLElement
  track: HTMLElement
  dragging: boolean
  lastY: number
  lastT: number
}

function buildColumn(values: number[], unit: string): Column {
  const el = document.createElement('div')
  el.className = 'wheel-col'
  el.dataset.unit = unit

  const viewport = document.createElement('div')
  viewport.className = 'wheel-col__viewport'

  const track = document.createElement('div')
  track.className = 'wheel-col__track'

  for (const v of values) {
    const item = document.createElement('div')
    item.className = 'wheel-col__item'
    item.textContent = String(v)
    item.dataset.value = String(v)
    track.append(item)
  }

  viewport.append(track)
  el.append(viewport)

  return {
    values,
    index: 0,
    y: 0,
    vy: 0,
    el,
    track,
    dragging: false,
    lastY: 0,
    lastT: 0,
  }
}

function indexToY(index: number): number {
  return -index * ITEM_H
}

function yToIndex(y: number, count: number): number {
  return clamp(Math.round(-y / ITEM_H), 0, count - 1)
}

function renderColumn(col: Column): void {
  col.track.style.transform = `translate3d(0, ${col.y}px, 0)`
  const items = col.track.children
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as HTMLElement
    item.classList.toggle('is-active', i === col.index)
  }
}

export function bindWheels(options: WheelsOptions): {
  setValue: (sec: number) => void
  getValue: () => number
} {
  const { root, minSec, maxSec, onChange } = options
  root.innerHTML = ''
  root.classList.add('wheels')
  root.style.setProperty('--item-h', `${ITEM_H}px`)
  root.style.setProperty('--wheel-h', `${ITEM_H * VISIBLE}px`)

  const minCol = buildColumn(
    Array.from({ length: 61 }, (_, i) => i),
    'min',
  )
  const secCol = buildColumn(
    Array.from({ length: 60 }, (_, i) => i),
    'sec',
  )

  const unitMin = document.createElement('div')
  unitMin.className = 'wheels__unit'
  unitMin.textContent = '分'
  const unitSec = document.createElement('div')
  unitSec.className = 'wheels__unit'
  unitSec.textContent = '秒'

  const frame = document.createElement('div')
  frame.className = 'wheels__frame'
  frame.setAttribute('aria-hidden', 'true')

  root.append(minCol.el, unitMin, secCol.el, unitSec, frame)

  let value = clamp(options.valueSec, minSec, maxSec)
  let emitTimer = 0
  let raf = 0

  const normalize = (m: number, s: number): { m: number; s: number; total: number } => {
    let minutes = m
    let seconds = s
    if (minutes >= 60) {
      minutes = 60
      seconds = 0
    }
    let total = minutes * 60 + seconds
    total = clamp(total, minSec, maxSec)
    minutes = Math.floor(total / 60)
    seconds = total % 60
    if (minutes >= 60) {
      minutes = 60
      seconds = 0
    }
    return { m: minutes, s: seconds, total }
  }

  const readTotal = () => normalize(minCol.index, secCol.index).total

  const setColumnIndex = (col: Column, index: number, animate = false) => {
    col.index = clamp(index, 0, col.values.length - 1)
    const target = indexToY(col.index)
    if (animate) {
      col.vy = 0
      // snap immediately for reliability
      col.y = target
    } else {
      col.y = target
      col.vy = 0
    }
    renderColumn(col)
  }

  const applyTotal = (sec: number, emit: boolean) => {
    const n = normalize(Math.floor(sec / 60), sec % 60)
    value = n.total
    setColumnIndex(minCol, n.m)
    setColumnIndex(secCol, n.s)
    if (emit) {
      window.clearTimeout(emitTimer)
      emitTimer = window.setTimeout(() => onChange(value), 0)
    }
  }

  const settleColumn = (col: Column) => {
    col.index = yToIndex(col.y, col.values.length)
    col.y = indexToY(col.index)
    col.vy = 0
    renderColumn(col)
    const total = readTotal()
    if (total !== value) {
      value = total
      const n = normalize(minCol.index, secCol.index)
      setColumnIndex(minCol, n.m)
      setColumnIndex(secCol, n.s)
    }
    window.clearTimeout(emitTimer)
    emitTimer = window.setTimeout(() => onChange(value), 40)
  }

  const tickMomentum = () => {
    raf = 0
    let moving = false
    for (const col of [minCol, secCol]) {
      if (col.dragging) continue
      if (Math.abs(col.vy) > 0.15) {
        col.y += col.vy
        col.vy *= 0.92
        const minY = indexToY(col.values.length - 1)
        const maxY = 0
        if (col.y > maxY) {
          col.y = maxY
          col.vy = 0
        } else if (col.y < minY) {
          col.y = minY
          col.vy = 0
        }
        col.index = yToIndex(col.y, col.values.length)
        renderColumn(col)
        moving = true
      } else if (col.vy !== 0) {
        settleColumn(col)
      }
    }
    if (moving) raf = requestAnimationFrame(tickMomentum)
  }

  const ensureRaf = () => {
    if (!raf) raf = requestAnimationFrame(tickMomentum)
  }

  const bindDrag = (col: Column) => {
    const viewport = col.el.querySelector<HTMLElement>('.wheel-col__viewport')!

    const onDown = (clientY: number, t: number) => {
      col.dragging = true
      col.vy = 0
      col.lastY = clientY
      col.lastT = t
    }

    const onMove = (clientY: number, t: number) => {
      if (!col.dragging) return
      const dy = clientY - col.lastY
      const dt = Math.max(1, t - col.lastT)
      col.y += dy
      col.vy = dy / dt * 16
      col.lastY = clientY
      col.lastT = t
      const minY = indexToY(col.values.length - 1) - ITEM_H * 0.35
      const maxY = ITEM_H * 0.35
      col.y = clamp(col.y, minY, maxY)
      col.index = yToIndex(col.y, col.values.length)
      renderColumn(col)
    }

    const onUp = () => {
      if (!col.dragging) return
      col.dragging = false
      if (Math.abs(col.vy) < 0.8) {
        settleColumn(col)
      } else {
        ensureRaf()
      }
    }

    viewport.addEventListener(
      'pointerdown',
      (e) => {
        viewport.setPointerCapture(e.pointerId)
        onDown(e.clientY, e.timeStamp)
      },
      { passive: true },
    )
    viewport.addEventListener(
      'pointermove',
      (e) => {
        if (!col.dragging) return
        e.preventDefault()
        onMove(e.clientY, e.timeStamp)
      },
      { passive: false },
    )
    viewport.addEventListener('pointerup', onUp)
    viewport.addEventListener('pointercancel', onUp)

    // Wheel / trackpad support
    viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        col.y -= e.deltaY
        const minY = indexToY(col.values.length - 1)
        const maxY = 0
        col.y = clamp(col.y, minY, maxY)
        col.index = yToIndex(col.y, col.values.length)
        renderColumn(col)
        window.clearTimeout(emitTimer)
        emitTimer = window.setTimeout(() => settleColumn(col), 80)
      },
      { passive: false },
    )
  }

  bindDrag(minCol)
  bindDrag(secCol)

  applyTotal(value, false)

  return {
    setValue: (sec: number) => applyTotal(sec, false),
    getValue: () => value,
  }
}
