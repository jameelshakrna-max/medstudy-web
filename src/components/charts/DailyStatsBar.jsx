import { Zap, Trophy, Calendar, Percent } from 'lucide-react'

export default function DailyStatsBar({ analytics, monthlyStats }) {
  const items = [
    { icon: Zap, number: analytics?.currentStreak ?? 0, label: 'Current Streak', color: 'var(--amber)' },
    { icon: Trophy, number: analytics?.longestStreak ?? 0, label: 'Longest Streak', color: 'var(--emerald)' },
    { icon: Calendar, number: monthlyStats?.daysThisMonth ?? 0, label: 'Days This Month', color: 'var(--blue)', sub: `of ${monthlyStats?.monthTotal ?? 1}` },
    { icon: Percent, number: `${monthlyStats?.completionPct ?? 0}%`, label: 'Monthly Completion', color: 'var(--indigo)' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 10,
      marginBottom: 16,
    }}>
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <div key={i} className="dailyStatItem">
            <style>{`
              .dailyStatItem {
                background: var(--card-bg); border: 1px solid var(--card-border);
                border-radius: 14px; padding: 14px 12px; text-align: center;
                position: relative; overflow: hidden;
              }
              .dailyStatItem::before {
                content: ''; position: absolute; top: 0; left: 0; right: 0;
                height: 2px; background: ${item.color};
                box-shadow: 0 1px 8px ${item.color};
              }
              .dailyStatIcon {
                width: 28px; height: 28px; border-radius: 8px;
                background: ${item.color}; opacity: 0.9;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 8px;
              }
              .dailyStatIcon svg { color: #0B1120; width: 14px; height: 14px; }
              .dailyStatNum {
                font-family: 'DM Serif Display', serif;
                font-size: 28px; color: var(--text-primary);
                line-height: 1; margin-bottom: 4px;
              }
              .dailyStatLabel { font-size: 10px; color: var(--mist); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
              .dailyStatSub { font-size: 10px; color: var(--mist); margin-top: 2px; }
            `}</style>
            <div className="dailyStatIcon"><Icon /></div>
            <div className="dailyStatNum">{item.number}</div>
            <div className="dailyStatLabel">{item.label}</div>
            {item.sub && <div className="dailyStatSub">{item.sub}</div>}
          </div>
        )
      })}
    </div>
  )
}
