import { useId, useMemo, type CSSProperties } from 'react'
import { getPremiumGrowth, clamp01, windVariables } from './growth'
import styles from './PremiumTree.module.css'
import { getPremiumTree } from './treeCatalog'
import type { PremiumTreeProps, SpeciesProps } from './types'
import { SakuraTree } from './species/SakuraTree'
import { WillowTree } from './species/WillowTree'
import { MapleTree } from './species/MapleTree'
import { BaobabTree } from './species/BaobabTree'
import { CrystalTree } from './species/CrystalTree'

const SPECIES = {
  sakura: SakuraTree,
  willow: WillowTree,
  maple: MapleTree,
  baobab: BaobabTree,
  crystal: CrystalTree,
} as const

function sizeValue(size: PremiumTreeProps['size']): string {
  if (typeof size === 'number') return `${size}px`
  return size ?? 'min(100%, 560px)'
}

export default function PremiumTree({
  treeType,
  progress,
  state = 'idle',
  className = '',
  size,
  preview = false,
  wind = false,
  windSeed,
  ariaLabel,
  style,
}: PremiumTreeProps) {
  const rawId = useId().replace(/:/g, '')
  const species = getPremiumTree(treeType)
  const TreeSpecies = SPECIES[treeType]
  const logicalProgress = preview || state === 'success' ? 1 : clamp01(progress)
  const visualProgress = Math.max(logicalProgress, state === 'idle' ? 0.018 : 0.028)
  const growth = getPremiumGrowth(visualProgress)
  const variables = useMemo(
    () => windVariables(windSeed ?? `${treeType}-${rawId}`),
    [rawId, treeType, windSeed],
  )
  const windActive = wind && state !== 'paused' && state !== 'failed'

  const rootStyle = {
    width: sizeValue(size),
    '--wind-duration': variables.duration,
    '--wind-delay': variables.delay,
    '--wind-angle': variables.angle,
    '--wind-distance': variables.distance,
    ...style,
  } as CSSProperties

  const speciesProps: SpeciesProps = {
    uid: rawId,
    growth,
    windActive,
    preview,
    state,
  }

  return (
    <div
      className={`${styles.wrapper} ${preview ? styles.compact : ''} ${className}`.trim()}
      style={rootStyle}
      data-tree-type={treeType}
      data-state={state}
      data-progress={logicalProgress.toFixed(3)}
    >
      <svg
        className={`${styles.svg} ${state === 'failed' ? styles.failed : ''}`.trim()}
        viewBox="0 0 800 800"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMax meet"
        role="img"
        aria-label={ariaLabel ?? `${species.name}, growing with the focus timer`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <TreeSpecies {...speciesProps} />
      </svg>
    </div>
  )
}
