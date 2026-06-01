'use client'

// SoundEngine — Tone.js + Web Audio API
// Dynamically imports Tone.js to avoid SSR issues.

type ToneModule = typeof import('tone')

let tonePromise: Promise<ToneModule> | null = null

function getTone(): Promise<ToneModule> {
  if (!tonePromise) {
    tonePromise = import('tone')
  }
  return tonePromise
}

export class SoundEngine {
  private muted: boolean = true
  private masterVolume: number = 0.2
  private audioCtx: AudioContext | null = null

  // ─── Init ────────────────────────────────────────────────────────────────

  init(): void {
    if (typeof window === 'undefined') return
    const savedMuted = localStorage.getItem('pt_muted')
    const savedVol = localStorage.getItem('pt_volume')
    this.muted = savedMuted === null ? true : savedMuted === 'true'
    this.masterVolume = savedVol !== null ? parseFloat(savedVol) : 0.2
  }

  // ─── AudioContext ────────────────────────────────────────────────────────

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext()
    }
    // Resume if suspended (browser autoplay policy)
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume()
    }
    return this.audioCtx
  }

  // ─── Low-level Web Audio helper ───────────────────────────────────────────

  private playSine(
    freq: number,
    durationMs: number,
    volumeScale = 1,
    freqEnd?: number,
  ): void {
    if (this.muted) return
    try {
      const ctx = this.getAudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      if (freqEnd !== undefined) {
        osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + durationMs / 1000)
      }

      const vol = this.masterVolume * volumeScale
      gain.gain.setValueAtTime(vol, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + durationMs / 1000 + 0.01)
    } catch {
      // ignore audio errors
    }
  }

  private playNoise(durationMs: number, freqStart: number, freqEnd: number): void {
    if (this.muted) return
    try {
      const ctx = this.getAudioCtx()
      const bufferSize = Math.ceil(ctx.sampleRate * (durationMs / 1000))
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(freqStart, ctx.currentTime)
      filter.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + durationMs / 1000)
      filter.Q.value = 1.5

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(this.masterVolume * 0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      source.start(ctx.currentTime)
      source.stop(ctx.currentTime + durationMs / 1000 + 0.05)
    } catch {
      // ignore
    }
  }

  // ─── Sound effects ────────────────────────────────────────────────────────

  playPixelTick(): void {
    this.playSine(800, 50)
  }

  playFillWhoosh(): void {
    this.playNoise(200, 2000, 400)
  }

  playCollaboratorJoin(): void {
    if (this.muted) return
    void getTone().then((Tone) => {
      try {
        const synth = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
          volume: Tone.gainToDb(this.masterVolume),
        }).toDestination()

        const now = Tone.now()
        synth.triggerAttackRelease('C5', '8n', now)
        synth.triggerAttackRelease('E5', '8n', now + 0.12)
        synth.triggerAttackRelease('G5', '8n', now + 0.24)

        setTimeout(() => synth.dispose(), 1500)
      } catch {
        // ignore
      }
    })
  }

  playCollaboratorLeave(): void {
    if (this.muted) return
    void getTone().then((Tone) => {
      try {
        const synth = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.6 },
          volume: Tone.gainToDb(this.masterVolume * 0.7),
        }).toDestination()

        const now = Tone.now()
        synth.triggerAttackRelease('G5', '8n', now)
        synth.triggerAttackRelease('E5', '8n', now + 0.12)
        synth.triggerAttackRelease('C5', '8n', now + 0.24)

        setTimeout(() => synth.dispose(), 1500)
      } catch {
        // ignore
      }
    })
  }

  playUndo(): void {
    this.playSine(600, 150, 1, 300)
  }

  playChallengeSubmit(): void {
    if (this.muted) return
    void getTone().then((Tone) => {
      try {
        const synth = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.08, sustain: 0.4, release: 0.4 },
          volume: Tone.gainToDb(this.masterVolume),
        }).toDestination()

        const notes = ['C5', 'E5', 'G5', 'B5', 'C6'] as const
        const now = Tone.now()
        notes.forEach((note, i) => {
          synth.triggerAttackRelease(note, '8n', now + i * 0.08)
        })

        setTimeout(() => synth.dispose(), 2000)
      } catch {
        // ignore
      }
    })
  }

  playUpvote(): void {
    this.playSine(1200, 80, 0.6)
  }

  // ─── Background music (Tone.js procedural) ──────────────────────────────

  private loopRef: import('tone').Loop | null = null
  private synthRef: import('tone').PolySynth | null = null

  startMusic(): void {
    if (this.muted) return
    void getTone().then((Tone) => {
      try {
        if (this.loopRef) return

        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 1.2 },
          volume: Tone.gainToDb(this.masterVolume * 0.4),
        }).toDestination()

        this.synthRef = synth

        // I-V-vi-IV loop in C major (C-G-Am-F), 80 BPM
        Tone.Transport.bpm.value = 80
        const progression = [
          ['C4', 'E4', 'G4'],
          ['G3', 'B3', 'D4'],
          ['A3', 'C4', 'E4'],
          ['F3', 'A3', 'C4'],
        ]
        let idx = 0

        const loop = new Tone.Loop((time) => {
          const chord = progression[idx % progression.length]
          synth.triggerAttackRelease(chord, '2n', time)
          idx++
        }, '2n')

        this.loopRef = loop
        loop.start(0)
        void Tone.Transport.start()
      } catch {
        // ignore
      }
    })
  }

  stopMusic(): void {
    void getTone().then((Tone) => {
      try {
        if (this.loopRef) {
          this.loopRef.stop()
          this.loopRef.dispose()
          this.loopRef = null
        }
        if (this.synthRef) {
          this.synthRef.dispose()
          this.synthRef = null
        }
        Tone.Transport.stop()
      } catch {
        // ignore
      }
    })
  }

  // ─── Control ──────────────────────────────────────────────────────────────

  setMuted(muted: boolean): void {
    this.muted = muted
    if (typeof window !== 'undefined') {
      localStorage.setItem('pt_muted', String(muted))
    }
    if (muted) this.stopMusic()
  }

  isMuted(): boolean {
    return this.muted
  }

  setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v))
    if (typeof window !== 'undefined') {
      localStorage.setItem('pt_volume', String(this.masterVolume))
    }
  }
}

export const soundEngine = new SoundEngine()
