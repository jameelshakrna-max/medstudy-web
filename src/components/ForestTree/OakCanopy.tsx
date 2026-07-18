import type { CSSProperties, ReactNode } from 'react'
import styles from './ForestTree.module.css'

const LEAF =
  'M0-10C2-9 5-7.5 5-6C6.5-5 6.5-3.5 5-2.5C6.5-1.5 6.5 0 5 1C6 2.5 5.5 4 4 5C2.5 6 1 7 0 7C-1 7-2.5 6-4 5C-5.5 4-6 2.5-5 1C-6.5 0-6.5-1.5-5-2.5C-6.5-3.5-6.5-5-5-6C-5-7.5-2-9 0-10Z'
const VEIN = 'M0-9Q0.4-2 0 6'

type LeafPlacement = {
  x: number
  y: number
  deg: number
  sc: number
}

function ring(
  count: number,
  rx: number,
  ry: number,
  sc: number,
  angleOffset = 0,
): LeafPlacement[] {
  return Array.from({ length: count }, (_, i) => {
    const deg = angleOffset + (i * 360) / count
    const rad = (deg * Math.PI) / 180
    return {
      x: +(rx * Math.sin(rad)).toFixed(1),
      y: +(-ry * Math.cos(rad)).toFixed(1),
      deg,
      sc,
    }
  })
}

function Leaves({
  items,
  fill,
  veinColor,
  opacity = 1,
}: {
  items: LeafPlacement[]
  fill: string
  veinColor?: string
  opacity?: number
}) {
  return (
    <>
      {items.map((leaf, index) => (
        <g
          key={`${leaf.x}-${leaf.y}-${index}`}
          transform={`translate(${leaf.x},${leaf.y}) rotate(${leaf.deg}) scale(${leaf.sc})`}
          opacity={opacity}
        >
          <path d={LEAF} fill={fill} />
          {veinColor ? (
            <path
              d={VEIN}
              fill="none"
              stroke={veinColor}
              strokeWidth={0.5}
              strokeLinecap="round"
              opacity={0.55}
            />
          ) : null}
        </g>
      ))}
    </>
  )
}

function GrowthGroup({
  progress,
  origin,
  delayClass,
  children,
}: {
  progress: number
  origin: string
  delayClass: string
  children: ReactNode
}) {
  const style = {
    '--grow': progress,
    '--grow-scale': 0.16 + progress * 0.84,
    '--grow-lift': `${(1 - progress) * 18}px`,
    '--cluster-origin': origin,
  } as CSSProperties

  return (
    <g className={`${styles.clusterGrowth} ${delayClass}`} style={style}>
      {children}
    </g>
  )
}

export interface OakCanopyProps {
  west: number
  east: number
  northwest: number
  northeast: number
  apex: number
  front: number
  shadowFilterId: string
  frontShadowFilterId: string
  isWindActive: boolean
}

export function OakCanopy({
  west,
  east,
  northwest,
  northeast,
  apex,
  front,
  shadowFilterId,
  frontShadowFilterId,
  isWindActive,
}: OakCanopyProps) {
  const windClass = isWindActive ? styles.windActive : ''

  return (
    <g aria-label="Oak canopy">
      <GrowthGroup
        progress={west}
        origin="260px 370px"
        delayClass={styles.clusterWest}
      >
        <g className={`${styles.windCluster} ${windClass}`}>
          <g transform="translate(172,322)" filter={`url(#${shadowFilterId})`}>
            <ellipse cx="4" cy="9" rx="92" ry="47" fill="#08160A" opacity="0.52" />
            <ellipse cx="0" cy="0" rx="90" ry="45" fill="#172E0D" />
            <ellipse cx="-18" cy="-6" rx="72" ry="36" fill="#244818" opacity="0.88" />
            <ellipse cx="-28" cy="-11" rx="50" ry="26" fill="#305A1E" opacity="0.62" />
            <Leaves items={ring(7, 40, 24, 2.7, -22)} fill="#2A5018" veinColor="#1A380E" opacity={0.92} />
            <Leaves items={ring(10, 80, 42, 3.1, -22)} fill="#386218" veinColor="#244010" />
            <ellipse cx="-34" cy="-15" rx="36" ry="22" fill="#4A7C22" opacity="0.30" />
            <ellipse cx="-42" cy="-20" rx="18" ry="11" fill="#5E9A2C" opacity="0.18" />
          </g>
        </g>
      </GrowthGroup>

      <GrowthGroup
        progress={east}
        origin="540px 370px"
        delayClass={styles.clusterEast}
      >
        <g className={`${styles.windCluster} ${styles.windReverse} ${windClass}`}>
          <g transform="translate(628,318)" filter={`url(#${shadowFilterId})`}>
            <ellipse cx="4" cy="9" rx="88" ry="52" fill="#08160A" opacity="0.50" />
            <ellipse cx="0" cy="0" rx="86" ry="50" fill="#183410" />
            <ellipse cx="15" cy="-7" rx="70" ry="40" fill="#254E1A" opacity="0.87" />
            <ellipse cx="24" cy="-13" rx="50" ry="28" fill="#326420" opacity="0.60" />
            <Leaves items={ring(7, 40, 28, 2.7, 22)} fill="#2C5618" veinColor="#1C3A10" opacity={0.92} />
            <Leaves items={ring(10, 77, 47, 3.1, 22)} fill="#3A681C" veinColor="#264410" />
            <ellipse cx="30" cy="-17" rx="36" ry="24" fill="#4C8026" opacity="0.30" />
            <ellipse cx="38" cy="-22" rx="18" ry="12" fill="#62A030" opacity="0.18" />
          </g>
        </g>
      </GrowthGroup>

      <GrowthGroup
        progress={northwest}
        origin="325px 305px"
        delayClass={styles.clusterNorthwest}
      >
        <g className={`${styles.windCluster} ${styles.windSlow} ${windClass}`}>
          <g transform="translate(255,216) rotate(-7)" filter={`url(#${shadowFilterId})`}>
            <ellipse cx="3" cy="9" rx="74" ry="62" fill="#0C2208" opacity="0.48" />
            <ellipse cx="0" cy="0" rx="72" ry="60" fill="#1E4610" />
            <ellipse cx="-10" cy="-9" rx="58" ry="48" fill="#2E6420" opacity="0.87" />
            <ellipse cx="-16" cy="-16" rx="40" ry="34" fill="#3C7A28" opacity="0.62" />
            <Leaves items={ring(6, 32, 32, 2.8, -12)} fill="#2E5C1C" veinColor="#1E3E12" opacity={0.92} />
            <Leaves items={ring(10, 64, 57, 3.2, -12)} fill="#44782C" veinColor="#2C501C" />
            <ellipse cx="-18" cy="-21" rx="36" ry="28" fill="#5C9A38" opacity="0.34" />
            <ellipse cx="-24" cy="-28" rx="18" ry="14" fill="#78BC48" opacity="0.21" />
          </g>
        </g>
      </GrowthGroup>

      <GrowthGroup
        progress={northeast}
        origin="475px 305px"
        delayClass={styles.clusterNortheast}
      >
        <g className={`${styles.windCluster} ${styles.windReverse} ${styles.windSlow} ${windClass}`}>
          <g transform="translate(545,216) rotate(9)" filter={`url(#${shadowFilterId})`}>
            <ellipse cx="3" cy="9" rx="78" ry="60" fill="#0C2208" opacity="0.46" />
            <ellipse cx="0" cy="0" rx="76" ry="58" fill="#204A12" />
            <ellipse cx="11" cy="-9" rx="62" ry="47" fill="#306A22" opacity="0.87" />
            <ellipse cx="18" cy="-16" rx="44" ry="33" fill="#3E802A" opacity="0.62" />
            <Leaves items={ring(6, 34, 32, 2.8, 12)} fill="#306020" veinColor="#204014" opacity={0.92} />
            <Leaves items={ring(10, 68, 55, 3.2, 12)} fill="#487E30" veinColor="#305420" />
            <ellipse cx="20" cy="-21" rx="38" ry="28" fill="#62A03C" opacity="0.36" />
            <ellipse cx="26" cy="-28" rx="20" ry="14" fill="#80C04C" opacity="0.22" />
          </g>
        </g>
      </GrowthGroup>

      <GrowthGroup
        progress={apex}
        origin="400px 260px"
        delayClass={styles.clusterApex}
      >
        <g className={`${styles.windCluster} ${styles.windApex} ${windClass}`}>
          <g transform="translate(400,143)" filter={`url(#${shadowFilterId})`}>
            <ellipse cx="3" cy="11" rx="76" ry="68" fill="#112808" opacity="0.46" />
            <ellipse cx="0" cy="0" rx="74" ry="66" fill="#265618" />
            <ellipse cx="-8" cy="-10" rx="60" ry="53" fill="#387828" opacity="0.87" />
            <ellipse cx="-13" cy="-18" rx="43" ry="38" fill="#4C9234" opacity="0.66" />
            <Leaves items={ring(6, 34, 35, 2.8, 0)} fill="#325E20" veinColor="#204014" opacity={0.92} />
            <Leaves items={ring(10, 67, 62, 3.2, 0)} fill="#509040" veinColor="#346028" />
            <ellipse cx="-15" cy="-24" rx="40" ry="33" fill="#68AC48" opacity="0.38" />
            <ellipse cx="-18" cy="-32" rx="24" ry="19" fill="#88C85C" opacity="0.26" />
            <ellipse cx="-20" cy="-39" rx="12" ry="9" fill="#A8E072" opacity="0.16" />
          </g>
        </g>
      </GrowthGroup>

      <GrowthGroup
        progress={front}
        origin="400px 450px"
        delayClass={styles.clusterFront}
      >
        <g className={`${styles.windCluster} ${styles.windFront} ${windClass}`}>
          <g transform="translate(400,378)" filter={`url(#${frontShadowFilterId})`}>
            <ellipse cx="3" cy="11" rx="97" ry="67" fill="#152A0C" opacity="0.48" />
            <ellipse cx="0" cy="0" rx="95" ry="65" fill="#2A6018" />
            <ellipse cx="-9" cy="-10" rx="80" ry="54" fill="#429032" opacity="0.88" />
            <ellipse cx="-13" cy="-18" rx="58" ry="40" fill="#58A840" opacity="0.70" />
            <Leaves items={ring(7, 46, 38, 3.0, 6)} fill="#3A7226" veinColor="#265018" opacity={0.92} />
            <Leaves items={ring(12, 87, 62, 3.5, 6)} fill="#60A440" veinColor="#406C28" />
            <ellipse cx="-13" cy="-24" rx="52" ry="37" fill="#7CC050" opacity="0.40" />
            <ellipse cx="-16" cy="-33" rx="32" ry="23" fill="#9AD462" opacity="0.28" />
            <ellipse cx="-18" cy="-41" rx="18" ry="13" fill="#B6E878" opacity="0.18" />
            <ellipse cx="-20" cy="-48" rx="8" ry="6" fill="#D0F890" opacity="0.11" />
          </g>
        </g>
      </GrowthGroup>
    </g>
  )
}
