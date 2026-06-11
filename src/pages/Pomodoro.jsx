import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePomodoro } from '../context/PomodoroContext'
import { supabase } from '../lib/supabase'
import s from './Pomodoro.module.css'

const MODES = ['study','break','long']
const MODE_LABELS = { study: 'Focus', break: 'Short Break', long: 'Long Break' }
const TREE_COLORS = ['treeTeal','treeSage','treeViolet','treeGold']

export default function Pomodoro() {
  const {
    mode, setMode, running, done, setDone,
    focusMins, setFocusMins, shortMins, setShortMins, longMins, setLongMins,
    selectedTopic, setSelectedTopic, sessionPomodoros, setSessionPomodoros,
    sessionStart, setSessionStart, resetSession,
    displayRemaining, totalSec, togglePlay, skipTimer, resetTimer
  } = usePomodoro()

  const [showSettings, setShowSettings] = useState(false)
  const [log, setLog] = useState([])
  const [trees, setTrees] = useState([])
  const [topics, setTopics] = useState([])
  const [topicInfo, setTopicInfo] = useState(null)
  const [showFinish, setShowFinish] = useState(false)
  const [topicStatus, setTopicStatus] = useState('In Progress')
  const [saving, setSaving] = useState(false)
  const treeIdRef = useMemo(() => ({ current: 0 }), [])

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

  useEffect(() => {
    if (selectedTopic) {
      const t = topics.find(t => t.id === selectedTopic)
      setTopicInfo(t || null)
    } else { setTopicInfo(null) }
  }, [selectedTopic, topics])

  useEffect(() => {
    if (displayRemaining === 0 && !running && totalSec > 0) {
      const color = TREE_COLORS[Math.floor(Math.random() * TREE_COLORS.length)]
      const id = treeIdRef.current++
      const left = 10 + Math.random() * 80
      const scale = 0.6 + Math.random() * 0.6
      setTrees(prev => [...prev, { id, color, left, scale, born: Date.now() }])
      setLog(prev => [{ type: mode, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 10))
      if (mode === 'study') {
        const nextMode = (done + 1) % 4 === 0 ? 'long' : 'break'
        setTimeout(() => setMode(nextMode), 500)
      } else {
        setTimeout(() => setMode('study'), 500)
      }
    }
  }, [displayRemaining, running])

  const handleFinish = () => { if (sessionPomodoros > 0) setShowFinish(true) }

  const confirmFinish = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const elapsedMin = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0
      const topicName = topicInfo?.name || 'General Study'
      await supabase.from('study_sessions').insert({
        user_id: user.id, topic: topicName,
        hours: +(elapsedMin / 60).toFixed(2), pomodoros: sessionPomodoros,
        date: new Date().toISOString().split('T')[0],
        label: 'Pomodoro - ' + topicName
      })
      if (selectedTopic && topicStatus) {
        const pct = topicStatus === 'Complete' ? 100 : topicStatus === 'Reviewing' ? 75 : 40
        await supabase.from('curriculum_topics').update({ status: topicStatus, completion_pct: pct }).eq('id', selectedTopic)
      }
      setShowFinish(false); resetSession(); setSessionStart(null); resetTimer()
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const startSession = () => { if (!sessionStart) setSessionStart(Date.now()) }

  const mins = Math.floor(displayRemaining / 60)
  const secs = displayRemaining % 60
  const display = String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0')
  const circumference = 2 * Math.PI * 130
  const progress = totalSec > 0 ? (totalSec - displayRemaining) / totalSec : 0
  const dashOffset = circumference * (1 - progress)
  const elapsedMin = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0
  const [liveMin, setLiveMin] = useState(0)
  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => setLiveMin(sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0), 30000)
    return () => clearInterval(iv)
  }, [running, sessionStart])

  const stars = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i, left: Math.random()*100+'%', top: Math.random()*100+'%',
    duration: (2+Math.random()*4)+'s', delay: Math.random()*3+'s'
  })), [])

  const fireflies = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    id: i, left: (10+Math.random()*80)+'%', top: (40+Math.random()*50)+'%',
    dur: (5+Math.random()*4)+'s', delay: Math.random()*5+'s',
    dx: (-30+Math.random()*60)+'px', dy: (-20+Math.random()*-40)+'px'
  })), [])

  const leaves = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id: i, left: (5+Math.random()*90)+'%', top: Math.random()*30+'%',
    color: TREE_COLORS[i % 4], dur: (3+Math.random()*3)+'s',
    delay: Math.random()*8+'s', dx: (-20+Math.random()*40)+'px', dx2: (-15+Math.random()*30)+'px'
  })), [])

  const tickMarks = useMemo(() => {
    const marks = []
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6) * Math.PI / 180, r = 140
      const x = 150 + r * Math.cos(angle), y = 150 + r * Math.sin(angle)
      const len = i % 5 === 0 ? 8 : 4
      marks.push({ id: i, x1: x, y1: y, x2: 150+(r-len)*Math.cos(angle), y2: 150+(r-len)*Math.sin(angle), major: i%5===0 })
    }
    return marks
  }, [])

  const modeClass = mode

  return (
    <div className={s.page}>
      <div className={`${s.ambient} ${mode==='study'?s.ambientStudy:mode==='break'?s.ambientBreak:s.ambientLong}`} />
      <div className={s.stars}>{stars.map(st => <div key={st.id} className={s.star} style={{left:st.left,top:st.top,'--duration':st.duration,'--delay':st.delay}} />)}</div>
      <div className={s.content}>
        <div className={s.header}><h1 className={s.title}>Forest Timer</h1><p className={s.sub}>Stay focused, grow your forest</p></div>
        <div className={s.modeTabs}>{MODES.map(m => (
          <button key={m} className={`${s.modeTab} ${mode===m?s.modeTabActive:''} ${mode===m?s[m]:''}`} onClick={() => { if (!running) setMode(m) }}>{MODE_LABELS[m]}</button>
        ))}</div>
        <div className={s.topicSelector}>
          <span className={s.topicLabel}>Studying Topic</span>
          <select className={s.topicSelect} value={selectedTopic||''} onChange={e=>setSelectedTopic(e.target.value||null)}>
            <option value="">-- Select a topic --</option>
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {topicInfo && <div className={s.topicInfo}>{topicInfo.high_yield && <span className={s.topicHY}>High Yield</span>}<span className={s.topicStatus}>{topicInfo.status||'Not Started'}</span></div>}
        </div>
        <div className={s.timerContainer}>
          <div className={s.orbitRing}><div className={`${s.orbitDot} ${s[modeClass]}`} /></div>
          <div className={`${s.glowRing} ${s[modeClass]} ${running?s.pulseActive:''}`} />
          <div className={s.ringOuter}>
            <svg className={s.ringSvg} viewBox="0 0 300 300">
              <defs>
                <linearGradient id="timerGradientStudy" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#00B5A3" /><stop offset="50%" stopColor="#3DBE7A" /><stop offset="100%" stopColor="#00D4B8" /></linearGradient>
                <linearGradient id="timerGradientBreak" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#3DBE7A" /><stop offset="50%" stopColor="#50d48e" /><stop offset="100%" stopColor="#7AE8A8" /></linearGradient>
                <linearGradient id="timerGradientLong" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6C63FF" /><stop offset="50%" stopColor="#8b83ff" /><stop offset="100%" stopColor="#A89FFF" /></linearGradient>
              </defs>
              {tickMarks.map(t => <line key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.06)" strokeWidth={t.major?1.5:0.5} />)}
              <circle className={s.ringBg} cx="150" cy="150" r="130" />
              <circle className={s.ringTrack} cx="150" cy="150" r="125" />
              <circle className={`${s.ringFg} ${s[modeClass]}`} cx="150" cy="150" r="130" style={{strokeDashoffset:dashOffset}} />
            </svg>
            <div className={s.ringInner}>
              <span className={s.ringLabel}>{MODE_LABELS[mode]}</span>
              <span className={`${s.ringTime} ${s[modeClass]} ${running?s.ringTimeActive:''}`}>{display}</span>
              <div className={s.ringDots}>{[0,1,2,3].map(i=><div key={i} className={`${s.dot} ${done>i?s.filled:''} ${s[modeClass]}`} />)}</div>
            </div>
          </div>
        </div>
        <div className={s.controls}>
          <button className={s.ctrlBtn} onClick={resetTimer} title="Reset">&#8634;</button>
          <button className={`${s.playBtn} ${s[modeClass]}`} onClick={()=>{startSession();togglePlay()}}>
            {running ? '\u23F8' : '\u25B6'}
            {running && <span className={`${s.playBtnPulse} ${s[modeClass]}`} />}
          </button>
          <button className={s.ctrlBtn} onClick={skipTimer} title="Skip">{'\u23ED'}</button>
        </div>
        <div className={s.statsGrid}>
          <div className={s.statCard}><span className={s.statIcon}>🍅</span><span className={s.statNum}>{sessionPomodoros}</span><span className={s.statLabel}>Pomodoros</span></div>
          <div className={s.statCard}><span className={s.statIcon}>⏱</span><span className={s.statNum}>{running?liveMin:elapsedMin}</span><span className={s.statLabel}>Minutes</span></div>
          <div className={s.statCard}><span className={s.statIcon}>🌿</span><span className={s.statNum}>{trees.length}</span><span className={s.statLabel}>Trees</span></div>
        </div>
        <div className={s.forest}>
          <div className={s.forestLabel}>Your Forest</div>
          <div className={s.forestGround}>
            {trees.map((tree,idx)=>(
              <div key={tree.id} className={`${s.tree} ${s[tree.color]} ${idx>=trees.length-1?s.treeGrowing:s.treeIdle}`}
                style={{left:tree.left+'%',transform:'scale('+tree.scale+')',transformOrigin:'bottom center',animationDelay:idx>=trees.length-1?'0s':idx*0.2+'s'}}>
                <div className={s.treeCrown}>
                  <div className={`${s.canopyLayer} ${s.canopyBack}`} style={{'--cw':28*tree.scale+'px','--ch':22*tree.scale+'px'}} />
                  <div className={`${s.canopyLayer} ${s.canopyMid}`} style={{'--cw':24*tree.scale+'px','--ch':20*tree.scale+'px'}} />
                  <div className={`${s.canopyLayer} ${s.canopyTop}`} style={{'--cw':20*tree.scale+'px','--ch':18*tree.scale+'px'}}><div className={s.canopyHighlight} /></div>
                </div>
                <div className={s.treeTrunk} style={{'--cw':24*tree.scale+'px','--ch':20*tree.scale+'px'}} />
                <div className={s.treeShadow} style={{'--cw':24*tree.scale+'px'}} />
              </div>
            ))}
            {trees.length>0 && leaves.map(lf=>(
              <div key={lf.id} className={`${s.leaf} ${s[lf.color.replace('tree','leaf')]} ${s.leafFall}`}
                style={{left:lf.left,top:lf.top,'--leaf-dur':lf.dur,'--leaf-delay':lf.delay,'--leaf-dx':lf.dx,'--leaf-dx2':lf.dx2}} />
            ))}
            {fireflies.map(ff=><div key={ff.id} className={s.firefly} style={{left:ff.left,top:ff.top,'--dur':ff.dur,'--delay':ff.delay,'--dx':ff.dx,'--dy':ff.dy}} />)}
            <div className={s.forestFog} />
          </div>
        </div>
        {sessionPomodoros>0 && (
          <div className={s.finishSection} style={{maxWidth:580,width:'100%'}}>
            <div className={s.finishInfo}>{sessionPomodoros} pomodoro{sessionPomodoros>1?'s':''} completed{topicInfo?' - '+topicInfo.name:''}</div>
            <button className={s.finishBtn} onClick={handleFinish}>Finish & Save Session</button>
          </div>
        )}
        <div className={s.bottomPanel}>
          <button className={s.toggleBtn} onClick={()=>setShowSettings(!showSettings)}>Timer Settings<span className={`${s.toggleArrow} ${showSettings?s.toggleArrowOpen:''}`}>▼</span></button>
          {showSettings && (
            <div className={s.settingsSection}>
              <div className={s.settingsTitle}>Duration (minutes)</div>
              <div className={s.settingsGrid}>
                <div className={s.setItem}><label>Focus</label><input type="number" min="1" max="90" value={focusMins} onChange={e=>setFocusMins(Math.max(1,+e.target.value))} /></div>
                <div className={s.setItem}><label>Short</label><input type="number" min="1" max="30" value={shortMins} onChange={e=>setShortMins(Math.max(1,+e.target.value))} /></div>
                <div className={s.setItem}><label>Long</label><input type="number" min="1" max="60" value={longMins} onChange={e=>setLongMins(Math.max(1,+e.target.value))} /></div>
              </div>
            </div>
          )}
          {log.length>0 && (
            <div className={s.sessionLog}>
              <div className={s.logTitle}>Session Log</div>
              {log.map((entry,i)=>(
                <div key={i} className={s.logItem}>
                  <span className={s.logEmoji}>{entry.type==='study'?'🍅':entry.type==='break'?'☕':'🌙'}</span>
                  <span className={s.logLabel}>{MODE_LABELS[entry.type]}</span>
                  <span className={s.logTime}>{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showFinish && (
        <div className={s.modalOverlay}>
          <div className={s.modal}>
            <div className={s.modalTitle}>Session Complete!</div>
            <div className={s.modalSummary}>
              <div>🍅 {sessionPomodoros} Pomodoro{sessionPomodoros>1?'s':''}</div>
              <div>⏱ {elapsedMin} minutes ({(elapsedMin/60).toFixed(1)} hours)</div>
              {topicInfo && <div>📚 {topicInfo.name}</div>}
            </div>
            {selectedTopic && (
              <div className={s.modalField}>
                <label>How's this topic?</label>
                <div className={s.statusOptions}>
                  {['In Progress','Reviewing','Complete'].map(st=>(
                    <button key={st} className={`${s.statusOpt} ${topicStatus===st?s.statusOptOn:''}`} onClick={()=>setTopicStatus(st)}>{st}</button>
                  ))}
                </div>
              </div>
            )}
            <div className={s.modalActions}>
              <button className={s.modalCancel} onClick={()=>setShowFinish(false)}>Cancel</button>
              <button className={s.modalSave} onClick={confirmFinish} disabled={saving}>{saving?'Saving...':'Save Session'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
