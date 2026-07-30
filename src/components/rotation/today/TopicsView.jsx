import { useState, useMemo } from 'react'
import { Check, Lock, Clock, Minus } from 'lucide-react'
import { TOPIC_STATUS_LABELS, filterTopics, groupTopicsByGroup, summarizeTopics } from './todayGrouping'
import styles from './TopicsView.module.css'

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'not_started', label: 'Not Started' },
  { key: 'locked', label: 'Locked' },
  { key: 'completed', label: 'Completed' },
]

const STATUS_BADGE_CLASS = {
  not_started: styles.badgeNeutral,
  learning: styles.badgeActive,
  questions_locked: styles.badgeMuted,
  uworld_in_progress: styles.badgeActive,
  incorrect_review: styles.badgeActive,
  maintenance: styles.badgeMuted,
  completed: styles.badgeSuccess,
}

const STATUS_ICON = {
  not_started: Minus,
  learning: Clock,
  questions_locked: Lock,
  uworld_in_progress: Clock,
  incorrect_review: Clock,
  maintenance: Minus,
  completed: Check,
}

function PipelineRow({ label, state, detail, indicator }) {
  return (
    <div className={styles.pipelineRow}>
      <span className={styles.pipelineLabel}>{label}</span>
      <span className={styles.pipelineValue}>
        {indicator && <span className={`${styles.pipelineIndicator} ${indicator.class}`}>{indicator.icon}</span>}
        {state}
      </span>
      {detail && <span className={styles.pipelineDetail}>{detail}</span>}
    </div>
  )
}

function getLearningRow(topic) {
  if (topic.status === 'not_started') {
    return null
  }
  if (topic.status === 'learning') {
    return { state: 'In progress', detail: null, indicator: { icon: '●', class: styles.indicatorBlue } }
  }
  if (topic.learningCompletedAt) {
    return { state: 'Completed', detail: null, indicator: { icon: '✓', class: styles.indicatorEmerald } }
  }
  return null
}

function getUworldRow(topic) {
  const completed = topic.completedUworldQuestions || 0
  const total = topic.totalUworldQuestions || 0
  if (total === 0) {
    return null
  }
  if (topic.status === 'not_started' || topic.status === 'learning' || topic.status === 'questions_locked') {
    return { state: 'Locked', detail: 'Complete learning first', indicator: { icon: '🔒', class: styles.indicatorMist } }
  }
  const remaining = total - completed
  return {
    state: `${completed} / ${total} questions`,
    detail: remaining > 0 ? `${remaining} remaining` : null,
    indicator: remaining > 0 ? { icon: '●', class: styles.indicatorBlue } : { icon: '✓', class: styles.indicatorEmerald },
  }
}

function getIncorrectRow(topic) {
  const remaining = topic.incorrectQuestionsRemaining
  if (topic.status === 'completed') {
    return remaining > 0
      ? { state: `${remaining} remaining`, detail: null, indicator: { icon: '●', class: styles.indicatorBlue } }
      : { state: 'Complete', detail: null, indicator: { icon: '✓', class: styles.indicatorEmerald } }
  }
  if (topic.status !== 'uworld_in_progress' && topic.status !== 'incorrect_review') {
    return null
  }
  if (remaining == null || remaining === 0) {
    return null
  }
  return { state: `${remaining} remaining`, detail: null, indicator: { icon: '●', class: styles.indicatorBlue } }
}

function TopicCard({ topic, sourceTitle }) {
  const Icon = STATUS_ICON[topic.status] || Minus
  const badgeClass = STATUS_BADGE_CLASS[topic.status] || styles.badgeNeutral
  const learning = getLearningRow(topic)
  const uworld = getUworldRow(topic)
  const incorrect = getIncorrectRow(topic)
  const plannedMinutes = topic.personalizedLearningMinutes || topic.baseLearningMinutes

  return (
    <div className={styles.topicCard}>
      <div className={styles.topicHeader}>
        <div className={styles.topicTitleGroup}>
          <h3 className={styles.topicTitle}>{topic.topicTitle}</h3>
          <div className={styles.topicMeta}>
            {sourceTitle && <span>{sourceTitle}</span>}
            {topic.groupId && <span>· {topic.groupId}</span>}
          </div>
        </div>
        <span className={`${styles.badge} ${badgeClass}`}>
          <Icon size={10} />
          {TOPIC_STATUS_LABELS[topic.status] || topic.status}
        </span>
      </div>
      <div className={styles.pipeline}>
        {learning && <PipelineRow label="Learning" state={learning.state} detail={learning.detail} indicator={learning.indicator} />}
        {uworld && <PipelineRow label="UWorld" state={uworld.state} detail={uworld.detail} indicator={uworld.indicator} />}
        {incorrect && <PipelineRow label="Incorrect Review" state={incorrect.state} detail={incorrect.detail} indicator={incorrect.indicator} />}
        {plannedMinutes > 0 && (
          <PipelineRow label="Planned learning" state={`${plannedMinutes} min`} detail={null} />
        )}
      </div>
    </div>
  )
}

export default function TopicsView({ topics, sourceTitle }) {
  const [filter, setFilter] = useState('all')

  const summary = useMemo(() => summarizeTopics(topics), [topics])

  const filteredTopics = useMemo(() => filterTopics(topics, filter), [topics, filter])

  const groups = useMemo(() => groupTopicsByGroup(filteredTopics), [filteredTopics])

  return (
    <div className={styles.container}>
      <div className={styles.summary}>
        <span className={styles.summaryPrimary}>
          {summary.total} topic{summary.total !== 1 ? 's' : ''}
        </span>
        <div className={styles.summaryStats}>
          <span className={styles.summaryCompleted}>{summary.completed} Completed</span>
          <span className={styles.summarySep}>·</span>
          <span className={styles.summaryActive}>{summary.active} Active</span>
          <span className={styles.summarySep}>·</span>
          <span className={styles.summaryRemaining}>{summary.remaining} Remaining</span>
        </div>
        {summary.totalUworld > 0 && (
          <div className={styles.summaryUworldRow}>
            <span className={styles.summaryUworld}>
              UWorld {summary.completedUworld} / {summary.totalUworld}
            </span>
          </div>
        )}
      </div>

      <div className={styles.filters}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            className={`${styles.filterBtn} ${filter === tab.key ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className={styles.empty}>No topics match this filter.</div>
      ) : (
        <div className={styles.topicList}>
          {groups.map(group => (
            <div key={group.groupId || '__ungrouped__'}>
              {group.groupId && (
                <h3 className={styles.groupLabel}>{group.groupId}</h3>
              )}
              {group.topics.map(topic => (
                <TopicCard key={topic.id} topic={topic} sourceTitle={sourceTitle} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
