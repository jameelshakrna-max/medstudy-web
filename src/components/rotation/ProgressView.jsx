import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  calculateOverallTopicProgress,
  calculateLearningProgress,
  calculateUworldProgress,
  calculateIncorrectReviewProgress,
  buildScheduledVsLoggedSeries,
  summarizeTopicStatuses,
  findTopicsNeedingAttention,
  summarizeConfidence,
} from './progressAnalytics'
import styles from './ProgressView.module.css'

const STATUS_COLORS = {
  completed: 'var(--emerald)',
  learning: 'var(--blue)',
  uworld_in_progress: 'var(--indigo)',
  questions_locked: 'var(--amber)',
  not_started: 'var(--mist)',
}

function formatMinutes(mins) {
  if (mins == null || Number.isNaN(mins) || mins <= 0) return '0m'
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

function formatDate(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipLabel}>{formatDate(label)}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className={styles.chartTooltipValue} style={{ color: entry.color }}>
          {entry.name}: {formatMinutes(entry.value)}
        </div>
      ))}
    </div>
  )
}

export default function ProgressView({
  plan,
  topics,
  tasks,
  topicsById,
  sourcePace,
  todayKey,
  forecast,
  forecastLoading,
  forecastError,
}) {
  const overall = useMemo(() => calculateOverallTopicProgress(topics), [topics])

  const learning = useMemo(
    () => calculateLearningProgress(topics, tasks),
    [topics, tasks]
  )

  const uworld = useMemo(() => calculateUworldProgress(topics), [topics])

  const incorrectReview = useMemo(
    () => calculateIncorrectReviewProgress(tasks),
    [tasks]
  )

  const chartData = useMemo(
    () => buildScheduledVsLoggedSeries(tasks, todayKey),
    [tasks, todayKey]
  )

  const hasChartData = useMemo(
    () => chartData.some(d => d.scheduled > 0 || d.logged > 0),
    [chartData]
  )

  const statusDistribution = useMemo(() => summarizeTopicStatuses(topics), [topics])

  const attentionTopics = useMemo(
    () => findTopicsNeedingAttention(topics, tasks, todayKey),
    [topics, tasks, todayKey]
  )

  const confidenceDistribution = useMemo(() => summarizeConfidence(topics), [topics])

  const maxStatusCount = useMemo(
    () => Math.max(1, ...statusDistribution.map((s) => s.count)),
    [statusDistribution]
  )

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Progress</h2>

      {/* A. Overall Summary */}
      <div className={styles.cardGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Overall</div>
          <div className={styles.metricValue}>{overall.percent}%</div>
          <div className={styles.metricSubtext}>
            {overall.completed}/{overall.total} topics
          </div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Learning</div>
          <div className={styles.metricValue}>{learning.percent}%</div>
          <div className={styles.metricSubtext}>
            {formatMinutes(learning.completed)}/{formatMinutes(learning.total)}
          </div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>UWorld</div>
          <div className={styles.metricValue}>{uworld.percent}%</div>
          <div className={styles.metricSubtext}>
            {uworld.completed}/{uworld.total}
          </div>
        </div>
      </div>

      {/* B. Incorrect Review */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Incorrect Review</h3>
        {incorrectReview.generated === 0 ? (
          <div className={styles.emptyState}>No incorrect review required</div>
        ) : (
          <div className={styles.metricLine}>
            <span>{incorrectReview.generated} generated</span>
            <span className={styles.metricDot}>·</span>
            <span>{incorrectReview.reviewed} reviewed</span>
            <span className={styles.metricDot}>·</span>
            <span>{incorrectReview.remaining} remain</span>
          </div>
        )}
      </div>

      {/* C. Scheduled vs Logged Time */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Scheduled vs Logged Time</h3>
        {hasChartData ? (
          <>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11, fill: 'var(--mist)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--card-border)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--mist)' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: 'var(--mist)' }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar
                    dataKey="scheduled"
                    name="Scheduled"
                    fill="var(--blue)"
                    fillOpacity={0.8}
                    radius={[3, 3, 0, 0]}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="logged"
                    name="Logged"
                    fill="var(--emerald)"
                    fillOpacity={0.8}
                    radius={[3, 3, 0, 0]}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--blue)' }} />
                Scheduled
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--emerald)' }} />
                Logged
              </span>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>No scheduled time data</div>
        )}
      </div>

      {/* D. Topic Status Distribution */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Topic Status Distribution</h3>
        {statusDistribution.length > 0 ? (
          <div className={styles.statusBars}>
            {statusDistribution.map((item) => (
              <div key={item.status} className={styles.statusBar}>
                <span className={styles.statusBarLabel}>
                  {item.label}
                </span>
                <div className={styles.statusBarTrack}>
                  <div
                    className={styles.statusBarFill}
                    style={{
                      width: `${(item.count / maxStatusCount) * 100}%`,
                      background: STATUS_COLORS[item.status] || 'var(--mist)',
                    }}
                  />
                </div>
                <span className={styles.statusBarCount}>{item.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>No topics yet</div>
        )}
      </div>

      {/* E. Forecast */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Forecast</h3>
        {forecastLoading ? (
          <div className={styles.emptyState}>Loading forecast...</div>
        ) : forecastError ? (
          <div className={styles.emptyState}>Forecast unavailable</div>
        ) : forecast ? (
          <div className={styles.forecastCard}>
            <div
              className={`${styles.forecastStatus} ${
                forecast.status === 'on_track'
                  ? styles.forecastOnTrack
                  : forecast.status === 'at_risk'
                  ? styles.forecastAtRisk
                  : styles.forecastImpossible
              }`}
            >
              {forecast.status === 'impossible'
                ? 'Cannot fit'
                : forecast.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
            <div className={styles.forecastDetails}>
              {forecast.estimatedCompletionDate && (
                <div>Est. completion: {formatDate(forecast.estimatedCompletionDate)}</div>
              )}
              <div>Remaining: {formatMinutes(forecast.remainingRequiredMinutes)}</div>
              {forecast.missingCapacityMinutes > 0 && (
                <div className={styles.forecastWarning}>
                  Missing: {formatMinutes(forecast.missingCapacityMinutes)} capacity
                </div>
              )}
              {forecast.requiredExtraMinutesPerDay > 0 && (
                <div>
                  Extra: {formatMinutes(forecast.requiredExtraMinutesPerDay)}/day needed
                </div>
              )}
              {forecast.unscheduledTopics > 0 && (
                <div className={styles.forecastWarning}>
                  {forecast.unscheduledTopics} unscheduled topic{forecast.unscheduledTopics !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>No forecast data available</div>
        )}
      </div>

      {/* F. Topics Needing Attention */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Topics Needing Attention</h3>
        {attentionTopics.length > 0 ? (
          <div className={styles.attentionList}>
            {attentionTopics.map((item) => (
              <div key={item.topicId} className={styles.attentionItem}>
                <div className={styles.attentionTitle}>{item.topicTitle}</div>
                <div className={styles.attentionReasons}>
                  {item.reasons.join(' · ')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>All topics on track</div>
        )}
      </div>

      {/* G. Source Pace */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Source Pace</h3>
        {sourcePace ? (
          <div className={styles.paceDetails}>
            <div>Learning pace: {sourcePace.paceMultiplier?.toFixed(1) || '1.0'}× base</div>
            <div>Calibration samples: {sourcePace.sampleCount}</div>
            {sourcePace.updatedAt && (
              <div>Updated: {formatDate(sourcePace.updatedAt.split('T')[0])}</div>
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>Not enough calibration data yet</div>
        )}
      </div>

      {/* H. Estimate Confidence */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Estimate Confidence</h3>
        {confidenceDistribution.length > 0 ? (
          <div className={styles.confidenceList}>
            {confidenceDistribution.map((item) => (
              <div key={item.confidence} className={styles.confidenceRow}>
                <span className={styles.confidenceLabel}>{item.confidence}</span>
                <span className={styles.confidenceCount}>{item.count} topic{item.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>No confidence data available</div>
        )}
      </div>
    </div>
  )
}
