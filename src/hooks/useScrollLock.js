import { useEffect, useRef } from 'react'

let lockCount = 0
let savedOverflow = ''

export default function useScrollLock(active) {
  const id = useRef(Math.random().toString(36).slice(2))

  useEffect(() => {
    if (!active) return

    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount++

    return () => {
      lockCount--
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow
      }
    }
  }, [active])
}
