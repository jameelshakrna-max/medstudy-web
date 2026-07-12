import { useState, useEffect, useRef, useCallback } from 'react'
import { useRealtimeKitClient, RealtimeKitProvider } from '@cloudflare/realtimekit-react'
import { RtkMeeting } from '@cloudflare/realtimekit-react-ui'
import { apiGet, apiPost } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import {
  Headphones, Plus, X, Loader2, LogOut,
  Play, Pause, Square, Clock, Users, Timer,
} from 'lucide-react'
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

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

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
  const canJoin = true

  const canManage = isMod || isAdmin

  const tokenRef = useRef(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const API_BASE = import.meta.env.VITE_API_URL || '/api'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      tokenRef.current = session?.access_token
      if (session?.user?.id) setCurrentUserId(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      tokenRef.current = session?.access_token
      if (session?.user?.id) setCurrentUserId(session.user.id)
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
      await apiPost(`/communities/${communityId}/rooms`, { name: createName.trim() })
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

  /* ── Shared Timer ── */

  const [timer, setTimer] = useState(null)
  const [participants, setParticipants] = useState([])
  const [localRemaining, setLocalRemaining] = useState(0)
  const [timerError, setTimerError] = useState('')
  const pollRef = useRef(null)

  const [focusDur, setFocusDur] = useState(25)
  const [shortBreakDur, setShortBreakDur] = useState(5)
  const [longBreakDur, setLongBreakDur] = useState(15)
  const [longBreakEvery, setLongBreakEvery] = useState(4)

  const pollTimer = useCallback(async () => {
    if (!joinedRoom) return
    try {
      const res = await fetch(`${API_BASE}/communities/${communityId}/rooms/${joinedRoom.id}/timer`, {
        headers: { 'Authorization': 'Bearer ' + tokenRef.current },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.timer) {
        setTimer(data.timer)
        setLocalRemaining(data.remaining)
        const serverTime = new Date(data.server_time).getTime()
        pollRef.current.serverTime = serverTime
        pollRef.current.remainingAtPoll = data.remaining
      } else {
        setTimer(null)
        setLocalRemaining(0)
      }
      setParticipants(data.participants || [])
    } catch {}
  }, [joinedRoom, communityId, API_BASE])

  useEffect(() => {
    if (!joinedRoom) {
      setTimer(null)
      setParticipants([])
      setLocalRemaining(0)
      setTimerError('')
      return
    }

    setTimerError('')
    pollRef.current = { serverTime: Date.now(), remainingAtPoll: 0 }
    pollTimer()

    const interval = setInterval(pollTimer, 15000)
    return () => clearInterval(interval)
  }, [joinedRoom, pollTimer])

  useEffect(() => {
    if (!timer || timer.status !== 'running') return
    const tick = setInterval(() => {
      setLocalRemaining(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(tick)
  }, [timer?.status, timer?.mode, timer?.round_number])

  const handleTimerAction = async (action) => {
    setTimerError('')
    try {
      await apiPost(`/communities/${communityId}/rooms/${joinedRoom.id}/timer/${action}`, {})
      await pollTimer()
    } catch (e) { setTimerError(e.message) }
  }

  const handleStartTimer = async () => {
    setTimerError('')
    try {
      await apiPost(`/communities/${communityId}/rooms/${joinedRoom.id}/timer/start`, {
        focus_duration: focusDur * 60,
        short_break_duration: shortBreakDur * 60,
        long_break_duration: longBreakDur * 60,
        long_break_every: longBreakEvery,
      })
      await pollTimer()
    } catch (e) { setTimerError(e.message) }
  }

  const handlePrivateTimerToggle = () => {
    if (privateTimer.running) {
      setPrivateTimer({ running: false, seconds: 0 })
    } else {
      setPrivateTimer({ running: true, seconds: 0 })
    }
  }

  const [privateTimer, setPrivateTimer] = useState({ running: false, seconds: 0 })
  const privateRef = useRef(null)

  useEffect(() => {
    if (!privateTimer.running) {
      if (privateRef.current) clearInterval(privateRef.current)
      return
    }
    privateRef.current = setInterval(() => {
      setPrivateTimer(prev => ({ ...prev, seconds: prev.seconds + 1 }))
    }, 1000)
    return () => { if (privateRef.current) clearInterval(privateRef.current) }
  }, [privateTimer.running])

  const timerLabel = timer?.mode === 'focus' ? 'Focus'
    : timer?.mode === 'long_break' ? 'Long Break' : 'Short Break'

  const timerColor = timer?.mode === 'focus' ? '#10b981'
    : timer?.mode === 'long_break' ? '#8b5cf6' : '#f59e0b'

  if (joinedRoom && meeting) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0f', display: 'flex' }}>
        <div className="voice-timer-sidebar" style={{
          width: 280, flexShrink: 0,
          background: 'var(--card-bg, #172032)',
          borderRight: '1px solid var(--card-border, #2a3448)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--card-border, #2a3448)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color="var(--blue, #4f8cff)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {joinedRoom.room_name}
              </span>
            </div>
            <button onClick={handleLeave} style={{
              background: 'var(--redL, rgba(239,68,68,0.15))', border: 'none',
              color: 'var(--red, #ef4444)', borderRadius: 6, padding: '4px 8px',
              cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <LogOut size={12} /> Leave
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {timerError && (
              <div style={{
                padding: '6px 10px', background: 'var(--redL, rgba(239,68,68,0.1))',
                border: '1px solid var(--red, #ef4444)', borderRadius: 8, fontSize: 12,
                color: 'var(--red, #ef4444)', marginBottom: 12,
              }}>{timerError}</div>
            )}

            {/* Timer display */}
            {timer && timer.status !== 'stopped' ? (
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: timerColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  {timerLabel}
                </div>
                <div style={{ fontSize: 42, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff', marginBottom: 8 }}>
                  {formatTime(localRemaining)}
                </div>
                <div style={{
                  height: 4, borderRadius: 2, background: 'var(--card-border, #2a3448)',
                  marginBottom: 8, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2, background: timerColor,
                    transition: 'width 1s linear',
                    width: `${(() => {
                      const d = timer.mode === 'focus' ? timer.focus_duration
                        : timer.mode === 'long_break' ? timer.long_break_duration : timer.short_break_duration
                      const elapsed = (localRemaining > 0 && d > 0) ? ((d - localRemaining) / d) * 100 : 0
                      return Math.min(100, elapsed)
                    })()}%`,
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted, #6b7280)' }}>
                  Round {timer.round_number || 0}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 24,
                  background: 'rgba(79,140,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px',
                }}>
                  <Timer size={20} color="var(--blue, #4f8cff)" />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                  No timer running
                </div>
              </div>
            )}

            {/* Timer controls */}
            {canManage && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
                {!timer || timer.status === 'stopped' ? (
                  <button onClick={handleStartTimer} style={{
                    background: 'var(--emeraldL, rgba(16,185,129,0.15))', border: 'none',
                    color: 'var(--emerald, #10b981)', borderRadius: 8, padding: '8px 16px',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Play size={14} /> Start Timer
                  </button>
                ) : (
                  <>
                    {timer.status === 'running' && (
                      <button onClick={() => handleTimerAction('pause')} style={{
                        background: 'rgba(245,158,11,0.15)', border: 'none',
                        color: '#f59e0b', borderRadius: 8, padding: '8px 16px',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <Pause size={14} /> Pause
                      </button>
                    )}
                    {timer.status === 'paused' && (
                      <button onClick={() => handleTimerAction('resume')} style={{
                        background: 'var(--emeraldL, rgba(16,185,129,0.15))', border: 'none',
                        color: 'var(--emerald, #10b981)', borderRadius: 8, padding: '8px 16px',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <Play size={14} /> Resume
                      </button>
                    )}
                    <button onClick={() => handleTimerAction('stop')} style={{
                      background: 'var(--redL, rgba(239,68,68,0.15))', border: 'none',
                      color: 'var(--red, #ef4444)', borderRadius: 8, padding: '8px 16px',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Square size={14} /> Stop
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Timer config (only when stopped) */}
            {canManage && (!timer || timer.status === 'stopped') && (
              <div style={{
                background: 'var(--navy2, #172032)', borderRadius: 10,
                padding: 14, marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Timer Settings
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Focus', val: focusDur, set: setFocusDur, suffix: 'm' },
                    { label: 'Short Break', val: shortBreakDur, set: setShortBreakDur, suffix: 'm' },
                    { label: 'Long Break', val: longBreakDur, set: setLongBreakDur, suffix: 'm' },
                    { label: 'Every X', val: longBreakEvery, set: setLongBreakEvery, suffix: 'rd' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{f.label}</div>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={f.val}
                        onChange={e => {
                          const v = Math.max(1, parseInt(e.target.value) || 1)
                          f.set(v)
                        }}
                        style={{
                          width: '100%', padding: '6px 8px', borderRadius: 6,
                          border: '1px solid var(--card-border, #2a3448)',
                          background: 'var(--input-bg, #0B1120)',
                          color: 'var(--text-primary)', fontSize: 13,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Private timer */}
            <div style={{
              background: 'var(--navy2, #172032)', borderRadius: 10,
              padding: 14, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Private Timer
                </div>
                <button onClick={handlePrivateTimerToggle} style={{
                  background: privateTimer.running ? 'var(--redL, rgba(239,68,68,0.15))' : 'var(--emeraldL, rgba(16,185,129,0.15))',
                  border: 'none', borderRadius: 6, padding: '4px 10px',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  color: privateTimer.running ? 'var(--red, #ef4444)' : 'var(--emerald, #10b981)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {privateTimer.running ? <Square size={10} /> : <Play size={10} />}
                  {privateTimer.running ? 'Stop' : 'Start'}
                </button>
              </div>
              {privateTimer.running && (
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff', textAlign: 'center' }}>
                  {formatTime(privateTimer.seconds)}
                </div>
              )}
            </div>

            {/* Participants */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={13} />
              Participants ({participants.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {participants.map(p => (
                <div key={p.user_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 8,
                  background: 'var(--navy2, #172032)',
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {p.user_id === currentUserId ? 'You' : p.user_id.slice(0, 8)}
                  </span>
                  <span style={{ color: 'var(--emerald, #10b981)', fontWeight: 600, fontSize: 12 }}>
                    {formatDuration(p.study_seconds)}
                  </span>
                </div>
              ))}
              {participants.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
                  No participants
                </div>
              )}
            </div>

            {participants.length > 0 && (
              <div style={{
                marginTop: 10, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(79,140,255,0.08)',
                display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600,
                color: 'var(--blue, #4f8cff)',
              }}>
                <span>Total Room Study</span>
                <span>{formatDuration(participants.reduce((s, p) => s + p.study_seconds, 0))}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
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