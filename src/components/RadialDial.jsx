import { useRef, useMemo } from 'react'
import { useRadialDrag } from '../hooks/useRadialDrag'
import { useForestAudio } from '../hooks/useForestAudio'
import s from './RadialDial.module.css'

const LABEL_ANGLES = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120]

export default function RadialDial({ minutes, onChange, mode, disabled }) {
  const centerRef = useRef(null)
  const { playSnap } = useForestAudio()

  const {
    dragging, handlePointerDown, angleDeg, circumference, arcLength,
    SNAP_INTERVALS, MIN_MINUTES, MAX_MINUTES,
  } = useRadialDrag({
    minutes,
    onChange,
    onSnap: (snapped) => {
      onChange(snapped)
      playSnap()
    },
    centerRef,
    disabled,
  })

  const modeColor = mode === 'study' ? 'var(--blue)' : mode === 'break' ? 'var(--emerald)' : 'var(--indigo)'
  const modeColorDim = mode === 'study' ? 'rgba(79,140,255,0.15)' : mode === 'break' ? 'rgba(16,185,129,0.15)' : 'rgba(129,140,248,0.15)'

  const tickMarks = useMemo(() => {
    const marks = []
    const r = 148
    for (let i = 0; i < 120; i++) {
      const angle = ((i * 3) - 90) * Math.PI / 180
      const isMajor = SNAP_INTERVALS.includes(i + 1)
      const len = isMajor ? 10 : i % 5 === 0 ? 6 : 3
      const x1 = 150 + r * Math.cos(angle)
      const y1 = 150 + r * Math.sin(angle)
      const x2 = 150 + (r - len) * Math.cos(angle)
      const y2 = 150 + (r - len) * Math.sin(angle)
      marks.push({ id: i, x1, y1, x2, y2, major: isMajor, minute: i + 1 })
    }
    return marks
  }, [])

  const snapLabels = useMemo(() => {
    const r = 158
    return LABEL_ANGLES.map(m => {
      const angle = ((m / MAX_MINUTES) * 360 - 90) * Math.PI / 180
      return {
        minute: m,
        x: 150 + r * Math.cos(angle),
        y: 150 + r * Math.sin(angle),
      }
    })
  }, [])

  const handleAngleRad = (angleDeg - 90) * Math.PI / 180
  const handleR = 130
  const handleX = 150 + handleR * Math.cos(handleAngleRad)
  const handleY = 150 + handleR * Math.sin(handleAngleRad)

  const progressArc = useMemo(() => {
    if (angleDeg <= 0) return ''
    const r = 130
    const startAngle = -90 * Math.PI / 180
    const endAngle = (angleDeg - 90) * Math.PI / 180
    const x1 = 150 + r * Math.cos(startAngle)
    const y1 = 150 + r * Math.sin(startAngle)
    const x2 = 150 + r * Math.cos(endAngle)
    const y2 = 150 + r * Math.sin(endAngle)
    const largeArc = angleDeg > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }, [angleDeg])

  return (
    <div
      ref={centerRef}
      className={`${s.dial} ${dragging ? s.dragging : ''} ${disabled ? s.disabled : ''}`}
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
    >
      <svg className={s.svg} viewBox="0 0 300 300">
        <defs>
          <filter id="dialGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background ring */}
        <circle cx="150" cy="150" r="130" fill="none"
          stroke={modeColorDim} strokeWidth="6" />

        {/* Tick marks */}
        {tickMarks.map(t => (
          <line key={t.id}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.minute <= minutes ? modeColor : 'var(--card-border)'}
            strokeWidth={t.major ? 1.5 : 0.5}
            opacity={t.major ? 1 : 0.5}
          />
        ))}

        {/* Progress arc */}
        {angleDeg > 0 && (
          <path d={progressArc}
            fill="none" stroke={modeColor}
            strokeWidth="6" strokeLinecap="round"
            filter="url(#dialGlow)"
            opacity="0.9"
          />
        )}

        {/* Handle */}
        {angleDeg > 0 && (
          <circle cx={handleX} cy={handleY}
            r={dragging ? 9 : 7}
            fill={modeColor}
            stroke="var(--page-bg)" strokeWidth="2"
            style={{
              transition: dragging ? 'none' : 'r 0.2s var(--ease-spring)',
              filter: `drop-shadow(0 0 8px ${modeColor === 'var(--blue)' ? 'rgba(79,140,255,0.6)' : modeColor === 'var(--emerald)' ? 'rgba(16,185,129,0.6)' : 'rgba(129,140,248,0.6)'})`,
            }}
          />
        )}

        {/* Snap labels */}
        {snapLabels.map(l => (
          <text key={l.minute} x={l.x} y={l.y}
            textAnchor="middle" dominantBaseline="central"
            fill="var(--mist)" fontSize="9" fontWeight="600"
            opacity={l.minute === minutes ? 1 : 0.4}
            style={{ fontFamily: "'DM Mono', monospace", transition: 'opacity 0.2s' }}
          >
            {l.minute}
          </text>
        ))}
      </svg>

      {/* Center display */}
      <div className={s.center}>
        <span className={s.time} style={{ color: modeColor }}>
          {String(minutes).padStart(2, '0')}:00
        </span>
        <span className={s.label}>minutes</span>
      </div>
    </div>
  )
}
