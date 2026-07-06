import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { getSubjectName, getSubjectColor } from '../../lib/subjectColors'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="chartTooltip">
      <style>{`
        .chartTooltip {
          background: var(--card-bg); border: 1px solid var(--card-border);
          border-radius: 10px; padding: 10px 14px; font-size: 13px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .chartTooltipLabel { color: var(--text-primary); font-weight: 600; margin-bottom: 2px; }
        .chartTooltipSub { color: var(--mist); font-size: 12px; }
      `}</style>
      <div className="chartTooltipLabel">{d.name}</div>
      <div className="chartTooltipSub">{d.percentage}% · {d.questions} questions</div>
    </div>
  )
}

export default function DistributionDoughnut({ data }) {
  if (!data?.length) return null
  const chartData = data.map(d => ({ ...d, name: getSubjectName(d.subject) }))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', flexWrap: 'wrap' }}>
      <ResponsiveContainer width="60%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="questions"
            nameKey="name"
            animationDuration={600}
            animationEasing="ease-out"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={getSubjectColor(entry.subject)} fillOpacity={0.85} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 120 }}>
        {chartData.slice(0, 8).map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: getSubjectColor(entry.subject), flexShrink: 0,
            }} />
            <span style={{ color: '#F1F5F9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.name}
            </span>
            <span style={{ color: '#8899AA', fontWeight: 600 }}>{entry.percentage}%</span>
          </div>
        ))}
        {chartData.length > 8 && (
          <div style={{ color: '#8899AA', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            +{chartData.length - 8} more
          </div>
        )}
      </div>
    </div>
  )
}
