export default function StatCard({ icon: Icon, number, label, color = 'var(--blue)', sub }) {
  return (
    <div className="statCard" style={{ '--c': color }}>
      <style>{`
        .statCard {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 24px 20px 20px;
          text-align: center;
          transition: all 0.3s;
          backdrop-filter: blur(12px);
          position: relative;
          overflow: hidden;
        }
        .statCard::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--c);
          box-shadow: 0 2px 12px var(--c);
        }
        .statCard:hover { transform: translateY(-3px); box-shadow: 0 16px 48px rgba(0,0,0,0.2); }
        .statIconWrap {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--c); opacity: 0.9;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 12px;
        }
        .statIconWrap svg { color: #0B1120; }
        .statNum { font-family: 'DM Serif Display', serif; font-size: 40px; color: var(--text-primary); line-height: 1; margin-bottom: 6px; }
        .statLabel { font-size: 11px; color: var(--mist); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
        .statSub { font-size: 11px; color: var(--mist); margin-top: 4px; }
        @media (max-width: 480px) {
          .statCard { padding: 18px 14px 16px; }
          .statNum { font-size: 32px; }
          .statIconWrap { width: 30px; height: 30px; }
          .statIconWrap svg { width: 18px; height: 18px; }
        }
      `}</style>
      {Icon && <div className="statIconWrap"><Icon size={22} strokeWidth={1.5} /></div>}
      <div className="statNum">{number}</div>
      <div className="statLabel">{label}</div>
      {sub && <div className="statSub">{sub}</div>}
    </div>
  )
}
