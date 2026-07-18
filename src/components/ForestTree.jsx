import { useMemo } from 'react'
import { getTreeTransforms, getGrowthStage } from '../lib/treeTypes'
import s from './ForestTree.module.css'

function lerp(a, b, t) { return a + (b - a) * t }

export default function ForestTree({ tree, progress = 0, status = 'IDLE', subjectColor }) {
  const t = getTreeTransforms(progress)
  const colors = tree?.colors || {}

  const accentFilter = subjectColor
    ? `drop-shadow(0 0 6px ${subjectColor}40)`
    : 'none'

  const isWilted = status === 'FAILED'
  const isBloomed = status === 'SUCCESS'

  const wiltStyle = isWilted ? {
    filter: 'sepia(0.7) saturate(0.3) brightness(0.7)',
    transition: 'filter 1s ease',
  } : isBloomed ? {
    filter: 'brightness(1.15) saturate(1.2)',
    transition: 'filter 0.5s ease',
  } : {}

  // Particle positions for bloom
  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      angle: (i * 45) * Math.PI / 180,
      dist: 20 + Math.random() * 15,
      size: 3 + Math.random() * 3,
      delay: i * 0.08,
    })), [])

  return (
    <div className={`${s.tree} ${isWilted ? s.wilted : ''} ${isBloomed ? s.bloomed : ''}`}
      style={wiltStyle}>
      <svg viewBox="0 0 120 140" className={s.svg} style={{ filter: accentFilter }}>
        <defs>
          <radialGradient id={`trunkGrad-${tree.id}`} cx="50%" cy="30%">
            <stop offset="0%" stopColor={colors.trunk} />
            <stop offset="100%" stopColor={colors.trunkDark} />
          </radialGradient>
          <filter id={`treeGlow-${tree.id}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Soil */}
        <ellipse cx="60" cy="132" rx="22" ry="5"
          fill="rgba(139,69,19,0.25)"
          style={{ opacity: lerp(0, 1, progress * 5) }} />

        {/* Trunk */}
        <rect
          x={60 - t.trunkWidth / 2}
          y={130 - t.trunkHeight}
          width={t.trunkWidth}
          height={t.trunkHeight}
          rx="1.5"
          fill={`url(#trunkGrad-${tree.id})`}
          style={{
            transition: 'height 0.4s var(--ease-out), width 0.4s var(--ease-out)',
          }}
        />

        {/* Bark texture lines */}
        {t.trunkHeight > 8 && (
          <>
            <line x1={60 - 1} y1={130 - t.trunkHeight * 0.3}
              x2={60 - 1} y2={130 - t.trunkHeight * 0.6}
              stroke={colors.trunkDark} strokeWidth="0.5" opacity="0.3" />
            <line x1={60 + 1.5} y1={130 - t.trunkHeight * 0.2}
              x2={60 + 1.5} y2={130 - t.trunkHeight * 0.5}
              stroke={colors.trunkDark} strokeWidth="0.5" opacity="0.3" />
          </>
        )}

        {/* Stem / branches */}
        {t.stemHeight > 0 && (
          <>
            <line x1="60" y1={130 - t.trunkHeight}
              x2="60" y2={130 - t.trunkHeight - t.stemHeight}
              stroke={colors.stem} strokeWidth="2" strokeLinecap="round"
              style={{ transition: 'y2 0.4s var(--ease-out)' }} />

            {/* Branches */}
            {t.branchSpread > 0 && (
              <>
                <line x1="60" y1={130 - t.trunkHeight - t.stemHeight * 0.4}
                  x2={60 - 14 * t.branchSpread} y2={130 - t.trunkHeight - t.stemHeight * 0.7}
                  stroke={colors.stem} strokeWidth="1.5" strokeLinecap="round" opacity={t.branchSpread} />
                <line x1="60" y1={130 - t.trunkHeight - t.stemHeight * 0.5}
                  x2={60 + 12 * t.branchSpread} y2={130 - t.trunkHeight - t.stemHeight * 0.8}
                  stroke={colors.stem} strokeWidth="1.5" strokeLinecap="round" opacity={t.branchSpread} />
              </>
            )}
          </>
        )}

        {/* Canopy layers */}
        {t.canopy1Opacity > 0 && (
          <ellipse cx="60" cy={130 - t.trunkHeight - t.stemHeight - 8}
            rx={22 * t.canopy1Scale} ry={16 * t.canopy1Scale}
            fill={colors.canopy1}
            style={{ transition: 'all 0.5s var(--ease-out)' }} />
        )}
        {t.canopy2Opacity > 0 && (
          <ellipse cx="60" cy={130 - t.trunkHeight - t.stemHeight - 5}
            rx={18 * t.canopy2Scale} ry={14 * t.canopy2Scale}
            fill={colors.canopy2}
            style={{ transition: 'all 0.5s var(--ease-out)' }} />
        )}
        {t.canopy3Opacity > 0 && (
          <ellipse cx="60" cy={130 - t.trunkHeight - t.stemHeight - 2}
            rx={15 * t.canopy3Scale} ry={12 * t.canopy3Scale}
            fill={colors.canopy3}
            style={{ transition: 'all 0.5s var(--ease-out)' }} />
        )}

        {/* Highlight */}
        {t.canopy3Opacity > 0 && (
          <ellipse cx={60 - 4 * t.canopy3Scale} cy={130 - t.trunkHeight - t.stemHeight - 6}
            rx={5 * t.canopy3Scale} ry={4 * t.canopy3Scale}
            fill="rgba(255,255,255,0.15)"
            style={{ transition: 'all 0.5s var(--ease-out)' }} />
        )}

        {/* Flowers */}
        {t.flowerOpacity > 0 && (
          <>
            <circle cx={52} cy={130 - t.trunkHeight - t.stemHeight - 10}
              r="2" fill={colors.flower} opacity={t.flowerOpacity} />
            <circle cx={68} cy={130 - t.trunkHeight - t.stemHeight - 8}
              r="1.8" fill={colors.flower} opacity={t.flowerOpacity * 0.8} />
            <circle cx={58} cy={130 - t.trunkHeight - t.stemHeight - 14}
              r="1.5" fill={colors.flower} opacity={t.flowerOpacity * 0.7} />
          </>
        )}

        {/* Shadow */}
        <ellipse cx="60" cy="134" rx={14 * t.trunkWidth / 5} ry="3"
          fill="rgba(0,0,0,0.2)" opacity={lerp(0, 0.6, progress * 3)} />
      </svg>

      {/* Bloom particles */}
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
