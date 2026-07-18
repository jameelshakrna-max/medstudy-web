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
  ['M398 570 Q330 540 276 480 Q242 440 218 378', 17],
  ['M390 520 Q340 472 318 412 Q305 375 306 325', 12],
  ['M410 525 Q468 485 514 428 Q548 385 570 334', 15],
  ['M421 570 Q488 554 556 502 Q596 470 621 422', 17],
  ['M404 476 Q386 414 383 350 Q382 306 392 258', 12],
  ['M382 438 Q342 405 322 362', 6],
  ['M446 468 Q484 430 505 388', 7],
] as const

const blossoms = [
  [245, 348, 76, 58, -8],
  [321, 294, 80, 62, 5],
  [402, 246, 88, 69, -2],
  [490, 300, 82, 63, 8],
  [567, 362, 74, 56, -6],
  [346, 390, 92, 64, 4],
  [455, 405, 98, 68, -4],
] as const

const petalDots = [
  [214, 360, 0],
  [276, 420, 1],
  [330, 235, 2],
  [454, 218, 3],
  [538, 295, 4],
  [600, 386, 5],
  [388, 438, 6],
  [472, 468, 7],
] as const

function BlossomCluster({
  x,
  y,
  rx,
  ry,
  rotation,
  fill,
  light,
}: {
  x: number
  y: number
  rx: number
  ry: number
  rotation: number
  fill: string
  light: string
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <ellipse cx="4" cy="10" rx={rx} ry={ry} fill="#35172A" opacity="0.28" />
      <ellipse cx="0" cy="0" rx={rx} ry={ry} fill={fill} />
      <ellipse cx={-rx * 0.2} cy={-ry * 0.22} rx={rx * 0.68} ry={ry * 0.63} fill={light} opacity="0.62" />
      {[-34, -14, 8, 29, 52].map((offset, index) => (
        <g key={offset} transform={`translate(${offset} ${index % 2 === 0 ? -8 : 12})`}>
          <circle r="9" fill="#FFD4E4" opacity="0.88" />
          <circle cx="8" cy="2" r="7" fill="#F3A6C2" opacity="0.74" />
          <circle cx="-6" cy="5" r="6" fill="#FFE4EE" opacity="0.8" />
          <circle cx="1" cy="2" r="2.2" fill="#F5C45B" />
        </g>
      ))}
    </g>
  )
}

export function SakuraTree({ uid, growth, windActive, preview, state }: SpeciesProps) {
  const trunkGradient = `sakura-trunk-${uid}`
  const glowGradient = `sakura-glow-${uid}`
  const seedStyle = { '--grow': growth.seed } as CSSProperties
  const particlesStyle = { '--grow': growth.particles } as CSSProperties

  return (
    <>
      <defs>
        <linearGradient id={trunkGradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2B1417" />
          <stop offset="30%" stopColor="#6A3038" />
          <stop offset="58%" stopColor="#A65E62" />
          <stop offset="80%" stopColor="#784047" />
          <stop offset="100%" stopColor="#32181D" />
        </linearGradient>
        <radialGradient id={glowGradient}>
          <stop offset="0%" stopColor="#FFB4D0" stopOpacity="0.44" />
          <stop offset="100%" stopColor="#FFB4D0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <Ground grow={Math.max(0.18, growth.roots)}>
        <ellipse cx="400" cy="740" rx="270" ry="26" fill="#160B10" opacity="0.32" />
        <ellipse cx="400" cy="734" rx="318" ry="17" fill="#466C3B" opacity="0.54" />
        <ellipse cx="400" cy="729" rx="260" ry="10" fill="#78A95B" opacity="0.46" />
      </Ground>

      <g className={styles.treeBody}>
        <g className={styles.seed} style={seedStyle}>
          <ellipse cx="400" cy="724" rx="18" ry="8" fill="#2B190D" />
          <path d="M400 722 Q396 708 403 696" stroke="#7B4A2E" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="405" cy="694" r="8" fill="#E88CB2" />
        </g>

        <DrawGroup draw={growth.roots}>
          <g fill="none" strokeLinecap="round">
            <path d="M365 721 Q310 727 257 748" stroke="#3A1A20" strokeWidth="11" pathLength={1} />
            <path d="M385 724 Q350 742 323 758" stroke="#5C2C33" strokeWidth="7" pathLength={1} />
            <path d="M435 721 Q490 727 548 748" stroke="#3A1A20" strokeWidth="11" pathLength={1} />
            <path d="M414 724 Q451 742 480 758" stroke="#5C2C33" strokeWidth="7" pathLength={1} />
          </g>
        </DrawGroup>

        <TrunkGrow grow={growth.trunk}>
          <path
            d="M353 726 C345 690 350 642 365 601 C378 565 382 526 374 482 C369 451 383 421 399 397 C417 425 429 456 426 489 C422 535 438 574 447 611 C459 657 459 696 447 726 Z"
            fill={`url(#${trunkGradient})`}
          />
          <path d="M377 708 Q369 620 385 535 Q393 479 396 418" stroke="#D38A8D" strokeWidth="3" opacity="0.32" fill="none" />
          <path d="M427 702 Q433 632 420 555 Q413 493 403 421" stroke="#35191E" strokeWidth="2" opacity="0.48" fill="none" />
        </TrunkGrow>

        <DrawGroup draw={growth.branches}>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {branchPaths.map(([d, width]) => (
              <path key={d} d={d} stroke="#4B2228" strokeWidth={width} pathLength={1} />
            ))}
          </g>
        </DrawGroup>

        <GrowLayer grow={growth.canopyBack} origin="400px 430px">
          <WindGroup active={windActive} speed="slow">
            <g opacity="0.9">
              <BlossomCluster x={245} y={348} rx={76} ry={58} rotation={-8} fill="#AA4F77" light="#D9769B" />
              <BlossomCluster x={567} y={362} rx={74} ry={56} rotation={-6} fill="#A74970" light="#D46D92" />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyMid} origin="400px 385px">
          <WindGroup active={windActive} speed="medium" reverse>
            <g>
              <BlossomCluster x={321} y={294} rx={80} ry={62} rotation={5} fill="#C76087" light="#ED91B0" />
              <BlossomCluster x={490} y={300} rx={82} ry={63} rotation={8} fill="#BF587F" light="#E787AA" />
              <BlossomCluster x={402} y={246} rx={88} ry={69} rotation={-2} fill="#CF6B91" light="#F3A0BC" />
            </g>
          </WindGroup>
        </GrowLayer>

        <GrowLayer grow={growth.canopyFront} origin="400px 455px">
          <WindGroup active={windActive} speed="fast">
            <g>
              <BlossomCluster x={346} y={390} rx={92} ry={64} rotation={4} fill="#D36D94" light="#F2A5C0" />
              <BlossomCluster x={455} y={405} rx={98} ry={68} rotation={-4} fill="#CA638B" light="#F5A8C4" />
              <ellipse cx="395" cy="340" rx="62" ry="39" fill="#FFE0EB" opacity="0.25" />
            </g>
          </WindGroup>
        </GrowLayer>

        <DetailLayer grow={growth.details}>
          <g className={styles.particles} style={particlesStyle}>
            {!preview &&
              petalDots.map(([x, y, index]) => (
                <g
                  key={`${x}-${y}`}
                  className={`${styles.petal} ${windActive ? styles.windOn : ''}`}
                  style={{ '--petal-index': index } as CSSProperties}
                  transform={`translate(${x} ${y})`}
                >
                  <path d="M0-7 C7-5 8 1 0 7 C-6 3-6-3 0-7Z" fill="#FFBDD3" opacity="0.8" />
                </g>
              ))}
          </g>
        </DetailLayer>
      </g>

      {state === 'success' && !preview ? (
        <g className={styles.successHalo}>
          <ellipse cx="400" cy="355" rx="255" ry="215" fill={`url(#${glowGradient})`} />
        </g>
      ) : null}
    </>
  )
}
