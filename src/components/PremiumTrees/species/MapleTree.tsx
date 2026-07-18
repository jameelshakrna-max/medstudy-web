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

const MAPLE_LEAF =
  'M0-15 L5-7 L13-10 L10-2 L18 1 L9 5 L12 13 L3 9 L0 19 L-3 9 L-12 13 L-9 5 L-18 1 L-10-2 L-13-10 L-5-7 Z'

const branchPaths = [
  ['M392 545 Q325 514 267 456 Q231 420 202 365', 18],
  ['M383 502 Q337 449 317 390 Q300 342 306 292', 11],
  ['M410 540 Q477 507 532 448 Q566 411 594 358', 18],
  ['M420 493 Q470 446 496 385 Q514 341 509 289', 11],
  ['M400 478 Q397 414 403 351 Q408 310 421 267', 10],
  ['M342 455 Q302 421 276 378', 7],
  ['M461 450 Q507 416 533 372', 7],
] as const

const clusters = [
  [232, 360, 82, 60, '#7F1D1D', '#DC2626'],
  [317, 292, 90, 68, '#9A3412', '#F97316'],
  [407, 245, 96, 72, '#991B1B', '#EF4444'],
  [501, 300, 90, 68, '#9F3218', '#FB923C'],
  [578, 365, 82, 60, '#7F1D1D', '#DC2626'],
  [337, 397, 105, 70, '#B91C1C', '#F97316'],
  [472, 405, 110, 72, '#991B1B', '#F59E0B'],
] as const

function MapleCluster({
  x,
  y,
  rx,
  ry,
  dark,
  bright,
  index,
}: {
  x: number
  y: number
  rx: number
  ry: number
  dark: string
  bright: string
  index: number
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${index % 2 === 0 ? -5 : 5})`}>
      <ellipse cx="4" cy="9" rx={rx} ry={ry} fill="#240D0A" opacity="0.34" />
      <ellipse cx="0" cy="0" rx={rx} ry={ry} fill={dark} />
      <ellipse cx={-rx * 0.18} cy={-ry * 0.2} rx={rx * 0.7} ry={ry * 0.64} fill={bright} opacity="0.72" />
      {Array.from({ length: 9 }, (_, leafIndex) => {
        const angle = (leafIndex * 360) / 9 + index * 9
        const rad = (angle * Math.PI) / 180
        const px = Math.cos(rad) * rx * 0.72
        const py = Math.sin(rad) * ry * 0.68
        const color = leafIndex % 3 === 0 ? '#FBBF24' : leafIndex % 2 === 0 ? '#F97316' : '#DC2626'
        return (
          <path
            key={leafIndex}
            d={MAPLE_LEAF}
            transform={`translate(${px} ${py}) rotate(${angle + 90}) scale(${1.45 + (leafIndex % 2) * 0.16})`}
            fill={color}
            opacity="0.9"
          />
        )
      })}
    </g>
  )
}

export function MapleTree({ uid, growth, windActive, preview, state }: SpeciesProps) {
  const trunkGradient = `maple-trunk-${uid}`
  const haloGradient = `maple-halo-${uid}`
  const seedStyle = { '--grow': growth.seed } as CSSProperties
  const particleStyle = { '--grow': growth.particles } as CSSProperties

  return (
    <>
      <defs>
        <linearGradient id={trunkGradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#27130B" />
          <stop offset="28%" stopColor="#6B351F" />
          <stop offset="56%" stopColor="#A15B32" />
          <stop offset="80%" stopColor="#6D371F" />
          <stop offset="100%" stopColor="#2A150C" />
        </linearGradient>
        <radialGradient id={haloGradient}>
          <stop offset="0%" stopColor="#FB923C" stopOpacity="0.46" />
          <stop offset="100%" stopColor="#FB923C" stopOpacity="0" />
        </radialGradient>
      </defs>

      <Ground grow={Math.max(0.2, growth.roots)}>
        <ellipse cx="400" cy="740" rx="276" ry="25" fill="#1A0D08" opacity="0.35" />
        <ellipse cx="400" cy="734" rx="318" ry="18" fill="#5A5E2B" opacity="0.48" />
        <ellipse cx="400" cy="728" rx="265" ry="10" fill="#B28A3D" opacity="0.32" />
      </Ground>

      <g className={styles.treeBody}>
        <g className={styles.seed} style={seedStyle}>
          <ellipse cx="400" cy="724" rx="18" ry="8" fill="#2F190D" />
          <path d="M400 721 Q395 706 406 692" stroke="#6B351F" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d={MAPLE_LEAF} transform="translate(412 687) rotate(24) scale(0.72)" fill="#F97316" />
        </g>

        <DrawGroup draw={growth.roots}>
          <g fill="none" strokeLinecap="round">
            <path d="M356 720 Q301 729 247 750" stroke="#341B10" strokeWidth="11" pathLength={1} />
            <path d="M385 723 Q346 742 318 758" stroke="#5D321E" strokeWidth="7" pathLength={1} />
            <path d="M444 720 Q503 729 557 750" stroke="#341B10" strokeWidth="11" pathLength={1} />
            <path d="M416 723 Q452 742 482 758" stroke="#5D321E" strokeWidth="7" pathLength={1} />
          </g>
        </DrawGroup>

        <TrunkGrow grow={growth.trunk}>
          <path
            d="M352 726 C345 688 350 648 361 611 C372 575 380 540 377 501 C374 467 382 433 399 405 C417 432 428 468 425 503 C422 542 434 578 445 615 C457 654 459 691 448 726 Z"
            fill={`url(#${trunkGradient})`}
          />
          <path d="M374 708 Q368 637 384 558 Q390 490 395 430" stroke="#C7834B" strokeWidth="3" opacity="0.3" fill="none" />
          <path d="M428 705 Q438 635 422 554 Q414 488 405 427" stroke="#1C0D07" strokeWidth="2" opacity="0.42" fill="none" />
        </TrunkGrow>

        <DrawGroup draw={growth.branches}>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {branchPaths.map(([d, width]) => (
              <path key={d} d={d} stroke="#482515" strokeWidth={width} pathLength={1} />
            ))}
          </g>
        </DrawGroup>

        <GrowLayer grow={growth.canopyBack} origin="400px 410px">
          <WindGroup active={windActive} speed="slow">
            <g>
              <MapleCluster x={232} y={360} rx={82} ry={60} dark="#6F1D1B" bright="#B91C1C" index={0} />
              <MapleCluster x={578} y={365} rx={82} ry={60} dark="#6F1D1B" bright="#C2410C" index={4} />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyMid} origin="400px 360px">
          <WindGroup active={windActive} speed="medium" reverse>
            <g>
              {clusters.slice(1, 5).map(([x, y, rx, ry, dark, bright], index) => (
                <MapleCluster
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  rx={rx}
                  ry={ry}
                  dark={dark}
                  bright={bright}
                  index={index + 1}
                />
              ))}
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyFront} origin="400px 455px">
          <WindGroup active={windActive} speed="fast">
            <g>
              {clusters.slice(5).map(([x, y, rx, ry, dark, bright], index) => (
                <MapleCluster
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  rx={rx}
                  ry={ry}
                  dark={dark}
                  bright={bright}
                  index={index + 5}
                />
              ))}
              <ellipse cx="386" cy="335" rx="70" ry="38" fill="#FCD34D" opacity="0.2" />
            </g>
          </WindGroup>
        </GrowLayer>

        <DetailLayer grow={growth.details}>
          <g className={styles.particles} style={particleStyle}>
            {!preview &&
              [
                [235, 411],
                [320, 222],
                [450, 205],
                [560, 330],
                [492, 470],
                [350, 470],
              ].map(([x, y], index) => (
                <path
                  key={`${x}-${y}`}
                  d={MAPLE_LEAF}
                  className={`${styles.leafFall} ${windActive ? styles.windOn : ''}`}
                  style={{ '--leaf-index': index } as CSSProperties}
                  transform={`translate(${x} ${y}) scale(0.45)`}
                  fill={index % 2 === 0 ? '#F97316' : '#FBBF24'}
                  opacity="0.72"
                />
              ))}
          </g>
        </DetailLayer>
      </g>

      {state === 'success' && !preview ? (
        <g className={styles.successHalo}>
          <ellipse cx="400" cy="355" rx="260" ry="220" fill={`url(#${haloGradient})`} />
        </g>
      ) : null}
    </>
  )
}
