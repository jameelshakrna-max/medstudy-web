import { useEffect, useState } from 'react'

/**
 * Returns a `value` that updates only after `delay` ms of stability, except
 * that clearing the value (falsy) propagates immediately so consumers can
 * reset server-driven queries instantly when the input is emptied.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (!value) {
      setDebounced(value)
      return
    }
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
