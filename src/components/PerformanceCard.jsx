export default function PerformanceCard({ title, score, maxScore = 100, tier, tierColor, breakdown = [], sub }) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0

  return (
    <div className="perfCard">
      <style>{`
        .perfCard {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 28px;
          backdrop-filter: blur(12px);
          position: relative;
          overflow: hidden;
        }
        .perfCard::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: ${tierColor || 'var(--blue)'};
          box-shadow: 0 2px 12px ${tierColor || 'var(--blue)'};
        }
        .perfHeader { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 16px; }
        .perfTitle { font-size: 13px; color: var(--mist); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
        .perfScoreWrap { text-align: right; }
        .perfScore { font-family: 'DM Serif Display', serif; font-size: 44px; color: var(--text-primary); line-height: 1; }
        .perfMax { font-size: 14px; color: var(--mist); }
        .perfTier { font-size: 12px; font-weight: 700; margin-top: 4px; }
        .perfSub { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5; }
        .perfBar { height: 6px; background: var(--input-bg); border-radius: 3px; overflow: hidden; margin-bottom: 20px; }
        .perfFill { height: 100%; border-radius: 3px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
        .perfBreakdownTitle { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mist); margin-bottom: 10px; }
        .perfRow { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--input-bg); font-size: 13px; }
        .perfRow:last-child { border-bottom: none; }
        .perfRowLabel { color: var(--text-secondary); }
        .perfRowScore { font-weight: 600; color: var(--text-primary); }
        .perfRowDetail { font-size: 11px; color: var(--mist); font-weight: 400; }
        .perfRowWeight { font-size: 10px; color: var(--mist); margin-left: 6px; }
      `}</style>

      <div className="perfHeader">
        <div>
          <div className="perfTitle">{title}</div>
          {sub && <div className="perfSub">{sub}</div>}
        </div>
        <div className="perfScoreWrap">
          <div>
            <span className="perfScore">{score}</span>
            <span className="perfMax">/{maxScore}</span>
          </div>
          {tier && <div className="perfTier" style={{ color: tierColor || 'var(--blue)' }}>{tier}</div>}
        </div>
      </div>

      <div className="perfBar"><div className="perfFill" style={{ width: `${pct}%`, background: tierColor || 'var(--blue)' }} /></div>

      {breakdown.length > 0 && (
        <div>
          <div className="perfBreakdownTitle">How this is calculated</div>
          {breakdown.map((b, i) => (
            <div key={i} className="perfRow">
              <span className="perfRowLabel">
                {b.label}
                <span className="perfRowWeight">({Math.round(b.weight * 100)}%)</span>
              </span>
              <span>
                <span className="perfRowScore">{b.score}</span>
                <span className="perfMax">/{b.max || 100}</span>
                {b.detail && <span className="perfRowDetail"> · {b.detail}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
