import { useState, useEffect, useCallback, useMemo } from 'react'
import confetti from 'canvas-confetti'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usePomodoro, usePomodoroSettings } from '../context/PomodoroContext'
import { Play, Pause, Leaf, Timer, ChevronDown, BookOpen, EyeOff, Trees } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getSubjectColor } from '../lib/subjectColors'
import { queryKeys } from '../lib/queryKeys'
import { useForestAudio } from '../hooks/useForestAudio'
import Modal from '../components/ui/Modal/Modal'
import { ForestTree } from '../components/ForestTree'
import ForestScene from '../components/ForestScene'
import TreePicker from '../components/TreePicker'
import s from './Pomodoro.module.css'

const MODES = ['study', 'break', 'long']
const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }

const DURATION_LIMITS = {
  study: { min: 5, max: 120, step: 5, presets: [15, 25, 50, 90] },
  break: { min: 1, max: 30, step: 1, presets: [3, 5, 10] },
  long:  { min: 5, max: 60, step: 5, presets: [10, 15, 20, 30] },
}

const BREAK_TIPS = [
  'Look at something 20 feet away for 20 seconds.',
  'Stand up and relax your shoulders.',
  'Drink some water.',
  'Take five slow breaths.',
  'Close your eyes and relax them briefly.',
]

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Pomodoro() {
  const {
    mode, setMode, running,
    done, seconds, totalSec,
    displayRemaining, progress,
    togglePlay, skipTimer, finishTimer, resetTimer, resetSession,
    treeStatus,
    focusMode, isFullscreen, toggleFocusMode,
    sessionPhase, sessionOutcome, isSetup, isActive,
    setModeDuration, advanceToNextMode,
  } = usePomodoro()

  const {
    focusMins, shortMins, longMins,
    selectedTopic, setSelectedTopic,
    sessionPomodoros, sessionLog, activeStudySeconds,
    selectedTree, setSelectedTree,
  } = usePomodoroSettings()

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { playBloom, playWilt, playStart, playSnap } = useForestAudio()

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
  const [achievement, setAchievement] = useState({ name: '', show: false })

  const [breakTip] = useState(() => BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)])

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

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'Escape' && focusMode) {
        toggleFocusMode()
      } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, toggleFocusMode, focusMode])

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
        if (data.achievements?.length > 0) {
          const ach = data.achievements[0]
          const names = { crystal: 'Crystal Tree', cosmic: 'Cosmic Pine' }
          setTimeout(() => {
            setAchievement({ name: names[ach.treeId] || ach.treeId, show: true })
            setTimeout(() => setAchievement(prev => ({ ...prev, show: false })), 4000)
          }, 3500)
        }
      } catch (_) {}
    }
    earnCoins()
  }, [treeStatus, activeStudySeconds])

  // ── Derived ──
  const isStudyMode = mode === 'study'
  const breakLabel = mode === 'break' ? 'Short Break' : 'Long Break'
  const totalMin = Math.floor(activeStudySeconds / 60)
  const currentDuration = { study: focusMins, break: shortMins, long: longMins }[mode]
  const limits = DURATION_LIMITS[mode]

  const treeProgress = isStudyMode ? progress : (sessionPomodoros > 0 ? 1 : 0)
  const treeState = treeStatus === 'SUCCESS' ? 'success'
    : treeStatus === 'FAILED' ? 'failed'
    : running ? 'running'
    : treeProgress > 0 ? 'paused'
    : 'idle'

  const sceneProgress =
    mode === 'study' && !isSetup
      ? treeProgress
      : 0

  const view = sessionOutcome ?? `${mode}-${sessionPhase}`

  const earnedCoins = useMemo(() => {
    const focusMin = Math.floor((totalSec) / 60)
    return 10 + Math.floor(focusMin / 5) - 5
  }, [totalSec])

  // ── Stars ──
  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      duration: `${2 + Math.random() * 4}s`,
      delay: `${Math.random() * 3}s`,
    })), [])

  // ── Duration stepping ──
  const stepDuration = useCallback((delta) => {
    const newVal = Math.max(limits.min, Math.min(limits.max, currentDuration + delta))
    setModeDuration(mode, newVal)
    playSnap()
  }, [mode, currentDuration, limits, setModeDuration, playSnap])

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
        tree_type: selectedTree || 'oak',
        subject_id: topicInfo?.subject?.system?.id || null,
        subject_name: topicInfo?.subject?.system?.name || topicName,
        status: 'completed',
        mode: 'study',
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
      const duration = 2000
      const end = Date.now() + duration
      const frame = () => {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } })
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } })
        if (Date.now() < end) requestAnimationFrame(frame)
      }
      frame()
      queryClient.invalidateQueries({ queryKey: queryKeys.forest.all })
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

      {/* ForestScene — page-level, outside .content */}
      <ForestScene
        className={s.sceneLayer}
        mode={mode}
        phase={sessionPhase}
        progress={sceneProgress}
        status={treeStatus}
      />

      <div className={s.content}>
        {view === 'completed' ? (
          <CompletionScreen
            totalSec={totalSec}
            topicInfo={topicInfo}
            earnedCoins={earnedCoins}
            advanceToNextMode={advanceToNextMode}
            sessionLog={sessionLog}
            onVisitForest={() => navigate('/forest')}
          />
        ) : view === 'failed' ? (
          <FailedScreen
            advanceToNextMode={advanceToNextMode}
            sessionLog={sessionLog}
          />
        ) : isSetup ? (
          <SetupScreen
            mode={mode}
            isStudyMode={isStudyMode}
            breakLabel={breakLabel}
            focusMode={focusMode}
            currentDuration={currentDuration}
            limits={limits}
            stepDuration={stepDuration}
            setModeDuration={setModeDuration}
            togglePlay={togglePlay}
            playStart={playStart}
            toggleFocusMode={toggleFocusMode}
            topics={topics}
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            topicInfo={topicInfo}
            selectedTree={selectedTree}
            setSelectedTree={setSelectedTree}
            subjectColor={subjectColor}
            ownedTrees={ownedTrees}
            coins={coins}
            setOwnedTrees={setOwnedTrees}
            totalMin={totalMin}
            sessionPomodoros={sessionPomodoros}
            sessionLog={sessionLog}
            showSessions={showSessions}
            setShowSessions={setShowSessions}
            handleFinish={handleFinish}
          />
        ) : isStudyMode && isActive ? (
          <ActiveFocusScreen
            selectedTopic={selectedTopic}
            topicInfo={topicInfo}
            treeProgress={treeProgress}
            treeState={treeState}
            displayRemaining={displayRemaining}
            running={running}
            togglePlay={togglePlay}
            finishTimer={finishTimer}
            focusMode={focusMode}
            toggleFocusMode={toggleFocusMode}
          />
        ) : isActive ? (
          <ActiveBreakScreen
            breakLabel={breakLabel}
            displayRemaining={displayRemaining}
            running={running}
            togglePlay={togglePlay}
            skipTimer={skipTimer}
            breakTip={breakTip}
            mode={mode}
          />
        ) : null}

        {coinEarning.show && (
          <div className={s.coinToast}>
            <span className={s.coinIcon}>🪙</span>
            <span>+{coinEarning.amount} coins earned</span>
          </div>
        )}

        {achievement.show && (
          <div className={s.achievementToast}>
            <span className={s.achievementIcon}>🏆</span>
            <span>{achievement.name} unlocked!</span>
          </div>
        )}
      </div>

      {/* Finish Modal */}
      {showFinish && (
        <Modal open={showFinish} onOpenChange={(v) => { if (!v) setShowFinish(false) }} size="sm">
          <div className={s.modalHeader}>
            <div className={s.modalEmoji}>🎉</div>
            <Modal.Title style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--text-primary)', textAlign: 'center' }}>
              Session Complete!
            </Modal.Title>
          </div>

          <div className={s.modalStats}>
            <div className={s.modalStat}>
              <span className={s.modalStatValue}>{sessionPomodoros}</span>
              <span className={s.modalStatLabel}>Pomodoro{sessionPomodoros > 1 ? 's' : ''}</span>
            </div>
            <div className={s.modalStatDivider} />
            <div className={s.modalStat}>
              <span className={s.modalStatValue}>{totalMin}m</span>
              <span className={s.modalStatLabel}>Focused</span>
            </div>
            <div className={s.modalStatDivider} />
            <div className={s.modalStat}>
              <span className={s.modalStatValue}>{coinEarning.amount || '—'}</span>
              <span className={s.modalStatLabel}>Coins</span>
            </div>
          </div>

          {topicInfo && (
            <div className={s.modalTopic}>
              <BookOpen size={13} strokeWidth={1.5} />
              <span>{topicInfo.name}</span>
            </div>
          )}

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

// ═══════════════════════════════════════════════
//  SETUP SCREEN
// ═══════════════════════════════════════════════

function SetupScreen({
  mode, isStudyMode, breakLabel, focusMode,
  currentDuration, limits, stepDuration, setModeDuration,
  togglePlay, playStart, toggleFocusMode,
  topics, selectedTopic, setSelectedTopic, topicInfo,
  selectedTree, setSelectedTree, subjectColor, ownedTrees, coins, setOwnedTrees,
  totalMin, sessionPomodoros, sessionLog, showSessions, setShowSessions, handleFinish,
}) {
  const navigate = useNavigate();
  return (
    <>
      {/* Mode Tabs */}
      {!focusMode && <ModeTabs />}

      {/* Topic Selector — study only */}
      {!focusMode && isStudyMode && (
        <TopicSelector topics={topics} selectedTopic={selectedTopic} setSelectedTopic={setSelectedTopic} topicInfo={topicInfo} />
      )}

      {/* Tree Picker — study only */}
      {!focusMode && isStudyMode && (
        <TreePicker selectedTree={selectedTree} onSelect={setSelectedTree} subjectColor={subjectColor} ownedTrees={ownedTrees} coins={coins} onPurchase={(treeId, newBalance) => { setOwnedTrees(prev => [...prev, treeId]); setCoins(newBalance) }} />
      )}

      {/* Selected tree hero preview */}
      <div className={s.treeHero}>
        <ForestTree progress={1} state="idle" size={180} preview />
      </div>

      {/* Duration editor */}
      <div className={s.durationEditor}>
        <button
          className={s.stepButton}
          onClick={() => stepDuration(-limits.step)}
          disabled={currentDuration <= limits.min}
          aria-label={`Decrease by ${limits.step} minutes`}
        >
          −{limits.step}
        </button>
        <div className={s.durationCenter}>
          <span className={s.durationTime}>{formatTime(currentDuration * 60)}</span>
          <span className={s.durationLabel}>minutes</span>
        </div>
        <button
          className={s.stepButton}
          onClick={() => stepDuration(limits.step)}
          disabled={currentDuration >= limits.max}
          aria-label={`Increase by ${limits.step} minutes`}
        >
          +{limits.step}
        </button>
      </div>

      {/* Preset chips */}
      <div className={s.presetChips}>
        {limits.presets.map(p => (
          <button
            key={p}
            className={`${s.presetChip} ${currentDuration === p ? s.presetActive : ''}`}
            onClick={() => { playStart(); setModeDuration(mode, p) }}
          >
            {p} min
          </button>
        ))}
      </div>

      {/* CTA */}
      <button className={`${s.plantBtn} ${s[mode]}`} onClick={() => { playStart(); navigator.vibrate?.(30); togglePlay() }}>
        <Play size={20} strokeWidth={2} />
        <span>{isStudyMode ? 'Plant' : `Start ${breakLabel}`}</span>
      </button>

      {/* Secondary settings */}
      {!focusMode && (
        <div className={s.secondaryActions}>
          <button className={s.forestBtn} onClick={() => navigate('/forest')} aria-label="Open My Forest">
            <Trees size={16} strokeWidth={2} />
            <span className={s.forestBtnLabel}>My Forest</span>
          </button>
          <button className={s.focusModeBtn} onClick={() => { navigator.vibrate?.(15); toggleFocusMode() }}>
            <EyeOff size={16} strokeWidth={2} />
            <span>Focus Mode</span>
          </button>
        </div>
      )}

      {/* Stats */}
      {!focusMode && <StatsBar totalMin={totalMin} sessionPomodoros={sessionPomodoros} coins={coins} />}

      {/* Sessions */}
      {!focusMode && sessionLog.length > 0 && (
        <SessionsSection sessionLog={sessionLog} showSessions={showSessions} setShowSessions={setShowSessions} />
      )}

      {/* Finish */}
      {!focusMode && sessionPomodoros > 0 && (
        <button className={s.finishBtn} onClick={handleFinish}>
          Finish & Save Session
        </button>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════
//  ACTIVE FOCUS SCREEN
// ═══════════════════════════════════════════════

function ActiveFocusScreen({
  selectedTopic, topicInfo, treeProgress, treeState,
  displayRemaining, running, togglePlay, finishTimer,
  focusMode, toggleFocusMode,
}) {
  return (
    <>
      {selectedTopic && topicInfo && (
        <p className={s.topicLabel}>{topicInfo.name}</p>
      )}

      <div className={s.activeTreeStage}>
        <ForestTree progress={treeProgress} state={treeState} size="100%" />
      </div>

      <div className={s.activeTimer}>
        <span className={s.countdownTime}>{displayRemaining}</span>
        <span className={s.countdownLabel}>Focus time remaining</span>
      </div>

      <div className={s.activeControls}>
        <button className={`${s.pauseBtn} ${s.study}`} onClick={() => { navigator.vibrate?.(20); togglePlay() }}>
          {running ? <Pause size={20} strokeWidth={2} /> : <Play size={20} strokeWidth={2} />}
        </button>
        <button className={s.giveUpBtn} onClick={() => { navigator.vibrate?.([10, 50, 10]); finishTimer() }}>
          Give up
        </button>
        <button className={s.focusModeBtn} onClick={() => { navigator.vibrate?.(15); toggleFocusMode() }}>
          <EyeOff size={16} strokeWidth={2} />
          <span>{focusMode ? 'Exit Focus' : 'Focus'}</span>
        </button>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════
//  ACTIVE BREAK SCREEN
// ═══════════════════════════════════════════════

function ActiveBreakScreen({
  breakLabel, displayRemaining, running, togglePlay, skipTimer, breakTip, mode,
}) {
  return (
    <>
      <div className={s.breakVisual}>
        <div className={s.breathingOrb} aria-hidden="true" />
      </div>

      <div className={s.activeTimer}>
        <span className={s.countdownTime}>{displayRemaining}</span>
        <span className={s.countdownLabel}>{breakLabel} remaining</span>
      </div>

      <p className={s.breakTip}>{breakTip}</p>

      <div className={s.activeControls}>
        <button className={`${s.pauseBtn} ${s[mode]}`} onClick={() => { navigator.vibrate?.(20); togglePlay() }}>
          {running ? <Pause size={20} strokeWidth={2} /> : <Play size={20} strokeWidth={2} />}
        </button>
        <button className={s.giveUpBtn} onClick={skipTimer}>
          Skip break
        </button>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════
//  COMPLETION SCREEN
// ═══════════════════════════════════════════════

function CompletionScreen({ totalSec, topicInfo, earnedCoins, advanceToNextMode, sessionLog, onVisitForest }) {
  return (
    <div className={s.completionCard}>
      <div className={s.completionTree}>
        <ForestTree progress={1} state="success" size={180} preview />
      </div>
      <h3 className={s.completionTitle}>Tree planted</h3>
      <p className={s.completionStat}>{Math.floor(totalSec / 60)} minutes focused</p>
      {topicInfo && <p className={s.completionStat}>{topicInfo.name}</p>}
      <p className={s.completionStat}>+{earnedCoins} coins</p>
      <div className={s.completionActions}>
        <button className={`${s.plantBtn} study`} onClick={advanceToNextMode}>
          <Play size={18} strokeWidth={2} />
          <span>Plant another</span>
        </button>
        <button className={s.secondaryBtn} onClick={onVisitForest}>
          <Trees size={16} strokeWidth={2} />
          <span>View My Forest</span>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  FAILED SCREEN
// ═══════════════════════════════════════════════

function FailedScreen({ advanceToNextMode, sessionLog }) {
  return (
    <div className={s.completionCard}>
      <div className={s.completionTree}>
        <ForestTree progress={0.3} state="failed" size={180} preview />
      </div>
      <h3 className={s.completionTitle}>Session ended</h3>
      <p className={s.completionStat}>Your tree didn't survive this time</p>
      <div className={s.completionActions}>
        <button className={`${s.plantBtn} study`} onClick={advanceToNextMode}>
          <Play size={18} strokeWidth={2} />
          <span>Try again</span>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════

function ModeTabs() {
  const { mode, setMode, running, resetTimer } = usePomodoro()

  return (
    <div className={s.modeTabs}>
      {MODES.map(m => (
        <button key={m}
          className={`${s.modeTab} ${mode === m ? s.modeTabActive : ''} ${mode === m ? s[m] : ''}`}
          onClick={() => { if (!running) { setMode(m); resetTimer() } }}>
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}

function TopicSelector({ topics, selectedTopic, setSelectedTopic, topicInfo }) {
  return (
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
  )
}

function StatsBar({ totalMin, sessionPomodoros, coins }) {
  return (
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
  )
}

function SessionsSection({ sessionLog, showSessions, setShowSessions }) {
  return (
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
  )
}
