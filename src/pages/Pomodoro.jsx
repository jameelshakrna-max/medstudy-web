import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePomodoro, PushDebugBanner } from '../context/PomodoroContext'
import { supabase } from '../lib/supabase'
import s from './Pomodoro.module.css'

const MODES = ['study','break','long']
const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
const TREE_COLORS = ['treeTeal','treeSage','treeViolet','treeGold']

export default function Pomodoro() {
  const {
    mode, setMode, running, setRunning,
    done, setDone, focusMins, setFocusMins,
    shortMins, setShortMins, longMins, setLongMins,
    selectedTopic, setSelectedTopic,
    sessionPomodoros, setSessionPomodoros,
    sessionStart, setSessionStart,
    sessionLog, resetSession,
    // Centralized timer values & actions
    seconds, totalSec,
    displayRemaining, progress,
    togglePlay, skipTimer, resetTimer
  } = usePomodoro()

  const [showSettings, setShowSettings] = useState(false)
  const [trees, setTrees] = useState([])
  const [topics, setTopics] = useState([])
  const [topicInfo, setTopicInfo] = useState(null)

  // Finish modal
  const [showFinish, setShowFinish] = useState(false)
  const [topicStatus, setTopicStatus] = useState('In Progress')
  const [saving, setSaving] = useState(false)

  const treeIdRef = useRef(0)

  // ── Listen for timer completion to grow a tree ──
  // We detect a "just completed" cycle when `done` increases
  const prevDoneRef = useRef(done)
  useEffect(() => {
    if (done > prevDoneRef.current) {
      const color = TREE_COLORS[Math.floor(Math.random() * TREE_COLORS.length)]
      const id = treeIdRef.current++
      const left = 10 + Math.random() * 80
      const scale = 0.6 + Math.random() * 0.6
      setTrees(prev => [...prev, { id, color, left, scale, born: Date.now() }])
    }
    prevDoneRef.current = done
  }, [done])

  // ── Load topics ──
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('curriculum_topics')
        .select('id, name, status, high_yield, completion_pct, subject:curriculum_subjects(name, system:curriculum_systems(name))')
        .eq('user_id', user.id)
        .order('name')
      if (data) setTopics(data)
    }
    load()
  }, [])

  // ── Update topic info when selection changes ──
  useEffect(() => {
    if (selectedTopic) {
      const t = topics.find(t => t.id === selectedTopic)
      setTopicInfo(t || null)
    } else {
      setTopicInfo(null)
    }
  }, [selectedTopic, topics])

  // ── Computed ──
  const circumference = 2 * Math.PI * 130
  const dashOffset = circumference * (1 - progress)

  const elapsedMin = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0
  const [liveMin, setLiveMin] = useState(0)
  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => setLiveMin(sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0), 30000)
    return () => clearInterval(iv)
  }, [running, sessionStart])

  // ── Stars (memoized) ──
  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      duration: `${2 + Math.random() * 4}s`,
      delay: `${Math.random() * 3}s`
    })), [])

  // ── Fireflies ──
  const fireflies = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      top: `${40 + Math.random() * 50}%`,
      dur: `${5 + Math.random() * 4}s`,
      delay: `${Math.random() * 5}s`,
      dx: `${-30 + Math.random() * 60}px`,
      dy: `${-20 + Math.random() * -40}px`
    })), [])

  // ── Leaf particles ──
  const leaves = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      top: `${Math.random() * 30}%`,
      color: TREE_COLORS[i % 4],
      dur: `${3 + Math.random() * 3}s`,
      delay: `${Math.random() * 8}s`,
      dx: `${-20 + Math.random() * 40}px`,
      dx2: `${-15 + Math.random() * 30}px`
    })), [])

  // ── Tick marks for timer ──
  const tickMarks = useMemo(() => {
    const marks = []
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6) * Math.PI / 180
      const r = 140
      const x = 150 + r * Math.cos(angle)
      const y = 150 + r * Math.sin(angle)
      const len = i % 5 === 0 ? 8 : 4
      const x2 = 150 + (r - len) * Math.cos(angle)
      const y2 = 150 + (r - len) * Math.sin(angle)
      marks.push({ id: i, x1: x, y1: y, x2, y2, major: i % 5 === 0 })
    }
    return marks
  }, [])

  const modeClass = mode

  // ══════════════════════════════════════════════════
  //  PUSH TEST FUNCTION — REMOVE AFTER TESTING
  //  This tests the full push notification flow:
  //  1. Check user is logged in
  //  2. Get/create push subscription
  //  3. Save subscription to server
  //  4. Schedule a test notification (1 min from now)
  // ══════════════════════════════════════════════════
  const testPush = async () => {
    try {
      // Step 1: Check authentication
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('1. NOT LOGGED IN'); return }
      alert('1. User OK: ' + user.id.substring(0, 8))

      // Step 2: Get service worker registration
      const reg = await navigator.serviceWorker.ready
      alert('2. SW ready')

      // Step 3: Get or create push subscription
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') { alert('3. Permission DENIED'); return }
        const VAPID_KEY = 'BKbcMQDt4fIvsxpU5j1mWFBsMNIyy-N3xMlOldlLkzpEUzmKtKNoxkI_s_lvl1_IsjX74bqNB5E9Xf8lhmYTtkE'
        const padding = '='.repeat((4 - VAPID_KEY.length % 4) % 4)
        const base64 = (VAPID_KEY + padding).replace(/-/g, '+').replace(/_/g, '/')
        const rawData = window.atob(base64)
        const outputArray = new Uint8Array(rawData.length)
        for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: outputArray })
        alert('3. Subscription CREATED')
      } else {
        alert('3. Subscription EXISTS')
      }

      // Step 4: Send subscription to server
      const subJson = sub.toJSON()
      const subscribeBody = JSON.stringify({ user_id: user.id, subscription: subJson })
      const subscribeResponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: subscribeBody
      })
      const subscribeText = await subscribeResponse.text()
      alert('4. Subscribe API: ' + subscribeResponse.status + ' ' + subscribeText)

      // Step 5: Schedule a test notification 1 minute from now
      const endTime = Date.now() + 60000
      const scheduleBody = JSON.stringify({ user_id: user.id, end_time: endTime, mode: 'study' })
      const scheduleResponse = await fetch('/api/push/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: scheduleBody
      })
      const scheduleText = await scheduleResponse.text()
      alert('5. Schedule API: ' + scheduleResponse.status + ' ' + scheduleText)

      alert('TEST COMPLETE! If step 4 & 5 returned 200, check Supabase tables.')
    } catch (e) {
      alert('ERROR: ' + e.message)
    }
  }

  // ── Finish session ──
  const handleFinish = () => {
    if (sessionPomodoros === 0) return
    setShowFinish(true)
  }

  // ── Error state for save failures ──
  const [saveError, setSaveError] = useState('')

  const confirmFinish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaveError('Not logged in'); setSaving(false); return }

      const elapsedMinNow = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0
      const topicName = topicInfo?.name || 'General Study'

      // Insert with only columns that exist in study_sessions table
      const { error: insertError } = await supabase.from('study_sessions').insert({
        user_id: user.id,
        label: `Pomodoro — ${topicName}`,
        date: new Date().toISOString().split('T')[0],
        duration_min: elapsedMinNow,
        session_type: 'Pomodoro',
        energy_level: 'High',
        focus_quality: 'Deep focus',
        goals_met: true,
        notes: `${sessionPomodoros} pomodoro${sessionPomodoros > 1 ? 's' : ''} completed`,
      })

      if (insertError) {
        console.error('Insert error:', insertError)
        setSaveError(insertError.message)
        setSaving(false)
        return
      }

      if (selectedTopic && topicStatus) {
        const pct = topicStatus === 'Complete' ? 100 : topicStatus === 'Reviewing' ? 75 : 40
        const { error: topicError } = await supabase.from('curriculum_topics').update({
          status: topicStatus,
          completion_pct: pct
        }).eq('id', selectedTopic)

        if (topicError) console.error('Topic update error:', topicError)
      }

      setShowFinish(false)
      resetSession()
      setSessionStart(null)
    } catch (err) {
      console.error(err)
      setSaveError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.page}>
      {/* Ambient BG */}
      <div className={`${s.ambient} ${mode === 'study' ? s.ambientStudy : mode === 'break' ? s.ambientBreak : s.ambientLong}`} />

      {/* Stars */}
      <div className={s.stars}>
        {stars.map(st => (
          <div key={st.id} className={s.star}
            style={{ left: st.left, top: st.top, '--duration': st.duration, '--delay': st.delay }} />
        ))}
      </div>

      <div className={s.content}>
        {/* Header */}
        <div className={s.header}>
          <h1 className={s.title}>Forest Timer</h1>
          <p className={s.sub}>Stay focused, grow your forest</p>
        </div>

        {/* Mode Tabs */}
        <div className={s.modeTabs}>
          {MODES.map(m => (
            <button key={m}
              className={`${s.modeTab} ${mode === m ? s.modeTabActive : ''} ${mode === m ? s[m] : ''}`}
              onClick={() => { if (!running) setMode(m) }}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Topic Selector */}
        <div className={s.topicSelector}>
          <span className={s.topicLabel}>Studying Topic</span>
          <select className={s.topicSelect}
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value || null)}>
            <option value="">— Select a topic —</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {topicInfo && (
            <div className={s.topicInfo}>
              {topicInfo.high_yield && <span className={s.topicHY}>High Yield</span>}
              <span className={s.topicStatus}>{topicInfo.status || 'Not Started'}</span>
            </div>
          )}
        </div>

        {/* ═══ UPGRADED TIMER ═══ */}
        <div className={s.timerContainer}>
          {/* Orbit ring decoration */}
          <div className={s.orbitRing}>
            <div className={`${s.orbitDot} ${s[modeClass]}`} />
          </div>

          {/* Glow */}
          <div className={`${s.glowRing} ${s[modeClass]} ${running ? s.pulseActive : ''}`} />

          <div className={s.ringOuter}>
            {/* SVG Ring with gradient + tick marks */}
            <svg className={s.ringSvg} viewBox="0 0 300 300">
              <defs>
                <linearGradient id="timerGradientStudy" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00B5A3" />
                  <stop offset="50%" stopColor="#3DBE7A" />
                  <stop offset="100%" stopColor="#00D4B8" />
                </linearGradient>
                <linearGradient id="timerGradientBreak" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3DBE7A" />
                  <stop offset="50%" stopColor="#50d48e" />
                  <stop offset="100%" stopColor="#7AE8A8" />
                </linearGradient>
                <linearGradient id="timerGradientLong" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6C63FF" />
                  <stop offset="50%" stopColor="#8b83ff" />
                  <stop offset="100%" stopColor="#A89FFF" />
                </linearGradient>
              </defs>

              {/* Tick marks */}
              {tickMarks.map(t => (
                <line key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={t.major ? 1.5 : 0.5} />
              ))}

              {/* Background ring */}
              <circle className={s.ringBg} cx="150" cy="150" r="130" />
              {/* Dashed track */}
              <circle className={s.ringTrack} cx="150" cy="150" r="125" />
              {/* Progress ring */}
              <circle className={`${s.ringFg} ${s[modeClass]}`}
                cx="150" cy="150" r="130"
                style={{ strokeDashoffset: dashOffset }} />
            </svg>

            {/* Inner content */}
            <div className={s.ringInner}>
              <span className={s.ringLabel}>{MODE_LABELS[mode]}</span>
              <span className={`${s.ringTime} ${s[modeClass]} ${running ? s.ringTimeActive : ''}`}>
                {displayRemaining}
              </span>
              <div className={s.ringDots}>
                {[0,1,2,3].map(i => (
                  <div key={i} className={`${s.dot} ${done > i ? s.filled : ''} ${s[modeClass]}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className={s.controls}>
          <button className={s.ctrlBtn} onClick={resetTimer} title="Reset">&#8634;</button>
          <button className={`${s.playBtn} ${s[modeClass]}`} onClick={togglePlay}>
            {running ? '⏸' : '▶'}
            {running && <span className={`${s.playBtnPulse} ${s[modeClass]}`} />}
          </button>
          <button className={s.ctrlBtn} onClick={skipTimer} title="Skip">⏭</button>
        </div>

        {/* PUSH TEST BUTTON — REMOVE AFTER TESTING */}
        <div style={{ padding: 10, background: '#1a1a2e', borderRadius: 8, marginTop: 10, width: '100%', maxWidth: 400 }}>
          <button onClick={testPush} style={{ background: '#ff9800', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, width: '100%', cursor: 'pointer' }}>
            TEST PUSH NOTIFICATION
          </button>
        </div>

        {/* Stats */}
        <div className={s.statsGrid}>
          <div className={s.statCard}>
            <span className={s.statIcon}>🍅</span>
            <span className={s.statNum}>{sessionPomodoros}</span>
            <span className={s.statLabel}>Pomodoros</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statIcon}>⏱</span>
            <span className={s.statNum}>{running ? liveMin : elapsedMin}</span>
            <span className={s.statLabel}>Minutes</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statIcon}>🌿</span>
            <span className={s.statNum}>{trees.length}</span>
            <span className={s.statLabel}>Trees</span>
          </div>
        </div>

        {/* ═══ UPGRADED FOREST ═══ */}
        <div className={s.forest}>
          <div className={s.forestLabel}>Your Forest</div>
          <div className={s.forestGround}>
            {trees.map((tree, idx) => (
              <div key={tree.id}
                className={`${s.tree} ${s[tree.color]} ${idx >= trees.length - 1 ? s.treeGrowing : s.treeIdle}`}
                style={{
                  left: `${tree.left}%`,
                  transform: `scale(${tree.scale})`,
                  transformOrigin: 'bottom center',
                  animationDelay: idx >= trees.length - 1 ? '0s' : `${idx * 0.2}s`
                }}>
                {/* Multi-layer canopy */}
                <div className={s.treeCrown}>
                  <div className={`${s.canopyLayer} ${s.canopyBack}`}
                    style={{ '--cw': `${28 * tree.scale}px`, '--ch': `${22 * tree.scale}px` }} />
                  <div className={`${s.canopyLayer} ${s.canopyMid}`}
                    style={{ '--cw': `${24 * tree.scale}px`, '--ch': `${20 * tree.scale}px` }} />
                  <div className={`${s.canopyLayer} ${s.canopyTop}`}
                    style={{ '--cw': `${20 * tree.scale}px`, '--ch': `${18 * tree.scale}px` }}>
                    <div className={s.canopyHighlight} />
                  </div>
                </div>
                {/* Trunk */}
                <div className={s.treeTrunk}
                  style={{ '--cw': `${24 * tree.scale}px`, '--ch': `${20 * tree.scale}px` }} />
                {/* Shadow */}
                <div className={s.treeShadow}
                  style={{ '--cw': `${24 * tree.scale}px` }} />
              </div>
            ))}

            {/* Falling leaves */}
            {trees.length > 0 && leaves.map(lf => (
              <div key={lf.id}
                className={`${s.leaf} ${s[lf.color.replace('tree','leaf')]} ${s.leafFall}`}
                style={{
                  left: lf.left,
                  top: lf.top,
                  '--leaf-dur': lf.dur,
                  '--leaf-delay': lf.delay,
                  '--leaf-dx': lf.dx,
                  '--leaf-dx2': lf.dx2
                }} />
            ))}

            {/* Fireflies */}
            {fireflies.map(ff => (
              <div key={ff.id} className={s.firefly}
                style={{
                  left: ff.left,
                  top: ff.top,
                  '--dur': ff.dur,
                  '--delay': ff.delay,
                  '--dx': ff.dx,
                  '--dy': ff.dy
                }} />
            ))}

            {/* Ground fog */}
            <div className={s.forestFog} />
          </div>
        </div>

        {/* Finish & Save */}
        {sessionPomodoros > 0 && (
          <div className={s.finishSection} style={{ maxWidth: 580, width: '100%' }}>
            <div className={s.finishInfo}>
              {sessionPomodoros} pomodoro{sessionPomodoros > 1 ? 's' : ''} completed
              {topicInfo ? ` — ${topicInfo.name}` : ''}
            </div>
            <button className={s.finishBtn} onClick={handleFinish}>Finish & Save Session</button>
          </div>
        )}

        {/* Bottom Panel */}
        <div className={s.bottomPanel}>
          {/* Settings Toggle */}
          <button className={s.toggleBtn} onClick={() => setShowSettings(!showSettings)}>
            Timer Settings
            <span className={`${s.toggleArrow} ${showSettings ? s.toggleArrowOpen : ''}`}>▼</span>
          </button>

          {showSettings && (
            <div className={s.settingsSection}>
              <div className={s.settingsTitle}>Duration (minutes)</div>
              <div className={s.settingsGrid}>
                <div className={s.setItem}>
                  <label>Focus</label>
                  <input type="number" min="1" max="90" value={focusMins}
                    onChange={e => setFocusMins(Math.max(1, +e.target.value))} />
                </div>
                <div className={s.setItem}>
                  <label>Short</label>
                  <input type="number" min="1" max="30" value={shortMins}
                    onChange={e => setShortMins(Math.max(1, +e.target.value))} />
                </div>
                <div className={s.setItem}>
                  <label>Long</label>
                  <input type="number" min="1" max="60" value={longMins}
                    onChange={e => setLongMins(Math.max(1, +e.target.value))} />
                </div>
              </div>
            </div>
          )}

          {/* Session Log */}
          {sessionLog.length > 0 && (
            <div className={s.sessionLog}>
              <div className={s.logTitle}>Session Log</div>
              {sessionLog.map((entry, i) => (
                <div key={i} className={s.logItem}>
                  <span className={s.logEmoji}>
                    {entry.type === 'study' ? '🍅' : entry.type === 'break' ? '☕' : '🌙'}
                  </span>
                  <span className={s.logLabel}>{entry.label}</span>
                  <span className={s.logTime}>{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Finish Modal ═══ */}
      {showFinish && (
        <div className={s.modalOverlay}>
          <div className={s.modal}>
            <div className={s.modalTitle}>Session Complete!</div>
            <div className={s.modalSummary}>
              <div>🍅 {sessionPomodoros} Pomodoro{sessionPomodoros > 1 ? 's' : ''}</div>
              <div>⏱ {elapsedMin} minutes ({(elapsedMin / 60).toFixed(1)} hours)</div>
              {topicInfo && <div>📚 {topicInfo.name}</div>}
            </div>
            {selectedTopic && (
              <div className={s.modalField}>
                <label>How's this topic?</label>
                <div className={s.statusOptions}>
                  {['In Progress','Reviewing','Complete'].map(st => (
                    <button key={st}
                      className={`${s.statusOpt} ${topicStatus === st ? s.statusOptOn : ''}`}
                      onClick={() => setTopicStatus(st)}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {saveError && (
              <div style={{ color: '#ff6b6b', fontSize: '13px', textAlign: 'center', padding: '8px', background: 'rgba(255,80,80,0.1)', borderRadius: '8px', marginTop: '8px' }}>
                {saveError}
              </div>
            )}
            <div className={s.modalActions}>
              <button className={s.modalCancel} onClick={() => setShowFinish(false)}>Cancel</button>
              <button className={s.modalSave} onClick={confirmFinish} disabled={saving}>
                {saving ? 'Saving...' : 'Save Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Debug Banner - REMOVE AFTER TESTING */}
      <PushDebugBanner />
    </div>
  )
}
