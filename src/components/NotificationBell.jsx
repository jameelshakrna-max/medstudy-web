import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'

export default function NotificationBell({ user }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const unread = notifications.filter(n => !n.read).length

  useEffect(() => {
    if (!user) return
    load()
  }, [user])

  const load = async () => {
    try {
      const data = await apiGet('/notifications')
      setNotifications(Array.isArray(data) ? data : [])
    } catch {}
  }

  const markAllRead = async () => {
    try {
      await apiPost('/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
    } catch {}
  }

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 4 }}
        aria-label="Notifications"
      >
        <Bell size={20} strokeWidth={1.5} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, width: 16, height: 16,
            borderRadius: '50%', background: 'var(--primary, #3b82f6)',
            color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>{unread}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', width: 320, maxHeight: 400,
          overflowY: 'auto', background: 'var(--card-bg, #1e1e2e)', border: '1px solid var(--border, #333)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 100, marginTop: 8
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border, #333)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted, #888)' }}>
                <CheckCheck size={14} style={{ marginRight: 4 }} />Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted, #888)' }}>No notifications</p>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{
                padding: '8px 12px', borderBottom: '1px solid var(--border, #222)',
                background: n.read ? 'transparent' : 'rgba(59,130,246,0.08)'
              }}>
                <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginTop: 2 }}>{n.body}</div>}
                <div style={{ fontSize: 10, color: 'var(--muted, #666)', marginTop: 4 }}>{n.created_at?.slice(0, 16).replace('T', ' ')}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
