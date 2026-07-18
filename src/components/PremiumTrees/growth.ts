import type { PremiumTreeGrowth } from './types'

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function segment(progress: number, start: number, end: number): number {
  if (end <= start) return progress >= end ? 1 : 0
  return clamp01((progress - start) / (end - start))
}

export function getPremiumGrowth(progress: number): PremiumTreeGrowth {
  const p = clamp01(progress)

  return {
    seed: 1 - segment(p, 0.06, 0.17),
    roots: segment(p, 0.02, 0.2),
    trunk: segment(p, 0.08, 0.38),
    branches: segment(p, 0.24, 0.56),
    canopyBack: segment(p, 0.4, 0.68),
    canopyMid: segment(p, 0.52, 0.8),
    canopyFront: segment(p, 0.64, 0.92),
    details: segment(p, 0.76, 0.98),
    particles: segment(p, 0.82, 1),
    glow: segment(p, 0.55, 1),
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function windVariables(seedValue: string | number) {
  const random = mulberry32(hashString(String(seedValue)))

  return {
    duration: `${5.8 + random() * 3.4}s`,
    delay: `${-random() * 7}s`,
    angle: `${0.55 + random() * 0.85}deg`,
    distance: `${0.7 + random() * 1.3}px`,
  }
}
