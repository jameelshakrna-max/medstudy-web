import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePomodoro } from '../context/PomodoroContext'
import { supabase } from '../lib/supabase'
import s from './Pomodoro.module.css'

function generateStars(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 60,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 4 + 2,
    delay: Math.random() * 5,
  }))
}

function generateFireflies(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 90 + 5,
    top: Math.random() * 60 + 20,
    dx: (Math.random() - 0.5) * 60,
    dy: (Math.random() - 0.5) * 50,
    dur: Math.random() * 6 + 4,
    delay: Math.random() * 8,
  }))
}

const treeClasses = ['treeTeal', 'treeSage', 'treeViolet', 'treeGold']

export default function Pomodoro() {
  const { user } = useAuth()
  const {
    mode, running, displayRemaining, total,
    done, focusMins,
    studyMin, breakMin, longMin,
    log, form, setForm, setLog,
    switchMode, togglePlay, resetTimer, skipTimer, setTimerSettings,
  } = usePomodoro()

  const [saving, setSaving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

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

  const mm = String(Math.floor(displayRemaining / 60)).padStart(2, '0')
  const ss = String(displayRemaining % 60).padStart(2, '0')
  const pct = total > 0 ? displayRemaining / total : 1
  const circ = 816.814
  const offset = circ * (1 - pct)
  const isFinished = displayRemaining === 0 && !running

  const trees = useMemo(() => {
    const result = []
    const positions = [8, 16, 24, 33, 42, 52, 60, 68, 76, 84, 91]
    for (let i = 0; i < done; i++) {
      const posIdx = i % positions.length
      const row = Math.floor(i / positions.length)
      const baseSize = 16 + Math.random() * 8
      result.push({
        id: i,
        left: positions[posIdx] + (Math.random() * 6 - 3),
        bottom: 32 + row * 4,
        w: baseSize,
        h: baseSize * 1.8,
        cls: treeClasses[i % treeClasses.length],
        delay: 0,
        growing: false,
      })
    }
    if (running && mode === 'study') {
      const nextIdx = done % positions.length
      const row = Math.floor(done / positions.length)
      const baseSize = 16 + Math.random() * 8
      const progress = 1 - pct
      result.push({
        id: 'growing',
        left: positions[nextIdx] + (Math.random() * 6 - 3),
        bottom: 32 + row * 4,
        w: baseSize,
        h: baseSize * 1.8 * progress,
        cls: treeClasses[done % treeClasses.length],
        delay: 0,
        growing: true,
      })
    }
    return result
  }, [done, running, mode, pct])

  const stars = useMemo(() => generateStars(30), [])
  const fireflies = useMemo(() => generateFireflies(8), [])

  return (
    <div className={s.page}>
      <div className={`${s.ambient} ${s['ambient' + mode.charAt(0).toUpperCase() + mode.slice(1)]}`} />
      <div className={s.stars}>
        {stars.map(star => (
          <div key={star.id} className={s.star} style={{
            left: star.left + '%',
            top: star.top + '%',
            width: star.size + 'px',
            height: star.size + 'px',
            '--duration': star.duration + 's',
            '--delay': star.delay + 's',
          }} />
        ))}
      </div>
      <div className={s.content}>
        <div className={s.header}>
          <h1 className={s.title}>Pomodoro</h1>
          <p className={s.sub}>Deep focus. Every session tracked.</p>
        </div>
        <div className={s.modeTabs}>
          {[
            { key: 'study', label: 'Focus', cls: 'study' },
            { key: 'break', label: 'Short Break', cls: 'break' },
            { key: 'long', label: 'Long Break', cls: 'long' },
          ].map(({ key, label, cls }) => (
            <button
              key={key}
              className={`${s.modeTab} ${mode === key ? `${s.modeTabActive} ${s[cls]}` : ''}`}
              onClick={() => switchMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={s.timerContainer}>
          <div className={`${s.glowRing} ${s[mode]} ${running ? s.pulseActive : ''}`} />
          <div className={s.ringOuter}>
            <svg viewBox="0 0 280 280" className={s.ringSvg}>
              <circle className={s.ringBg} cx="140" cy="140" r="130" />
              <circle className={s.ringTrack} cx="140" cy="140" r="130" />
              <circle className={s.ringFg} cx="140" cy="140" r="130"
                style={{
                  stroke: mode === 'study' ? '#00B5A3' : mode === 'break' ? '#3DBE7A' : '#6C63FF',
                  '--ring-color': mode === 'study' ? 'rgba(0,181,163,0.6)' : mode === 'break' ? 'rgba(61,190,122,0.6)' : 'rgba(108,99,255,0.6)',
                  strokeDashoffset: offset,
                }} />
            </svg>
            <div className={s.ringInner}>
              <div className={s.ringLabel}>
                {isFinished ? 'COMPLETE' : running ? 'COUNTING...' : mode === 'study' ? 'FOCUS TIME' : mode === 'break' ? 'SHORT BREAK' : 'LONG BREAK'}
              </div>
              <div className={`${s.ringTime} ${s[mode]}`}>{mm}:{ss}</div>
              <div className={s.ringDots}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`${s.dot} ${i < done % 4 ? `${s.filled} ${s[mode]}` : ''}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={s.controls}>
          <button className={s.ctrlBtn} onClick={resetTimer} title="Reset">&#x21BA;</button>
          <button className={`${s.playBtn} ${s[mode]}`} onClick={togglePlay}>
            {running ? '\u23F8' : '\u25B6'}
          </button>
          <button className={s.ctrlBtn} onClick={skipTimer} title="Skip">&#x23ED;</button>
        </div>
        <div className={s.statsGrid}>
          <div className={s.statCard}>
            <span className={s.statIcon}>&#x1F345;</span>
            <span className={s.statNum}>{done}</span>
            <span className={s.statLabel}>Completed</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statIcon}>&#x23F1;</span>
            <span className={s.statNum}>{focusMins}</span>
            <span className={s.statLabel}>Minutes</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statIcon}>&#x1F525;</span>
            <span className={s.statNum}>{focusMins > 0 ? (focusMins / 60).toFixed(1) : '0.0'}</span>
            <span className={s.statLabel}>Hours</span>
          </div>
        </div>
        <div className={s.forest}>
          <div className={s.forestLabel}>
            {done === 0 ? 'Complete your first pomodoro to plant a tree!' :
             done === 1 ? 'Your forest begins \u2014 1 tree planted!' :
             done + ' trees planted in your focus forest'}
          </div>
          <div className={s.forestGround}>
            {trees.map(t => (
              <div
                key={t.id}
                className={`${s.tree} ${s[t.cls]} ${t.growing ? s.treeGrowing : ''}`}
                style={{
                  left: t.left + '%',
                  bottom: t.bottom + 'px',
                  animationDelay: t.delay + 's',
                  '--w': t.w + 'px',
                  '--h': (t.growing ? Math.max(t.h * (1 - pct), 8) : t.h) + 'px',
                }}
              >
                <div className={s.treeCrown}>
                  <div className={s.treeTop} />
                </div>
                <div className={s.treeTrunk} />
              </div>
            ))}
            {fireflies.map(ff => (
              <div
                key={ff.id}
                className={s.firefly}
                style={{
                  left: ff.left + '%',
                  top: ff.top + '%',
                  '--dx': ff.dx + 'px',
                  '--dy': ff.dy + 'px',
                  '--dur': ff.dur + 's',
                  '--delay': ff.delay + 's',
                }}
              />
            ))}
          </div>
        </div>
        <div className={s.bottomPanel}>
          <div className={s.settingsSection}>
            <div className={s.settingsTitle}>Timer Settings</div>
            <div className={s.settingsGrid}>
              {[
                { label: 'Focus (min)', value: studyMin },
                { label: 'Break (min)', value: breakMin },
                { label: 'Long (min)', value: longMin },
              ].map(({ label, value }) => (
                <div key={label} className={s.setItem}>
                  <label>{label}</label>
                  <input
                    type="number"
                    value={value}
                    onChange={e => {
                      const v = +e.target.value
                      setTimerSettings(
                        label.includes('Focus') ? v : studyMin,
                        label.includes('Break') ? v : breakMin,
                        label.includes('Long') ? v : longMin
                      )
                    }}
                    min="1"
                    max="90"
                  />
                </div>
              ))}
            </div>
          </div>
          <button className={s.toggleBtn} onClick={() => setShowDetails(!showDetails)}>
            <span>Session Details</span>
            <span className={`${s.toggleArrow} ${showDetails ? s.toggleArrowOpen : ''}`}>&#x25BC;</span>
          </button>
          {showDetails && (
            <div className={s.detailsSection}>
              <div className={s.field}>
                <label>Session Name</label>
                <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Cardiology Block 3" />
              </div>
              <div className={s.field}>
                <label>Topic</label>
                <input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Arrhythmias" />
              </div>
              <div className={s.field}>
                <label>Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What you covered..." />
              </div>
              <button className={s.primaryBtn} onClick={saveSession} disabled={saving || !form.label}>
                {saving ? 'Saving...' : 'Save to Database'}
              </button>
            </div>
          )}
          {log.length > 0 && (
            <div className={s.sessionLog}>
              <div className={s.logTitle}>Today's Sessions</div>
              {log.map((l, i) => (
                <div key={i} className={s.logItem}>
                  <span className={s.logEmoji}>&#x1F345;</span>
                  <span className={s.logLabel}>{l.label}</span>
                  <span className={s.logTime}>{l.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}