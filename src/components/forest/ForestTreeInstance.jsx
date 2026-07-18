import { useMemo } from 'react'
import { createSeededRandom } from '../../lib/seededRandom'
import TreePreview from '../TreePreview'
import s from './ForestLandscape.module.css'

const TREE_SIZES = {
  back:  { base: 72,  range: 18 },
  mid:   { base: 98,  range: 27 },
  front: { base: 130, range: 35 },
}

const ROW_BOTTOM = { back: 45, mid: 22, front: 3 }

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

  const { x = 50, sizeVar = 1, scale = 1, rotation = 0 } = layout || {}

  const sizeConfig = TREE_SIZES[depth] || TREE_SIZES.mid
  const treeHeight = Math.round(sizeConfig.base + sizeVar * sizeConfig.range)
  const bottom = ROW_BOTTOM[depth] ?? 20

  return (
    <button
      className={s.treeInstance}
      style={{
        left: `${x}%`,
        bottom: `${bottom}%`,
        width: `${treeHeight * 0.55}px`,
        height: `${treeHeight}px`,
        transform: `translateX(-50%) scale(${scale}) rotate(${rotation}deg)`,
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
        variant="landscape"
        wind={wind}
        mature
        windSeed={session.id}
      />
    </button>
  )
}
