import { useState, useRef, useCallback, useEffect } from 'react'

const MIN_MINUTES = 5
const MAX_MINUTES = 120
const SNAP_INTERVALS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120]

function angleToMinutes(angleRad) {
  const degrees = ((angleRad * 180) / Math.PI + 360) % 360
  return Math.round((degrees / 360) * MAX_MINUTES)
}

function minutesToAngle(minutes) {
  return (minutes / MAX_MINUTES) * 2 * Math.PI
}

function snapToNearest(value, interval = 5) {
  return Math.round(value / interval) * interval
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

export function useRadialDrag({ minutes, onChange, onSnap, centerRef, disabled }) {
  const [dragging, setDragging] = useState(false)
  const lastAngleRef = useRef(null)
  const rafRef = useRef(null)

  const getAngleFromEvent = useCallback((e) => {
    if (!centerRef.current) return null
    const rect = centerRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null || clientY == null) return null
    return Math.atan2(clientX - cx, -(clientY - cy))
  }, [centerRef])

  const handlePointerDown = useCallback((e) => {
    if (disabled) return
    const angle = getAngleFromEvent(e)
    if (angle == null) return
    setDragging(true)
    lastAngleRef.current = angle
    const newMins = clamp(snapToNearest(angleToMinutes(angle)), MIN_MINUTES, MAX_MINUTES)
    onChange(newMins)
    e.preventDefault()
  }, [disabled, getAngleFromEvent, onChange])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const angle = getAngleFromEvent(e)
        if (angle == null) return
        lastAngleRef.current = angle
        const rawMins = angleToMinutes(angle)
        const clamped = clamp(rawMins, MIN_MINUTES, MAX_MINUTES)
        onChange(clamped)
      })
    }

    const onUp = () => {
      setDragging(false)
      const snapped = snapToNearest(clamp(
        lastAngleRef.current != null ? angleToMinutes(lastAngleRef.current) : minutes,
        MIN_MINUTES, MAX_MINUTES
      ))
      onSnap?.(snapped)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
  }, [dragging, getAngleFromEvent, minutes, onChange, onSnap])

  const angleDeg = (minutes / MAX_MINUTES) * 360
  const angleRad = minutesToAngle(minutes)

  return {
    dragging,
    handlePointerDown,
    angleDeg,
    angleRad,
    circumference: 2 * Math.PI * 130,
    arcLength: (angleDeg / 360) * 2 * Math.PI * 130,
    SNAP_INTERVALS,
    MIN_MINUTES,
    MAX_MINUTES,
  }
}
