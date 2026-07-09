import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const API = import.meta.env.VITE_API_URL || '/api'

function getJwtFromSession() {
  return supabase.auth.getSession().then(({ data: { session } }) => session?.access_token || null)
}

function safeParseJSON(text) {
  try { return JSON.parse(text) } catch { return null }
}

export function useCommunityRealtime(communityId) {
  const [messages, setMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [competitions, setCompetitions] = useState([])
  const [leaderboards, setLeaderboards] = useState({})

  const [connected, setConnected] = useState(false)

  const lastChatIdRef = useRef(null)
  const firstMessageIdRef = useRef(null)
  const loadingOlderRef = useRef(false)
  const seenEventIdsRef = useRef(new Set())

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const backoffRef = useRef(1000)

  const jwtUrlParam = useMemo(() => 'jwt', [])



  const fetchInitial = useCallback(async () => {
    if (!communityId) return
    setChatLoading(true)
    try {
      const token = await getJwtFromSession()

      const [msgRes, compRes] = await Promise.all([
        fetch(`${API}/communities/${communityId}/messages?limit=50`, {
          headers: { Authorization: 'Bearer ' + token },
        }),
        fetch(`${API}/communities/${communityId}/competitions`, {
          headers: { Authorization: 'Bearer ' + token },
        }),
      ])

      const [msgText, compText] = await Promise.all([msgRes.text(), compRes.text()])
      const msgJson = safeParseJSON(msgText)
      const compJson = safeParseJSON(compText)

      if (!msgRes.ok) throw new Error(msgJson?.error || msgText)
      const msgs = Array.isArray(msgJson) ? msgJson : []
      setMessages(msgs)
      setHasMore(msgs.length === 50)
      if (msgs.length) {
        lastChatIdRef.current = msgs[msgs.length - 1].id
        firstMessageIdRef.current = msgs[0].id
      }

      if (compRes.ok && Array.isArray(compJson)) setCompetitions(compJson)
    } finally {
      setChatLoading(false)
    }
  }, [communityId])

  const backfillChat = useCallback(async () => {
    if (!communityId) return

    const after = lastChatIdRef.current
    const token = await getJwtFromSession()
    const params = after ? `?after=${encodeURIComponent(after)}` : ''

    const res = await fetch(`${API}/communities/${communityId}/messages${params}`, {
      headers: { Authorization: 'Bearer ' + token },
    })

    if (!res.ok) return

    const text = await res.text()
    const json = safeParseJSON(text)
    if (!Array.isArray(json) || !json.length) return

    setMessages(prev => {
      const existing = new Set(prev.map(m => m.id))
      const newMsgs = json.filter(m => !existing.has(m.id))
      if (!newMsgs.length) return prev
      lastChatIdRef.current = newMsgs[newMsgs.length - 1].id
      return [...prev, ...newMsgs]
    })
  }, [communityId])

  const loadMore = useCallback(async () => {
    if (!communityId || loadingOlderRef.current || !hasMore) return
    loadingOlderRef.current = true
    const before = firstMessageIdRef.current
    try {
      const token = await getJwtFromSession()
      const res = await fetch(`${API}/communities/${communityId}/messages?before=${encodeURIComponent(before)}&limit=50`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) return
      const text = await res.text()
      const json = safeParseJSON(text)
      if (!Array.isArray(json) || !json.length) { setHasMore(false); return }
      setHasMore(json.length === 50)
      setMessages(prev => {
        const existing = new Set(prev.map(m => m.id))
        const older = json.filter(m => !existing.has(m.id))
        if (!older.length) { setHasMore(false); return prev }
        firstMessageIdRef.current = older[0].id
        return [...older, ...prev]
      })
    } finally {
      loadingOlderRef.current = false
    }
  }, [communityId, hasMore])

  const handleEvent = useCallback((evt) => {
    // Expected v1 schema:
    // { version: 1, id: "evt_xxx", type: "...", communityId: "...", timestamp: "...", payload: {} }
    if (!evt || evt.version !== 1) return
    if (!evt.id || !evt.type) return
    if (seenEventIdsRef.current.has(evt.id)) return
    seenEventIdsRef.current.add(evt.id)

    const type = evt.type
    const payload = evt.payload || {}

    if (type === 'message:new') {
      const msg = payload.message || payload
      if (!msg?.id) return
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
      lastChatIdRef.current = msg.id
      return
    }

    if (type === 'message:edit') {
      const id = payload.id
      const newContent = payload.new_content
      if (!id) return
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: newContent, is_edited: true } : m)))
      return
    }

    if (type === 'message:delete') {
      const id = payload.id
      if (!id) return
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, deleted: true, content: null } : m)))
      return
    }

    if (type === 'competition:new') {
      const c = payload.competition || payload
      if (!c?.id) return
      setCompetitions(prev => (prev.some(x => x.id === c.id) ? prev : [...prev, c]))
      return
    }

    if (type === 'competition:update' || type === 'competition:end') {
      const c = payload.competition || payload
      if (!c?.id) return
      setCompetitions(prev => prev.map(x => (x.id === c.id ? c : x)))
      return
    }

    if (type === 'leaderboard:update') {
      const lb = payload.leaderboard
      const compId = payload.competition_id
      if (compId && Array.isArray(lb)) setLeaderboards(prev => ({ ...prev, [compId]: lb }))
      return
    }
  }, [])

  const connect = useCallback(async () => {
    if (!communityId) return

    const token = await getJwtFromSession()
    if (!token) return

    const base = API.startsWith('http') ? API : window.location.origin + API
    const wsBase = base.replace(/^http/, 'ws')
    const url = `${wsBase}/communities/${communityId}/ws?${jwtUrlParam}=${encodeURIComponent(token)}`

    setConnected(false)

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = async () => {
      setConnected(true)
      backoffRef.current = 1000
      await backfillChat()
    }

    ws.onmessage = (e) => {
      const evt = safeParseJSON(e.data)
      if (evt?.id) handleEvent(evt)
    }

    ws.onerror = () => {}

    ws.onclose = () => {
      setConnected(false)
      const delay = Math.min(backoffRef.current, 30000)
      backoffRef.current = Math.min(backoffRef.current * 2, 30000)
      reconnectTimerRef.current = setTimeout(() => connect(), delay + Math.random() * 250)
    }
  }, [API, backfillChat, communityId, handleEvent, jwtUrlParam])

  useEffect(() => {
    if (!communityId) return

    seenEventIdsRef.current.clear()
    lastChatIdRef.current = null

    fetchInitial()
    connect()

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      try {
        wsRef.current?.close()
      } catch {}
    }
  }, [communityId, fetchInitial, connect])

  const apiPost = useCallback(async (path, body) => {
    const token = await getJwtFromSession()
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const json = safeParseJSON(text)
    if (!res.ok) throw new Error(json?.error || text || 'Request failed')
    return json
  }, [])

  const sendMessage = useCallback(async (content) => {
    if (!communityId || !content?.trim()) return
    return apiPost(`/communities/${communityId}/messages`, { content })
  }, [apiPost, communityId])

  const sendFlashcard = useCallback(async (flashcardData) => {
    if (!communityId) return
    return apiPost(`/communities/${communityId}/messages/flashcard`, flashcardData)
  }, [apiPost, communityId])

  return {
    messages,
    loading: chatLoading,
    competitions,
    leaderboards,
    connected,
    sendMessage,
    sendFlashcard,
    fetchNewMessages: backfillChat,
    hasMore,
    loadMore,
    setActive: () => {},
    lastIdRef: lastChatIdRef,
  }
}


