import { getTreeById } from '../../lib/treeTypes'
import { ForestTree } from '../ForestTree'
import ForestTreeOld from '../ForestTreeOld'
import { PremiumTree, PREMIUM_TREE_IDS } from '../PremiumTrees'

function mapLegacyStatus(state) {
  switch (state) {
    case 'running': return 'RUNNING'
    case 'failed':  return 'FAILED'
    case 'success': return 'SUCCESS'
    default:        return 'IDLE'
  }
}

export default function GrowingTreeRenderer({
  treeId,
  progress,
  state,
  subjectColor,
  wind,
}) {
  const id = treeId || 'oak'
  const visualProgress = Math.max(0.035, Math.min(1, progress))

  if (PREMIUM_TREE_IDS.has(id)) {
    return (
      <PremiumTree
        treeType={id}
        progress={visualProgress}
        state={state}
        preview={false}
        wind={wind}
        size="100%"
      />
    )
  }

  if (id === 'oak') {
    return (
      <ForestTree
        progress={visualProgress}
        state={state}
        preview={false}
        landscapeWind={wind}
        showParticles={false}
        showGlow={false}
        size="100%"
      />
    )
  }

  const tree = getTreeById(id) || getTreeById('oak')

  return (
    <ForestTreeOld
      tree={tree}
      progress={visualProgress}
      status={mapLegacyStatus(state)}
      subjectColor={subjectColor}
      wind={wind}
    />
  )
}
