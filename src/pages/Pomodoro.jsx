import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePomodoro, usePomodoroSettings } from '../context/PomodoroContext'
import { Play, Pause, Leaf, Timer, ChevronDown, BookOpen, Maximize2, Minimize2, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getTreeById, getTreeColors } from '../lib/treeTypes'
import { getSubjectColor } from '../lib/subjectColors'
import { useForestAudio } from '../hooks/useForestAudio'
import Modal from '../components/ui/Modal/Modal'
import RadialDial from '../components/RadialDial'
import ForestTree from '../components/ForestTree'
import ForestScene from '../components/ForestScene'
import TreePicker from '../components/TreePicker'
import s from './Pomodoro.module.css'

const MODES = ['study', 'break', 'long']
const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }

export default function Pomodoro() {
  const {
    mode, setMode, running,
    done, seconds, totalSec,
    displayRemaining, progress,
    togglePlay, finishTimer, resetTimer, resetSession,
    treeStatus,
    focusMode, isFullscreen, toggleFocusMode, toggleFullscreen,
  } = usePomodoro()

  const {
    focusMins, setFocusMins,
    shortMins, setShortMins, longMins, setLongMins,
    selectedTopic, setSelectedTopic,
    sessionPomodoros, sessionLog, activeStudySeconds,
    selectedTree, setSelectedTree,
  } = usePomodoroSettings()

  const { playBloom, playWilt, playStart } = useForestAudio()

  const [topics, setTopics] = useState([])
  const [topicInfo, setTopicInfo] = useState(null)
  const [showSessions, setShowSessions] = useState(false)
  const [showFinish, setShowFinish] = useState(false)
  const [topicStatus, setTopicStatus] = useState('In Progress')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [ownedTrees, setOwnedTrees] = useState(['oak', 'sakura'])
  const [coins, setCoins] = useState(0)
  const [coinEarning, setCoinEarning] = useState({ amount: 0, show: false })

  const tree = getTreeById(selectedTree)
  const subjectColor = topicInfo?.subject?.system?.id
    ? getSubjectColor(topicInfo.subject.system.id)
    : null

  const API = import.meta.env.VITE_API_URL || '/api'

  // ── Load forest inventory on mount ──
  useEffect(() => {
    const loadForest = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const res = await fetch(`${API}/forest/inventory`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.owned) setOwnedTrees(data.owned)
        if (data.selectedTree) setSelectedTree(data.selectedTree)
        if (data.coins !== undefined) setCoins(data.coins)
      } catch (_) {}
    }
    loadForest()
  }, [])

  // ── Persist selected tree (debounced) ──
  useEffect(() => {
    if (!selectedTree) return
    const timeout = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        await fetch(`${API}/forest/selected-tree`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ treeId: selectedTree }),
        })
      } catch (_) {}
    }, 500)
    return () => clearTimeout(timeout)
  }, [selectedTree])

  // ── Load topics ──
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('curriculum_topics')
        .select('id, name, status, high_yield, completion_pct, subject:curriculum_subjects(name, system:curriculum_systems(id, name))')
        .eq('user_id', user.id)
        .order('name')
      if (data) setTopics(data)
    }
    load()
  }, [])

  useEffect(() => {
    if (selectedTopic) {
      const t = topics.find(t => t.id === selectedTopic)
      setTopicInfo(t || null)
    } else {
      setTopicInfo(null)
    }
  }, [selectedTopic, topics])

  // ── Audio on status change ──
  useEffect(() => {
    if (treeStatus === 'SUCCESS') playBloom()
    else if (treeStatus === 'FAILED') playWilt()
  }, [treeStatus, playBloom, playWilt])

  // ── Earn coins on session success ──
  useEffect(() => {
    if (treeStatus !== 'SUCCESS') return
    const earnCoins = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const focusMin = Math.floor(activeStudySeconds / 60)
        const streak = 0
        const res = await fetch(`${API}/forest/earn-coins`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ focusMinutes: focusMin, streak }),
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.coinsEarned) {
          setCoins(data.newBalance)
          setCoinEarning({ amount: data.coinsEarned, show: true })
          setTimeout(() => setCoinEarning(prev => ({ ...prev, show: false })), 3000)
        }
      } catch (_) {}
    }
    earnCoins()
  }, [treeStatus, activeStudySeconds])

  // ── Current duration for the radial dial ──
  const currentDuration = useMemo(() => {
    return { study: focusMins, break: shortMins, long: longMins }[mode]
  }, [mode, focusMins, shortMins, longMins])

  const setCurrentDuration = useCallback((mins) => {
    if (mode === 'study') setFocusMins(mins)
    else if (mode === 'break') setShortMins(mins)
    else setLongMins(mins)
  }, [mode, setFocusMins, setShortMins, setLongMins])

  // ── Computed ──
  const circumference = 2 * Math.PI * 210
  const dashOffset = circumference * (1 - progress)
  const totalMin = Math.floor(activeStudySeconds / 60)
  const showDial = !running && seconds === totalSec
  const showProgress = running || (!running && seconds < totalSec)

  // ── Stars ──
  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      duration: `${2 + Math.random() * 4}s`,
      delay: `${Math.random() * 3}s`,
    })), [])

  // ── Finish ──
  const handleFinish = () => {
    if (sessionPomodoros === 0) return
    setShowFinish(true)
  }

  const confirmFinish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaveError('Not logged in'); setSaving(false); return }

      const elapsedMinNow = Math.floor(activeStudySeconds / 60)
      const topicName = topicInfo?.name || 'General Study'

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
        setSaveError(insertError.message)
        setSaving(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      fetch(API + '/study-hours/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ session_minutes: elapsedMinNow }),
      }).catch(() => {})

      if (selectedTopic && topicStatus) {
        const pct = topicStatus === 'Complete' ? 100 : topicStatus === 'Reviewing' ? 75 : 40
        await supabase.from('curriculum_topics').update({
          status: topicStatus,
          completion_pct: pct
        }).eq('id', selectedTopic)
      }

      setShowFinish(false)
      resetSession()
    } catch (err) {
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
        {/* Mode Tabs — hidden in focus mode */}
        {!focusMode && (
          <div className={s.modeTabs}>
            {MODES.map(m => (
              <button key={m}
                className={`${s.modeTab} ${mode === m ? s.modeTabActive : ''} ${mode === m ? s[m] : ''}`}
                onClick={() => { if (!running) { setMode(m); resetTimer() } }}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        )}

        {/* Topic Selector — hidden in focus mode */}
        {!focusMode && (
          <div className={s.topicSelector}>
            <BookOpen size={13} className={s.topicIcon} />
            <select className={s.topicSelect}
              value={selectedTopic || ''}
              onChange={e => setSelectedTopic(e.target.value || null)}>
              <option value="">Select a topic</option>
              {topics.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {topicInfo?.high_yield && <span className={s.topicHY}>HY</span>}
          </div>
        )}

        {/* Tree Picker — hidden when running or in focus mode */}
        {!running && !focusMode && (
          <TreePicker selectedTree={selectedTree} onSelect={setSelectedTree} subjectColor={subjectColor} ownedTrees={ownedTrees} coins={coins} onPurchase={(treeId, newBalance) => { setOwnedTrees(prev => [...prev, treeId]); setCoins(newBalance) }} />
        )}

        {/* ═══ TIMER AREA ═══ */}
        <div className={s.timerArea}>
          {/* Scene */}
          <ForestScene progress={running ? progress : 0} status={treeStatus} />

          {/* Radial Dial (idle) */}
          {showDial && (
            <RadialDial
              minutes={currentDuration}
              onChange={setCurrentDuration}
              mode={mode}
              disabled={false}
            />
          )}

          {/* Progress Ring + Tree (running or paused) */}
          {showProgress && (
            <div className={s.progressContainer}>
              <div className={`${s.glowRing} ${s[mode]} ${running ? s.pulseActive : ''}`} />

              <svg className={s.progressSvg} viewBox="0 0 480 480">
                <defs>
                  <linearGradient id="pGradStudy" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#93C5FD" />
                  </linearGradient>
                  <linearGradient id="pGradBreak" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#6EE7B7" />
                  </linearGradient>
                  <linearGradient id="pGradLong" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#A5B4FC" />
                  </linearGradient>
                </defs>
                <circle cx="240" cy="240" r="210" fill="none"
                  stroke="var(--card-border)" strokeWidth="5" />
                <circle cx="240" cy="240" r="210" fill="none"
                  className={`${s.progressFg} ${s[mode]}`}
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 240 240)" />
              </svg>

              <div className={s.progressCenter}>
                <span className={`${s.progressTime} ${s[mode]}`}>
                  {displayRemaining}
                </span>
              </div>

              {/* Tree inside the ring */}
              <div className={s.treeInRing}>
                <ForestTree tree={tree} progress={running ? progress : 0.6} status={treeStatus} subjectColor={subjectColor} />
              </div>
            </div>
          )}
        </div>

        {/* ═══ CONTROLS ═══ */}
        <div className={s.controls}>
          {!running && showDial && (
            <>
              <button className={`${s.plantBtn} ${s[mode]}`} onClick={() => { playStart(); togglePlay() }}>
                <Play size={20} strokeWidth={2} />
                <span>Plant</span>
              </button>
              <button className={s.focusModeBtn} onClick={toggleFocusMode}>
                <EyeOff size={16} strokeWidth={2} />
                <span>Focus Mode</span>
              </button>
            </>
          )}

          {running && (
            <>
              <button className={s.giveUpBtn} onClick={finishTimer}>
                Give Up
              </button>
              <div className={s.runningControls}>
                <button className={`${s.pauseBtn} ${s[mode]}`} onClick={togglePlay}>
                  <Pause size={20} strokeWidth={2} />
                </button>
                <button className={s.focusModeBtn} onClick={toggleFocusMode}>
                  <EyeOff size={16} strokeWidth={2} />
                  <span>{focusMode ? 'Exit Focus' : 'Focus'}</span>
                </button>
              </div>
            </>
          )}

          {!running && !showDial && (
            <button className={`${s.pauseBtn} ${s[mode]}`} onClick={togglePlay}>
              <Play size={20} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ═══ STATS BAR ═══ */}
        {!focusMode && (
          <div className={s.statsBar}>
            <div className={s.statItem}>
              <span className={s.statLabel}>Today</span>
              <span className={s.statValue}>{totalMin}m</span>
            </div>
            <div className={s.statDivider} />
            <div className={s.statItem}>
              <span className={s.statLabel}>Streak</span>
              <span className={s.statValue}>--</span>
            </div>
            <div className={s.statDivider} />
            <div className={s.statItem}>
              <span className={s.statLabel}>Trees</span>
              <span className={s.statValue}>{sessionPomodoros}</span>
            </div>
            <div className={s.statDivider} />
            <div className={s.statItem}>
              <span className={s.statLabel}>Coins</span>
              <span className={s.statValue}>{coins}</span>
            </div>
          </div>
        )}

        {/* ═══ RECENT SESSIONS ═══ */}
        {!focusMode && sessionLog.length > 0 && (
          <div className={s.sessionsSection}>
            <button className={s.sessionsToggle} onClick={() => setShowSessions(!showSessions)}>
              <span>Recent Sessions</span>
              <ChevronDown size={14} className={`${s.sessionsArrow} ${showSessions ? s.sessionsArrowOpen : ''}`} />
            </button>
            {showSessions && (
              <div className={s.sessionsList}>
                {sessionLog.map((entry, i) => (
                  <div key={i} className={s.sessionItem}>
                    <span className={s.sessionIcon}>
                      {entry.type === 'study' ? '🌳' : entry.type === 'break' ? '☕' : '🌙'}
                    </span>
                    <span className={s.sessionLabel}>{entry.label}</span>
                    <span className={s.sessionTime}>{entry.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ FINISH & SAVE ═══ */}
        {!focusMode && sessionPomodoros > 0 && !running && (
          <button className={s.finishBtn} onClick={handleFinish}>
            Finish & Save Session
          </button>
        )}

        {coinEarning.show && (
          <div className={s.coinToast}>
            <span className={s.coinIcon}>🪙</span>
            <span>+{coinEarning.amount} coins</span>
          </div>
        )}
      </div>

      {/* ═══ Finish Modal ═══ */}
      {showFinish && (
        <Modal open={showFinish} onOpenChange={(v) => { if (!v) setShowFinish(false) }} size="sm">
          <Modal.Title style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 16 }}>
            Session Complete!
          </Modal.Title>
          <div className={s.modalSummary}>
            <div><Timer size={14} strokeWidth={1.5} /> {sessionPomodoros} Pomodoro{sessionPomodoros > 1 ? 's' : ''}</div>
            <div>⏱ {totalMin} minutes</div>
            {topicInfo && <div><BookOpen size={14} strokeWidth={1.5} /> {topicInfo.name}</div>}
          </div>
          {selectedTopic && (
            <div className={s.modalField}>
              <label>How's this topic?</label>
              <div className={s.statusOptions}>
                {['In Progress', 'Reviewing', 'Complete'].map(st => (
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
            <div className={s.saveError}>{saveError}</div>
          )}
          <div className={s.modalActions}>
            <button className={s.modalCancel} onClick={() => setShowFinish(false)}>Cancel</button>
            <button className={s.modalSave} onClick={confirmFinish} disabled={saving}>
              {saving ? 'Saving...' : 'Save Session'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
