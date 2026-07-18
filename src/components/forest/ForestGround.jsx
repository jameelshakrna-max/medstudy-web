import { useMemo } from 'react'
import { createSeededRandom } from '../../lib/seededRandom'

function HillSilhouette({ d, fill, opacity, blur }) {
  return (
    <path
      d={d}
      fill={fill}
      opacity={opacity}
      style={blur ? { filter: `blur(${blur}px)` } : undefined}
    />
  )
}

const GRASS_POSITIONS = [
  2, 5, 9, 13, 17, 21, 26, 31, 36, 42, 48, 55, 62, 70, 78, 86,
  94, 103, 112, 122, 132, 143, 154, 166, 178, 191, 204, 218, 232,
  247, 262, 278, 294, 311, 328, 346, 364, 383, 402, 422, 442, 463,
  484, 506, 528, 551, 574, 598, 622, 647, 672, 698, 724, 751, 778,
]

const ROCK_POSITIONS = [
  { x: 45, y: 0, rx: 8, ry: 5 },
  { x: 190, y: 2, rx: 6, ry: 4 },
  { x: 380, y: -1, rx: 10, ry: 6 },
  { x: 560, y: 1, rx: 7, ry: 4 },
  { x: 720, y: 0, rx: 9, ry: 5 },
]

const FLOWER_POSITIONS = [
  { x: 30, y: -4 }, { x: 85, y: -6 }, { x: 150, y: -3 },
  { x: 240, y: -5 }, { x: 320, y: -4 }, { x: 410, y: -6 },
  { x: 500, y: -3 }, { x: 580, y: -5 }, { x: 660, y: -4 },
  { x: 740, y: -6 }, { x: 115, y: -5 }, { x: 350, y: -3 },
  { x: 470, y: -6 }, { x: 620, y: -4 }, { x: 290, y: -5 },
]

const PATH_D = 'M-20 8 Q120 4 260 10 Q400 16 540 8 Q680 0 820 6'

export default function ForestGround({ env, wind = false }) {
  const grassRand = useMemo(() => createSeededRandom('ground-grass'), [])
  const flowerRand = useMemo(() => createSeededRandom('ground-flowers'), [])

  const grassData = useMemo(() =>
    GRASS_POSITIONS.map((x, i) => ({
      x,
      height: 12 + grassRand() * 14,
      lean: (grassRand() - 0.5) * 4,
      delay: (grassRand() * 3).toFixed(1),
      width: 1.5 + grassRand() * 1,
    })),
  [])

  const flowerData = useMemo(() =>
    FLOWER_POSITIONS.map((pos, i) => ({
      ...pos,
      color: env.flowerColors[i % env.flowerColors.length],
      size: 2 + flowerRand() * 2,
      delay: (flowerRand() * 4).toFixed(1),
    })),
  [])

  return (
    <svg
      className="forestGround"
      viewBox="0 0 800 40"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '22%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={env.ground} />
          <stop offset="100%" stopColor={env.groundDark} />
        </linearGradient>
        <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(180,160,130,0.0)" />
          <stop offset="20%" stopColor="rgba(180,160,130,0.25)" />
          <stop offset="50%" stopColor="rgba(180,160,130,0.35)" />
          <stop offset="80%" stopColor="rgba(180,160,130,0.25)" />
          <stop offset="100%" stopColor="rgba(180,160,130,0.0)" />
        </linearGradient>
      </defs>

      {/* Ground plane */}
      <rect x="0" y="10" width="800" height="30" fill="url(#groundGrad)" />

      {/* Subtle path */}
      {env.features.path && (
        <path
          d={PATH_D}
          fill="none"
          stroke="url(#pathGrad)"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.4"
        />
      )}

      {/* Grass tufts */}
      {grassData.map((g, i) => (
        <g
          key={i}
          className={wind ? 'groundGrass' : ''}
          style={{
            transformOrigin: `${g.x}px 12px`,
            animationDelay: wind ? `${g.delay}s` : undefined,
          }}
        >
          <line
            x1={g.x} y1={12}
            x2={g.x + g.lean - 2} y2={12 - g.height}
            stroke={env.grass}
            strokeWidth={g.width}
            strokeLinecap="round"
            opacity="0.7"
          />
          <line
            x1={g.x} y1={12}
            x2={g.x + g.lean + 3} y2={12 - g.height * 0.8}
            stroke={env.grassDark}
            strokeWidth={g.width * 0.8}
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
      ))}

      {/* Flowers */}
      {env.features.flowers && flowerData.map((f, i) => (
        <g
          key={`f${i}`}
          className={wind ? 'groundFlower' : ''}
          style={{
            transformOrigin: `${f.x}px 12px`,
            animationDelay: wind ? `${f.delay}s` : undefined,
          }}
        >
          <circle cx={f.x} cy={12 + f.y} r={f.size} fill={f.color} opacity="0.75" />
          <circle cx={f.x} cy={12 + f.y} r={f.size * 0.4} fill="#FFF8DC" opacity="0.6" />
        </g>
      ))}

      {/* Rocks */}
      {env.features.rocks && ROCK_POSITIONS.map((r, i) => (
        <ellipse
          key={`r${i}`}
          cx={r.x} cy={12 + r.y}
          rx={r.rx} ry={r.ry}
          fill="rgba(120,110,100,0.35)"
        />
      ))}
    </svg>
  )
}
