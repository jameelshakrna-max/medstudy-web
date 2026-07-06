import EmptyState from '../EmptyState'
import { BarChart3 } from 'lucide-react'

export default function ChartCard({ title, children, isEmpty, emptyMessage, action, onAction }) {
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
        .chartBody { flex: 1; display: flex; align-items: center; justify-content: center; }
      `}</style>
      <div className="chartTitle">{title}</div>
      <div className="chartBody">
        {isEmpty ? (
          <EmptyState
            icon={BarChart3}
            message={emptyMessage || 'No data available yet.'}
            action={action}
            onAction={onAction}
            actionLabel={action}
          />
        ) : children}
      </div>
    </div>
  )
}
