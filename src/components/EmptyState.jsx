export default function EmptyState({ icon: Icon, message, action, onAction, actionLabel }) {
  return (
    <div className="emptyState">
      <style>{`
        .emptyState {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 64px 32px; color: var(--mist); text-align: center;
          background: var(--card-bg); border: 1px dashed var(--card-border); border-radius: 20px;
        }
        .emptyIcon { opacity: 0.4; }
        .emptyMessage { font-size: 15px; color: var(--mist); max-width: 360px; line-height: 1.5; }
        .emptyAction {
          margin-top: 8px; padding: 10px 24px; background: var(--blueL); color: var(--blue);
          border: 1px solid rgba(79, 140, 255, 0.3); border-radius: 10px; font-size: 14px;
          font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
        }
        .emptyAction:hover { background: rgba(79, 140, 255, 0.2); }
      `}</style>
      {Icon && <div className="emptyIcon"><Icon size={40} strokeWidth={1} /></div>}
      <div className="emptyMessage">{message}</div>
      {action && onAction && (
        <button className="emptyAction" onClick={onAction}>{actionLabel || action}</button>
      )}
    </div>
  )
}
