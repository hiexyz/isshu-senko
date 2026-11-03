/**
 * Brighter, more metallic orin via OfflineAudioContext → WAV → HTMLAudioElement.
 * Unlock with a real play() inside a user gesture (required on iPhone).
 */

let audioEl: HTMLAudioElement | null = null
let objectUrl: string | null = null
let preparing: Promise<void> | null = null
let unlocked = false

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
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
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
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

/** Small temple rin: bright, shimmering, slightly inharmonic. */
async function renderOrinBuffer(): Promise<AudioBuffer> {
  const sampleRate = 44100
  const duration = 7.5
  const length = Math.floor(sampleRate * duration)
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext
  const offline = new OfflineCtx(1, length, sampleRate)
  const t0 = 0

  const master = offline.createGain()
  master.gain.value = 0.9
  master.connect(offline.destination)

  // High small-orin body with long metallic tail
  const f0 = 1680

  // Bowl-like inharmonic partials — longer decays for lingering チーン
  const partials: Array<{ ratio: number; amp: number; decay: number; beat: number }> = [
    { ratio: 1.0, amp: 0.4, decay: 6.8, beat: 0.55 },
    { ratio: 1.0, amp: 0.26, decay: 6.5, beat: -0.75 }, // detuned pair / shimmer
    { ratio: 2.76, amp: 0.24, decay: 5.4, beat: 0.9 },
    { ratio: 4.54, amp: 0.15, decay: 4.2, beat: -0.5 },
    { ratio: 6.27, amp: 0.1, decay: 3.2, beat: 0.65 },
    { ratio: 8.12, amp: 0.065, decay: 2.4, beat: -0.95 },
    { ratio: 10.4, amp: 0.04, decay: 1.7, beat: 0.4 },
    { ratio: 13.1, amp: 0.025, decay: 1.15, beat: -0.55 },
  ]

  for (const p of partials) {
    const osc = offline.createOscillator()
    const gain = offline.createGain()
    const filter = offline.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(f0 * p.ratio, t0)
    filter.Q.value = 9

    osc.type = 'sine'
    const freq = f0 * p.ratio + p.beat
    osc.frequency.setValueAtTime(freq, t0)
    // Tiny pitch sag after strike
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.993), t0 + p.decay)

    gain.gain.setValueAtTime(0.00001, t0)
    gain.gain.linearRampToValueAtTime(p.amp, t0 + 0.008)
    // Gentle early drop, then very long metallic tail
    gain.gain.linearRampToValueAtTime(p.amp * 0.62, t0 + 0.18)
    gain.gain.linearRampToValueAtTime(p.amp * 0.28, t0 + p.decay * 0.45)
    gain.gain.exponentialRampToValueAtTime(0.00001, t0 + p.decay)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + p.decay + 0.08)
  }

  // Bright sparkle layer (very high, short)
  for (const hz of [5200, 7400, 9800]) {
    const osc = offline.createOscillator()
    const gain = offline.createGain()
    osc.type = 'sine'
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.00001, t0)
    gain.gain.linearRampToValueAtTime(0.045, t0 + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.00001, t0 + 0.22)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + 0.25)
  }

  // Wood-mallet transient: short filtered noise burst
  const n = Math.floor(sampleRate * 0.04)
  const noiseBuf = offline.createBuffer(1, n, sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const env = (1 - i / n) ** 2.2
    data[i] = (Math.random() * 2 - 1) * env
  }
  const noise = offline.createBufferSource()
  noise.buffer = noiseBuf
  const hp = offline.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1800
  const bp = offline.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3200
  bp.Q.value = 1.2
  const noiseGain = offline.createGain()
  noiseGain.gain.setValueAtTime(0.00001, t0)
  noiseGain.gain.linearRampToValueAtTime(0.28, t0 + 0.002)
  noiseGain.gain.exponentialRampToValueAtTime(0.00001, t0 + 0.045)
  noise.connect(hp)
  hp.connect(bp)
  bp.connect(noiseGain)
  noiseGain.connect(master)
  noise.start(t0)

  // Soft body "air" after strike
  const airN = Math.floor(sampleRate * 0.35)
  const airBuf = offline.createBuffer(1, airN, sampleRate)
  const airData = airBuf.getChannelData(0)
  for (let i = 0; i < airN; i++) {
    airData[i] = (Math.random() * 2 - 1) * (1 - i / airN) ** 1.4
  }
  const air = offline.createBufferSource()
  air.buffer = airBuf
  const airFilter = offline.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.value = 4500
  airFilter.Q.value = 0.6
  const airGain = offline.createGain()
  airGain.gain.setValueAtTime(0.00001, t0)
  airGain.gain.linearRampToValueAtTime(0.06, t0 + 0.02)
  airGain.gain.exponentialRampToValueAtTime(0.00001, t0 + 0.35)
  air.connect(airFilter)
  airFilter.connect(airGain)
  airGain.connect(master)
  air.start(t0)

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
      await new Promise<void>((resolve) => {
        const done = () => {
          el.removeEventListener('canplaythrough', done)
          resolve()
        }
        el.addEventListener('canplaythrough', done)
        el.load()
        window.setTimeout(done, 1000)
      })
      audioEl = el
    })()
  }
  await preparing
  if (!audioEl) throw new Error('orin audio missing')
  return audioEl
}

export async function unlockAudio(): Promise<void> {
  const el = await ensureAudioElement()
  try {
    el.muted = true
    el.volume = 0
    el.currentTime = 0
    await el.play()
    el.pause()
    el.currentTime = 0
  } catch {
    /* ignore */
  } finally {
    el.muted = false
    el.volume = 1
  }
  unlocked = true
}

export async function playOrin(): Promise<void> {
  const el = await ensureAudioElement()
  if (!unlocked) await unlockAudio()
  el.pause()
  el.currentTime = 0
  el.muted = false
  el.volume = 1
  try {
    await el.play()
  } catch {
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
