import { useState, useEffect, useRef, useCallback } from 'react'
import { usePomodoro } from '../context/PomodoroContext'
import { Pause, Play } from 'lucide-react'
import s from './FloatingTimer.module.css'

export default function FloatingTimer() {
  const {
    mode, running, displayRemaining, done,
    togglePlay, skipTimer, resetTimer
  } = usePomodoro()

  const [pos, setPos] = useState({ x: 20, y: 80 })
  const [dragging, setDragging] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const dragOff = useRef({ x: 0, y: 0 })
  const ref = useRef(null)

  // ── Clamp position to viewport on mount/resize ──
  useEffect(() => {
    const clamp = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setPos(p => ({
        x: Math.min(Math.max(0, p.x), w - (minimized ? 56 : 196)),
        y: Math.min(Math.max(0, p.y), h - (minimized ? 56 : 96))
      }))
    }
    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [minimized])

  // ── Drag handlers (mouse) ──
  const onPointerDown = useCallback((e) => {
    if (e.target.closest(`.${s.noDrag}`)) return
    setDragging(true)
    dragOff.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const x = e.clientX - dragOff.current.x
      const y = e.clientY - dragOff.current.y
      setPos({ x, y })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

  // ── Don't render if timer not running ──
  if (!running) return null

  const modeColor = mode === 'study' ? '#3B82F6' : mode === 'break' ? '#10B981' : '#6366F1'

  // ── Minimized: tiny floating circle ──
  if (minimized) {
    return (
      <div
        ref={ref}
        className={s.mini}
        style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
        onPointerDown={(e) => {
          setDragging(true)
          dragOff.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
          e.preventDefault()
        }}
        onDoubleClick={() => setMinimized(false)}
        title="Double-click to expand"
      >
        <span className={s.miniTime}>{displayRemaining}</span>
        <button className={`${s.miniExpand} ${s.noDrag}`} onClick={(e) => { e.stopPropagation(); setMinimized(false) }}>
          ⤢
        </button>
      </div>
    )
  }

  // ── Expanded: draggable panel ──
  return (
    <div
      ref={ref}
      className={s.floating}
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
      onPointerDown={onPointerDown}
    >
      {/* Drag bar */}
      <div className={s.dragBar}>
        <span className={s.dragDots}>⋯</span>
        <span className={s.dragMode} style={{ color: modeColor }}>
          {mode === 'study' ? 'Focus' : mode === 'break' ? 'Break' : 'Long Break'}
        </span>
        <button className={`${s.minBtn} ${s.noDrag}`} onClick={() => setMinimized(true)} title="Minimize">
          ─
        </button>
      </div>

      {/* Timer body */}
      <div className={s.body}>
        <span className={s.time} style={{ color: modeColor }}>
          {displayRemaining}
        </span>

        {/* Dots */}
        <div className={s.dots}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`${s.dot} ${done > i ? s.dotFill : ''}`}
              style={{ backgroundColor: done > i ? modeColor : 'rgba(255,255,255,0.15)' }} />
          ))}
        </div>

        {/* Controls */}
        <div className={s.controls}>
          <button className={`${s.fBtn} ${s.noDrag}`} onClick={resetTimer} title="Reset">
            ↺
          </button>
          <button className={`${s.fPlay} ${s.noDrag}`} style={{ backgroundColor: modeColor }} onClick={togglePlay}>
            {running ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
          </button>
          <button className={`${s.fBtn} ${s.noDrag}`} onClick={skipTimer} title="Skip">
            ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
