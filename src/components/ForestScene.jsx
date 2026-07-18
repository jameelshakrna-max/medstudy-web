import { useMemo } from 'react'
import s from './ForestScene.module.css'

export default function ForestScene({ progress = 0, status = 'IDLE' }) {
  const grassBlades = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${5 + (i / 20) * 90}%`,
      height: 6 + Math.random() * 10,
      delay: `${(i / 20) * 2}s`,
      dur: `${3 + Math.random() * 2}s`,
    })), [])

  const flowers = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      bottom: `${2 + Math.random() * 12}px`,
      size: 4 + Math.random() * 4,
      color: ['var(--emerald)', 'var(--blue)', 'var(--indigo)', 'var(--amber)', 'var(--red)', 'var(--emerald)'][i],
      delay: `${i * 0.3}s`,
    })), [])

  const fireflies = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      top: `${20 + Math.random() * 60}%`,
      dur: `${4 + Math.random() * 3}s`,
      delay: `${Math.random() * 4}s`,
      dx: `${-20 + Math.random() * 40}px`,
      dy: `${-15 + Math.random() * -25}px`,
    })), [])

  const butterflies = useMemo(() =>
    Array.from({ length: 3 }, (_, i) => ({
      id: i,
      left: `${15 + Math.random() * 70}%`,
      top: `${15 + Math.random() * 50}%`,
      dur: `${6 + Math.random() * 4}s`,
      delay: `${i * 2}s`,
      color: ['#EC4899', '#F59E0B', '#818CF8'][i],
    })), [])

  const showGrass = progress > 0.10
  const showFlowers = progress > 0.25
  const showStones = progress > 0.40
  const showFireflies = progress > 0.60
  const showButterflies = progress > 0.80
  const showSunRays = status === 'SUCCESS'

  return (
    <div className={s.scene}>
      {/* Ground */}
      <div className={s.ground} style={{
        opacity: Math.min(1, progress * 5),
      }} />

      {/* Soil texture */}
      <div className={s.soil} style={{
        opacity: Math.min(0.6, progress * 3),
      }} />

      {/* Grass */}
      {showGrass && grassBlades.map(blade => (
        <div key={blade.id} className={s.grass}
          style={{
            left: blade.left,
            height: `${blade.height}px`,
            animationDelay: blade.delay,
            animationDuration: blade.dur,
            opacity: Math.min(1, (progress - 0.10) * 8),
          }} />
      ))}

      {/* Stones */}
      {showStones && (
        <>
          <div className={s.stone} style={{
            left: '20%', bottom: '6px',
            width: '8px', height: '5px',
            opacity: Math.min(0.5, (progress - 0.40) * 5),
          }} />
          <div className={s.stone} style={{
            left: '75%', bottom: '8px',
            width: '6px', height: '4px',
            opacity: Math.min(0.4, (progress - 0.40) * 5),
          }} />
        </>
      )}

      {/* Flowers */}
      {showFlowers && flowers.map(f => (
        <div key={f.id} className={s.flower}
          style={{
            left: f.left,
            bottom: f.bottom,
            '--size': `${f.size}px`,
            '--color': f.color,
            animationDelay: f.delay,
            opacity: Math.min(0.8, (progress - 0.25) * 4),
          }} />
      ))}

      {/* Fireflies */}
      {showFireflies && fireflies.map(ff => (
        <div key={ff.id} className={s.firefly}
          style={{
            left: ff.left,
            top: ff.top,
            '--dur': ff.dur,
            '--delay': ff.delay,
            '--dx': ff.dx,
            '--dy': ff.dy,
            opacity: Math.min(1, (progress - 0.60) * 5),
          }} />
      ))}

      {/* Butterflies */}
      {showButterflies && butterflies.map(b => (
        <div key={b.id} className={s.butterfly}
          style={{
            left: b.left,
            top: b.top,
            '--dur': b.dur,
            '--delay': b.delay,
            '--color': b.color,
            opacity: Math.min(0.8, (progress - 0.80) * 5),
          }} />
      ))}

      {/* Sun rays on success */}
      {showSunRays && (
        <div className={s.sunRays} />
      )}

      {/* Fog */}
      <div className={s.fog} />
    </div>
  )
}
