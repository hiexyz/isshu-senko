/** Microphone breath / blow detector via Web Audio API. */

export type BreathSample = {
  /** 0..1 smoothed intensity suitable for wind */
  level: number
  /** True when a clear blow is detected above ambient */
  blowing: boolean
  active: boolean
}

export class BreathSensor {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private data: Uint8Array<ArrayBuffer> | null = null
  private freq: Float32Array<ArrayBuffer> | null = null
  private running = false
  private smoothed = 0
  private baseline = 0.02
  private baselineFrames = 0

  isActive(): boolean {
    return this.running
  }

  async start(): Promise<void> {
    if (this.running) return
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('このブラウザではマイクが使えません')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.35
    // Soft boost so quiet phone mics still register a gentle breath
    const gain = ctx.createGain()
    gain.gain.value = 2.4
    source.connect(gain)
    gain.connect(analyser)

    this.stream = stream
    this.ctx = ctx
    this.analyser = analyser
    this.data = new Uint8Array(new ArrayBuffer(analyser.fftSize))
    this.freq = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4))
    this.running = true
    this.smoothed = 0
    this.baseline = 0.02
    this.baselineFrames = 0

    if (ctx.state === 'suspended') await ctx.resume()
  }

  stop(): void {
    this.running = false
    this.smoothed = 0
    this.analyser?.disconnect()
    void this.ctx?.close()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.ctx = null
    this.analyser = null
    this.data = null
    this.freq = null
  }

  /** Call once per animation frame. */
  sample(): BreathSample {
    if (!this.running || !this.analyser || !this.data || !this.freq) {
      return { level: 0, blowing: false, active: false }
    }

    const analyser = this.analyser
    // Time-domain RMS (overall loudness)
    analyser.getByteTimeDomainData(this.data)
    let sum = 0
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i]! - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / this.data.length)

    // Frequency: blowing is broadband / high-band noisy vs speech
    analyser.getFloatFrequencyData(this.freq)
    const binHz = (this.ctx?.sampleRate ?? 44100) / analyser.fftSize
    let high = 0
    let highN = 0
    let mid = 0
    let midN = 0
    for (let i = 0; i < this.freq.length; i++) {
      const hz = i * binHz
      const db = this.freq[i]!
      const lin = Math.pow(10, db / 20)
      if (hz >= 800 && hz <= 6000) {
        high += lin
        highN++
      } else if (hz >= 200 && hz < 800) {
        mid += lin
        midN++
      }
    }
    const highAvg = highN ? high / highN : 0
    const midAvg = midN ? mid / midN : 0
    // Blow tends to elevate high band relative to mid (speech)
    const blowShape = highAvg / (midAvg + 1e-6)

    // Combine RMS with high-band energy (high sensitivity for soft breaths)
    const raw = Math.min(1, rms * 9.5 + highAvg * 36)
    const shaped = raw * (0.75 + Math.min(1.6, blowShape) * 0.4)

    // Learn quiet baseline briefly, then only drift downward slowly
    // so ambient noise doesn't raise the gate too high
    if (this.baselineFrames < 60) {
      this.baseline += (shaped - this.baseline) * 0.12
      this.baselineFrames++
    } else if (shaped < this.baseline) {
      this.baseline += (shaped - this.baseline) * 0.04
    } else {
      this.baseline += (shaped - this.baseline) * 0.002
    }

    const excess = Math.max(0, shaped - this.baseline * 1.08 - 0.004)
    // Concave curve: small excess → noticeable level
    const gated = Math.min(1, Math.pow(excess * 7.5, 0.72))

    // Attack very fast / release a bit slower
    const attack = gated > this.smoothed ? 0.62 : 0.16
    this.smoothed += (gated - this.smoothed) * attack

    // Extra perceptual boost on the output level
    const level = Math.min(1, Math.pow(this.smoothed, 0.78) * 1.35)

    return {
      level,
      blowing: level > 0.03,
      active: true,
    }
  }
}
