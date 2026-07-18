import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTreeLayout, splitRows } from '../../lib/forestUtils'
import { createSeededRandom } from '../../lib/seededRandom'
import { ENVIRONMENTS } from './environments'
import ForestGround from './ForestGround'
import ForestParticles from './ForestParticles'
import ForestTreeInstance from './ForestTreeInstance'
import s from './ForestLandscape.module.css'

const DETAILED_LIMIT = 100
const CLUSTER_BATCH = 48

function sortChronologically(trees) {
  return [...trees].sort((a, b) => {
    const dateDiff = new Date(a.created_at) - new Date(b.created_at)
    if (dateDiff !== 0) return dateDiff
    return String(a.id).localeCompare(String(b.id))
  })
}

function splitDensity(orderedTrees) {
  if (orderedTrees.length <= DETAILED_LIMIT) {
    return { detailed: orderedTrees, clusters: [] }
  }
  const detailed = orderedTrees.slice(-DETAILED_LIMIT)
  const older = orderedTrees.slice(0, -DETAILED_LIMIT)
  const clusters = []
  for (let i = 0; i < older.length; i += CLUSTER_BATCH) {
    clusters.push({
      count: Math.min(CLUSTER_BATCH, older.length - i),
      sessions: older.slice(i, i + CLUSTER_BATCH),
    })
  }
  return { detailed, clusters }
}

function HillSVG({ far, env }) {
  const c = far ? env.hillsFar : env.hills
  return (
    <svg
      className={far ? s.hillsFar : s.hillsNear}
      viewBox="0 0 800 200"
      preserveAspectRatio="none"
    >
      {far ? (
        <path
          d="M0 200 Q80 80 200 120 Q320 60 400 100 Q500 40 600 90 Q700 50 800 110 L800 200Z"
          fill={c.fill}
          opacity={c.opacity}
          style={{ filter: 'blur(3px)' }}
        />
      ) : (
        <path
          d="M0 200 Q100 100 180 130 Q280 70 380 110 Q480 50 560 100 Q660 60 760 120 Q800 100 800 200Z"
          fill={c.fill}
          opacity={c.opacity}
        />
      )}
    </svg>
  )
}

function BackgroundForestSVG({ env }) {
  const trees = useMemo(() => {
    const rand = createSeededRandom('bg-forest')
    return Array.from({ length: 28 }, (_, i) => ({
      x: i * 29 + (rand() - 0.5) * 20,
      h: 40 + rand() * 80,
      w: 16 + rand() * 20,
      opacity: 0.3 + rand() * 0.3,
    }))
  }, [])

  return (
    <svg
      className={s.backgroundForest}
      viewBox="0 0 800 200"
      preserveAspectRatio="none"
    >
      {trees.map((t, i) => (
        <g key={i} opacity={t.opacity}>
          <rect x={t.x} y={200 - t.h} width={t.w * 0.3} height={t.h} fill={env.hills.fill} rx="2" />
          <ellipse
            cx={t.x + t.w * 0.15}
            cy={200 - t.h - t.w * 0.6}
            rx={t.w}
            ry={t.w * 0.7}
            fill={env.hills.fill}
          />
        </g>
      ))}
    </svg>
  )
}

function TreeRow({ trees, depth, wind, onTreeClick }) {
  return (
    <div className={`${s.depthRow} ${s[`${depth}Row`]}`}>
      {trees.map(({ session, layout }) => (
        <ForestTreeInstance
          key={session.id}
          session={session}
          layout={layout}
          depth={depth}
          wind={wind}
          onClick={() => onTreeClick(session)}
        />
      ))}
    </div>
  )
}

function ClusterRow({ clusters, onClusterClick }) {
  const rand = createSeededRandom('cluster-positions')
  return (
    <div className={`${s.depthRow} ${s.backRow}`}>
      {clusters.map((cluster, i) => (
        <div
          key={i}
          className={s.treeCluster}
          style={{
            left: `${8 + (i / Math.max(1, clusters.length)) * 82 + (rand() - 0.5) * 8}%`,
            bottom: '38%',
            '--cluster-width': `${60 + cluster.count * 0.8}px`,
          }}
          onClick={() => onClusterClick(cluster)}
          role="button"
          tabIndex={0}
          aria-label={`${cluster.count} older study sessions`}
        >
          <div className={s.clusterSilhouettes}>
            {Array.from({ length: Math.min(5, cluster.count) }, (_, j) => (
              <svg
                key={j}
                viewBox="0 0 30 40"
                style={{
                  position: 'absolute',
                  bottom: `${j * 12}%`,
                  left: `${8 + j * 18}%`,
                  width: '30%',
                  height: '70%',
                  opacity: 0.5 + j * 0.1,
                }}
              >
                <rect x="13" y="20" width="4" height="20" fill="#3A5A3A" rx="1" />
                <ellipse cx="15" cy="16" rx="12" ry="10" fill="#4A7A4A" />
              </svg>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyMeadow({ onStartFocus }) {
  return (
    <div className={s.emptyOverlay}>
      <svg className={s.emptySeed} viewBox="0 0 40 40">
        <ellipse cx="20" cy="30" rx="8" ry="4" fill="rgba(139,69,19,0.3)" />
        <path d="M14 28 Q20 18 26 28 Q23 35 20 36 Q17 35 14 28Z" fill="#8B5A2B" />
        <path d="M16 26 Q20 20 24 26" fill="none" stroke="#C78B4B" strokeWidth="1.5" opacity="0.7" />
        <path d="M20 20 Q19 14 21 10" fill="none" stroke="#4E7A25" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M21 14 Q26 11 28 14 Q24 17 21 15Z" fill="#68A43A" />
      </svg>
      <p className={s.emptyMessage}>
        Complete your first focus session to plant a tree
      </p>
      <button className={s.emptyCta} onClick={onStartFocus}>
        Start Focus
      </button>
    </div>
  )
}

export default function ForestLandscape({
  trees = [],
  environment = 'meadow',
  wind = false,
  onTreeClick,
  empty = false,
  transitioning = false,
}) {
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const [isLandscapeVisible, setIsLandscapeVisible] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(!document.hidden)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsLandscapeVisible(entry.isIntersecting),
      { threshold: 0.1 },
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onVisChange = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [])

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const shouldAnimate = isLandscapeVisible && documentVisible && !prefersReducedMotion && wind

  const env = ENVIRONMENTS[environment] || ENVIRONMENTS.meadow

  const { detailed, clusters } = useMemo(() => {
    const ordered = sortChronologically(trees)
    return splitDensity(ordered)
  }, [trees])

  const layout = useMemo(() => getTreeLayout(detailed), [detailed])
  const rows = useMemo(() => splitRows(detailed, layout), [detailed, layout])

  const handleClusterClick = useCallback((cluster) => {
    // Future: open history panel for older sessions
  }, [])

  const animClass = shouldAnimate ? '' : s.paused
  const transClass = transitioning ? s.transitioning : ''

  return (
    <div
      ref={containerRef}
      className={`${s.landscape} ${s[environment] || s.meadow} ${animClass} ${transClass}`}
    >
      {/* Sky */}
      <div className={s.sky} />

      {/* Distant hills */}
      <HillSVG far env={env} />
      <HillSVG env={env} />

      {/* Background forest silhouettes */}
      <BackgroundForestSVG env={env} />

      {/* Mist */}
      <div className={s.mistLayer}>
        <div className={`${s.mistBand} ${s.mistBand1}`} />
        <div className={`${s.mistBand} ${s.mistBand2}`} />
        <div className={`${s.mistBand} ${s.mistBand3}`} />
      </div>

      {/* Trees */}
      <div className={s.treeScene}>
        {clusters.length > 0 && (
          <ClusterRow clusters={clusters} onClusterClick={handleClusterClick} />
        )}
        {rows.back.length > 0 && (
          <TreeRow
            trees={rows.back}
            depth="back"
            wind={shouldAnimate}
            onTreeClick={onTreeClick}
          />
        )}
        {rows.mid.length > 0 && (
          <TreeRow
            trees={rows.mid}
            depth="mid"
            wind={shouldAnimate}
            onTreeClick={onTreeClick}
          />
        )}
        {rows.front.length > 0 && (
          <TreeRow
            trees={rows.front}
            depth="front"
            wind={shouldAnimate}
            onTreeClick={onTreeClick}
          />
        )}
      </div>

      {/* Ground */}
      <ForestGround env={env} wind={shouldAnimate} />

      {/* Particles */}
      <ForestParticles
        environment={environment}
        wind={shouldAnimate}
        treeCount={detailed.length}
      />

      {/* Empty state */}
      {empty && <EmptyMeadow onStartFocus={() => navigate('/pomodoro')} />}
    </div>
  )
}
