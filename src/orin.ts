/**
 * Orin chime for iPhone/Safari:
 * pre-render to WAV + HTMLAudioElement, unlock with a real play() on gesture.
 */

let audioEl: HTMLAudioElement | null = null
let objectUrl: string | null = null
let preparing: Promise<void> | null = null
let unlocked = false

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = buffer.sampleRate
  const samples = buffer.getChannelData(0)
  const dataLength = samples.length * 2
  const arrayBuffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

async function renderOrinBuffer(): Promise<AudioBuffer> {
  const sampleRate = 44100
  const duration = 3.8
  const length = Math.floor(sampleRate * duration)
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  const offline = new OfflineCtx(1, length, sampleRate)
  const now = 0
  const master = offline.createGain()
  master.gain.value = 1
  master.connect(offline.destination)

  const fundamental = 830
  const partials = [
    { ratio: 1, amp: 0.75, decay: 3.4 },
    { ratio: 2.01, amp: 0.3, decay: 2.5 },
    { ratio: 2.76, amp: 0.24, decay: 2.8 },
    { ratio: 4.1, amp: 0.14, decay: 1.7 },
    { ratio: 5.45, amp: 0.08, decay: 1.2 },
  ]

  for (const p of partials) {
    const osc = offline.createOscillator()
    const gain = offline.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(fundamental * p.ratio, now)
    osc.frequency.linearRampToValueAtTime(fundamental * p.ratio * 0.995, now + p.decay)
    gain.gain.setValueAtTime(0.00001, now)
    gain.gain.linearRampToValueAtTime(p.amp, now + 0.015)
    gain.gain.linearRampToValueAtTime(0.00001, now + p.decay)
    osc.connect(gain)
    gain.connect(master)
    osc.start(now)
    osc.stop(now + p.decay + 0.05)
  }

  const n = Math.floor(sampleRate * 0.03)
  const noiseBuf = offline.createBuffer(1, n, sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2
  }
  const noise = offline.createBufferSource()
  noise.buffer = noiseBuf
  const filter = offline.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2400
  filter.Q.value = 0.9
  const noiseGain = offline.createGain()
  noiseGain.gain.setValueAtTime(0.00001, now)
  noiseGain.gain.linearRampToValueAtTime(0.22, now + 0.005)
  noiseGain.gain.linearRampToValueAtTime(0.00001, now + 0.05)
  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(master)
  noise.start(now)

  return offline.startRendering()
}

async function ensureAudioElement(): Promise<HTMLAudioElement> {
  if (audioEl) return audioEl
  if (!preparing) {
    preparing = (async () => {
      const buffer = await renderOrinBuffer()
      const wav = audioBufferToWav(buffer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = URL.createObjectURL(wav)
      const el = new Audio()
      el.src = objectUrl
      el.preload = 'auto'
      el.setAttribute('playsinline', 'true')
      el.setAttribute('webkit-playsinline', 'true')
      ;(el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
      // Load into memory
      await new Promise<void>((resolve, reject) => {
        const ok = () => {
          cleanup()
          resolve()
        }
        const fail = () => {
          cleanup()
          reject(new Error('audio load failed'))
        }
        const cleanup = () => {
          el.removeEventListener('canplaythrough', ok)
          el.removeEventListener('error', fail)
        }
        el.addEventListener('canplaythrough', ok)
        el.addEventListener('error', fail)
        el.load()
        // Safari sometimes never fires canplaythrough for blob URLs
        window.setTimeout(() => {
          cleanup()
          resolve()
        }, 800)
      })
      audioEl = el
    })()
  }
  await preparing
  if (!audioEl) throw new Error('orin audio missing')
  return audioEl
}

/** Must run inside a user gesture on iPhone. */
export async function unlockAudio(): Promise<void> {
  const el = await ensureAudioElement()
  const prev = el.volume
  try {
    el.muted = true
    el.volume = 0
    el.currentTime = 0
    await el.play()
    el.pause()
    el.currentTime = 0
  } catch {
    // Still mark attempt; a later play() may work after another gesture
  } finally {
    el.muted = false
    el.volume = prev || 1
  }
  unlocked = true
}

export async function playOrin(): Promise<void> {
  const el = await ensureAudioElement()
  if (!unlocked) {
    await unlockAudio()
  }
  try {
    el.pause()
    el.currentTime = 0
    el.muted = false
    el.volume = 1
    await el.play()
  } catch (err) {
    // One more unlock+play attempt (helps some WebViews)
    unlocked = false
    await unlockAudio()
    el.currentTime = 0
    el.muted = false
    el.volume = 1
    await el.play()
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked
}
