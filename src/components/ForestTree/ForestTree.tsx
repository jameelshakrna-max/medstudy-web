import { useId, type CSSProperties } from 'react'
import { OakCanopy } from './OakCanopy'
import styles from './ForestTree.module.css'
import {
  clamp01,
  getTreeStages,
  type ForestTreeState,
} from './treeGrowth'

export interface ForestTreeProps {
  /** Timer progress from 0 to 1. */
  progress: number
  state?: ForestTreeState
  className?: string
  /** CSS width, for example 420, "100%", or "min(64vw, 560px)". */
  size?: number | string
  ariaLabel?: string
}

const rootPaths = [
  ['M368 722 Q328 726 285 736 Q254 743 232 750', 9, '#3A1D08'],
  ['M362 726 Q328 742 308 758', 5, '#3A1D08'],
  ['M378 724 Q348 731 318 744', 6, '#3A1D08'],
  ['M392 726 Q388 738 385 754', 7, '#4A2810'],
  ['M408 726 Q412 738 415 754', 7, '#4A2810'],
  ['M422 724 Q452 731 482 744', 6, '#3A1D08'],
  ['M432 722 Q472 726 515 736 Q546 743 568 750', 9, '#3A1D08'],
  ['M438 726 Q472 742 492 758', 5, '#3A1D08'],
] as const

const branchPaths = [
  ['M368 508 Q318 492 268 478 Q222 466 192 454', 22, '#3A1D08'],
  ['M268 478 Q245 462 236 438 Q228 418 224 398', 13, '#3A1D08'],
  ['M192 454 Q178 440 170 420 Q163 403 160 385', 8, '#4A2810'],
  ['M224 398 Q212 378 208 358', 5.5, '#5A3418'],
  ['M236 438 Q218 420 210 398', 5, '#5A3418'],
  ['M378 498 Q338 476 298 456 Q266 440 248 422', 17, '#3A1D08'],
  ['M298 456 Q274 432 264 408', 10, '#3A1D08'],
  ['M248 422 Q230 400 226 378', 7, '#4A2810'],
  ['M264 408 Q252 386 248 364', 5, '#5A3418'],
  ['M432 508 Q482 492 532 478 Q578 466 608 454', 22, '#3A1D08'],
  ['M532 478 Q555 462 564 438 Q572 418 576 398', 13, '#3A1D08'],
  ['M608 454 Q622 440 630 420 Q637 403 640 385', 8, '#4A2810'],
  ['M576 398 Q588 378 592 358', 5.5, '#5A3418'],
  ['M564 438 Q582 420 590 398', 5, '#5A3418'],
  ['M422 498 Q462 476 502 456 Q534 440 552 422', 17, '#3A1D08'],
  ['M502 456 Q526 432 536 408', 10, '#3A1D08'],
  ['M552 422 Q570 400 574 378', 7, '#4A2810'],
  ['M536 408 Q548 386 552 364', 5, '#5A3418'],
  ['M392 488 Q378 462 370 432 Q363 406 360 378', 13, '#3A1D08'],
  ['M408 488 Q422 462 430 432 Q437 406 440 378', 13, '#3A1D08'],
  ['M400 488 Q398 460 396 432 Q394 406 395 378 Q396 355 397 332', 10, '#3A1D08'],
  ['M360 378 Q348 355 342 330', 6.5, '#4A2810'],
  ['M360 378 Q352 356 344 338', 4.5, '#5A3418'],
  ['M440 378 Q452 355 458 330', 6.5, '#4A2810'],
  ['M440 378 Q448 356 456 338', 4.5, '#5A3418'],
  ['M397 332 Q390 308 387 284', 6, '#4A2810'],
  ['M397 332 Q405 308 410 284', 6, '#4A2810'],
  ['M342 330 Q325 312 318 292', 3.5, '#5A3418'],
  ['M342 330 Q332 308 328 286', 3, '#5A3418'],
  ['M458 330 Q475 312 482 292', 3.5, '#5A3418'],
  ['M458 330 Q468 308 472 286', 3, '#5A3418'],
  ['M387 284 Q380 264 377 244', 3, '#5A3418'],
  ['M410 284 Q418 264 422 244', 3, '#5A3418'],
] as const

const grassTufts = [225, 252, 278, 308, 335, 362, 390, 418, 445, 472, 500, 528, 556, 582]
const flowers = [
  [238, 720, '#FFF5C0', '#F2CC40'],
  [295, 717, '#FFD6E8', '#E87898'],
  [355, 719, '#FFF5C0', '#F2CC40'],
  [448, 719, '#D8F0FF', '#78B8F0'],
  [508, 718, '#FFD6E8', '#E87898'],
  [568, 717, '#FFF5C0', '#F2CC40'],
] as const

const particles = [
  [164, 335, 3.2, '#E8F872', 0.65, 0],
  [182, 285, 2, '#C8E860', 0.5, 1.4],
  [630, 325, 3, '#E8F872', 0.62, 0.8],
  [648, 275, 2, '#C8E860', 0.48, 2.1],
  [350, 150, 2.5, '#F0FF88', 0.58, 1.8],
  [450, 158, 2.8, '#D8F066', 0.55, 0.5],
  [400, 138, 2, '#F0FF88', 0.62, 2.8],
  [292, 188, 1.8, '#C8E860', 0.44, 1.1],
  [508, 186, 2.2, '#C8E860', 0.47, 2.5],
  [155, 420, 1.8, '#D4F272', 0.38, 3.2],
  [645, 415, 1.8, '#D4F272', 0.38, 0.3],
  [318, 168, 1.5, '#EAFF80', 0.42, 3.6],
  [485, 165, 1.6, '#EAFF80', 0.4, 1.9],
  [200, 240, 1.6, '#C8E860', 0.36, 2.9],
  [598, 242, 1.6, '#C8E860', 0.36, 1.2],
  [400, 124, 1.4, '#FFFFFF', 0.4, 3.9],
] as const

function sizeValue(size: ForestTreeProps['size']): string {
  if (typeof size === 'number') return `${size}px`
  return size ?? 'min(100%, 560px)'
}

export default function ForestTree({
  progress,
  state = 'idle',
  className = '',
  size,
  ariaLabel = 'An oak tree growing with the focus timer',
}: ForestTreeProps) {
  const rawId = useId().replace(/:/g, '')
  const shadowFilterId = `oak-shadow-${rawId}`
  const frontShadowFilterId = `oak-front-shadow-${rawId}`
  const glowFilterId = `oak-glow-${rawId}`
  const trunkGradientId = `oak-trunk-${rawId}`
  const grassGradientId = `oak-grass-${rawId}`
  const trunkClipId = `oak-trunk-clip-${rawId}`

  const logicalProgress = state === 'success' ? 1 : clamp01(progress)
  const visualProgress = Math.max(logicalProgress, state === 'idle' ? 0.015 : 0.025)
  const stages = getTreeStages(visualProgress)
  const isWindActive = state === 'running' || state === 'success'

  const rootStyle = {
    '--draw': stages.roots,
  } as CSSProperties
  const branchStyle = {
    '--draw': stages.branches,
  } as CSSProperties
  const seedStyle = {
    '--seed-opacity': stages.seed,
  } as CSSProperties
  const groundStyle = {
    '--ground-grow': stages.ground,
  } as CSSProperties
  const flowerStyle = {
    '--flower-grow': stages.flowers,
  } as CSSProperties
  const particleStyle = {
    '--particle-opacity': stages.particles,
  } as CSSProperties
  const glowStyle = {
    '--glow-opacity': stages.glow,
  } as CSSProperties

  return (
    <div
      className={`${styles.wrapper} ${className}`.trim()}
      style={{ width: sizeValue(size) }}
      data-state={state}
      data-progress={logicalProgress.toFixed(3)}
    >
      <svg
        className={`${styles.svg} ${styles[state]}`}
        viewBox="0 0 800 800"
        role="img"
        aria-label={ariaLabel}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={trunkGradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2C1505" />
            <stop offset="28%" stopColor="#6B3C18" />
            <stop offset="58%" stopColor="#9B6030" />
            <stop offset="78%" stopColor="#7B4820" />
            <stop offset="100%" stopColor="#3A1D08" />
          </linearGradient>
          <linearGradient id={grassGradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#4A7A28" />
            <stop offset="100%" stopColor="#78CC44" />
          </linearGradient>
          <filter id={shadowFilterId} x="-30%" y="-25%" width="160%" height="160%">
            <feDropShadow dx="2" dy="6" stdDeviation="11" floodColor="#051502" floodOpacity="0.34" />
          </filter>
          <filter id={frontShadowFilterId} x="-30%" y="-25%" width="160%" height="160%">
            <feDropShadow dx="3" dy="8" stdDeviation="14" floodColor="#061803" floodOpacity="0.4" />
          </filter>
          <filter id={glowFilterId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="24" />
          </filter>
          <clipPath id={trunkClipId}>
            <rect
              x="320"
              y={728 - 258 * stages.trunk}
              width="160"
              height={258 * stages.trunk + 4}
              rx="24"
            />
          </clipPath>
        </defs>

        <g className={styles.environment}>
          <g className={styles.glow} style={glowStyle} filter={`url(#${glowFilterId})`}>
            <ellipse cx="400" cy="330" rx="265" ry="205" fill="#D6F76C" opacity="0.23" />
          </g>

          <g className={styles.ground} style={groundStyle}>
            <ellipse cx="400" cy="739" rx="255" ry="25" fill="#170D05" opacity="0.28" />
            <ellipse cx="400" cy="733" rx="325" ry="19" fill="#4B7D35" opacity="0.32" />
            <ellipse cx="400" cy="730" rx="285" ry="13" fill="#6BA54A" opacity="0.5" />
          </g>
        </g>

        <g className={styles.treeBody}>
          <g className={styles.roots} style={rootStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {rootPaths.map(([d, width, stroke], index) => (
              <path
                key={d}
                d={d}
                stroke={stroke}
                strokeWidth={width}
                pathLength={1}
                style={{ transitionDelay: `${index * 18}ms` }}
              />
            ))}
            <path d="M240 748 Q260 742 290 735 Q320 728 360 724" stroke="#8A5428" strokeWidth="2" opacity="0.42" pathLength={1} />
            <path d="M560 748 Q540 742 510 735 Q480 728 440 724" stroke="#8A5428" strokeWidth="2" opacity="0.42" pathLength={1} />
          </g>

          <g className={styles.trunk} clipPath={`url(#${trunkClipId})`}>
            <path
              d="M350 728 C342 710 338 688 340 665 C342 642 345 618 348 598 C351 575 354 555 356 535 C358 515 360 498 363 482 L437 482 C440 498 442 515 444 535 C446 555 449 575 452 598 C455 618 458 642 460 665 C462 688 458 710 450 728 Z"
              fill={`url(#${trunkGradientId})`}
            />
            <path d="M365 718 Q362 685 361 650 Q360 615 362 580 Q364 548 362 515" stroke="#1E0C03" strokeWidth="1.8" fill="none" opacity="0.45" />
            <path d="M375 720 Q373 688 372 655 Q371 620 373 585 Q375 552 374 520" stroke="#1E0C03" strokeWidth="1.2" fill="none" opacity="0.3" />
            <path d="M385 722 Q384 690 383 660 Q382 628 384 595" stroke="#1E0C03" strokeWidth="1" fill="none" opacity="0.25" />
            <path d="M435 718 Q438 685 439 650 Q440 615 438 580 Q436 548 438 515" stroke="#1E0C03" strokeWidth="1.8" fill="none" opacity="0.45" />
            <path d="M425 720 Q427 688 428 655 Q429 620 427 585 Q425 552 426 520" stroke="#1E0C03" strokeWidth="1.2" fill="none" opacity="0.3" />
            <path d="M444 715 Q447 682 448 648 Q449 614 447 580 Q445 545 443 510 Q441 495 439 483" stroke="#B57B40" strokeWidth="2.5" fill="none" opacity="0.5" />
            <ellipse cx="400" cy="485" rx="38" ry="8" fill="#1A0A02" opacity="0.35" />
          </g>

          <g className={styles.branches} style={branchStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {branchPaths.map(([d, width, stroke], index) => (
              <path
                key={d}
                d={d}
                stroke={stroke}
                strokeWidth={width}
                pathLength={1}
                style={{ transitionDelay: `${index * 12}ms` }}
              />
            ))}
          </g>

          <OakCanopy
            west={stages.west}
            east={stages.east}
            northwest={stages.northwest}
            northeast={stages.northeast}
            apex={stages.apex}
            front={stages.front}
            shadowFilterId={shadowFilterId}
            frontShadowFilterId={frontShadowFilterId}
            isWindActive={isWindActive}
          />
        </g>

        <g className={styles.seed} style={seedStyle}>
          <ellipse cx="400" cy="730" rx="17" ry="8" fill="#2A1708" opacity="0.45" />
          <path d="M386 727 Q400 708 414 727 Q408 741 400 743 Q392 741 386 727Z" fill="#8B5A2B" />
          <path d="M390 725 Q400 715 410 725" fill="none" stroke="#C78B4B" strokeWidth="2" opacity="0.72" />
          <path d="M400 718 Q398 703 402 693" fill="none" stroke="#4E7A25" strokeWidth="4" strokeLinecap="round" />
          <path d="M401 703 Q414 696 421 703 Q412 711 401 708Z" fill="#68A43A" />
        </g>

        <g className={styles.grass} style={groundStyle}>
          {grassTufts.map((x, index) => (
            <g key={x} transform={`translate(${x},730)`} style={{ animationDelay: `${index * 75}ms` }}>
              <path d="M0 0 Q-5-10-4-20" stroke={`url(#${grassGradientId})`} strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M0 0 Q0-12 1-23" stroke={`url(#${grassGradientId})`} strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M0 0 Q5-9 6-18" stroke={`url(#${grassGradientId})`} strokeWidth="2" fill="none" strokeLinecap="round" />
            </g>
          ))}
        </g>

        <g className={styles.flowers} style={flowerStyle}>
          {flowers.map(([x, y, petal, center], index) => (
            <g key={`${x}-${y}`} transform={`translate(${x},${y})`} style={{ transitionDelay: `${index * 70}ms` }}>
              {[0, 72, 144, 216, 288].map((angle) => {
                const radians = (angle * Math.PI) / 180
                const px = Math.cos(radians) * 5
                const py = Math.sin(radians) * 5
                return (
                  <ellipse
                    key={angle}
                    cx={px}
                    cy={py}
                    rx="3.8"
                    ry="2.2"
                    fill={petal}
                    opacity="0.92"
                    transform={`rotate(${angle},${px},${py})`}
                  />
                )
              })}
              <circle cx="0" cy="0" r="2.4" fill={center} />
            </g>
          ))}
        </g>

        <g className={styles.particles} style={particleStyle}>
          {particles.map(([x, y, radius, fill, opacity, delay], index) => (
            <circle
              key={`${x}-${y}-${index}`}
              className={styles.particle}
              cx={x}
              cy={y}
              r={radius}
              fill={fill}
              opacity={opacity}
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>

        <g className={styles.completionHalo} aria-hidden="true">
          <ellipse cx="400" cy="335" rx="278" ry="220" fill="none" stroke="#E8FF92" strokeWidth="5" opacity="0.32" />
        </g>
      </svg>
    </div>
  )
}
