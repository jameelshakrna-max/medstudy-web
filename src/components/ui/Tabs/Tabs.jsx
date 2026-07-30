import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import styles from './Tabs.module.css'

const TabsContext = createContext(null)

function useTabsContext() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>')
  return ctx
}

export function Tabs({ defaultValue, value: controlledValue, onValueChange, children }) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const isControlled = controlledValue !== undefined
  const activeValue = isControlled ? controlledValue : internalValue

  const handleChange = useCallback((newValue) => {
    if (!isControlled) setInternalValue(newValue)
    onValueChange?.(newValue)
  }, [isControlled, onValueChange])

  const ctx = useMemo(() => ({ activeValue, handleChange }), [activeValue, handleChange])

  return (
    <TabsContext.Provider value={ctx}>
      <div className={styles.tabs}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className = '' }) {
  return (
    <div role="tablist" className={`${styles.tabList} ${className}`}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, disabled = false, children, className = '' }) {
  const { activeValue, handleChange } = useTabsContext()
  const isActive = activeValue === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${className}`}
      onClick={() => handleChange(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className = '' }) {
  const { activeValue } = useTabsContext()

  if (activeValue !== value) return null

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      tabIndex={0}
      className={`${styles.tabContent} ${className}`}
    >
      {children}
    </div>
  )
}
