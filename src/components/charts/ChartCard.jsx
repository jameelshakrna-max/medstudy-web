import { useId } from 'react'
import EmptyState from '../EmptyState'
import { BarChart3 } from 'lucide-react'

export default function ChartCard({ title, children, isEmpty, emptyMessage, action, onAction, summary }) {
  const titleId = 'chartcard-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const summaryId = `${titleId}-summary`
  const accessibleName = summary ? `${title}. ${summary}` : title
  return (
    <div className="chartCard">
      <style>{`
        .chartCard {
          background: var(--card-bg); border: 1px solid var(--card-border);
          border-radius: 20px; padding: 20px; display: flex; flex-direction: column;
        }
        .chartTitle {
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
          color: var(--mist); text-transform: uppercase; letter-spacing: 0.5px;
          margin-bottom: 16px;
        }
        .chartSummary {
          color: var(--text-secondary); font-size: var(--text-xs);
          margin-top: -12px; margin-bottom: 16px; line-height: 1.4;
        }
        .chartBody { flex: 1; display: flex; align-items: center; justify-content: center; }
      `}</style>
      <div id={titleId} className="chartTitle">{title}</div>
      {summary && (
        <div id={summaryId} className="chartSummary">{summary}</div>
      )}
      <div className="chartBody">
        {isEmpty ? (
          <EmptyState
            icon={BarChart3}
            message={emptyMessage || 'No data available yet.'}
            action={action}
            onAction={onAction}
            actionLabel={action}
          />
        ) : (
          <div role="img" aria-label={accessibleName}>{children}</div>
        )}
      </div>
    </div>
  )
}
