import { useEffect, useState } from 'react'

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    setMatches(mql.matches)
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange)
    if (typeof mql.addListener === 'function') mql.addListener(onChange)
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange)
      if (typeof mql.removeListener === 'function') mql.removeListener(onChange)
    }
  }, [query])

  return matches
}
