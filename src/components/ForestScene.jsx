import { useMemo } from 'react'
import s from './ForestScene.module.css'

export default function ForestScene({ progress = 0, status = 'IDLE' }) {
  const vp = Math.max(0, progress)

  const grassBlades = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: `${3 + (i / 24) * 94}%`,
      height: 5 + Math.random() * 12,
      delay: `${(i / 24) * 2.5}s`,
      dur: `${2.5 + Math.random() * 2}s`,
    })), [])

  const flowers = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${8 + Math.random() * 84}%`,
      bottom: `${2 + Math.random() * 14}px`,
      size: 3 + Math.random() * 5,
      color: ['var(--emerald)', 'var(--blue)', 'var(--indigo)', 'var(--amber)', 'var(--red)', '#EC4899', 'var(--emerald)', 'var(--indigo)'][i],
      delay: `${i * 0.25}s`,
    })), [])

  const fireflies = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${8 + Math.random() * 84}%`,
      top: `${15 + Math.random() * 65}%`,
      dur: `${3.5 + Math.random() * 3}s`,
      delay: `${Math.random() * 4}s`,
      dx: `${-25 + Math.random() * 50}px`,
      dy: `${-20 + Math.random() * -30}px`,
    })), [])

  const butterflies = useMemo(() =>
    Array.from({ length: 4 }, (_, i) => ({
      id: i,
      left: `${12 + Math.random() * 76}%`,
      top: `${12 + Math.random() * 55}%`,
      dur: `${5 + Math.random() * 4}s`,
      delay: `${i * 1.8}s`,
      color: ['#EC4899', '#F59E0B', '#818CF8', '#34D399'][i],
    })), [])

  const pollen = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      bottom: `${10 + Math.random() * 30}px`,
      dur: `${6 + Math.random() * 4}s`,
      delay: `${Math.random() * 5}s`,
      dx: `${-8 + Math.random() * 16}px`,
    })), [])

  const fallingLeaves = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      left: `${15 + Math.random() * 70}%`,
      top: `${10 + Math.random() * 30}%`,
      dur: `${5 + Math.random() * 3}s`,
      delay: `${i * 1.5 + Math.random() * 2}s`,
      rot: `${180 + Math.random() * 360}deg`,
      color: ['rgba(16,185,129,0.6)', 'rgba(74,222,128,0.5)', 'rgba(52,211,153,0.5)', 'rgba(110,231,183,0.4)', 'rgba(16,185,129,0.55)'][i],
    })), [])

  const showGrass = vp > 0.08
  const showFlowers = vp > 0.20
  const showStones = vp > 0.35
  const showPollen = vp > 0.15
  const showLeaves = vp > 0.30
  const showFireflies = vp > 0.55
  const showButterflies = vp > 0.75
  const showSunRays = status === 'SUCCESS'

  // Time-of-day class for ambient gradient
  const timeOfDay = vp < 0.25 ? 'dawn' : vp < 0.50 ? 'morning' : vp < 0.75 ? 'day' : 'dusk'

  return (
    <div className={`${s.scene} ${s[`time_${timeOfDay}`]}`}>
      {/* Ground — evolves from bare soil to grassy */}
      <div className={s.ground} style={{ opacity: Math.min(1, vp * 4) }} />
      <div className={s.soil} style={{ opacity: Math.min(0.6, vp * 3) }} />

      {/* Grass */}
      {showGrass && grassBlades.map(blade => (
        <div key={blade.id} className={s.grass}
          style={{
            left: blade.left,
            height: `${blade.height}px`,
            animationDelay: blade.delay,
            animationDuration: blade.dur,
            opacity: Math.min(1, (vp - 0.08) * 6),
          }} />
      ))}

      {/* Stones */}
      {showStones && (
        <>
          <div className={s.stone} style={{ left: '18%', bottom: '6px', width: '8px', height: '5px', opacity: Math.min(0.5, (vp - 0.35) * 4) }} />
          <div className={s.stone} style={{ left: '78%', bottom: '8px', width: '6px', height: '4px', opacity: Math.min(0.4, (vp - 0.35) * 4) }} />
          <div className={s.stone} style={{ left: '45%', bottom: '4px', width: '5px', height: '3px', opacity: Math.min(0.35, (vp - 0.40) * 4) }} />
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
            opacity: Math.min(0.8, (vp - 0.20) * 4),
          }} />
      ))}

      {/* Pollen — small floating dots */}
      {showPollen && pollen.map(p => (
        <div key={`p${p.id}`} className={s.pollen}
          style={{
            left: p.left,
            bottom: p.bottom,
            '--dur': p.dur,
            '--delay': p.delay,
            '--dx': p.dx,
            opacity: Math.min(0.6, (vp - 0.15) * 5),
          }} />
      ))}

      {/* Falling leaves */}
      {showLeaves && fallingLeaves.map(l => (
        <div key={`l${l.id}`} className={s.fallingLeaf}
          style={{
            left: l.left,
            top: l.top,
            '--dur': l.dur,
            '--delay': l.delay,
            '--rot': l.rot,
            '--color': l.color,
            opacity: Math.min(0.7, (vp - 0.30) * 3),
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
            opacity: Math.min(1, (vp - 0.55) * 4),
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
            opacity: Math.min(0.8, (vp - 0.75) * 4),
          }} />
      ))}

      {/* Sun rays on success */}
      {showSunRays && <div className={s.sunRays} />}

      {/* Fog */}
      <div className={s.fog} />
    </div>
  )
}
