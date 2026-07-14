import { useState, useRef, useEffect, useCallback } from 'react'
import { apiGet } from '../lib/api'

export default function MentionInput({ value, onChange, onSubmit, placeholder, onMentionSelect }) {
  const [query, setQuery] = useState(null)
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef(null)
  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (query === null) return
    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!query) { setResults([]); setLoading(false); return }
      apiGet(`/users/mention/search?q=${encodeURIComponent(query)}&limit=6`)
        .then(data => { setResults(Array.isArray(data) ? data : data?.users || []) })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length, query])

  const detectMention = useCallback((text, cursorPos) => {
    const before = text.slice(0, cursorPos)
    const match = before.match(/@([a-z0-9_-]*)$/i)
    return match ? match[1] : null
  }, [])

  const handleChange = (e) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart
    onChange(newValue)
    const mentionQuery = detectMention(newValue, cursorPos)
    if (mentionQuery !== null) {
      setQuery(mentionQuery)
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
      setQuery(null)
    }
  }

  const insertMention = (user) => {
    const textarea = textareaRef.current
    const cursorPos = textarea.selectionStart
    const text = value
    const before = text.slice(0, cursorPos)
    const after = text.slice(cursorPos)
    const mentionStart = before.lastIndexOf('@')
    const newText = before.slice(0, mentionStart) + `@${user.username} ` + after
    onChange(newText)
    setShowDropdown(false)
    setQuery(null)
    if (onMentionSelect) onMentionSelect(user)
    setTimeout(() => {
      const pos = mentionStart + user.username.length + 2
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    }, 0)
  }

  const handleKeyDown = (e) => {
    if (showDropdown && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => (i + 1) % results.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + results.length) % results.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        insertMention(results[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowDropdown(false)
        setQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onSubmit?.()
    }
  }

  const getDropdownPosition = () => {
    const textarea = textareaRef.current
    if (!textarea) return { top: 0, left: 0 }
    const rect = textarea.getBoundingClientRect()
    const text = value.slice(0, textarea.selectionStart)
    const lines = text.split('\n')
    const lineHeight = 20
    return {
      top: rect.top + lines.length * lineHeight + 4,
      left: rect.left + 12,
    }
  }

  const pos = showDropdown ? getDropdownPosition() : { top: 0, left: 0 }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type a message... (@ to mention)'}
        rows={1}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 10,
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
          resize: 'none',
          outline: 'none',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box',
        }}
        onFocus={() => {
          if (query !== null) setShowDropdown(true)
        }}
        onBlur={() => {
          setTimeout(() => setShowDropdown(false), 150)
        }}
      />
      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 100,
            minWidth: 220,
          }}
        >
          {results.map((user, i) => (
            <div
              key={user.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === selectedIndex ? 'rgba(79,140,255,0.1)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseDown={(e) => { e.preventDefault(); insertMention(user) }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--card-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--mist)',
                }}>
                  {(user.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                  {user.full_name || user.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--mist)' }}>
                  @{user.username}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
