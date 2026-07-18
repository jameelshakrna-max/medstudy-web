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

const mainBranches = [
  ['M392 545 Q328 503 273 430 Q246 394 224 332', 17],
  ['M406 535 Q476 500 535 437 Q574 396 603 338', 18],
  ['M398 493 Q370 426 369 355 Q369 308 386 255', 12],
  ['M410 487 Q446 423 466 349 Q480 302 475 249', 11],
  ['M356 472 Q314 433 290 382', 8],
  ['M455 463 Q503 420 526 370', 8],
] as const

const fronds = [
  [224, 330, 270, 575, -8, 0.92],
  [276, 344, 308, 624, -4, 1.04],
  [326, 292, 345, 610, -2, 0.96],
  [382, 250, 390, 606, 0, 1.1],
  [434, 250, 428, 618, 2, 1.05],
  [482, 286, 470, 616, 3, 0.98],
  [535, 334, 506, 610, 6, 1.08],
  [604, 338, 558, 582, 9, 0.9],
] as const

function WillowFrond({
  x1,
  y1,
  x2,
  y2,
  bend,
  speed,
  active,
  index,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  bend: number
  speed: number
  active: boolean
  index: number
}) {
  const midX = (x1 + x2) / 2 + bend * 2
  const midY = (y1 + y2) / 2 - 22

  return (
    <g
      className={`${styles.frond} ${active ? styles.windOn : ''}`}
      style={
        {
          '--frond-speed': speed,
          '--frond-delay': `${-index * 0.37}s`,
        } as CSSProperties
      }
    >
      <path
        d={`M${x1} ${y1} Q${midX} ${midY} ${x2} ${y2}`}
        stroke="#214F3E"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: 10 }, (_, leafIndex) => {
        const t = (leafIndex + 1) / 11
        const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * midX + t * t * x2
        const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * midY + t * t * y2
        const side = leafIndex % 2 === 0 ? -1 : 1
        return (
          <g key={leafIndex} transform={`translate(${x} ${y}) rotate(${side * 24})`}>
            <ellipse cx={side * 9} cy="0" rx="13" ry="5" fill={leafIndex < 4 ? '#5DBF8D' : '#3C936E'} opacity={0.92} />
            <ellipse cx={side * 6} cy="-2" rx="7" ry="2.4" fill="#A0E3B9" opacity="0.38" />
          </g>
        )
      })}
    </g>
  )
}

export function WillowTree({ uid, growth, windActive, preview, state }: SpeciesProps) {
  const trunkGradient = `willow-trunk-${uid}`
  const glowGradient = `willow-glow-${uid}`
  const seedStyle = { '--grow': growth.seed } as CSSProperties
  const particleStyle = { '--grow': growth.particles } as CSSProperties

  return (
    <>
      <defs>
        <linearGradient id={trunkGradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#21170D" />
          <stop offset="35%" stopColor="#5C4431" />
          <stop offset="60%" stopColor="#8A6B4A" />
          <stop offset="82%" stopColor="#4D3827" />
          <stop offset="100%" stopColor="#1D140C" />
        </linearGradient>
        <radialGradient id={glowGradient}>
          <stop offset="0%" stopColor="#7EF2D1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#7EF2D1" stopOpacity="0" />
        </radialGradient>
      </defs>

      <Ground grow={Math.max(0.2, growth.roots)}>
        <ellipse cx="400" cy="740" rx="274" ry="25" fill="#091510" opacity="0.34" />
        <ellipse cx="400" cy="734" rx="322" ry="18" fill="#2C6A51" opacity="0.45" />
        <ellipse cx="400" cy="728" rx="265" ry="10" fill="#67A982" opacity="0.44" />
      </Ground>

      <g className={styles.treeBody}>
        <g className={styles.seed} style={seedStyle}>
          <ellipse cx="400" cy="723" rx="17" ry="8" fill="#302315" />
          <path d="M400 721 Q398 705 409 690" stroke="#5C4431" strokeWidth="5" fill="none" strokeLinecap="round" />
          <ellipse cx="414" cy="686" rx="12" ry="5" fill="#5DBF8D" transform="rotate(-24 414 686)" />
        </g>

        <DrawGroup draw={growth.roots}>
          <g fill="none" strokeLinecap="round">
            <path d="M355 720 Q302 732 251 751" stroke="#2A1D13" strokeWidth="11" pathLength={1} />
            <path d="M383 723 Q346 744 321 758" stroke="#4C3525" strokeWidth="7" pathLength={1} />
            <path d="M446 718 Q504 730 558 749" stroke="#2A1D13" strokeWidth="11" pathLength={1} />
            <path d="M418 723 Q454 744 483 758" stroke="#4C3525" strokeWidth="7" pathLength={1} />
          </g>
        </DrawGroup>

        <TrunkGrow grow={growth.trunk}>
          <path
            d="M354 726 C352 687 363 647 374 612 C389 566 385 529 369 487 C358 456 365 419 389 389 C407 367 430 355 449 349 C437 378 428 407 432 441 C438 487 452 530 455 575 C459 630 454 680 444 726 Z"
            fill={`url(#${trunkGradient})`}
          />
          <path d="M378 705 Q376 630 392 554 Q398 483 390 414" stroke="#BFA17B" strokeWidth="3" opacity="0.3" fill="none" />
          <path d="M429 704 Q441 620 426 545 Q415 468 427 384" stroke="#1A120B" strokeWidth="2" opacity="0.42" fill="none" />
        </TrunkGrow>

        <DrawGroup draw={growth.branches}>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {mainBranches.map(([d, width]) => (
              <path key={d} d={d} stroke="#3B2A1D" strokeWidth={width} pathLength={1} />
            ))}
          </g>
        </DrawGroup>

        <GrowLayer grow={growth.canopyBack} origin="400px 390px">
          <WindGroup active={windActive} speed="slow">
            <g opacity="0.82">
              <ellipse cx="312" cy="320" rx="86" ry="58" fill="#174536" />
              <ellipse cx="489" cy="313" rx="92" ry="60" fill="#164A39" />
              <ellipse cx="404" cy="255" rx="96" ry="65" fill="#1A5A42" />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyMid} origin="400px 420px">
          <WindGroup active={windActive} speed="medium" reverse>
            <g>
              <ellipse cx="335" cy="355" rx="105" ry="68" fill="#237153" opacity="0.9" />
              <ellipse cx="474" cy="353" rx="106" ry="68" fill="#277A59" opacity="0.9" />
              <ellipse cx="400" cy="302" rx="112" ry="74" fill="#2D8761" opacity="0.92" />
              <ellipse cx="374" cy="276" rx="64" ry="38" fill="#65B98B" opacity="0.25" />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyFront} origin="400px 525px">
          <g>
            {fronds.map(([x1, y1, x2, y2, bend, speed], index) => (
              <WillowFrond
                key={`${x1}-${x2}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                bend={bend}
                speed={speed}
                active={windActive}
                index={index}
              />
            ))}
          </g>
        </GrowLayer>

        <DetailLayer grow={growth.details}>
          <g className={styles.particles} style={particleStyle}>
            {!preview &&
              [
                [262, 410],
                [326, 235],
                [430, 214],
                [552, 357],
                [501, 468],
                [356, 498],
              ].map(([x, y], index) => (
                <circle
                  key={`${x}-${y}`}
                  className={`${styles.sparkle} ${windActive ? styles.windOn : ''}`}
                  style={{ '--sparkle-index': index } as CSSProperties}
                  cx={x}
                  cy={y}
                  r={index % 2 === 0 ? 3.2 : 2.2}
                  fill="#A8F5DA"
                  opacity="0.7"
                />
              ))}
          </g>
        </DetailLayer>
      </g>

      {state === 'success' && !preview ? (
        <g className={styles.successHalo}>
          <ellipse cx="400" cy="390" rx="250" ry="230" fill={`url(#${glowGradient})`} />
        </g>
      ) : null}
    </>
  )
}
