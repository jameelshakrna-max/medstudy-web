import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

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
      if (error) {
        console.error('Error saving session:', error)
        alert('Error saving session: ' + error.message)
        setSaving(false)
        return
      }
      setLog(l => [{ label: form.label, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...l])
      setForm({ label: '', topic: '', notes: '' })
    } catch (err) {
      console.error('saveSession error:', err)
    }
    setSaving(false)
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const pct = remaining / total
  const circ = 816.814
  const offset = circ * (1 - pct)
  const modeColor = mode === 'study' ? 'var(--teal)' : mode === 'break' ? 'var(--sage)' : 'var(--violet)'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🍅 Pomodoro Timer</h1>
        <p className={styles.sub}>Deep focus. Every session logged automatically.</p>
      </div>

      <div className={styles.pomoCentred}>
        <div className={styles.tabs}>
          {[['study', '🎯 Study'], ['break', '☕ Break'], ['long', '🌿 Long Break']].map(([v, l]) => (
            <button key={v} className={`${styles.tab} ${mode === v ? styles.tabActive : ''}`}
              style={mode === v ? { borderColor: modeColor, color: modeColor } : {}} onClick={() => switchMode(v)}>{l}</button>
          ))}
        </div>

        <div className={styles.ring}>
          <svg viewBox="0 0 280 280" className={styles.ringsvg}>
            <circle className={styles.ringbg} cx="140" cy="140" r="130" />
            <circle className={styles.ringfg} cx="140" cy="140" r="130"
              style={{ stroke: modeColor, strokeDashoffset: offset, filter: `drop-shadow(0 0 10px ${modeColor})` }} />
          </svg>
          <div className={styles.ringInner}>
            <div className={styles.ringLabel}>{mode === 'study' ? 'FOCUS TIME' : mode === 'break' ? 'SHORT BREAK' : 'LONG BREAK'}</div>
            <div className={styles.ringTime} style={{ color: mode === 'study' ? '#fff' : modeColor }}>{mm}:{ss}</div>
            <div className={styles.ringDots}>
              {[0, 1, 2, 3].map(i => <div key={i} className={styles.dot} style={{ background: i < done % 4 ? 'var(--teal)' : 'rgba(255,255,255,0.1)' }} />)}
            </div>
          </div>
        </div>

        <div className={styles.pomoControls}>
          <button className={styles.ctrlBtn} onClick={reset}>↺</button>
          <button className={styles.playBtn} style={{ background: modeColor }} onClick={togglePlay}>{running ? '⏸' : '▶'}</button>
          <button className={styles.ctrlBtn} onClick={onDone}>⏭</button>
        </div>

        <div className={styles.pomoStats}>
          <div className={styles.ps}><strong>{done}</strong><span>Done</span></div>
          <div className={styles.ps}><strong>{focusMins}</strong><span>Minutes</span></div>
        </div>

        <div className={styles.pomoSettings}>
          {[['Study', studyMin, setStudyMin], ['Break', breakMin, setBreakMin], ['Long', longMin, setLongMin]].map(([l, v, s]) => (
            <div key={l} className={styles.setItem}>
              <label>{l} (min)</label>
              <input type="number" value={v} onChange={e => { s(+e.target.value); if (!running) switchMode(mode) }} min="1" max="90" />
            </div>
          ))}
        </div>

        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>📝 Session Details</h3>
          <div className={styles.field}><label>Session Name</label><input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Cardiology Block 3 — Arrhythmias" /></div>
          <div className={styles.field}><label>Topic</label><input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Atrial fibrillation" /></div>
          <div className={styles.field}><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What you covered..." /></div>
          <button className={styles.primaryBtn} onClick={saveSession} disabled={saving || !form.label}>{saving ? 'Saving...' : '🚀 Save to Database'}</button>
        </div>

        {log.length > 0 && (
          <div className={styles.sessionLog}>
            <div className={styles.logTitle}>Today's Sessions</div>
            {log.map((l, i) => (
              <div key={i} className={styles.logItem}>
                <span>🍅</span><span>{l.label}</span><span className={styles.logTime}>{l.time} ✅</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
