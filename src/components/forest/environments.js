export const ENVIRONMENTS = {
  meadow: {
    sky: 'linear-gradient(180deg, #7EC8E3 0%, #B4D8E8 35%, #D4EDDA 70%, #E8F5E9 100%)',
    skyNight: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 35%, #0f3460 70%, #1a3a2a 100%)',
    hills: { fill: '#5B8C5A', opacity: 0.6 },
    hillsFar: { fill: '#7BAF7A', opacity: 0.35 },
    ground: '#4CAF50',
    groundDark: '#388E3C',
    mist: 'rgba(255,255,255,0.25)',
    mistSpeed: 80,
    grass: '#5DAA5D',
    grassDark: '#3D8B3D',
    flowerColors: ['#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'],
    particles: ['pollen', 'leaves'],
    features: { flowers: true, rocks: true, path: true, reeds: false },
  },
  woodland: {
    sky: 'linear-gradient(180deg, #4A7C59 0%, #6B9F78 30%, #8FBC8F 60%, #C8DFC0 100%)',
    skyNight: 'linear-gradient(180deg, #0d1117 0%, #161b22 30%, #1a3a2a 60%, #0d2818 100%)',
    hills: { fill: '#3E6B48', opacity: 0.7 },
    hillsFar: { fill: '#5A8A60', opacity: 0.4 },
    ground: '#2E7D32',
    groundDark: '#1B5E20',
    mist: 'rgba(200,230,200,0.35)',
    mistSpeed: 100,
    grass: '#4A8B4A',
    grassDark: '#2D6B2D',
    flowerColors: ['#E8E0D0', '#D4C8B0', '#C0B898', '#A8D8A0'],
    particles: ['leaves', 'fireflies'],
    features: { flowers: true, rocks: true, path: true, reeds: false },
  },
  lake: {
    sky: 'linear-gradient(180deg, #87CEEB 0%, #B0D4E8 40%, #D0E8F0 70%, #E0F0F8 100%)',
    hills: { fill: '#5A8A60', opacity: 0.5 },
    hillsFar: { fill: '#7BAF7A', opacity: 0.3 },
    ground: '#3A7D44',
    groundDark: '#2A5D34',
    mist: 'rgba(200,220,240,0.3)',
    mistSpeed: 90,
    grass: '#4A9A5A',
    grassDark: '#3A7A4A',
    flowerColors: ['#87CEEB', '#ADD8E6', '#E0E8F0'],
    particles: ['pollen'],
    features: { flowers: false, rocks: true, path: false, reeds: true },
  },
  enchanted: {
    sky: 'linear-gradient(180deg, #2D1B4E 0%, #4A2D7A 30%, #6B3FA0 60%, #8B5EC0 100%)',
    hills: { fill: '#3A2D5E', opacity: 0.7 },
    hillsFar: { fill: '#5A4D7E', opacity: 0.4 },
    ground: '#2A3D4E',
    groundDark: '#1A2D3E',
    mist: 'rgba(180,160,255,0.3)',
    mistSpeed: 120,
    grass: '#4A6A7A',
    grassDark: '#3A5A6A',
    flowerColors: ['#C8A8FF', '#A888FF', '#8868FF', '#E0C0FF'],
    particles: ['fireflies', 'pollen'],
    features: { flowers: true, rocks: true, path: true, reeds: false },
  },
  celestial: {
    sky: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 30%, #2a2a5a 60%, #1a2a4a 100%)',
    hills: { fill: '#1a1a3a', opacity: 0.6 },
    hillsFar: { fill: '#2a2a4a', opacity: 0.3 },
    ground: '#1a2a3a',
    groundDark: '#0a1a2a',
    mist: 'rgba(150,150,255,0.2)',
    mistSpeed: 110,
    grass: '#2a4a5a',
    grassDark: '#1a3a4a',
    flowerColors: ['#C8E8FF', '#A8D0FF', '#88B8FF'],
    particles: ['fireflies'],
    features: { flowers: false, rocks: true, path: false, reeds: false },
  },
}

export const ENVIRONMENT_ORDER = ['meadow', 'woodland', 'lake', 'enchanted', 'celestial']

export function getEnvironment(level) {
  if (level < 10) return 'meadow'
  if (level < 25) return 'woodland'
  if (level < 50) return 'lake'
  if (level < 100) return 'enchanted'
  return 'celestial'
}
