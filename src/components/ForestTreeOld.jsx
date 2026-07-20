import { useMemo } from 'react'
import { getPartProgress } from '../lib/treeTypes'
import s from './ForestTree.module.css'

function lerp(a, b, t) { return a + (b - a) * t }

// Leaf positions relative to canopy center (cx=90, cy ~75-95)
const LEAF_CONFIG = [
  { x: -18, y: -12, delay: 0 },
  { x:  15, y: -16, delay: 1 },
  { x: -24, y:   2, delay: 2 },
  { x:  22, y:   0, delay: 3 },
  { x:  -8, y: -22, delay: 4 },
  { x:  10, y: -20, delay: 5 },
  { x: -28, y: -8,  delay: 6 },
  { x:  28, y: -6,  delay: 7 },
  { x:   0, y: -26, delay: 8 },
  { x: -14, y: -18, delay: 9 },
]

const FLOWER_CONFIG = [
  { x: -10, y: -18, r: 3, delay: 0 },
  { x:  12, y: -14, r: 2.5, delay: 2 },
  { x:   2, y: -24, r: 2, delay: 4 },
  { x: -20, y: -6,  r: 2.2, delay: 3 },
  { x:  22, y: -4,  r: 1.8, delay: 5 },
]

export default function ForestTree({ tree, progress = 0, status = 'IDLE', subjectColor, wind = false }) {
  const vp = Math.max(0.12, progress)
  const colors = tree?.colors || {}

  // Per-part progress
  const soilP = getPartProgress('soil', vp)
  const trunkP = getPartProgress('trunk', vp)
  const stemP = getPartProgress('stem', vp)
  const branchP = getPartProgress('branches', vp)
  const c1P = getPartProgress('canopy1', vp)
  const c2P = getPartProgress('canopy2', vp)
  const c3P = getPartProgress('canopy3', vp)
  const leafP = getPartProgress('leaves', vp)
  const flowerP = getPartProgress('flowers', vp)

  const isGrowing = status === 'RUNNING'
  const isWilted = status === 'FAILED'
  const isBloomed = status === 'SUCCESS'

  // SVG coordinates (viewBox 180x210)
  const groundY = 198
  const baseX = 90
  const trunkH = lerp(0, 50, trunkP)
  const trunkTop = groundY - trunkH
  const stemH = lerp(0, 30, stemP)
  const stemTop = trunkTop - stemH
  const canopyCY = stemTop - 5

  // Trunk clip-path for draw effect
  const trunkClipBottom = lerp(100, 0, trunkP)

  const accentFilter = subjectColor
    ? `drop-shadow(0 0 8px ${subjectColor}40)` : 'none'

  const wiltStyle = isWilted ? {
    filter: 'sepia(0.7) saturate(0.3) brightness(0.7)',
    transition: 'filter 1s ease',
  } : isBloomed ? {
    filter: 'brightness(1.15) saturate(1.2)',
    transition: 'filter 0.5s ease',
  } : {}

  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      angle: (i * 45) * Math.PI / 180,
      dist: 20 + Math.random() * 15,
      size: 3 + Math.random() * 3,
      delay: i * 0.08,
    })), [])

  // Canopy sizes driven by part progress
  const c1RX = lerp(0, 38, c1P)
  const c1RY = lerp(0, 28, c1P)
  const c2RX = lerp(0, 30, c2P)
  const c2RY = lerp(0, 24, c2P)
  const c3RX = lerp(0, 24, c3P)
  const c3RY = lerp(0, 20, c3P)

  return (
    <div className={`${s.tree} ${isWilted ? s.wilted : ''} ${isBloomed ? s.bloomed : ''} ${isGrowing ? s.growing : ''} ${wind ? s.windy : ''}`}
      style={wiltStyle}>
      <svg viewBox="0 0 180 210" preserveAspectRatio="xMidYMax meet" className={s.svg} style={{ filter: accentFilter }}>
        <defs>
          <radialGradient id={`trunkGrad-${tree.id}`} cx="50%" cy="30%">
            <stop offset="0%" stopColor={colors.trunk} />
            <stop offset="100%" stopColor={colors.trunkDark} />
          </radialGradient>
          {/* Clip path for trunk draw effect */}
          <clipPath id={`trunkClip-${tree.id}`}>
            <rect x={baseX - 6} y={trunkTop} width={12} height={trunkH} />
          </clipPath>
        </defs>

        {/* Soil */}
        <ellipse cx={baseX} cy={groundY + 3} rx={lerp(0, 32, soilP)} ry={lerp(0, 6, soilP)}
          fill="rgba(139,69,19,0.3)"
          style={{ opacity: Math.max(0.45, lerp(0, 1, soilP)) }} />

        {/* Shadow on ground */}
        <ellipse cx={baseX} cy={groundY + 6} rx={lerp(0, 22, trunkP)} ry={lerp(0, 3.5, trunkP)}
          fill="rgba(0,0,0,0.18)"
          style={{ opacity: Math.max(0.25, lerp(0, 0.6, vp * 3)) }} />

        {/* Trunk with clip-path draw */}
        <g clipPath={`url(#trunkClip-${tree.id})`}
           style={{ clipPath: `inset(0 0 ${trunkClipBottom}% 0)` }}>
          <rect
            x={baseX - 5}
            y={trunkTop}
            width={10}
            height={trunkH}
            rx="2"
            fill={`url(#trunkGrad-${tree.id})`}
          />
          {/* Bark texture */}
          {trunkH > 10 && (
            <>
              <line x1={baseX - 1.5} y1={trunkTop + trunkH * 0.2}
                x2={baseX - 1.5} y2={trunkTop + trunkH * 0.55}
                stroke={colors.trunkDark} strokeWidth="0.6" opacity="0.35" />
              <line x1={baseX + 2} y1={trunkTop + trunkH * 0.15}
                x2={baseX + 2} y2={trunkTop + trunkH * 0.45}
                stroke={colors.trunkDark} strokeWidth="0.5" opacity="0.25" />
            </>
          )}
        </g>

        {/* Stem */}
        {stemP > 0 && (
          <line x1={baseX} y1={trunkTop}
            x2={baseX} y2={trunkTop - stemH}
            stroke={colors.stem} strokeWidth="2.5" strokeLinecap="round"
            style={{ opacity: stemP }} />
        )}

        {/* Branches */}
        {branchP > 0 && (
          <g style={{ opacity: branchP }}>
            <line x1={baseX} y1={trunkTop - stemH * 0.35}
              x2={baseX - 22 * branchP} y2={trunkTop - stemH * 0.7}
              stroke={colors.stem} strokeWidth="1.8" strokeLinecap="round" />
            <line x1={baseX} y1={trunkTop - stemH * 0.5}
              x2={baseX + 20 * branchP} y2={trunkTop - stemH * 0.8}
              stroke={colors.stem} strokeWidth="1.5" strokeLinecap="round" />
            <line x1={baseX} y1={trunkTop - stemH * 0.6}
              x2={baseX - 14 * branchP} y2={trunkTop - stemH * 0.9}
              stroke={colors.stem} strokeWidth="1.2" strokeLinecap="round" />
            <line x1={baseX} y1={trunkTop - stemH * 0.7}
              x2={baseX + 12 * branchP} y2={trunkTop - stemH}
              stroke={colors.stem} strokeWidth="1" strokeLinecap="round" />
          </g>
        )}

        {/* Canopy layers */}
        <g className="canopyWrap">
          {c1P > 0 && (
            <ellipse cx={baseX - 3} cy={canopyCY + 4}
              rx={c1RX} ry={c1RY}
              fill={colors.canopy1} style={{ transition: 'all 0.4s var(--ease-out)' }} />
          )}
          {c2P > 0 && (
            <ellipse cx={baseX + 2} cy={canopyCY}
              rx={c2RX} ry={c2RY}
              fill={colors.canopy2} style={{ transition: 'all 0.4s var(--ease-out)' }} />
          )}
          {c3P > 0 && (
            <ellipse cx={baseX} cy={canopyCY - 3}
              rx={c3RX} ry={c3RY}
              fill={colors.canopy3} style={{ transition: 'all 0.4s var(--ease-out)' }} />
          )}

          {/* Canopy shadow (dark side) */}
          {c2P > 0 && (
            <ellipse cx={baseX + 8} cy={canopyCY + 6}
              rx={c2RX * 0.6} ry={c2RY * 0.5}
              fill={colors.canopyShadow || 'rgba(0,0,0,0.12)'}
              style={{ opacity: c2P * 0.7, transition: 'all 0.4s var(--ease-out)' }} />
          )}

          {/* Highlight */}
          {c3P > 0 && (
            <ellipse cx={baseX - 8} cy={canopyCY - 8}
              rx={c3RX * 0.3} ry={c3RY * 0.25}
              fill="rgba(255,255,255,0.18)"
              style={{ opacity: c3P, transition: 'all 0.4s var(--ease-out)' }} />
          )}
        </g>

        {/* Leaves with stagger pop */}
        {leafP > 0 && LEAF_CONFIG.map((lf, i) => {
          const visible = leafP > (lf.delay / LEAF_CONFIG.length)
          if (!visible) return null
          const opacity = lerp(0, 0.8, Math.min(1, (leafP - lf.delay / LEAF_CONFIG.length) * LEAF_CONFIG.length))
          return (
            <ellipse key={i}
              cx={baseX + lf.x} cy={canopyCY + lf.y}
              rx="3.5" ry="2.5"
              fill={colors.leaf || colors.canopy3}
              className="leafPop"
              style={{
                '--x': `${lf.x}px`,
                '--y': `${lf.y}px`,
                '--target-opacity': opacity,
                '--leaf-delay': `${lf.delay * 0.06}s`,
                animation: `leafPop 0.4s var(--ease-out) ${lf.delay * 0.06}s both`,
                opacity: 0,
              }}
            />
          )
        })}

        {/* Flowers with stagger bloom */}
        {flowerP > 0 && FLOWER_CONFIG.map((fl, i) => {
          const visible = flowerP > (fl.delay / FLOWER_CONFIG.length)
          if (!visible) return null
          const opacity = lerp(0, 0.85, Math.min(1, (flowerP - fl.delay / FLOWER_CONFIG.length) * FLOWER_CONFIG.length))
          return (
            <circle key={`f${i}`}
              cx={baseX + fl.x} cy={canopyCY + fl.y}
              r={fl.r}
              fill={colors.flower}
              className="flowerBloom"
              style={{
                '--x': `${fl.x}px`,
                '--y': `${fl.y}px`,
                '--target-opacity': opacity,
                animation: `flowerBloom 0.5s var(--ease-out) ${fl.delay * 0.08}s both`,
                opacity: 0,
              }}
            />
          )
        })}
      </svg>

      {/* Bloom particles on success */}
      {isBloomed && particles.map(p => (
        <div key={p.id} className={s.particle}
          style={{
            '--angle': `${p.angle}rad`,
            '--dist': `${p.dist}px`,
            '--size': `${p.size}px`,
            '--delay': `${p.delay}s`,
            background: colors.flower || 'rgba(253,224,71,0.8)',
          }} />
      ))}

      {/* Wilt leaves falling */}
      {isWilted && (
        <>
          <div className={`${s.wiltLeaf} ${s.wiltLeaf1}`} style={{ background: colors.canopy3 }} />
          <div className={`${s.wiltLeaf} ${s.wiltLeaf2}`} style={{ background: colors.canopy2 }} />
          <div className={`${s.wiltLeaf} ${s.wiltLeaf3}`} style={{ background: colors.canopy3 }} />
        </>
      )}
    </div>
  )
}
