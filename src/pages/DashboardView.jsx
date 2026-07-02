import { useState } from 'react'
import { Timer, BookOpen, BrainCircuit, Target, TrendingUp, Zap, Activity, Clock } from 'lucide-react'
import StatCard from '../components/StatCard'
import SummaryCard from '../components/SummaryCard'
import PerformanceCard from '../components/PerformanceCard'
import ToggleSwitch from '../components/ToggleSwitch'
import { getSubjectName } from '../lib/subjectColors'
import styles from './Page.module.css'

const TRACKS = ['uworld', 'mrcp', 'board']

export default function DashboardView({ report, onViewChange }) {
  const [visibleTracks, setVisibleTracks] = useState({ uworld: true, mrcp: true, board: true })

  if (!report) return null

  const { performance, readiness, analytics, subjects, recommendations, activity } = report

  return (
    <div>
      <div className={styles.header} style={{ marginBottom: 20 }}>
        <h2 className={styles.title} style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}>Dashboard</h2>
        <p className={styles.sub}>Your study command centre — aggregated across all tracks</p>
      </div>

      {/* Performance & Readiness */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 28 }}>
        <PerformanceCard title="Overall Performance" score={performance.overallScore} maxScore={100}
          tier={readiness.tier} tierColor={readiness.color} breakdown={performance.breakdown}
          sub="Weighted score based on accuracy, consistency, trends, and study frequency" />

        <PerformanceCard title="Exam Readiness" score={readiness.score} maxScore={100}
          tier={readiness.tier} tierColor={readiness.color} breakdown={readiness.breakdown}
          sub="Estimated readiness based on your recorded study behavior" />
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 32 }}>
        <StatCard icon={Zap} number={analytics.currentStreak} label="Day Streak" color="var(--amber)" />
        <StatCard icon={Target} number={analytics.totalQuestions} label="Questions Solved" color="var(--blue)" sub={`${analytics.totalCorrect} correct`} />
        <StatCard icon={TrendingUp} number={analytics.weeksActive} label="Weeks Active" color="var(--emerald)" sub={`${analytics.totalBlocks} blocks`} />
        <StatCard icon={Activity} number={analytics.daysStudied} label="Days Studied" color="var(--indigo)" />
      </div>

      {/* Toggle Track Visibility */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mist)' }}>Show Tracks</span>
        <ToggleSwitch checked={visibleTracks.uworld} onChange={v => setVisibleTracks(p => ({ ...p, uworld: v }))} label="UWorld" />
        <ToggleSwitch checked={visibleTracks.mrcp} onChange={v => setVisibleTracks(p => ({ ...p, mrcp: v }))} label="MRCP" />
        <ToggleSwitch checked={visibleTracks.board} onChange={v => setVisibleTracks(p => ({ ...p, board: v }))} label="Local Board" />
      </div>

      {/* Track Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 32 }}>
        {visibleTracks.uworld && (
          <SummaryCard title="UWorld Summary" value={`${analytics.totalBlocks} blocks`} sub={`Avg: ${performance.breakdown?.[0]?.score || 0}%`}
            color="var(--blue)" progress={performance.breakdown?.[0]?.score || 0} accent="View Details →"
            onClick={() => onViewChange?.('uworld')} />
        )}
        {visibleTracks.mrcp && (
          <SummaryCard title="MRCP Progress" value={`${analytics.totalMrcpTopics} topics`} sub={`${subjects.rankings?.length || 0} subjects tracked`}
            color="var(--indigo)" onClick={() => onViewChange?.('mrcp')} />
        )}
        {visibleTracks.board && (
          <SummaryCard title="Local Board" value={`${analytics.totalCases} cases`} sub="Clinical case log"
            color="var(--emerald)" onClick={() => onViewChange?.('board')} />
        )}
      </div>

      {/* Subject Rankings */}
      {subjects.rankings?.length > 0 && (
        <div className={styles.formCard} style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--text-primary)', marginBottom: 16 }}>Subject Performance</h3>
          {subjects.strongest?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--emerald)', marginBottom: 8 }}>Strongest</div>
              {subjects.strongest.map((s, i) => (
                <div key={s.subject} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--input-bg)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{i + 1}. {getSubjectName(s.subject)}</span>
                  <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>{s.avgScore}% · {s.blocks} blocks</span>
                </div>
              ))}
            </div>
          )}
          {subjects.weakest?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--red)', marginBottom: 8 }}>Needs Improvement</div>
              {subjects.weakest.map((s, i) => (
                <div key={s.subject} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--input-bg)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{i + 1}. {getSubjectName(s.subject)}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{s.avgScore}% · {s.blocks} blocks</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className={styles.formCard} style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--text-primary)', marginBottom: 16 }}>Recommendations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{
                padding: '12px 16px', borderRadius: 12,
                background: r.confidence === 'high' ? 'var(--blueL)' : 'var(--amberL)',
                border: '1px solid ' + (r.confidence === 'high' ? 'rgba(79,140,255,0.2)' : 'rgba(245,158,11,0.2)'),
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, flexShrink: 0,
                    color: r.confidence === 'high' ? 'var(--blue)' : 'var(--amber)',
                    background: r.confidence === 'high' ? 'rgba(79,140,255,0.1)' : 'rgba(245,158,11,0.1)',
                  }}>
                    {r.confidence} confidence
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 6, lineHeight: 1.5 }}>{r.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {activity.recent?.length > 0 && (
        <div>
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--text-primary)', marginBottom: 12 }}>Recent Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activity.recent.map((a, i) => (
              <div key={a.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10,
                border: '1px solid var(--card-border)', fontSize: 13,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6,
                  color: 'var(--blue)', background: 'var(--blueL)', flexShrink: 0,
                }}>{a.module}</span>
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.summary}</span>
                <span style={{ fontSize: 11, color: 'var(--mist)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
