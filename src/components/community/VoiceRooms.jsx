import { useState, useEffect, useRef, useCallback } from 'react'
import { useRealtimeKitClient, RealtimeKitProvider } from '@cloudflare/realtimekit-react'
import { RtkMeeting } from '@cloudflare/realtimekit-react-ui'
import { apiGet, apiPost } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import {
  Headphones, Plus, X, Loader2, LogOut,
  Play, Pause, Square, Clock, Users, Timer, Volume2, VolumeX, Music,
  ChevronDown, ChevronRight, BarChart3, Activity,
} from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'
import Dropdown from '../ui/Dropdown/Dropdown'

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
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const breakSuggestions = [
  { icon: '🤸', text: 'Stand up and stretch', duration: 30 },
  { icon: '💧', text: 'Drink some water', duration: 20 },
  { icon: '👁️', text: 'Rest your eyes — look at something 20ft away', duration: 30 },
  { icon: '🫁', text: 'Take 3 deep breaths', duration: 15 },
  { icon: '📋', text: 'Review what you just studied', duration: 60 },
  { icon: '🚶', text: 'Walk around for a minute', duration: 60 },
]

const ambientOptions = [
  { key: 'white_noise', label: 'White Noise' },
  { key: 'brown_noise', label: 'Brown Noise' },
  { key: 'pink_noise', label: 'Pink Noise' },
  { key: 'rain', label: 'Rain' },
  { key: 'cafe', label: 'Café' },
]

const focusStatuses = [
  { key: 'studying', label: 'Studying', color: '#4f8cff' },
  { key: 'focusing', label: 'Focusing', color: '#10b981' },
  { key: 'on_break', label: 'On Break', color: '#f59e0b' },
  { key: 'away', label: 'Away', color: '#6b7280' },
]

function focusStatusColor(status) {
  const s = focusStatuses.find(f => f.key === status)
  return s ? s.color : '#10b981'
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
      setError('')
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
    ensureAudio()
    if (Notification.permission === 'default') Notification.requestPermission()
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
  const [endsAt, setEndsAt] = useState(null)
  const [renderTick, setRenderTick] = useState(0)
  const [timerError, setTimerError] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioCtxRef = useRef(null)
  const prevModeRef = useRef(null)
  const pausedRemainingRef = useRef(null)

  const [focusDur, setFocusDur] = useState(25)
  const [shortBreakDur, setShortBreakDur] = useState(5)
  const [longBreakDur, setLongBreakDur] = useState(15)
  const [longBreakEvery, setLongBreakEvery] = useState(4)

  const [ambientSound, setAmbientSound] = useState(null)
  const [ambientVolume, setAmbientVolume] = useState(0.3)
  const [ambientPlaying, setAmbientPlaying] = useState(false)
  const ambientNodeRef = useRef(null)
  const ambientGainRef = useRef(null)

  const [currentSuggestion, setCurrentSuggestion] = useState(0)

  const [focusStatus, setFocusStatus] = useState('focusing')
  const [showStatusPicker, setShowStatusPicker] = useState(false)

  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [timelineData, setTimelineData] = useState(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [statsData, setStatsData] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  function ensureAudio() {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (Ctor) audioCtxRef.current = new Ctor()
    }
  }

  function playNote(ctx, freq, startTime, duration, volume) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(freq, startTime)
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
    gain.gain.linearRampToValueAtTime(0, startTime + duration)
    osc.start(startTime)
    osc.stop(startTime + duration)
  }

  function playChime(mode) {
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') return
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    if (mode === 'short_break' || mode === 'long_break') {
      playNote(ctx, 523.25, now, 0.25, 0.3)
      playNote(ctx, 392.00, now + 0.15, 0.35, 0.3)
    } else {
      playNote(ctx, 392.00, now, 0.15, 0.3)
      playNote(ctx, 523.25, now + 0.12, 0.25, 0.3)
    }
  }

  function startAmbientSound(type) {
    stopAmbientSound()
    ensureAudio()
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') return
    if (ctx.state === 'suspended') ctx.resume()

    const gainNode = ctx.createGain()
    gainNode.gain.value = ambientVolume
    gainNode.connect(ctx.destination)

    let sourceNode
    if (type === 'white_noise') {
      const bufferSize = 2 * ctx.sampleRate
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
      sourceNode = ctx.createBufferSource()
      sourceNode.buffer = buffer
      sourceNode.loop = true
      sourceNode.connect(gainNode)
      sourceNode.start()
    } else if (type === 'brown_noise') {
      const bufferSize = 2 * ctx.sampleRate
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        data[i] = (lastOut + 0.02 * white) / 1.02
        lastOut = data[i]
        data[i] *= 3.5
      }
      sourceNode = ctx.createBufferSource()
      sourceNode.buffer = buffer
      sourceNode.loop = true
      sourceNode.connect(gainNode)
      sourceNode.start()
    } else if (type === 'pink_noise') {
      const bufferSize = 2 * ctx.sampleRate
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
        b6 = white * 0.115926
      }
      sourceNode = ctx.createBufferSource()
      sourceNode.buffer = buffer
      sourceNode.loop = true
      sourceNode.connect(gainNode)
      sourceNode.start()
    } else if (type === 'rain') {
      const bufferSize = 2 * ctx.sampleRate
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        lastOut = (lastOut + 0.02 * white) / 1.02
        const mod = 0.7 + 0.3 * Math.sin(i / (ctx.sampleRate * 0.8))
        data[i] = lastOut * 3.5 * mod
      }
      sourceNode = ctx.createBufferSource()
      sourceNode.buffer = buffer
      sourceNode.loop = true
      sourceNode.connect(gainNode)
      sourceNode.start()
    } else if (type === 'cafe') {
      const bufferSize = 4 * ctx.sampleRate
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        lastOut = (lastOut + 0.02 * white) / 1.02
        data[i] = lastOut * 3.5
        if (Math.random() < 0.0003) {
          const spikeLen = Math.floor(ctx.sampleRate * 0.05 + Math.random() * ctx.sampleRate * 0.15)
          for (let j = 0; j < spikeLen && (i + j) < bufferSize; j++) {
            data[i + j] += (Math.random() * 2 - 1) * 0.4 * Math.sin(Math.PI * j / spikeLen)
          }
        }
      }
      sourceNode = ctx.createBufferSource()
      sourceNode.buffer = buffer
      sourceNode.loop = true
      sourceNode.connect(gainNode)
      sourceNode.start()
    }

    ambientNodeRef.current = sourceNode
    ambientGainRef.current = gainNode
    setAmbientSound(type)
    setAmbientPlaying(true)
  }

  function stopAmbientSound() {
    if (ambientNodeRef.current) {
      try {
        ambientNodeRef.current.stop()
        ambientNodeRef.current.disconnect()
      } catch {}
      ambientNodeRef.current = null
    }
    if (ambientGainRef.current) {
      try { ambientGainRef.current.disconnect() } catch {}
      ambientGainRef.current = null
    }
    setAmbientPlaying(false)
  }

  async function updateFocusStatus(status) {
    setFocusStatus(status)
    setShowStatusPicker(false)
    if (!joinedRoom) return
    try {
      await apiPost(`/communities/${communityId}/rooms/${joinedRoom.id}/status`, { status })
    } catch {}
  }

  const displayRemaining = (() => {
    if (!timer || !endsAt) return 0
    if (timer.status === 'paused') {
      if (pausedRemainingRef.current === null) {
        pausedRemainingRef.current = Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000))
      }
      return pausedRemainingRef.current
    }
    if (timer.status === 'running') {
      pausedRemainingRef.current = null
      return Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000))
    }
    pausedRemainingRef.current = null
    return 0
  })()

  // Re-render every second for live countdown
  useEffect(() => {
    const id = setInterval(() => setRenderTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (ambientGainRef.current) {
      ambientGainRef.current.gain.value = ambientVolume
    }
  }, [ambientVolume])

  useEffect(() => {
    return () => {
      if (ambientNodeRef.current) {
        try {
          ambientNodeRef.current.stop()
          ambientNodeRef.current.disconnect()
        } catch {}
        ambientNodeRef.current = null
      }
      if (ambientGainRef.current) {
        try { ambientGainRef.current.disconnect() } catch {}
        ambientGainRef.current = null
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch {}
        audioCtxRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (timer?.mode === 'short_break' || timer?.mode === 'long_break') {
      setCurrentSuggestion(Math.floor(Math.random() * breakSuggestions.length))
    }
  }, [timer?.mode])

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
        setEndsAt(data.ends_at)
      } else {
        setTimer(null)
        setEndsAt(null)
      }
      setParticipants(data.participants || [])
    } catch {}
  }, [joinedRoom, communityId, API_BASE])

  useEffect(() => {
    if (!joinedRoom) {
      setTimer(null)
      setParticipants([])
      setEndsAt(null)
      setTimerError('')
      return
    }

    setTimerError('')
    pollTimer()

    const interval = setInterval(pollTimer, 15000)
    return () => clearInterval(interval)
  }, [joinedRoom, pollTimer])

  // Audio chime + notification on mode change
  useEffect(() => {
    if (!timer) { prevModeRef.current = null; return }
    const prev = prevModeRef.current
    prevModeRef.current = timer.mode
    if (!prev || prev === timer.mode) return
    if (soundEnabled) {
      ensureAudio()
      playChime(timer.mode)
    }
    if (Notification.permission === 'granted') {
      const isFocus = timer.mode === 'focus'
      new Notification(isFocus ? '☕ Break finished!' : '🍅 Focus complete!', {
        body: isFocus ? 'Time to focus.' : 'Great session! Break starts now.',
      })
    }
  }, [timer?.mode, soundEnabled])

  // Re-poll when tab becomes visible
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') pollTimer() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [pollTimer])

  /* ── Timeline & Stats fetching ── */

  const fetchTimeline = useCallback(async () => {
    if (!joinedRoom) return
    setTimelineLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const data = await apiGet(`/communities/${communityId}/rooms/${joinedRoom.id}/timeline?date=${today}`)
      setTimelineData(data)
    } catch {}
    setTimelineLoading(false)
  }, [joinedRoom, communityId])

  const fetchStats = useCallback(async () => {
    if (!joinedRoom) return
    setStatsLoading(true)
    try {
      const data = await apiGet(`/communities/${communityId}/rooms/${joinedRoom.id}/stats`)
      setStatsData(data)
    } catch {}
    setStatsLoading(false)
  }, [joinedRoom, communityId])

  useEffect(() => {
    if (!joinedRoom) {
      setTimelineData(null)
      setStatsData(null)
      return
    }
    fetchTimeline()
    fetchStats()
    const interval = setInterval(() => {
      fetchTimeline()
      fetchStats()
    }, 60000)
    return () => clearInterval(interval)
  }, [joinedRoom, fetchTimeline, fetchStats])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && joinedRoom) {
        fetchTimeline()
        fetchStats()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [joinedRoom, fetchTimeline, fetchStats])

  const handleTimerAction = async (action) => {
    setTimerError('')
    try {
      await apiPost(`/communities/${communityId}/rooms/${joinedRoom.id}/timer/${action}`, {})
      await pollTimer()
    } catch (e) { setTimerError(e.message) }
  }

  const handleStartTimer = async () => {
    setTimerError('')
    ensureAudio()
    if (Notification.permission === 'default') Notification.requestPermission()
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
      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-float, 1800)', background: '#0a0a0f', display: 'flex' }}>
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
                {(timer.mode === 'short_break' || timer.mode === 'long_break') && timer.status === 'running' ? (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff', marginBottom: 6 }}>
                      {formatTime(displayRemaining)}
                    </div>
                    <div style={{
                      background: 'var(--navy2, #172032)', borderRadius: 10,
                      padding: 16, marginBottom: 8,
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>
                        {breakSuggestions[currentSuggestion].icon}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {breakSuggestions[currentSuggestion].text}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
                        Try this during your break
                      </div>
                      <button onClick={() => setCurrentSuggestion((currentSuggestion + 1) % breakSuggestions.length)} style={{
                        background: 'rgba(79,140,255,0.1)', border: 'none',
                        color: 'var(--blue, #4f8cff)', borderRadius: 6, padding: '5px 12px',
                        cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      }}>
                        Next suggestion
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 42, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff', marginBottom: 8 }}>
                      {formatTime(displayRemaining)}
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
                          const elapsed = (displayRemaining > 0 && d > 0) ? ((d - displayRemaining) / d) * 100 : 0
                          return Math.min(100, elapsed)
                        })()}%`,
                      }} />
                    </div>
                  </>
                )}
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

            {/* Ambient Sounds */}
            <div style={{
              background: 'var(--navy2, #172032)', borderRadius: 10,
              padding: 14, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Music size={13} color="var(--text-secondary)" />
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Ambient Sounds
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {ambientOptions.map(opt => (
                  <button key={opt.key} onClick={() => {
                    if (ambientPlaying && ambientSound === opt.key) {
                      stopAmbientSound()
                    } else {
                      startAmbientSound(opt.key)
                    }
                  }} style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none',
                    background: ambientPlaying && ambientSound === opt.key
                      ? 'rgba(79,140,255,0.2)' : 'var(--input-bg, #0B1120)',
                    color: ambientPlaying && ambientSound === opt.key
                      ? 'var(--blue, #4f8cff)'
                      : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {ambientPlaying && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <VolumeX size={12} color="var(--muted)" style={{ cursor: 'pointer', flexShrink: 0 }}
                    onClick={stopAmbientSound} />
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={ambientVolume}
                    onChange={e => setAmbientVolume(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--blue, #4f8cff)', height: 4 }}
                  />
                  <Volume2 size={12} color="var(--muted)" style={{ flexShrink: 0 }} />
                </div>
              )}
            </div>

            {/* Focus Status */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Your Status
              </div>
              <Dropdown open={showStatusPicker} onOpenChange={setShowStatusPicker}>
                <Dropdown.Trigger asChild>
                  <button style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: 'var(--navy2, #172032)',
                    color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', width: '100%',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: focusStatusColor(focusStatus), display: 'inline-block' }} />
                    {focusStatuses.find(f => f.key === focusStatus)?.label || focusStatus}
                  </button>
                </Dropdown.Trigger>
                <Dropdown.Content>
                  {focusStatuses.map(f => (
                    <Dropdown.Item key={f.key} onSelect={() => updateFocusStatus(f.key)}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, display: 'inline-block' }} />
                      {f.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Content>
              </Dropdown>
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
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: focusStatusColor(p.focus_status || 'focusing'), display: 'inline-block', flexShrink: 0 }} />
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

            {/* Session Timeline */}
            <div style={{
              background: 'var(--navy2, #172032)', borderRadius: 10,
              padding: 14, marginTop: 12,
            }}>
              <button onClick={() => {
                const next = !timelineExpanded
                setTimelineExpanded(next)
                if (next && !timelineData) fetchTimeline()
              }} style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
              }}>
                <Activity size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>Today's Timeline</span>
                {timelineExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {timelineExpanded && (
                <div style={{ marginTop: 10 }}>
                  {timelineLoading && !timelineData ? (
                    <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Loading...</div>
                  ) : timelineData && timelineData.events && timelineData.events.length > 0 ? (
                    <>
                      <div style={{
                        fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '6px 8px',
                        borderRadius: 6, background: 'rgba(79,140,255,0.06)',
                      }}>
                        {timelineData.total_focus_minutes || 0} min focus · {timelineData.total_break_minutes || 0} min break
                      </div>
                      <div style={{ position: 'relative', paddingLeft: 20 }}>
                        <div style={{
                          position: 'absolute', left: 7, top: 0, bottom: 0, width: 2,
                          background: 'var(--card-border, #2a3448)',
                        }} />
                        {timelineData.events.map((ev, i) => {
                          const isFocus = ev.type === 'timer_start' && ev.mode === 'focus'
                          const isBreak = ev.type === 'timer_start' && (ev.mode === 'short_break' || ev.mode === 'long_break')
                          const isJoin = ev.type === 'member_join'
                          const isLeave = ev.type === 'member_leave'
                          const isComplete = ev.type === 'timer_complete'
                          let dotColor = 'var(--muted, #6b7280)'
                          let desc = ev.type
                          if (isFocus) { dotColor = 'var(--emerald, #10b981)'; desc = 'Timer started: Focus' }
                          else if (isBreak) { dotColor = 'var(--amber, #f59e0b)'; desc = `Timer started: ${ev.mode === 'long_break' ? 'Long Break' : 'Short Break'}` }
                          else if (isComplete) {
                            dotColor = ev.mode === 'focus' ? 'var(--emerald, #10b981)' : 'var(--amber, #f59e0b)'
                            desc = 'Timer completed'
                          }
                          else if (isJoin) { dotColor = 'var(--blue, #4f8cff)'; desc = 'Member joined' }
                          else if (isLeave) { dotColor = 'var(--red, #ef4444)'; desc = 'Member left' }
                          return (
                            <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                              <div style={{
                                position: 'absolute', left: -13, top: 4,
                                width: 10, height: 10, borderRadius: '50%',
                                background: dotColor,
                              }} />
                              <div style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {ev.time ? ev.time.slice(0, 5) : ''}
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{desc}</div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
                      No activity recorded today
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Room Stats Dashboard */}
            <div style={{
              background: 'var(--navy2, #172032)', borderRadius: 10,
              padding: 14, marginTop: 12,
            }}>
              <button onClick={() => {
                const next = !statsExpanded
                setStatsExpanded(next)
                if (next && !statsData) fetchStats()
              }} style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
              }}>
                <BarChart3 size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>Room Stats</span>
                {statsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {statsExpanded && (
                <div style={{ marginTop: 10 }}>
                  {statsLoading && !statsData ? (
                    <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Loading...</div>
                  ) : statsData ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                        {[
                          { label: 'Total Study Time', value: formatDuration(statsData.total_study_seconds || 0) },
                          { label: 'Sessions', value: statsData.total_sessions || 0 },
                          { label: 'Active Members', value: statsData.active_participants || 0 },
                          { label: 'Current', value: statsData.current_participants || 0 },
                        ].map(card => (
                          <div key={card.label} style={{
                            background: 'var(--input-bg, #0B1120)', borderRadius: 8,
                            padding: '8px 10px', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                              {card.value}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{card.label}</div>
                          </div>
                        ))}
                      </div>
                      {statsData.top_participants && statsData.top_participants.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Top Participants</div>
                          {statsData.top_participants.slice(0, 3).map((p, i) => (
                            <div key={p.user_id} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '5px 8px', borderRadius: 6, marginBottom: 3,
                              background: 'var(--input-bg, #0B1120)',
                            }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : '#b45309',
                                width: 14, textAlign: 'center',
                              }}>
                                {i + 1}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.user_id === currentUserId ? 'You' : p.user_id.slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--emerald, #10b981)', fontWeight: 600 }}>
                                {formatDuration(p.study_seconds)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
                      No stats available
                    </div>
                  )}
                </div>
              )}
            </div>
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={soundEnabled}
          onChange={e => setSoundEnabled(e.target.checked)}
          style={{ accentColor: 'var(--blue, #4f8cff)' }} />
        <Volume2 size={13} /> Sound alerts
      </label>

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