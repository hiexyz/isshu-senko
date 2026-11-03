/** Soft orin (temple bell) chime via Web Audio. */

let sharedCtx: AudioContext | null = null
let unlocked = false

function getCtx(): AudioContext {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx()
    unlocked = false
  }
  return sharedCtx
}

/** Call from a user gesture so later chimes can play (esp. iOS/Safari). */
export async function unlockAudio(): Promise<void> {
  const ctx = getCtx()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      /* ignore */
    }
  }
  if (unlocked) return

  // Silent blip unlocks the audio pipeline on mobile browsers
  const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  src.start(0)
  unlocked = true
}

function rampGain(gain: AudioParam, from: number, peak: number, end: number, now: number, dur: number): void {
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(Math.max(from, 0.00001), now)
  gain.linearRampToValueAtTime(peak, now + 0.02)
  gain.linearRampToValueAtTime(Math.max(end, 0.00001), now + dur)
}

/** Strike a small orin — clear 「チーン」. */
export async function playOrin(): Promise<void> {
  await unlockAudio()
  const ctx = getCtx()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }

  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.85
  master.connect(ctx.destination)

  const fundamental = 830
  const partials: Array<{ ratio: number; amp: number; decay: number }> = [
    { ratio: 1, amp: 0.7, decay: 3.6 },
    { ratio: 2.01, amp: 0.28, decay: 2.6 },
    { ratio: 2.76, amp: 0.22, decay: 2.9 },
    { ratio: 4.1, amp: 0.12, decay: 1.8 },
    { ratio: 5.45, amp: 0.07, decay: 1.3 },
  ]

  for (const p of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(fundamental * p.ratio, now)
    osc.frequency.linearRampToValueAtTime(fundamental * p.ratio * 0.995, now + p.decay)
    rampGain(gain.gain, 0.00001, p.amp, 0.00001, now, p.decay)
    osc.connect(gain)
    gain.connect(master)
    osc.start(now)
    osc.stop(now + p.decay + 0.1)
  }

  // Soft mallet tap
  const n = Math.floor(ctx.sampleRate * 0.025)
  const noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2
  }
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuf
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2400
  filter.Q.value = 0.9
  const noiseGain = ctx.createGain()
  rampGain(noiseGain.gain, 0.00001, 0.2, 0.00001, now, 0.05)
  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(master)
  noise.start(now)
}
