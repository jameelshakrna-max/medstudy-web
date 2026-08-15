export default function SummaryCard({ title, value, sub, color = 'var(--blue)', progress, accent, onClick }) {
  const summaryStyles = `
    .summaryCard {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-top: 3px solid var(--sc);
      border-radius: 16px;
      padding: 20px;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(12px);
      position: relative;
      overflow: hidden;
    }
    .summaryCard:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.2); }
    .summaryCardButton {
      font-family: inherit;
      text-align: left;
      width: 100%;
      cursor: pointer;
    }
    .summaryTitle { font-size: 13px; color: var(--mist); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .summaryValue { font-family: 'DM Serif Display', serif; font-size: 32px; color: var(--text-primary); line-height: 1.1; }
    .summarySub { font-size: 12px; color: var(--mist); margin-top: 4px; }
    .summaryBar { height: 4px; background: var(--input-bg); border-radius: 2px; overflow: hidden; margin-top: 12px; }
    .summaryFill { height: 100%; border-radius: 2px; background: var(--sc); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
    .summaryAccent { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 100px; margin-top: 8px; background: rgba(79,140,255,0.12); color: var(--blue); }
  `
  const inner = (
    <>
      <div className="summaryTitle">{title}</div>
      <div className="summaryValue">{value}</div>
      {sub && <div className="summarySub">{sub}</div>}
      {typeof progress === 'number' && (
        <div className="summaryBar"><div className="summaryFill" style={{ width: `${Math.min(100, progress)}%` }} /></div>
      )}
      {accent && <div className="summaryAccent">{accent}</div>}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className="summaryCard summaryCardButton" onClick={onClick} style={{ '--sc': color }}>
        <style>{summaryStyles}</style>
        {inner}
      </button>
    )
  }

  return (
    <div className="summaryCard" style={{ '--sc': color }}>
      <style>{summaryStyles}</style>
      {inner}
    </div>
  )
}
