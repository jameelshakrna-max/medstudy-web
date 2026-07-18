// ═══════════════════════════════════════════════════
//  TREE DEFINITIONS
//  10 trees: 2 free, 6 unlockable, 2 achievement
// ═══════════════════════════════════════════════════

export const GROWTH_STAGES = [
  { threshold: 0.00, label: 'seed' },
  { threshold: 0.05, label: 'sprout' },
  { threshold: 0.12, label: 'stem' },
  { threshold: 0.25, label: 'branches' },
  { threshold: 0.40, label: 'smallCanopy' },
  { threshold: 0.60, label: 'largeCanopy' },
  { threshold: 0.80, label: 'full' },
]

export function getGrowthStage(progress) {
  let stage = 0
  for (let i = GROWTH_STAGES.length - 1; i >= 0; i--) {
    if (progress >= GROWTH_STAGES[i].threshold) {
      stage = i
      break
    }
  }
  const stageProgress = stage < GROWTH_STAGES.length - 1
    ? (progress - GROWTH_STAGES[stage].threshold) /
      (GROWTH_STAGES[stage + 1].threshold - GROWTH_STAGES[stage].threshold)
    : 1
  return { stage, stageProgress: Math.min(1, Math.max(0, stageProgress)), label: GROWTH_STAGES[stage].label }
}

function lerp(a, b, t) { return a + (b - a) * t }

export function getTreeTransforms(progress) {
  const { stage, stageProgress } = getGrowthStage(progress)

  const trunkHeight = stage === 0 ? lerp(0, 4, stageProgress)
    : stage === 1 ? lerp(4, 12, stageProgress)
    : stage === 2 ? lerp(12, 20, stageProgress)
    : stage === 3 ? lerp(20, 26, stageProgress)
    : lerp(26, 30, Math.min(1, (stage - 3) / 3 + stageProgress / 3))

  const trunkWidth = stage === 0 ? lerp(2, 3, stageProgress) : lerp(3, 5, Math.min(1, stage / 5))

  const stemHeight = stage >= 1 ? lerp(0, 16, Math.min(1, (stage - 1 + stageProgress) / 4)) : 0

  const branchSpread = stage >= 3 ? lerp(0, 1, Math.min(1, (stage - 3 + stageProgress) / 2)) : 0

  const canopy1Opacity = stage >= 4 ? lerp(0, 0.35, stage === 4 ? stageProgress : 1) : 0
  const canopy2Opacity = stage >= 4 ? lerp(0, 0.5, stage === 4 ? stageProgress : 1) : 0
  const canopy3Opacity = stage >= 4 ? lerp(0, 0.65, stage === 4 ? stageProgress : 1) : 0

  const canopy1Scale = stage >= 4 ? lerp(0.3, 1.4, stage === 4 ? stageProgress : 1) : 0
  const canopy2Scale = stage >= 4 ? lerp(0.3, 1.2, stage === 4 ? stageProgress : 1) : 0
  const canopy3Scale = stage >= 4 ? lerp(0.3, 1.0, stage === 4 ? stageProgress : 1) : 0

  const flowerOpacity = stage >= 5 ? lerp(0, 0.9, Math.min(1, (stage - 5 + stageProgress) / 1.5)) : 0
  const particleOpacity = stage >= 6 ? lerp(0, 1, stageProgress) : 0

  return {
    trunkHeight, trunkWidth, stemHeight, branchSpread,
    canopy1Opacity, canopy2Opacity, canopy3Opacity,
    canopy1Scale, canopy2Scale, canopy3Scale,
    flowerOpacity, particleOpacity,
  }
}

// ═══════════════════════════════════════════════════
//  TREE DEFINITIONS
// ═══════════════════════════════════════════════════

export const TREES = [
  // ── FREE ──
  {
    id: 'oak',
    name: 'Oak',
    description: 'A sturdy classic',
    unlockType: 'free',
    price: 0,
    subjectAffinity: null,
    colors: {
      trunk: '#8B6914',
      trunkDark: '#6B4F10',
      canopy1: 'rgba(16,185,129,0.25)',
      canopy2: 'rgba(16,185,129,0.45)',
      canopy3: 'rgba(16,185,129,0.65)',
      canopyShadow: 'rgba(6,95,70,0.3)',
      stem: '#4D7C0F',
      flower: 'rgba(253,224,71,0.7)',
      leaf: 'rgba(16,185,129,0.6)',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Cherry blossom',
    unlockType: 'free',
    price: 0,
    subjectAffinity: ['self_assessment', 'mixed'],
    colors: {
      trunk: '#92400E',
      trunkDark: '#78350F',
      canopy1: 'rgba(236,72,153,0.2)',
      canopy2: 'rgba(244,114,182,0.4)',
      canopy3: 'rgba(251,207,232,0.6)',
      canopyShadow: 'rgba(157,23,77,0.25)',
      stem: '#BE185D',
      flower: 'rgba(252,231,243,0.85)',
      leaf: 'rgba(236,72,153,0.5)',
    },
  },

  // ── UNLOCKABLE (coins) ──
  {
    id: 'pine',
    name: 'Pine',
    description: 'Tall and sharp',
    unlockType: 'coins',
    price: 500,
    subjectAffinity: ['surgery', 'emergency'],
    colors: {
      trunk: '#713F12',
      trunkDark: '#422006',
      canopy1: 'rgba(22,101,52,0.3)',
      canopy2: 'rgba(22,101,52,0.5)',
      canopy3: 'rgba(22,101,52,0.7)',
      canopyShadow: 'rgba(5,46,22,0.4)',
      stem: '#166534',
      flower: 'rgba(134,239,172,0.5)',
      leaf: 'rgba(22,101,52,0.6)',
    },
  },
  {
    id: 'maple',
    name: 'Maple',
    description: 'Autumn fire',
    unlockType: 'coins',
    price: 750,
    subjectAffinity: ['neurology', 'psychiatry'],
    colors: {
      trunk: '#7C2D12',
      trunkDark: '#5C1A06',
      canopy1: 'rgba(234,88,12,0.25)',
      canopy2: 'rgba(249,115,22,0.45)',
      canopy3: 'rgba(251,146,60,0.65)',
      canopyShadow: 'rgba(154,52,18,0.3)',
      stem: '#C2410C',
      flower: 'rgba(254,215,170,0.7)',
      leaf: 'rgba(234,88,12,0.55)',
    },
  },
  {
    id: 'bamboo',
    name: 'Bamboo',
    description: 'Elegant and resilient',
    unlockType: 'coins',
    price: 1000,
    subjectAffinity: ['pediatrics'],
    colors: {
      trunk: '#4D7C0F',
      trunkDark: '#3F6212',
      canopy1: 'rgba(74,222,128,0.2)',
      canopy2: 'rgba(74,222,128,0.4)',
      canopy3: 'rgba(74,222,128,0.6)',
      canopyShadow: 'rgba(22,101,52,0.25)',
      stem: '#15803D',
      flower: 'rgba(187,247,208,0.7)',
      leaf: 'rgba(74,222,128,0.5)',
    },
  },
  {
    id: 'willow',
    name: 'Willow',
    description: 'Graceful and flowing',
    unlockType: 'coins',
    price: 1250,
    subjectAffinity: ['rheumatology', 'dermatology'],
    colors: {
      trunk: '#78716C',
      trunkDark: '#57534E',
      canopy1: 'rgba(163,163,163,0.2)',
      canopy2: 'rgba(163,163,163,0.38)',
      canopy3: 'rgba(214,211,209,0.55)',
      canopyShadow: 'rgba(87,83,78,0.25)',
      stem: '#78716C',
      flower: 'rgba(245,245,244,0.6)',
      leaf: 'rgba(163,163,163,0.45)',
    },
  },
  {
    id: 'baobab',
    name: 'Baobab',
    description: 'Ancient giant',
    unlockType: 'coins',
    price: 1500,
    subjectAffinity: ['cardiology', 'emergency'],
    colors: {
      trunk: '#92400E',
      trunkDark: '#78350F',
      canopy1: 'rgba(217,119,6,0.2)',
      canopy2: 'rgba(245,158,11,0.4)',
      canopy3: 'rgba(252,211,77,0.55)',
      canopyShadow: 'rgba(146,64,14,0.3)',
      stem: '#B45309',
      flower: 'rgba(254,240,138,0.7)',
      leaf: 'rgba(217,119,6,0.5)',
    },
  },
  {
    id: 'eucalyptus',
    name: 'Eucalyptus',
    description: 'Colorful bark, healing air',
    unlockType: 'coins',
    price: 2000,
    subjectAffinity: ['respiratory', 'infectious'],
    colors: {
      trunk: '#6D28D9',
      trunkDark: '#5B21B6',
      canopy1: 'rgba(139,92,246,0.2)',
      canopy2: 'rgba(139,92,246,0.38)',
      canopy3: 'rgba(167,139,250,0.55)',
      canopyShadow: 'rgba(91,33,182,0.25)',
      stem: '#7C3AED',
      flower: 'rgba(196,181,253,0.7)',
      leaf: 'rgba(139,92,246,0.45)',
    },
  },

  // ── ACHIEVEMENT ──
  {
    id: 'crystal',
    name: 'Crystal Tree',
    description: '100 focus hours',
    unlockType: 'achievement',
    price: 0,
    achievement: '100_focus_hours',
    subjectAffinity: null,
    colors: {
      trunk: '#0E7490',
      trunkDark: '#155E75',
      canopy1: 'rgba(34,211,238,0.2)',
      canopy2: 'rgba(34,211,238,0.4)',
      canopy3: 'rgba(103,232,249,0.55)',
      canopyShadow: 'rgba(14,116,144,0.3)',
      stem: '#0891B2',
      flower: 'rgba(165,243,252,0.8)',
      leaf: 'rgba(34,211,238,0.5)',
    },
  },
  {
    id: 'cosmic',
    name: 'Cosmic Pine',
    description: '365-day streak',
    unlockType: 'achievement',
    price: 0,
    achievement: '365_day_streak',
    subjectAffinity: null,
    colors: {
      trunk: '#312E81',
      trunkDark: '#1E1B4B',
      canopy1: 'rgba(99,102,241,0.25)',
      canopy2: 'rgba(129,140,248,0.45)',
      canopy3: 'rgba(165,180,252,0.6)',
      canopyShadow: 'rgba(49,46,129,0.35)',
      stem: '#4F46E5',
      flower: 'rgba(199,210,254,0.8)',
      leaf: 'rgba(99,102,241,0.5)',
    },
  },
]

export function getTreeById(id) {
  return TREES.find(t => t.id === id) || TREES[0]
}

// Apply subject color tint to a tree's colors
export function getTreeColors(tree, subjectColor) {
  if (!subjectColor) return tree.colors
  return { ...tree.colors, _accent: subjectColor }
}
