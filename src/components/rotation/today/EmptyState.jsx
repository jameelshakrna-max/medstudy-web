export default function EmptyState({ title = 'Nothing here yet', description }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
    </div>
  )
}
