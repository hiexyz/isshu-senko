/** Soft orin (temple bell) chime via Web Audio — no sample files. */

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx()
  }
  return sharedCtx
}

/** Strike a small orin — clear 「チーン」 with long decay. */
export async function playOrin(): Promise<void> {
  const ctx = getCtx()
  if (ctx.state === 'suspended') await ctx.resume()

  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.55, now + 0.012)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 4.8)
  master.connect(ctx.destination)

  // Partial ratios inspired by small bronze bowls
  const partials: Array<{ ratio: number; amp: number; decay: number }> = [
    { ratio: 1, amp: 0.55, decay: 4.2 },
    { ratio: 2.0, amp: 0.22, decay: 3.0 },
    { ratio: 2.76, amp: 0.18, decay: 3.4 },
    { ratio: 4.07, amp: 0.1, decay: 2.2 },
    { ratio: 5.4, amp: 0.06, decay: 1.6 },
    { ratio: 6.75, amp: 0.035, decay: 1.2 },
  ]

  const fundamental = 784 // ~G5 — bright small orin

  for (const p of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(fundamental * p.ratio, now)
    // Slight pitch drop as metal settles
    osc.frequency.exponentialRampToValueAtTime(fundamental * p.ratio * 0.997, now + p.decay)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(p.amp, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay)

    osc.connect(gain)
    gain.connect(master)
    osc.start(now)
    osc.stop(now + p.decay + 0.05)
  }

  // Soft attack noise click (mallet tap)
  const bufferSize = Math.floor(ctx.sampleRate * 0.03)
  const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3)
  }
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuf
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 2200
  noiseFilter.Q.value = 0.8
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.12, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(master)
  noise.start(now)
}
