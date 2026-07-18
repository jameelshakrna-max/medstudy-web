import { useMemo } from 'react'
import { getTreeById } from '../lib/treeTypes'
import ForestTreeOld from './ForestTreeOld'
import { ForestTree } from './ForestTree'
import s from './TreePreview.module.css'

export default function TreePreview({ treeId, size = 'md', className = '' }) {
  const tree = useMemo(() => getTreeById(treeId) || getTreeById('oak'), [treeId])
  const isOak = tree?.id === 'oak'

  const sizeClass = size === 'sm' ? s.sm : size === 'forest' ? s.forest : s.md

  if (isOak) {
    return (
      <div className={`${s.wrapper} ${sizeClass} ${className}`}>
        <ForestTree progress={1} state="paused" preview size="100%" />
      </div>
    )
  }

  return (
    <div className={`${s.wrapper} ${sizeClass} ${className}`}>
      <ForestTreeOld tree={tree} progress={1} status="IDLE" />
    </div>
  )
}
