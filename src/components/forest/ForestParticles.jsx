import { useMemo } from 'react'
import { createSeededRandom } from '../../lib/seededRandom'
import { ENVIRONMENTS } from './environments'
import s from './ForestLandscape.module.css'

const LEAF_COLORS = ['#8B6914', '#A0522D', '#CD853F', '#D2691E', '#B8860B', '#DAA520']

export default function ForestParticles({ environment = 'meadow', wind = false, treeCount = 0 }) {
  const env = ENVIRONMENTS[environment] || ENVIRONMENTS.meadow
  const particleTypes = env.particles || []

  const leafCount = Math.min(12, Math.max(3, Math.floor(treeCount / 8)))
  const pollenCount = Math.min(15, Math.max(4, Math.floor(treeCount / 6)))
  const fireflyCount = Math.min(10, Math.max(3, Math.floor(treeCount / 10)))

  const leaves = useMemo(() => {
    if (!particleTypes.includes('leaves')) return []
    const rand = createSeededRandom('particle-leaves')
    return Array.from({ length: leafCount }, (_, i) => ({
      id: i,
      left: `${rand() * 100}%`,
      top: `${10 + rand() * 40}%`,
      color: LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)],
      drift: `${(rand() - 0.5) * 80}px`,
      fall: `${120 + rand() * 200}px`,
      spin: `${180 + rand() * 360}deg`,
      duration: `${7 + rand() * 6}s`,
      delay: `${rand() * 10}s`,
      size: 5 + rand() * 4,
    }))
  }, [particleTypes.includes('leaves'), leafCount])

  const pollen = useMemo(() => {
    if (!particleTypes.includes('pollen')) return []
    const rand = createSeededRandom('particle-pollen')
    return Array.from({ length: pollenCount }, (_, i) => ({
      id: i,
      left: `${rand() * 100}%`,
      top: `${30 + rand() * 50}%`,
      drift: `${(rand() - 0.5) * 40}px`,
      rise: `${-40 - rand() * 80}px`,
      duration: `${5 + rand() * 5}s`,
      delay: `${rand() * 8}s`,
    }))
  }, [particleTypes.includes('pollen'), pollenCount])

  const fireflies = useMemo(() => {
    if (!particleTypes.includes('fireflies')) return []
    const rand = createSeededRandom('particle-fireflies')
    return Array.from({ length: fireflyCount }, (_, i) => ({
      id: i,
      left: `${10 + rand() * 80}%`,
      top: `${20 + rand() * 50}%`,
      dx: `${(rand() - 0.5) * 30}px`,
      dy: `${(rand() - 0.5) * 20}px`,
      duration: `${3 + rand() * 4}s`,
      delay: `${rand() * 6}s`,
    }))
  }, [particleTypes.includes('fireflies'), fireflyCount])

  if (!wind) return null

  return (
    <div className={s.particleLayer}>
      {leaves.map((leaf) => (
        <div
          key={`leaf-${leaf.id}`}
          className={s.fallingLeaf}
          style={{
            left: leaf.left,
            top: leaf.top,
            background: leaf.color,
            width: `${leaf.size}px`,
            height: `${leaf.size}px`,
            '--leaf-drift': leaf.drift,
            '--leaf-fall': leaf.fall,
            '--leaf-spin': leaf.spin,
            '--leaf-duration': leaf.duration,
            '--leaf-delay': leaf.delay,
          }}
        />
      ))}

      {pollen.map((p) => (
        <div
          key={`pollen-${p.id}`}
          className={s.pollenDot}
          style={{
            left: p.left,
            top: p.top,
            '--pollen-drift': p.drift,
            '--pollen-rise': p.rise,
            '--pollen-duration': p.duration,
            '--pollen-delay': p.delay,
          }}
        />
      ))}

      {fireflies.map((ff) => (
        <div
          key={`ff-${ff.id}`}
          className={s.fireflyDot}
          style={{
            left: ff.left,
            top: ff.top,
            '--ff-dx': ff.dx,
            '--ff-dy': ff.dy,
            '--ff-duration': ff.duration,
            '--ff-delay': ff.delay,
          }}
        />
      ))}
    </div>
  )
}
