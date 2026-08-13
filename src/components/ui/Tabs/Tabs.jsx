import { createContext, useContext, useState, useCallback, useMemo, useId } from 'react'
import styles from './Tabs.module.css'

const TabsContext = createContext(null)

function useTabsContext() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>')
  return ctx
}

export function Tabs({ defaultValue, value: controlledValue, onValueChange, children, className = '' }) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const isControlled = controlledValue !== undefined
  const activeValue = isControlled ? controlledValue : internalValue
  const baseId = useId()

  const handleChange = useCallback((newValue) => {
    if (!isControlled) setInternalValue(newValue)
    onValueChange?.(newValue)
  }, [isControlled, onValueChange])

  const ctx = useMemo(
    () => ({ activeValue, handleChange, baseId }),
    [activeValue, handleChange, baseId]
  )

  return (
    <TabsContext.Provider value={ctx}>
      <div className={`${styles.tabs} ${className}`}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className = '', ...rest }) {
  const { handleChange, activeValue } = useTabsContext()

  const handleKeyDown = useCallback((event) => {
    const tablist = event.currentTarget
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]')).filter((el) => !el.disabled)
    if (tabs.length === 0) return

    // Manual activation: Enter/Space activate the focused tab; arrow keys only move focus.
    if (event.key === 'Enter' || event.key === ' ') {
      const focused = document.activeElement
      if (!focused || !tablist.contains(focused)) return
      const value = focused.getAttribute('data-tab-value')
      if (value == null) return
      event.preventDefault()
      if (value !== activeValue) handleChange(value)
      return
    }

    const currentIndex = tabs.indexOf(document.activeElement)

    let nextIndex = null
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % tabs.length
        break
      case 'ArrowLeft':
        nextIndex = currentIndex === -1 ? tabs.length - 1 : (currentIndex - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = tabs.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    tabs[nextIndex].focus()
  }, [handleChange, activeValue])

  return (
    <div role="tablist" onKeyDown={handleKeyDown} className={`${styles.tabList} ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, disabled = false, children, className = '', ...rest }) {
  const { activeValue, handleChange, baseId } = useTabsContext()
  const isActive = activeValue === value
  const tabId = `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel-${value}`

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      data-tab-value={value}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${className}`}
      onClick={() => handleChange(value)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className = '', ...rest }) {
  const { activeValue, baseId } = useTabsContext()

  if (activeValue !== value) return null

  const tabId = `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel-${value}`

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      tabIndex={0}
      className={`${styles.tabContent} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
