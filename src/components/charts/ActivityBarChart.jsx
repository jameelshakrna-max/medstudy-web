import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const BARS = [
  { key: 'questions', color: '#4F8CFF', name: 'Questions' },
  { key: 'cases', color: '#10B981', name: 'Cases' },
  { key: 'topics', color: '#F59E0B', name: 'Topics' },
]

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
        .chartTooltipValue { font-weight: 600; }
      `}</style>
      <div className="chartTooltipLabel">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="chartTooltipValue" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  )
}

export default function ActivityBarChart({ data }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="week"
          tick={{ fill: '#8899AA', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
        />
        <YAxis
          tick={{ fill: '#8899AA', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#8899AA' }}
          iconType="circle"
          iconSize={8}
        />
        {BARS.map(bar => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            fillOpacity={0.8}
            radius={[4, 4, 0, 0]}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
