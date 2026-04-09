import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Pomodoro.module.css'

export default function Pomodoro() {
  const { user } = useAuth()
  const [mode, setMode] = useState('study')
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(25 * 60)
  const [total, setTotal] = useState(25 * 60)
  const [done, setDone] = useState(0)
  const [focusMins, setFocusMins] = useState(0)
  const [studyMin, setStudyMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [longMin, setLongMin] = useState(15)
  const [form, setForm] = useState({ label: '', topic: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [log, setLog] = useState([])
  const [showDetails, setShowDetails] = useState(false)
  const workerRef = useRef(null)

  useEffect(() => {
    const code = `
      let iv=null,st=null,sr=0;
      self.onmessage=function(e){
        if(e.data.type==='START'){st=Date.now();sr=e.data.remaining;clearInterval(iv);
          iv=setInterval(()=>{const l=Math.max(0,sr-Math.floor((Date.now()-st)/1000));
          self.postMessage({type:'TICK',remaining:l});
          if(l<=0){clearInterval(iv);self.postMessage({type:'DONE'});}},500);}
        if(e.data.type==='PAUSE'){clearInterval(iv);self.postMessage({type:'PAUSED',remaining:Math.max(0,sr-Math.floor((Date.now()-st)/1000))});}
        if(e.data.type==='STOP')clearInterval(iv);
      };`
    const blob = new Blob([code], { type: 'application/javascript' })
    workerRef.current = new Worker(URL.createObjectURL(blob))
    workerRef.current.onmessage = e => {
      if (e.data.type === 'TICK') setRemaining(e.data.remaining)
      if (e.data.type === 'PAUSED') { setRemaining(e.data.remaining); setRunning(false) }
      if (e.data.type === 'DONE') { setRemaining(0); setRunning(false); onDone() }
    }
    return () => workerRef.current.terminate()
  }, [])

  function getTotal(m) {
    return (m === 'study' ? studyMin : m === 'break' ? breakMin : longMin) * 60
  }

  function switchMode(m) {
    workerRef.current.postMessage({ type: 'STOP' })
    setMode(m); setRunning(false)
    const t = getTotal(m); setTotal(t); setRemaining(t)
  }

  function togglePlay() {
    if (running) { workerRef.current.postMessage({ type: 'PAUSE' }); setRunning(false) }
    else { workerRef.current.postMessage({ type: 'START', remaining }); setRunning(true) }
  }

  function reset() { workerRef.current.postMessage({ type: 'STOP' }); setRunning(false); setRemaining(total) }

  function onDone() {
    if (mode === 'study') {
      setDone(d => d + 1); setFocusMins(m => m + studyMin)
      if (!form.label) setForm(f => ({ ...f, label: `Pomodoro ${done + 1}${f.topic ? ' — ' + f.topic : ''}` }))
      playChime()
    } else { switchMode('study') }
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ;[[523, 0], [659, .15], [784, .3]].forEach(([f, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = 'sine'
        g.gain.setValueAtTime(.28, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .35)
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .4)
      })
    } catch (e) { }
  }

  async function saveSession() {
    if (!form.label) return
    setSaving(true)
    try {
      const { error } = await supabase.from('pomodoro_sessions').insert({
        user_id: user.id,
        label: form.label,
        topic: form.topic || null,
        notes: form.notes || null,
        date: new Date().toISOString().split('T')[0],
        duration_min: studyMin,
        completed: true,
        focus_quality: 'Deep focus',
        session_type: 'Study'
      })
      if (error) { alert('Error saving session: ' + error.message); setSaving(false); return }
      setLog(l => [{ label: form.label, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...l])
      setForm({ label: '', topic: '', notes: '' })
      setShowDetails(false)
    } catch (err) {
      console.error('saveSession error:', err)
    }
    setSaving(false)
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const pct = total > 0 ? remaining / total : 1
  const circ = 816.814
  const offset = circ * (1 - pct)
  const isFinished = remaining === 0 && !running

  return (
    <div className={styles.page}>
      {/* Ambient Background */}
      <div className={`${styles.ambient} ${styles['ambient' + mode.charAt(0).toUpperCase() + mode.slice(1)]}`} />

      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>🍅 Pomodoro</h1>
          <p className={styles.sub}>Deep focus. Every session tracked.</p>
        </div>

        {/* Mode Tabs */}
        <div className={styles.modeTabs}>
          {[
            { key: 'study', label: '🎯 Focus', cls: 'study' },
            { key: 'break', label: '☕ Short Break', cls: 'break' },
            { key: 'long', label: '🌿 Long Break', cls: 'long' },
          ].map(({ key, label, cls }) => (
            <button
              key={key}
              className={`${styles.modeTab} ${mode === key ? `${styles.modeTabActive} ${styles[cls]}` : ''}`}
              onClick={() => switchMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Timer */}
        <div className={styles.timerContainer}>
          <div className={`${styles.glowRing} ${styles[mode]} ${running ? styles.pulseActive : ''}`} />
          <div className={styles.ringOuter}>
            <svg viewBox="0 0 280 280" className={styles.ringSvg}>
              <circle className={styles.ringBg} cx="140" cy="140" r="130" />
              <circle className={styles.ringTrack} cx="140" cy="140" r="130" />
              <circle className={styles.ringFg} cx="140" cy="140" r="130"
                style={{
                  stroke: mode === 'study' ? 'var(--teal)' : mode === 'break' ? 'var(--sage)' : 'var(--violet)',
                  '--ring-color': mode === 'study' ? 'rgba(0,181,163,0.5)' : mode === 'break' ? 'rgba(61,190,122,0.5)' : 'rgba(108,99,255,0.5)',
                  strokeDashoffset: offset,
                }} />
            </svg>
            <div className={styles.ringInner}>
              <div className={styles.ringLabel}>
                {isFinished ? '✅ COMPLETE' : mode === 'study' ? 'FOCUS TIME' : mode === 'break' ? 'SHORT BREAK' : 'LONG BREAK'}
              </div>
              <div className={`${styles.ringTime} ${styles[mode]}`}>{mm}:{ss}</div>
              <div className={styles.ringDots}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`${styles.dot} ${i < done % 4 ? `${styles.filled} ${styles[mode]}` : ''}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button className={styles.ctrlBtn} onClick={reset} title="Reset">↺</button>
          <button className={`${styles.playBtn} ${styles[mode]}`} onClick={togglePlay}>
            {running ? '⏸' : '▶'}
          </button>
          <button className={styles.ctrlBtn} onClick={onDone} title="Skip">⏭</button>
        </div>

        {/* Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>🍅</div>
            <div className={styles.statNum}>{done}</div>
            <div className={styles.statLabel}>Completed</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>⏱</div>
            <div className={styles.statNum}>{focusMins}</div>
            <div className={styles.statLabel}>Minutes</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>🔥</div>
            <div className={styles.statNum}>{Math.floor(focusMins / 60 * 10) / 10}</div>
            <div className={styles.statLabel}>Hours</div>
          </div>
        </div>

        {/* Timer Settings */}
        <div className={styles.settingsSection}>
          <div className={styles.settingsTitle}>⚙ Timer Settings</div>
          <div className={styles.settingsGrid}>
            {[
              { label: 'Focus (min)', value: studyMin, set: setStudyMin },
              { label: 'Break (min)', value: breakMin, set: setBreakMin },
              { label: 'Long (min)', value: longMin, set: setLongMin },
            ].map(({ label, value, set }) => (
              <div key={label} className={styles.setItem}>
                <label>{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={e => { set(+e.target.value); if (!running) switchMode(mode) }}
                  min="1"
                  max="90"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Session Details (collapsible) */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            width: '100%', padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)', color: 'var(--mist)', fontSize: '13px',
            fontWeight: 600, cursor: 'pointer', marginBottom: '16px', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span>📝 Session Details</span>
          <span style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showDetails && (
          <div className={styles.detailsSection}>
            <div className={styles.field}>
              <label>Session Name</label>
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Cardiology Block 3 — Arrhythmias" />
            </div>
            <div className={styles.field}>
              <label>Topic</label>
              <input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Atrial fibrillation" />
            </div>
            <div className={styles.field}>
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What you covered..." />
            </div>
            <button className={styles.primaryBtn} onClick={saveSession} disabled={saving || !form.label}>
              {saving ? 'Saving...' : '🚀 Save to Database'}
            </button>
          </div>
        )}

        {/* Session Log */}
        {log.length > 0 && (
          <div className={styles.sessionLog}>
            <div className={styles.logTitle}>📋 Today's Sessions</div>
            {log.map((l, i) => (
              <div key={i} className={styles.logItem}>
                <span className={styles.logEmoji}>🍅</span>
                <span className={styles.logLabel}>{l.label}</span>
                <span className={styles.logTime}>{l.time} ✅</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
