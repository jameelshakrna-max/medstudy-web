export default function ProgressCard({ name, status, progress, color = 'var(--blue)', onClick, children }) {
  const statusColor = s => s === 'In Progress' ? 'var(--blue)' : s === 'Complete' || s === 'Mastered' ? 'var(--emerald)' : s === 'Reviewing' ? 'var(--indigo)' : 'var(--mist)'

  return (
    <div className="progCard" style={{ '--pc': color }} onClick={onClick}>
      <style>{`
        .progCard {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-left: 3px solid var(--pc);
          border-radius: 16px;
          padding: 18px;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(12px);
          cursor: ${onClick ? 'pointer' : 'default'};
        }
        .progCard:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(0,0,0,0.2); }
        .progCardTop { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .progCardName { font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .progCardStatus { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 100px; }
        .progBar { height: 4px; background: var(--input-bg); border-radius: 2px; overflow: hidden; }
        .progFill { height: 100%; border-radius: 2px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
        .progChildren { margin-top: 12px; }
      `}</style>
      <div className="progCardTop">
        <span className="progCardName">{name}</span>
        {status && <span className="progCardStatus" style={{ color: statusColor(status), background: statusColor(status).replace(')', ',0.12)').replace('var(', 'rgba(') }}>{status}</span>}
      </div>
      {typeof progress === 'number' && (
        <div className="progBar"><div className="progFill" style={{ width: `${Math.min(100, progress)}%`, background: color }} /></div>
      )}
      {children && <div className="progChildren">{children}</div>}
    </div>
  )
}
