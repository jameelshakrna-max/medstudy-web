import { useMemo } from 'react'
import { createSeededRandom } from '../../lib/seededRandom'
import TreePreview from '../TreePreview'
import s from './ForestLandscape.module.css'

const TREE_WIDTHS = { back: 36, mid: 48, front: 60 }

export default function ForestTreeInstance({
  session,
  layout,
  depth = 'mid',
  wind = false,
  onClick,
}) {
  const windParams = useMemo(() => {
    if (!wind) return null
    const rand = createSeededRandom(`wind-${session.id}`)
    return {
      duration: 5.5 + rand() * 4,
      delay: -(rand() * 8),
      intensity: 0.45 + rand() * 0.55,
    }
  }, [session.id, wind])

  const width = TREE_WIDTHS[depth] || 48
  const { xJitter = 0, yJitter = 0, scale = 1, rotation = 0 } = layout || {}

  return (
    <button
      className={s.treeInstance}
      style={{
        '--tree-width': `${width}px`,
        transform: `translateX(${xJitter}px) translateY(${yJitter}px) scale(${scale}) rotate(${rotation}deg)`,
        ...(windParams
          ? {
              '--wind-duration': `${windParams.duration}s`,
              '--wind-delay': `${windParams.delay}s`,
              '--wind-intensity': `${windParams.intensity}`,
            }
          : {}),
      }}
      onClick={onClick}
      aria-label={`${session.subject_name || 'Study'} session — ${session.tree_type || 'oak'} tree`}
      type="button"
    >
      <TreePreview
        treeId={session.tree_type || 'oak'}
        size="100%"
        wind={wind}
        mature
      />
    </button>
  )
}
