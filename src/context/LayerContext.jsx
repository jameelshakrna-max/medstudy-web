import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const LayerContext = createContext(null)

export function useLayer() {
  const ctx = useContext(LayerContext)
  if (!ctx) throw new Error('useLayer must be used within LayerProvider')
  return ctx
}

export function LayerProvider({ children }) {
  const [overlays, setOverlays] = useState(new Set())
  const prevFocusRef = useRef(null)

  const openOverlay = useCallback((id) => {
    setOverlays(prev => {
      const next = new Set(prev)
      if (next.size === 0) {
        prevFocusRef.current = document.activeElement
      }
      next.add(id)
      return next
    })
  }, [])

  const closeOverlay = useCallback((id) => {
    setOverlays(prev => {
      const next = new Set(prev)
      next.delete(id)
      if (next.size === 0 && prevFocusRef.current) {
        prevFocusRef.current.focus()
        prevFocusRef.current = null
      }
      return next
    })
  }, [])

  const closeTopmost = useCallback(() => {
    setOverlays(prev => {
      if (prev.size === 0) return prev
      const arr = Array.from(prev)
      const topmost = arr[arr.length - 1]
      const next = new Set(arr.slice(0, -1))
      if (next.size === 0 && prevFocusRef.current) {
        prevFocusRef.current.focus()
        prevFocusRef.current = null
      }
      return next
    })
  }, [])

  const closeAll = useCallback(() => {
    setOverlays(prev => {
      if (prev.size === 0) return prev
      if (prevFocusRef.current) {
        prevFocusRef.current.focus()
        prevFocusRef.current = null
      }
      return new Set()
    })
  }, [])

  const isTopOverlay = useCallback((id) => {
    const arr = Array.from(overlays)
    return arr[arr.length - 1] === id
  }, [overlays])

  const hasOverlays = overlays.size > 0

  // Global escape handler — closes topmost overlay
  useEffect(() => {
    if (!hasOverlays) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        closeTopmost()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [hasOverlays, closeTopmost])

  // Body scroll lock — locked when any overlay is open
  useEffect(() => {
    if (!hasOverlays) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [hasOverlays])

  return (
    <LayerContext.Provider value={{ openOverlay, closeOverlay, closeTopmost, closeAll, isTopOverlay, hasOverlays, overlayCount: overlays.size }}>
      {children}
    </LayerContext.Provider>
  )
}
