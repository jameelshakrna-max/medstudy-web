import type { CSSProperties } from 'react'

export type PremiumTreeType =
  | 'sakura'
  | 'willow'
  | 'maple'
  | 'baobab'
  | 'crystal'

export type PremiumTreeState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'success'
  | 'failed'

export interface PremiumTreeGrowth {
  seed: number
  roots: number
  trunk: number
  branches: number
  canopyBack: number
  canopyMid: number
  canopyFront: number
  details: number
  particles: number
  glow: number
}

export interface SpeciesProps {
  uid: string
  growth: PremiumTreeGrowth
  windActive: boolean
  preview: boolean
  state: PremiumTreeState
}

export interface PremiumTreeProps {
  treeType: PremiumTreeType
  progress: number
  state?: PremiumTreeState
  className?: string
  size?: number | string
  preview?: boolean
  wind?: boolean
  windSeed?: string | number
  ariaLabel?: string
  style?: CSSProperties
}
