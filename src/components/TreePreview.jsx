import { useMemo } from 'react'
import { getTreeById } from '../lib/treeTypes'
import ForestTreeOld from './ForestTreeOld'
import { ForestTree } from './ForestTree'
import s from './TreePreview.module.css'

export default function TreePreview({ treeId, size = 'md', className = '', wind = false, mature = false, variant }) {
  const tree = useMemo(() => getTreeById(treeId) || getTreeById('oak'), [treeId])
  const isOak = tree?.id === 'oak'

  const isLandscape = variant === 'landscape'
  const sizeClass = isLandscape ? s.forest : size === 'sm' ? s.sm : size === 'forest' ? s.forest : s.md

  if (isOak) {
    return (
      <div className={`${s.wrapper} ${sizeClass} ${isLandscape ? s.landscapePreview : ''} ${className}`}>
        <ForestTree
          progress={1}
          state="idle"
          preview={mature}
          landscapeWind={wind}
          showParticles={false}
          showGlow={false}
          size="100%"
        />
      </div>
    )
  }

  return (
    <div className={`${s.wrapper} ${sizeClass} ${isLandscape ? s.landscapePreview : ''} ${className}`}>
      <ForestTreeOld
        tree={tree}
        progress={1}
        status={mature ? 'IDLE' : 'IDLE'}
        wind={wind}
      />
    </div>
  )
}
