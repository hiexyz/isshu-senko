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
    analyser.smoothingTimeConstant = 0.55
    source.connect(analyser)

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

    // Combine RMS with high-band energy
    const raw = Math.min(1, rms * 4.2 + highAvg * 18)
    const shaped = raw * (0.65 + Math.min(1.4, blowShape) * 0.35)

    // Learn quiet baseline for first ~1.5s then slowly track
    if (this.baselineFrames < 90) {
      this.baseline += (shaped - this.baseline) * 0.08
      this.baselineFrames++
    } else {
      this.baseline += (Math.min(shaped, this.baseline) - this.baseline) * 0.01
    }

    const excess = Math.max(0, shaped - this.baseline * 1.35 - 0.015)
    const gated = Math.min(1, Math.pow(excess * 3.2, 1.15))

    // Attack fast / release medium — feels like a breath
    const attack = gated > this.smoothed ? 0.45 : 0.12
    this.smoothed += (gated - this.smoothed) * attack

    return {
      level: this.smoothed,
      blowing: this.smoothed > 0.08,
      active: true,
    }
  }
}
