import { useState, useEffect, useRef } from 'react'
import { useRealtimeKitClient, RealtimeKitProvider } from '@cloudflare/realtimekit-react'
import { RtkMeeting } from '@cloudflare/realtimekit-react-ui'
import { apiGet, apiPost } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { Headphones, Plus, X, Loader2, Mic, MicOff, LogOut, UserCheck } from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'

const roomCard = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 12,
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 8,
}

const roomBadge = (status) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 20,
  background: status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.15)',
  color: status === 'active' ? 'var(--green, #10b981)' : 'var(--muted)',
})

export default function VoiceRooms({ communityId, myRole, isMod, isAdmin }) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [joinedRoom, setJoinedRoom] = useState(null)
  const [joining, setJoining] = useState(false)
  const [meeting, initMeeting] = useRealtimeKitClient()

  const canCreate = isMod || isAdmin
  const canEnd = isMod || isAdmin
  const canJoin = true // all members

  const tokenRef = useRef(null)
  const API_BASE = import.meta.env.VITE_API_URL || '/api'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      tokenRef.current = session?.access_token
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      tokenRef.current = session?.access_token
    })
    return () => subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    if (!joinedRoom) return

    const leaveUrl = `${API_BASE}/communities/${communityId}/rooms/${joinedRoom.id}/leave`

    const onLeave = () => {
      const token = tokenRef.current
      if (!token) return
      fetch(leaveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: '{}',
        keepalive: true,
      })
    }

    window.addEventListener('beforeunload', onLeave)

    return () => {
      window.removeEventListener('beforeunload', onLeave)
      onLeave()
    }
  }, [joinedRoom, communityId])

  const fetchRooms = async () => {
    try {
      const d = await apiGet(`/communities/${communityId}/rooms`)
      setRooms(Array.isArray(d) ? d : [])
    } catch { setError('Failed to load rooms') }
    setLoading(false)
  }

  useEffect(() => { fetchRooms() }, [communityId])

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const r = await apiPost(`/communities/${communityId}/rooms`, { name: createName.trim() })
      setCreateName('')
      setShowCreate(false)
      await fetchRooms()
    } catch (e) { setError('Failed to create room') }
    setCreating(false)
  }

  const handleJoin = async (room) => {
    setJoining(true)
    try {
      const { authToken, meetingId } = await apiPost(`/communities/${communityId}/rooms/${room.id}/join`, {})
      setJoinedRoom({ ...room, meetingId })
      initMeeting({ authToken })
    } catch (e) { setError('Failed to join room') }
    setJoining(false)
  }

  const handleEnd = async (roomId) => {
    try {
      await apiPost(`/communities/${communityId}/rooms/${roomId}/end`, {})
      await fetchRooms()
    } catch { setError('Failed to end room') }
  }

  const handleLeave = async () => {
    try { await apiPost(`/communities/${communityId}/rooms/${joinedRoom.id}/leave`, {}) } catch {}
    setJoinedRoom(null)
  }

  if (joinedRoom && meeting) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0f' }}>
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{joinedRoom.room_name}</span>
          <button onClick={handleLeave} className={s.actionBtnDanger} style={{ padding: '6px 12px', fontSize: 12 }}>
            <LogOut size={14} /> Leave
          </button>
        </div>
        <div style={{ width: '100%', height: '100%' }}>
          <RealtimeKitProvider value={meeting}>
            <RtkMeeting meeting={meeting} mode="fill" showSetupScreen={true} />
          </RealtimeKitProvider>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Voice Rooms</h3>
        {canCreate && (
          <button className={s.actionBtn} onClick={() => setShowCreate(!showCreate)}>
            <Plus size={14} /> Create Room
          </button>
        )}
      </div>

      {error && <div className={s.hint} style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--red-bg, #3b1a1a)', border: '1px solid var(--red, #ef4444)', borderRadius: 8, fontSize: 13, color: 'var(--red, #ef4444)' }}>{error}</div>}

      {showCreate && (
        <div className={s.settingSection} style={{ marginBottom: 12, padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Room name..."
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
            />
            <button className={s.actionBtn} onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating ? <Loader2 size={14} className={s.spinner} /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={s.hint} style={{ padding: 20, textAlign: 'center' }}>Loading rooms...</div>
      ) : rooms.length === 0 ? (
        <div className={s.hint} style={{ padding: 20, textAlign: 'center' }}>
          <Headphones size={24} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p>No active voice rooms{canCreate ? ' — click Create Room to start one' : ''}.</p>
        </div>
      ) : (
        rooms.map(room => (
          <div key={room.id} style={roomCard}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139, 92, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Headphones size={18} strokeWidth={1.5} color="#8b5cf6" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{room.room_name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                <span style={roomBadge(room.status)}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: room.status === 'active' ? '#10b981' : '#6b7280', display: 'inline-block' }} />
                  {room.status}
                </span>
                <span>{room.participants || 0} {room.participants === 1 ? 'member' : 'members'}</span>
                {room.created_by_name && <span>{room.created_by_name}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {canJoin && (
                <button className={s.actionBtn} onClick={() => handleJoin(room)} disabled={joining}>
                  {joining ? <Loader2 size={14} className={s.spinner} /> : 'Join'}
                </button>
              )}
              {canEnd && (
                <button className={s.actionBtnDanger} onClick={() => handleEnd(room.id)} title="End room">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
