import { useMemo } from 'react'
import { TrendingUp, Target, BarChart3, Clock, PieChart, Calendar } from 'lucide-react'
import ChartCard from '../components/charts/ChartCard'
import TrendLineChart from '../components/charts/TrendLineChart'
import SubjectBarChart from '../components/charts/SubjectBarChart'
import ActivityBarChart from '../components/charts/ActivityBarChart'
import DistributionDoughnut from '../components/charts/DistributionDoughnut'
import CalendarHeatmap from '../components/charts/CalendarHeatmap'
import DailyStatsBar from '../components/charts/DailyStatsBar'
import styles from './AnalyticsView.module.css'

export default function AnalyticsView({ report }) {
  const { charts, subjects, analytics } = report || {}
  const {
    trendData = [],
    subjectDistribution = [],
    weeklyActivity = [],
    studyTime = [],
    dailyActivity = [],
    monthlyStats = {},
  } = charts || {}

  const hasUWorld = (report?.analytics?.totalBlocks || 0) > 0
  const hasBoard = (report?.analytics?.totalCases || 0) > 0
  const hasMRCP = (report?.analytics?.totalMrcpTopics || 0) > 0
  const hasData = hasUWorld || hasBoard || hasMRCP

  const chartConfigs = useMemo(() => [
    {
      id: 'trend',
      title: 'Performance Trend',
      icon: TrendingUp,
      isEmpty: !trendData.length,
      emptyMsg: hasUWorld ? 'Complete more UWorld blocks to see your score trend over time.' : 'Log your first UWorld block to start tracking performance.',
      children: <TrendLineChart data={trendData} yKey="avgScore" name="Avg Score" color="#4F8CFF" />,
      span: 2,
    },
    {
      id: 'subjects',
      title: 'Subject Performance',
      icon: Target,
      isEmpty: !subjects?.rankings?.length,
      emptyMsg: 'Complete UWorld blocks across different subjects to see your performance breakdown.',
      children: <SubjectBarChart data={subjects?.rankings} />,
      span: 1,
    },
    {
      id: 'activity',
      title: 'Weekly Study Activity',
      icon: BarChart3,
      isEmpty: !weeklyActivity.length,
      emptyMsg: !hasData ? 'Start using UWorld, MRCP, or Local Board to track your weekly activity.' : 'Activity data will appear here as you study.',
      children: <ActivityBarChart data={weeklyActivity} />,
      span: 2,
    },
    {
      id: 'time',
      title: 'Study Time',
      icon: Clock,
      isEmpty: !studyTime.length,
      emptyMsg: 'Log study time when completing UWorld blocks to see your time investment per week.',
      children: <TrendLineChart data={studyTime} yKey="minutes" name="Minutes" color="#10B981" yUnit=" min" />,
      span: 1,
    },
    {
      id: 'distribution',
      title: 'Subject Distribution',
      icon: PieChart,
      isEmpty: !subjectDistribution.length,
      emptyMsg: 'Complete UWorld blocks in different subjects to see your effort distribution.',
      children: <DistributionDoughnut data={subjectDistribution} />,
      span: 3,
    },
  ], [trendData, subjects, weeklyActivity, studyTime, subjectDistribution, hasUWorld, hasBoard, hasMRCP, hasData])

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Analytics</h2>
        <p className={styles.sub}>
          {hasData
            ? `${trendData.length} weeks tracked · ${subjects?.rankings?.length || 0} subjects`
            : 'Start logging your study activity to unlock insights'}
        </p>
      </div>

      <div className={styles.sectionHeader}>
        <Calendar size={16} />
        <span>Activity Calendar</span>
      </div>
      <DailyStatsBar analytics={analytics} monthlyStats={monthlyStats} />
      <div className={styles.grid} style={{ marginBottom: 32 }}>
        <div className={styles.gridItem} style={{ gridColumn: 'span 3' }}>
          <ChartCard
            title="Study Contribution Graph"
            isEmpty={!dailyActivity.length}
            emptyMessage="Log your first study session to see your contribution graph"
          >
            <CalendarHeatmap data={dailyActivity} />
          </ChartCard>
        </div>
      </div>

      <div className={styles.sectionHeader}>
        <BarChart3 size={16} />
        <span>Chart Analytics</span>
      </div>
      <div className={styles.grid}>
        {chartConfigs.map(cfg => (
          <div key={cfg.id} className={styles.gridItem} style={{ gridColumn: cfg.span > 1 ? `span ${cfg.span}` : undefined }}>
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
