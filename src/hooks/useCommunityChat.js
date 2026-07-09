import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const API = import.meta.env.VITE_API_URL || '/api'

const LOG_PREFIX = '[ChatPoll]'

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

export function useCommunityChat(communityId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [active, setActive] = useState(false)

  const intervalRef = useRef(null)
  const lastIdRef = useRef(null)
  const bottomRef = useRef(null)
  const lastFetchRef = useRef(0)
  const watchdogRef = useRef(null)

  const fetchNewMessages = useCallback(async () => {
    if (!communityId) return
    const after = lastIdRef.current
    const label = after ? `after=${after.slice(0, 8)}` : 'initial'
    console.debug(LOG_PREFIX, 'fetch', label)
    try {
      const params = after ? `?after=${after}` : ''
      const data = await apiGet(`/communities/${communityId}/messages${params}`)
      console.debug(LOG_PREFIX, 'got', data.length, 'messages')
      lastFetchRef.current = Date.now()
      if (data.length) {
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id))
          const newMsgs = data.filter(m => !existing.has(m.id))
          if (!newMsgs.length) {
            console.debug(LOG_PREFIX, 'all', data.length, 'already seen')
            return prev
          }
          lastIdRef.current = newMsgs[newMsgs.length - 1].id
          console.debug(LOG_PREFIX, 'appending', newMsgs.length, 'new messages, lastId:', lastIdRef.current?.slice(0, 8))
          return [...prev, ...newMsgs]
        })
      }
    } catch (err) {
      console.warn(LOG_PREFIX, 'fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [communityId])

  const loadMore = useCallback(async () => {
    if (!communityId || !hasMore) return
    const oldest = messages[0]
    if (!oldest) return
    try {
      const data = await apiGet(`/communities/${communityId}/messages/history?before=${oldest.id}&limit=50`)
      if (data.length < 50) setHasMore(false)
      setMessages(prev => [...data, ...prev])
    } catch {}
  }, [communityId, messages, hasMore])

  const sendMessage = useCallback(async (content) => {
    if (!communityId || !content.trim()) return
    const data = await apiPost(`/communities/${communityId}/messages`, { content })
    if (data.success) {
      await fetchNewMessages()
    }
    return data
  }, [communityId, fetchNewMessages])

  const sendFlashcard = useCallback(async (flashcardData) => {
    if (!communityId) return
    return await apiPost(`/communities/${communityId}/messages/flashcard`, flashcardData)
  }, [communityId])

  useEffect(() => {
    if (!communityId || !active) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
      return
    }

    lastIdRef.current = null
    setMessages([])
    setHasMore(true)
    setLoading(true)
    fetchNewMessages()

    const getInterval = () => document.hidden ? 10000 : 2000

    const startInterval = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        fetchNewMessages()
      }, getInterval())
    }

    startInterval()

    const handleVisibility = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        startInterval()
        if (!document.hidden) fetchNewMessages()
      }
    }

    const handleFocus = () => {
      console.debug(LOG_PREFIX, 'window focused, fetching')
      fetchNewMessages()
    }

    const handleOnline = () => {
      console.debug(LOG_PREFIX, 'online event, fetching')
      fetchNewMessages()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)

    watchdogRef.current = setInterval(() => {
      const elapsed = Date.now() - lastFetchRef.current
      if (elapsed > 60000) {
        console.warn(LOG_PREFIX, 'watchdog: no fetch in', Math.round(elapsed / 1000) + 's, restarting')
        if (intervalRef.current) clearInterval(intervalRef.current)
        startInterval()
        fetchNewMessages()
      }
    }, 30000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (watchdogRef.current) clearInterval(watchdogRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [communityId, active, fetchNewMessages])

  return {
    messages,
    loading,
    hasMore,
    loadMore,
    sendMessage,
    sendFlashcard,
    fetchNewMessages,
    setActive,
    bottomRef,
    lastIdRef,
  }
}
