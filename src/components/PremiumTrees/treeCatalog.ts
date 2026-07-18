import type { PremiumTreeType } from './types'

export interface PremiumTreeCatalogItem {
  id: PremiumTreeType
  name: string
  price: number
  rarity: 'rare' | 'epic' | 'legendary'
  description: string
  accent: string
  sellingPoint: string
}

export const PREMIUM_TREE_CATALOG: PremiumTreeCatalogItem[] = [
  {
    id: 'sakura',
    name: 'Eternal Sakura',
    price: 450,
    rarity: 'rare',
    description: 'A layered cherry blossom tree with drifting petals and soft spring light.',
    accent: '#F48FB1',
    sellingPoint: 'Most elegant and calming',
  },
  {
    id: 'maple',
    name: 'Crimson Crown Maple',
    price: 700,
    rarity: 'rare',
    description: 'A broad autumn maple with red, amber, and gold leaf clusters.',
    accent: '#F97316',
    sellingPoint: 'Strong seasonal identity',
  },
  {
    id: 'willow',
    name: 'Moonveil Willow',
    price: 950,
    rarity: 'epic',
    description: 'A luminous weeping willow with long hanging fronds and moonlit particles.',
    accent: '#5EEAD4',
    sellingPoint: 'Most distinctive wind animation',
  },
  {
    id: 'baobab',
    name: 'Ancient Baobab',
    price: 1300,
    rarity: 'epic',
    description: 'A monumental old-world tree with a sculpted trunk and umbrella canopy.',
    accent: '#D4A373',
    sellingPoint: 'Feels powerful and prestigious',
  },
  {
    id: 'crystal',
    name: 'Crystal Wisteria',
    price: 2000,
    rarity: 'legendary',
    description: 'A fantasy wisteria with a crystal trunk, hanging violet blooms, and star dust.',
    accent: '#C084FC',
    sellingPoint: 'Premium end-game collectible',
  },
]

export function getPremiumTree(treeType: PremiumTreeType) {
  return PREMIUM_TREE_CATALOG.find((tree) => tree.id === treeType) ?? PREMIUM_TREE_CATALOG[0]
}
