export { default as PremiumTree } from './PremiumTree'
export { PREMIUM_TREE_CATALOG, getPremiumTree } from './treeCatalog'
export type {
  PremiumTreeProps,
  PremiumTreeState,
  PremiumTreeType,
} from './types'

import type { PremiumTreeType } from './types'
export const PREMIUM_TREE_IDS: Set<PremiumTreeType> = new Set(['sakura', 'maple', 'willow', 'baobab', 'crystal'])
