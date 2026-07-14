import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send, Paperclip } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { apiGet, apiPost, imageUrl } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import styles from './DMConversation.module.css'

const API = import.meta.env.VITE_API_URL || '/api'

function formatMessageTime(iso) {
  if (!iso) return ''
  const normalized = iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z')
  const d = new Date(normalized)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDividerDate(iso) {
  if (!iso) return ''
  const normalized = iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z')
  const d = new Date(normalized)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (sameDay) return 'Today'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function shouldShowDivider(prev, curr) {
  if (!prev) return true
  const toMs = s => {
    const n = s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z')
    return new Date(n).getTime()
  }
  const diff = toMs(curr) - toMs(prev)
  return diff > 300000
}

export default function DMConversation() {
  const { user } = useAuth()
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const { data: messages = [], isLoading } = useQuery({
    queryKey: queryKeys.dm.messages(conversationId, 50),
    queryFn: async () => {
      const msgs = await apiGet(`/dm/${conversationId}/messages?limit=50`)
      return (Array.isArray(msgs) ? msgs : []).reverse()
    },
    enabled: !!user && !!conversationId,
    staleTime: Infinity,
  })

  const { data: conversations = [] } = useQuery({
    queryKey: queryKeys.dm.conversations(),
    queryFn: () => apiGet('/dm/conversations').then(d => Array.isArray(d) ? d : []),
    enabled: !!user,
    staleTime: 10_000,
  })

  const otherUser = conversations.find(c => String(c.id) === String(conversationId))?.other_user || null

  const sendMutation = useMutation({
    mutationFn: async (trimmed) => {
      return apiPost(`/dm/${conversationId}/messages`, { content: trimmed })
    },
    onSuccess: (msg) => {
      queryClient.setQueryData(queryKeys.dm.messages(conversationId, 50), prev => [...prev, msg])
      setContent('')
      setTimeout(scrollToBottom, 50)
    },
  })

  useEffect(() => {
    if (!isLoading && messages.length > 0) scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  useEffect(() => {
    if (!isLoading && inputRef.current) inputRef.current.focus()
  }, [isLoading])

  useEffect(() => {
    if (!user || !conversationId || isLoading) return
    apiPost(`/dm/${conversationId}/read`).then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dm.unread() })
      queryClient.invalidateQueries({ queryKey: queryKeys.dm.conversations() })
    }).catch(() => {})
  }, [user, conversationId, isLoading, queryClient])

  useEffect(() => {
    if (!user || !conversationId) return
    let ws = null
    let cancelled = false

    async function connect() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token || cancelled) return

      const base = API.startsWith('http') ? API : window.location.origin + API
      const wsBase = base.replace(/^http/, 'ws')
      const url = `${wsBase}/dm/${conversationId}/ws?jwt=${encodeURIComponent(token)}`

      ws = new WebSocket(url)
      ws.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data)
          if (evt.type === 'message:new' && evt.message) {
            queryClient.setQueryData(queryKeys.dm.messages(conversationId, 50), prev => {
              if (prev.some(m => m.id === evt.message.id)) return prev
              return [...prev, evt.message]
            })
          } else if (evt.type === 'message:delete' && evt.message_id) {
            queryClient.setQueryData(queryKeys.dm.messages(conversationId, 50), prev =>
              prev.map(m => m.id === evt.message_id ? { ...m, deleted_at: new Date().toISOString() } : m)
            )
          }
        } catch {}
      }
      ws.onerror = () => {}
      ws.onclose = () => {
        if (!cancelled) {
          setTimeout(() => { if (!cancelled) connect() }, 3000)
        }
      }
    }
    connect()

    return () => {
      cancelled = true
      ws?.close()
    }
  }, [user, conversationId, queryClient])

  const send = async () => {
    const trimmed = content.trim()
    if (!trimmed || sendMutation.isPending) return
    sendMutation.mutate(trimmed)
  }

  const sendFile = async (file) => {
    if (!file || uploading) return
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const formData = new FormData()
      formData.append('file', file)
      formData.append('content', file.name)
      const res = await fetch(`${API}/dm/${conversationId}/messages`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (res.ok) {
        const msg = await res.json()
        queryClient.setQueryData(queryKeys.dm.messages(conversationId, 50), prev => [...prev, msg])
        setTimeout(scrollToBottom, 50)
      }
    } catch {}
    setUploading(false)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) sendFile(file)
    e.target.value = ''
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (!user) return null

  const initials = (otherUser?.display_name || otherUser?.username || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/messages')}>
          <ArrowLeft size={20} />
        </button>
        {otherUser?.avatar_url ? (
          <img className={styles.avatar} src={imageUrl(otherUser.avatar_url)} alt="" />
        ) : (
          <div className={styles.avatarFallback}>{initials}</div>
        )}
        <div className={styles.headerInfo}>
          <div className={styles.headerName}>{otherUser?.display_name || otherUser?.username || 'Conversation'}</div>
        </div>
      </div>

      <div className={styles.messages} ref={containerRef}>
        {isLoading ? null : messages.length === 0 ? (
          <div className={styles.empty}>Send a message to start the conversation.</div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.user_id === user.id
            const isDeleted = !!msg.deleted_at || msg.message_type === 'deleted'
            if (isDeleted) {
              return <div key={msg.id} className={styles.messageDeleted}>Message deleted</div>
            }
            const showDivider = shouldShowDivider(messages[i - 1]?.created_at, msg.created_at)
            return (
              <div key={msg.id}>
                {showDivider && (
                  <div className={styles.timeDivider}>{formatDividerDate(msg.created_at)}</div>
                )}
                <div className={`${styles.message} ${isOwn ? styles.messageOwn : styles.messageOther}`}>
                  {msg.message_type === 'file' ? (
                    <a href={`${API}/images/${msg.file_key}`} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                      {msg.file_name || 'File'}
                    </a>
                  ) : msg.content}
                  <div className={styles.messageTime}>{formatMessageTime(msg.created_at)}</div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputBar}>
        <button className={styles.attachBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file">
          <Paperclip size={18} />
        </button>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx,.txt,.zip" />
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          placeholder={uploading ? 'Uploading...' : 'Type a message...'}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={styles.sendBtn}
          onClick={send}
          disabled={(!content.trim() && !uploading) || sendMutation.isPending}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
