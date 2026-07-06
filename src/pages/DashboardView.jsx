import { useState, useMemo } from 'react'
import { Timer, BookOpen, BrainCircuit, Target, TrendingUp, Zap, Activity, Clock, BarChart3, PieChart, Calendar, Check, ArrowRight } from 'lucide-react'
import StatCard from '../components/StatCard'
import SummaryCard from '../components/SummaryCard'
import PerformanceCard from '../components/PerformanceCard'
import ToggleSwitch from '../components/ToggleSwitch'
import ChartCard from '../components/charts/ChartCard'
import TrendLineChart from '../components/charts/TrendLineChart'
import SubjectBarChart from '../components/charts/SubjectBarChart'
import ActivityBarChart from '../components/charts/ActivityBarChart'
import DistributionDoughnut from '../components/charts/DistributionDoughnut'
import CalendarHeatmap from '../components/charts/CalendarHeatmap'
import DailyStatsBar from '../components/charts/DailyStatsBar'
import GoalCard from '../components/GoalCard'
import { getSubjectName } from '../lib/subjectColors'
import styles from './DashboardView.module.css'
import pageStyles from './Page.module.css'

const TRACKS = ['uworld', 'mrcp', 'board']

export default function DashboardView({ report, onViewChange }) {
  const [visibleTracks, setVisibleTracks] = useState({ uworld: true, mrcp: true, board: true })

  if (!report) return null

  const { performance, readiness, analytics, subjects, recommendations, activity, goals, charts } = report

  const activeGoals = (goals || []).filter(g => g.status === 'active' || !g.status || g.status === 'active')
  const completedGoals = (goals || []).filter(g => g.status === 'completed')
  const sortedActive = [...activeGoals].sort((a, b) => (b.pct || 0) - (a.pct || 0))
  const currentGoal = sortedActive[0]
  const otherGoals = sortedActive.slice(1, 5)

  const hasUWorld = (analytics?.totalBlocks || 0) > 0
  const hasBoard = (analytics?.totalCases || 0) > 0
  const hasMRCP = (analytics?.totalMrcpTopics || 0) > 0
  const hasData = hasUWorld || hasBoard || hasMRCP

  const chartConfigs = useMemo(() => [
    {
      id: 'trend', title: 'Performance Trend', icon: TrendingUp,
      isEmpty: !(charts?.trendData?.length),
      emptyMsg: hasUWorld ? 'Complete more UWorld blocks to see your score trend over time.' : 'Log your first UWorld block to start tracking performance.',
      children: <TrendLineChart data={charts?.trendData || []} yKey="avgScore" name="Avg Score" color="#4F8CFF" />,
      span: 2,
    },
    {
      id: 'subjects', title: 'Subject Performance', icon: Target,
      isEmpty: !(subjects?.rankings?.length),
      emptyMsg: 'Complete UWorld blocks across different subjects to see your performance breakdown.',
      children: <SubjectBarChart data={subjects?.rankings} />,
      span: 1,
    },
    {
      id: 'activity', title: 'Weekly Study Activity', icon: BarChart3,
      isEmpty: !(charts?.weeklyActivity?.length),
      emptyMsg: !hasData ? 'Start using UWorld, MRCP, or Local Board to track your weekly activity.' : 'Activity data will appear here as you study.',
      children: <ActivityBarChart data={charts?.weeklyActivity || []} />,
      span: 2,
    },
    {
      id: 'time', title: 'Study Time', icon: Clock,
      isEmpty: !(charts?.studyTime?.length),
      emptyMsg: 'Log study time when completing UWorld blocks to see your time investment per week.',
      children: <TrendLineChart data={charts?.studyTime || []} yKey="minutes" name="Minutes" color="#10B981" yUnit=" min" />,
      span: 1,
    },
    {
      id: 'distribution', title: 'Subject Distribution', icon: PieChart,
      isEmpty: !(charts?.subjectDistribution?.length),
      emptyMsg: 'Complete UWorld blocks in different subjects to see your effort distribution.',
      children: <DistributionDoughnut data={charts?.subjectDistribution || []} />,
      span: 3,
    },
  ], [charts, subjects, hasUWorld, hasBoard, hasMRCP])

  return (
    <div>
      <div className={pageStyles.header} style={{ marginBottom: 20 }}>
        <h2 className={pageStyles.title}>Dashboard</h2>
        <p className={pageStyles.sub}>Your study command centre — aggregated across all tracks</p>
      </div>

      {/* Current Goal Highlight */}
      {currentGoal && (
        <div className={styles.currentGoal}>
          <div className={styles.currentGoalAccent} />
          <div className={styles.currentGoalLabel}>
            <div className={styles.currentGoalIcon}>
              <Target size={14} color="#0B1120" />
            </div>
            <span className={styles.currentGoalChip}>Current Goal</span>
          </div>
          <div className={styles.currentGoalTitle}>{currentGoal.title}</div>
          <div className={styles.currentGoalTrack}>
            <div className={styles.currentGoalFill} style={{ width: `${Math.min(100, currentGoal.pct || 0)}%` }} />
          </div>
          <div className={styles.currentGoalMeta}>
            <span className={styles.currentGoalMetaText}>
              <span className={styles.currentGoalMetaBold}>
                {currentGoal.goal_type === 'hours' ? Math.round(currentGoal.current * 10) / 10 : Math.round(currentGoal.current)}
              </span>
              {' / '}
              <span className={styles.currentGoalMetaMist}>
                {currentGoal.goal_type === 'hours' ? Math.round(currentGoal.target_value * 10) / 10 : Math.round(currentGoal.target_value)}
              </span>
              {currentGoal.goal_type === 'hours' ? ' hrs' : currentGoal.goal_type === 'performance' || currentGoal.goal_type === 'subject_avg' ? '%' : ''}
            </span>
            <span className={styles.currentGoalPct}>{currentGoal.pct}%</span>
            {currentGoal.nextMilestone && (
              <span className={styles.currentGoalMetaSmall}>
                Next milestone: <span className={styles.currentGoalMetaSmallBold}>{currentGoal.nextMilestone}</span>
              </span>
            )}
            {currentGoal.estimatedDate && (
              <span className={styles.currentGoalMetaSmall}>
                Est. completion: <span className={styles.currentGoalMetaSmallBold}>
                  {new Date(currentGoal.estimatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Other Active Goals */}
      {otherGoals.length > 0 && (
        <div className={styles.goalList}>
          <div className={styles.subHeader}>
            <Target size={16} />
            Other Active Goals ({activeGoals.length - 1})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {otherGoals.map(g => (
              <GoalCard key={g.id} goal={g} compact />
            ))}
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className={styles.goalList}>
          <div className={`${styles.subHeader} ${styles.subHeaderGreen}`}>
            <Check size={16} />
            Recently Completed ({completedGoals.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completedGoals.slice(0, 3).map(g => (
              <GoalCard key={g.id} goal={g} compact />
            ))}
          </div>
        </div>
      )}

      {/* Performance & Readiness */}
      <div className={styles.grid2}>
        <PerformanceCard title="Overall Performance" score={performance.overallScore} maxScore={100}
          tier={readiness.tier} tierColor={readiness.color} breakdown={performance.breakdown}
          sub="Weighted score based on accuracy, consistency, trends, and study frequency" />

        <PerformanceCard title="Exam Readiness" score={readiness.score} maxScore={100}
          tier={readiness.tier} tierColor={readiness.color} breakdown={readiness.breakdown}
          sub="Estimated readiness based on your recorded study behavior" />
      </div>

      {/* Quick Stats */}
      <div className={styles.grid4}>
        <StatCard icon={Zap} number={analytics.currentStreak} label="Day Streak" color="var(--amber)" />
        <StatCard icon={Target} number={analytics.totalQuestions} label="Questions Solved" color="var(--blue)" sub={`${analytics.totalCorrect} correct`} />
        <StatCard icon={TrendingUp} number={analytics.weeksActive} label="Weeks Active" color="var(--emerald)" sub={`${analytics.totalBlocks} blocks`} />
        <StatCard icon={Activity} number={analytics.daysStudied} label="Days Studied" color="var(--indigo)" />
      </div>

      {/* Toggle Track Visibility */}
      <div className={styles.toggles}>
        <span className={styles.toggleLabel}>Show Tracks</span>
        <ToggleSwitch checked={visibleTracks.uworld} onChange={v => setVisibleTracks(p => ({ ...p, uworld: v }))} label="UWorld" />
        <ToggleSwitch checked={visibleTracks.mrcp} onChange={v => setVisibleTracks(p => ({ ...p, mrcp: v }))} label="MRCP" />
        <ToggleSwitch checked={visibleTracks.board} onChange={v => setVisibleTracks(p => ({ ...p, board: v }))} label="Local Board" />
      </div>

      {/* Track Summary Cards */}
      <div className={styles.summaryGrid}>
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
        <div className={pageStyles.formCard} style={{ marginBottom: 28 }}>
          <h3 className={styles.cardTitle}>Subject Performance</h3>
          {subjects.strongest?.length > 0 && (
            <div className={styles.subjectSection}>
              <div className={`${styles.sectionChip} ${styles.sectionChipGreen}`}>Strongest</div>
              {subjects.strongest.map((s, i) => (
                <div key={s.subject} className={styles.subjectRow}>
                  <span className={styles.subjectName}>{i + 1}. {getSubjectName(s.subject)}</span>
                  <span className={`${styles.subjectScore} ${styles.subjectScoreGreen}`}>{s.avgScore}% · {s.blocks} blocks</span>
                </div>
              ))}
            </div>
          )}
          {subjects.weakest?.length > 0 && (
            <div>
              <div className={`${styles.sectionChip} ${styles.sectionChipRed}`}>Needs Improvement</div>
              {subjects.weakest.map((s, i) => (
                <div key={s.subject} className={styles.subjectRow}>
                  <span className={styles.subjectName}>{i + 1}. {getSubjectName(s.subject)}</span>
                  <span className={`${styles.subjectScore} ${styles.subjectScoreRed}`}>{s.avgScore}% · {s.blocks} blocks</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className={pageStyles.formCard} style={{ marginBottom: 28 }}>
          <h3 className={styles.cardTitle}>Recommendations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommendations.map((r, i) => (
              <div key={i} className={`${styles.recommendation} ${r.confidence === 'high' ? styles.recommendationHigh : styles.recommendationLow}`}>
                <span className={`${styles.confidenceBadge} ${r.confidence === 'high' ? styles.confidenceBadgeHigh : styles.confidenceBadgeLow}`}>
                  {r.confidence} confidence
                </span>
                <div className={styles.recommendationText}>{r.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {activity.recent?.length > 0 && (
        <div className={styles.recentSection}>
          <h3 className={styles.cardTitle}>Recent Activity</h3>
          <div className={styles.recentList}>
            {activity.recent.map((a, i) => (
              <div key={a.id || i} className={styles.recentItem}>
                <span className={styles.recentBadge}>{a.module}</span>
                <span className={styles.recentSummary}>{a.summary}</span>
                <span className={styles.recentDate}>
                  {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Calendar */}
      <div className={styles.calendarSection}>
        <div className={styles.calendarTitle}>
          <Calendar size={16} />
          Activity Calendar
        </div>
        <DailyStatsBar analytics={analytics} monthlyStats={charts?.monthlyStats} />
        <div className={styles.calendarWrap}>
          <CalendarHeatmap data={charts?.dailyActivity || []} />
        </div>
      </div>

      {/* Chart Analytics */}
      <div className={styles.chartTitle}>
        <BarChart3 size={16} />
        Chart Analytics
      </div>
      <div className={styles.chartGrid}>
        {chartConfigs.map(cfg => (
          <div key={cfg.id} style={{ gridColumn: cfg.span > 1 ? `span ${cfg.span}` : undefined, minWidth: 0 }}>
            <ChartCard
              title={cfg.title}
              isEmpty={cfg.isEmpty}
              emptyMessage={cfg.emptyMsg}
            >
              {cfg.children}
            </ChartCard>
          </div>
        ))}
      </div>
    </div>
  )
}
