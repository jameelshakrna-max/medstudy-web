import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chartTooltip">
      <style>{`
        .chartTooltip {
          background: var(--card-bg); border: 1px solid var(--card-border);
          border-radius: 10px; padding: 10px 14px; font-size: 13px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .chartTooltipLabel { color: var(--mist); margin-bottom: 4px; }
        .chartTooltipValue { color: var(--text-primary); font-weight: 600; }
      `}</style>
      <div className="chartTooltipLabel">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="chartTooltipValue" style={{ color: entry.color }}>
          {entry.name}: {entry.value}{entry.name === 'avgScore' || entry.name === 'score' ? '%' : ''}
        </div>
      ))}
    </div>
  )
}

export default function TrendLineChart({ data, xKey = 'week', yKey = 'avgScore', name = 'Score', color = '#4F8CFF', yUnit = '%' }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#8899AA', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
        />
        <YAxis
          tick={{ fill: '#8899AA', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={[0, 'auto']}
          tickFormatter={v => `${v}${yUnit}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey={yKey}
          name={name}
          stroke={color}
          strokeWidth={2.5}
          dot={{ fill: color, stroke: 'var(--card-bg)', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, fill: color, stroke: 'var(--card-bg)', strokeWidth: 2 }}
          animationDuration={600}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
