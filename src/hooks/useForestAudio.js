import { useRef, useCallback } from 'react'

let audioCtx = null

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

export function useForestAudio() {
  const lastSnapRef = useRef(0)

  const playSnap = useCallback(() => {
    const now = Date.now()
    if (now - lastSnapRef.current < 30) return
    lastSnapRef.current = now
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, t)
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.02)
      gain.gain.setValueAtTime(0.08, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.04)
    } catch (_) {}
  }, [])

  const playBloom = useCallback(() => {
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      const freqs = [523.25, 659.25, 783.99]
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, t + i * 0.12)
        gain.gain.linearRampToValueAtTime(0.2, t + i * 0.12 + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t + i * 0.12)
        osc.stop(t + i * 0.12 + 0.6)
      })
      // Second pass softer
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, t + 0.4 + i * 0.12)
        gain.gain.linearRampToValueAtTime(0.1, t + 0.4 + i * 0.12 + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4 + i * 0.12 + 0.4)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t + 0.4 + i * 0.12)
        osc.stop(t + 0.4 + i * 0.12 + 0.5)
      })
    } catch (_) {}
  }, [])

  const playWilt = useCallback(() => {
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(400, t)
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.4)
      gain.gain.setValueAtTime(0.15, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.6)
    } catch (_) {}
  }, [])

  const playStart = useCallback(() => {
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(300, t)
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.15)
      gain.gain.setValueAtTime(0.1, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.25)
    } catch (_) {}
  }, [])

  return { playSnap, playBloom, playWilt, playStart }
}
