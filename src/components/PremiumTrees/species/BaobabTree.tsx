import type { CSSProperties } from 'react'
import styles from '../PremiumTree.module.css'
import type { SpeciesProps } from '../types'
import {
  DetailLayer,
  DrawGroup,
  Ground,
  GrowLayer,
  TrunkGrow,
  WindGroup,
} from './shared'

const branchPaths = [
  ['M350 465 Q288 432 238 376 Q206 340 181 290', 24],
  ['M366 440 Q325 391 309 336 Q297 295 300 248', 16],
  ['M450 465 Q512 432 562 376 Q594 340 619 290', 24],
  ['M434 440 Q475 391 491 336 Q503 295 500 248', 16],
  ['M385 423 Q366 361 365 302 Q365 258 378 215', 15],
  ['M415 423 Q434 361 435 302 Q435 258 422 215', 15],
  ['M302 360 Q257 337 226 304', 9],
  ['M498 360 Q543 337 574 304', 9],
] as const

const canopyClusters = [
  [168, 272, 92, 40, '#345C27', '#5E8C3E'],
  [276, 228, 106, 46, '#2E5524', '#628F42'],
  [400, 204, 116, 50, '#375F2A', '#74A34C'],
  [524, 228, 106, 46, '#2E5524', '#628F42'],
  [632, 272, 92, 40, '#345C27', '#5E8C3E'],
  [328, 286, 120, 48, '#3C6A2D', '#7AA653'],
  [472, 286, 120, 48, '#3C6A2D', '#7AA653'],
] as const

function BaobabCluster({
  x,
  y,
  rx,
  ry,
  dark,
  light,
}: {
  x: number
  y: number
  rx: number
  ry: number
  dark: string
  light: string
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="5" cy="9" rx={rx} ry={ry} fill="#111B0D" opacity="0.38" />
      <ellipse cx="0" cy="0" rx={rx} ry={ry} fill={dark} />
      <ellipse cx={-rx * 0.16} cy={-ry * 0.22} rx={rx * 0.72} ry={ry * 0.62} fill={light} opacity="0.62" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * 360) / 8
        const rad = (angle * Math.PI) / 180
        const px = Math.cos(rad) * rx * 0.72
        const py = Math.sin(rad) * ry * 0.66
        return (
          <ellipse
            key={index}
            cx={px}
            cy={py}
            rx={17 + (index % 3) * 2}
            ry={9 + (index % 2) * 2}
            fill={index % 2 === 0 ? '#6E9A48' : '#4F7C38'}
            transform={`rotate(${angle} ${px} ${py})`}
            opacity="0.9"
          />
        )
      })}
    </g>
  )
}

export function BaobabTree({ uid, growth, windActive, preview, state }: SpeciesProps) {
  const trunkGradient = `baobab-trunk-${uid}`
  const haloGradient = `baobab-halo-${uid}`
  const seedStyle = { '--grow': growth.seed } as CSSProperties
  const particleStyle = { '--grow': growth.particles } as CSSProperties

  return (
    <>
      <defs>
        <linearGradient id={trunkGradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4A2A17" />
          <stop offset="22%" stopColor="#8D5730" />
          <stop offset="52%" stopColor="#C18452" />
          <stop offset="77%" stopColor="#8A512B" />
          <stop offset="100%" stopColor="#3A2113" />
        </linearGradient>
        <radialGradient id={haloGradient}>
          <stop offset="0%" stopColor="#E7C48C" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#E7C48C" stopOpacity="0" />
        </radialGradient>
      </defs>

      <Ground grow={Math.max(0.22, growth.roots)}>
        <ellipse cx="400" cy="742" rx="302" ry="27" fill="#1B120D" opacity="0.36" />
        <ellipse cx="400" cy="736" rx="346" ry="18" fill="#776B3C" opacity="0.5" />
        <ellipse cx="400" cy="730" rx="290" ry="10" fill="#A69A58" opacity="0.34" />
      </Ground>

      <g className={styles.treeBody}>
        <g className={styles.seed} style={seedStyle}>
          <ellipse cx="400" cy="725" rx="20" ry="9" fill="#3B2415" />
          <path d="M400 722 Q397 705 407 690" stroke="#8D5730" strokeWidth="6" fill="none" strokeLinecap="round" />
          <ellipse cx="414" cy="687" rx="12" ry="6" fill="#6E9A48" transform="rotate(-22 414 687)" />
        </g>

        <DrawGroup draw={growth.roots}>
          <g fill="none" strokeLinecap="round">
            <path d="M325 714 Q256 725 185 750" stroke="#4C2C18" strokeWidth="18" pathLength={1} />
            <path d="M354 723 Q298 748 260 764" stroke="#704122" strokeWidth="11" pathLength={1} />
            <path d="M475 714 Q544 725 615 750" stroke="#4C2C18" strokeWidth="18" pathLength={1} />
            <path d="M446 723 Q502 748 540 764" stroke="#704122" strokeWidth="11" pathLength={1} />
            <path d="M390 724 Q383 746 380 766" stroke="#6A3B20" strokeWidth="10" pathLength={1} />
            <path d="M410 724 Q417 746 420 766" stroke="#6A3B20" strokeWidth="10" pathLength={1} />
          </g>
        </DrawGroup>

        <TrunkGrow grow={growth.trunk}>
          <path
            d="M300 726 C289 690 292 645 304 604 C319 552 337 508 348 460 C358 419 374 392 400 370 C426 392 442 419 452 460 C463 508 481 552 496 604 C508 645 511 690 500 726 Z"
            fill={`url(#${trunkGradient})`}
          />
          <path d="M337 707 Q325 628 350 545 Q369 472 390 398" stroke="#E0AA72" strokeWidth="4" opacity="0.32" fill="none" />
          <path d="M463 707 Q475 628 450 545 Q431 472 410 398" stroke="#3A2012" strokeWidth="3" opacity="0.46" fill="none" />
          <path d="M374 704 Q357 628 374 553 Q390 482 400 408" stroke="#5A321B" strokeWidth="2" opacity="0.5" fill="none" />
          <ellipse cx="400" cy="590" rx="34" ry="62" fill="#2A170D" opacity="0.2" />
        </TrunkGrow>

        <DrawGroup draw={growth.branches}>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {branchPaths.map(([d, width]) => (
              <path key={d} d={d} stroke="#56301B" strokeWidth={width} pathLength={1} />
            ))}
          </g>
        </DrawGroup>

        <GrowLayer grow={growth.canopyBack} origin="400px 330px">
          <WindGroup active={windActive} speed="slow">
            <g>
              <BaobabCluster x={168} y={272} rx={92} ry={40} dark="#294A22" light="#4D7637" />
              <BaobabCluster x={632} y={272} rx={92} ry={40} dark="#294A22" light="#4D7637" />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyMid} origin="400px 300px">
          <WindGroup active={windActive} speed="slow" reverse>
            <g>
              {canopyClusters.slice(1, 5).map(([x, y, rx, ry, dark, light]) => (
                <BaobabCluster key={`${x}-${y}`} x={x} y={y} rx={rx} ry={ry} dark={dark} light={light} />
              ))}
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyFront} origin="400px 350px">
          <WindGroup active={windActive} speed="medium">
            <g>
              {canopyClusters.slice(5).map(([x, y, rx, ry, dark, light]) => (
                <BaobabCluster key={`${x}-${y}`} x={x} y={y} rx={rx} ry={ry} dark={dark} light={light} />
              ))}
            </g>
          </WindGroup>
        </GrowLayer>

        <DetailLayer grow={growth.details}>
          <g className={styles.particles} style={particleStyle}>
            {!preview &&
              [
                [228, 309],
                [330, 183],
                [468, 177],
                [573, 312],
                [503, 410],
                [292, 419],
              ].map(([x, y], index) => (
                <circle
                  key={`${x}-${y}`}
                  className={`${styles.sparkle} ${windActive ? styles.windOn : ''}`}
                  style={{ '--sparkle-index': index } as CSSProperties}
                  cx={x}
                  cy={y}
                  r={index % 2 === 0 ? 3 : 2.2}
                  fill="#E9C98D"
                  opacity="0.58"
                />
              ))}
          </g>
        </DetailLayer>
      </g>

      {state === 'success' && !preview ? (
        <g className={styles.successHalo}>
          <ellipse cx="400" cy="350" rx="290" ry="225" fill={`url(#${haloGradient})`} />
        </g>
      ) : null}
    </>
  )
}
