import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiGet, imageUrl, formatDate } from '../lib/api'
import styles from './DMInbox.module.css'

export default function DMInbox() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const [conversations, setConversations] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        const data = await apiGet('/dm/conversations')
        if (!cancelled) setConversations(Array.isArray(data) ? data : [])
      } catch {}
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  const filtered = conversations.filter(c => {
    if (!search) return true
    const name = c.other_user?.display_name || c.other_user?.username || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  if (!user) return null

  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <h1 className={styles.title}>Messages</h1>
      </div>
      <input
        className={styles.search}
        placeholder="Search conversations..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {loading ? null : filtered.length === 0 ? (
        <div className={styles.empty}>
          No conversations yet. Start a conversation from a user's profile.
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(conv => {
            const u = conv.other_user
            const initials = (u?.display_name || u?.username || '?')
              .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={conv.id}
                className={`${styles.conversation} ${String(conv.id) === String(conversationId) ? styles.active : ''}`}
                onClick={() => navigate(`/messages/${conv.id}`)}
              >
                {u?.avatar_url ? (
                  <img className={styles.avatar} src={imageUrl(u.avatar_url)} alt="" />
                ) : (
                  <div className={styles.avatarFallback}>{initials}</div>
                )}
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{u?.display_name || u?.username}</span>
                    <span className={styles.time}>
                      {conv.last_message?.created_at ? formatDate(conv.last_message.created_at) : ''}
                    </span>
                  </div>
                  <div className={styles.preview}>
                    {conv.last_message?.content || 'No messages yet'}
                  </div>
                </div>
                {conv.unread_count > 0 && (
                  <span className={styles.unread}>{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
