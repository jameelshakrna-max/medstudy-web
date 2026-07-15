import { useState, useRef, useCallback, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import styles from './Autocomplete.module.css'

export default function Autocomplete({
  value,
  onValueChange,
  onSelect,
  suggestions = [],
  placeholder = 'Search...',
  renderItem,
  className,
  contentClassName,
}) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef(null)

  const filtered = suggestions.filter(s => {
    const label = typeof s === 'string' ? s : s.label || s.name || ''
    return label.toLowerCase().includes((value || '').toLowerCase())
  })

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [filtered.length, value])

  const handleKeyDown = useCallback((e) => {
    if (!open || filtered.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => prev < filtered.length - 1 ? prev + 1 : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : filtered.length - 1)
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      const item = filtered[highlightedIndex]
      onSelect?.(item)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }, [open, filtered, highlightedIndex, onSelect])

  const getLabel = (item) => {
    if (typeof item === 'string') return item
    return item.label || item.name || ''
  }

  const showDropdown = open && filtered.length > 0

  return (
    <Popover.Root open={showDropdown} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <input
          ref={inputRef}
          className={`${styles.input} ${className || ''}`}
          value={value}
          onChange={e => {
            onValueChange?.(e.target.value)
            setOpen(true)
          }}
          onFocus={() => { if (filtered.length > 0) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className={`${styles.content} ${contentClassName || ''}`}
          sideOffset={4}
          align="start"
          onOpenAutoFocus={e => e.preventDefault()}
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <div role="listbox" className={styles.list}>
            {filtered.map((item, i) => {
              const label = getLabel(item)
              return (
                <div
                  key={label}
                  role="option"
                  aria-selected={i === highlightedIndex}
                  className={`${styles.option} ${i === highlightedIndex ? styles.highlighted : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect?.(item)
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                >
                  {renderItem ? renderItem(item, i === highlightedIndex) : label}
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
