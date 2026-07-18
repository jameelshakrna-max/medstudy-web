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
  ['M393 548 Q325 505 281 443 Q251 400 234 348', 16],
  ['M387 498 Q346 447 331 393 Q320 349 328 302', 10],
  ['M407 548 Q475 505 519 443 Q549 400 566 348', 16],
  ['M413 498 Q454 447 469 393 Q480 349 472 302', 10],
  ['M400 480 Q393 417 399 354 Q404 311 420 270', 9],
  ['M352 450 Q310 417 290 378', 6],
  ['M448 450 Q490 417 510 378', 6],
] as const

const crystalClusters = [
  [244, 343, 78, 56, -8],
  [324, 290, 84, 62, 5],
  [402, 240, 94, 72, -2],
  [486, 292, 86, 63, 7],
  [563, 347, 78, 56, -7],
  [346, 392, 96, 68, 4],
  [458, 398, 102, 70, -4],
] as const

const blossomChains = [
  [276, 360, 6],
  [330, 320, 7],
  [382, 282, 8],
  [432, 282, 8],
  [484, 320, 7],
  [536, 360, 6],
  [358, 400, 7],
  [446, 408, 7],
] as const

function CrystalCluster({
  x,
  y,
  rx,
  ry,
  rotation,
}: {
  x: number
  y: number
  rx: number
  ry: number
  rotation: number
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <ellipse cx="4" cy="10" rx={rx} ry={ry} fill="#1E1231" opacity="0.36" />
      <ellipse cx="0" cy="0" rx={rx} ry={ry} fill="#5B2F86" opacity="0.96" />
      <ellipse cx={-rx * 0.18} cy={-ry * 0.23} rx={rx * 0.7} ry={ry * 0.62} fill="#9C5FCC" opacity="0.64" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * 360) / 8
        const rad = (angle * Math.PI) / 180
        const px = Math.cos(rad) * rx * 0.7
        const py = Math.sin(rad) * ry * 0.65
        return (
          <polygon
            key={index}
            points="0,-14 8,-2 4,12 -5,10 -9,-3"
            transform={`translate(${px} ${py}) rotate(${angle + 10}) scale(${1.05 + (index % 2) * 0.18})`}
            fill={index % 2 === 0 ? '#B982E8' : '#7C4AB4'}
            opacity="0.88"
          />
        )
      })}
      <ellipse cx={-rx * 0.2} cy={-ry * 0.28} rx={rx * 0.34} ry={ry * 0.2} fill="#E8CCFF" opacity="0.28" />
    </g>
  )
}

function BlossomChain({
  x,
  y,
  count,
  active,
  index,
}: {
  x: number
  y: number
  count: number
  active: boolean
  index: number
}) {
  return (
    <g
      className={`${styles.frond} ${active ? styles.windOn : ''}`}
      style={
        {
          '--frond-speed': 0.9 + (index % 3) * 0.08,
          '--frond-delay': `${-index * 0.32}s`,
        } as CSSProperties
      }
      transform={`translate(${x} ${y})`}
    >
      <path d={`M0 0 Q${index % 2 === 0 ? -8 : 8} ${count * 13} 0 ${count * 26}`} stroke="#8C5BBB" strokeWidth="3" fill="none" />
      {Array.from({ length: count }, (_, petalIndex) => {
        const py = 18 + petalIndex * 21
        const side = petalIndex % 2 === 0 ? -1 : 1
        return (
          <g key={petalIndex} transform={`translate(${side * 7} ${py}) rotate(${side * 18})`}>
            <ellipse rx="9" ry="14" fill="#C48DF0" opacity="0.88" />
            <ellipse cy="-4" rx="4" ry="7" fill="#F0D8FF" opacity="0.48" />
          </g>
        )
      })}
    </g>
  )
}

export function CrystalTree({ uid, growth, windActive, preview, state }: SpeciesProps) {
  const trunkGradient = `crystal-trunk-${uid}`
  const haloGradient = `crystal-halo-${uid}`
  const seedStyle = { '--grow': growth.seed } as CSSProperties
  const particleStyle = { '--grow': growth.particles } as CSSProperties

  return (
    <>
      <defs>
        <linearGradient id={trunkGradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2A1742" />
          <stop offset="26%" stopColor="#7050A0" />
          <stop offset="52%" stopColor="#D2B7EF" />
          <stop offset="76%" stopColor="#7F59B6" />
          <stop offset="100%" stopColor="#25143A" />
        </linearGradient>
        <radialGradient id={haloGradient}>
          <stop offset="0%" stopColor="#D8B4FE" stopOpacity="0.58" />
          <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
        </radialGradient>
      </defs>

      <Ground grow={Math.max(0.2, growth.roots)}>
        <ellipse cx="400" cy="740" rx="270" ry="25" fill="#110A1D" opacity="0.38" />
        <ellipse cx="400" cy="734" rx="318" ry="18" fill="#3F2A5C" opacity="0.55" />
        <ellipse cx="400" cy="728" rx="265" ry="10" fill="#A16CC7" opacity="0.36" />
      </Ground>

      <g className={styles.treeBody}>
        <g className={styles.seed} style={seedStyle}>
          <ellipse cx="400" cy="724" rx="18" ry="8" fill="#25153A" />
          <path d="M400 721 Q397 705 408 689" stroke="#7E58B4" strokeWidth="5" fill="none" strokeLinecap="round" />
          <polygon points="0,-11 7,0 3,10 -5,8 -8,-2" transform="translate(414 684)" fill="#C48DF0" />
        </g>

        <DrawGroup draw={growth.roots}>
          <g fill="none" strokeLinecap="round">
            <path d="M356 720 Q302 730 250 750" stroke="#392154" strokeWidth="11" pathLength={1} />
            <path d="M384 723 Q348 742 320 758" stroke="#684A91" strokeWidth="7" pathLength={1} />
            <path d="M444 720 Q498 730 550 750" stroke="#392154" strokeWidth="11" pathLength={1} />
            <path d="M416 723 Q452 742 480 758" stroke="#684A91" strokeWidth="7" pathLength={1} />
          </g>
        </DrawGroup>

        <TrunkGrow grow={growth.trunk}>
          <path
            d="M352 726 C347 687 353 646 364 607 C375 567 382 530 378 492 C375 458 385 426 400 401 C416 426 426 458 423 492 C419 530 426 567 437 607 C448 646 453 687 448 726 Z"
            fill={`url(#${trunkGradient})`}
          />
          <path d="M373 706 Q368 636 384 555 Q391 488 395 426" stroke="#F0D8FF" strokeWidth="3" opacity="0.36" fill="none" />
          <path d="M428 704 Q437 636 421 554 Q413 487 405 425" stroke="#2B173F" strokeWidth="2" opacity="0.48" fill="none" />
          <polygon points="0,-24 12,-4 7,20 -9,18 -14,-6" transform="translate(401 610)" fill="#CDB1E8" opacity="0.18" />
        </TrunkGrow>

        <DrawGroup draw={growth.branches}>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {branchPaths.map(([d, width]) => (
              <path key={d} d={d} stroke="#5D3C7C" strokeWidth={width} pathLength={1} />
            ))}
          </g>
        </DrawGroup>

        <GrowLayer grow={growth.canopyBack} origin="400px 405px">
          <WindGroup active={windActive} speed="slow">
            <g>
              <CrystalCluster x={244} y={343} rx={78} ry={56} rotation={-8} />
              <CrystalCluster x={563} y={347} rx={78} ry={56} rotation={-7} />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyMid} origin="400px 360px">
          <WindGroup active={windActive} speed="medium" reverse>
            <g>
              {crystalClusters.slice(1, 5).map(([x, y, rx, ry, rotation]) => (
                <CrystalCluster key={`${x}-${y}`} x={x} y={y} rx={rx} ry={ry} rotation={rotation} />
              ))}
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyFront} origin="400px 470px">
          <WindGroup active={windActive} speed="fast">
            <g>
              {crystalClusters.slice(5).map(([x, y, rx, ry, rotation]) => (
                <CrystalCluster key={`${x}-${y}`} x={x} y={y} rx={rx} ry={ry} rotation={rotation} />
              ))}
            </g>
          </WindGroup>
        </GrowLayer>

        <DetailLayer grow={growth.details}>
          <g>
            {blossomChains.map(([x, y, count], index) => (
              <BlossomChain key={`${x}-${y}`} x={x} y={y} count={count} active={windActive} index={index} />
            ))}
          </g>
          <g className={styles.particles} style={particleStyle}>
            {!preview &&
              [
                [228, 350],
                [318, 210],
                [410, 185],
                [502, 218],
                [574, 350],
                [468, 482],
                [342, 478],
              ].map(([x, y], index) => (
                <g
                  key={`${x}-${y}`}
                  className={`${styles.sparkle} ${windActive ? styles.windOn : ''}`}
                  style={{ '--sparkle-index': index } as CSSProperties}
                  transform={`translate(${x} ${y})`}
                >
                  <path d="M0-7 L2-2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2-2 Z" fill="#F0D8FF" opacity="0.82" />
                </g>
              ))}
          </g>
        </DetailLayer>
      </g>

      {state === 'success' && !preview ? (
        <g className={styles.successHalo}>
          <ellipse cx="400" cy="365" rx="270" ry="230" fill={`url(#${haloGradient})`} />
        </g>
      ) : null}
    </>
  )
}
