import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { getSubjectName, getSubjectColor } from '../../lib/subjectColors'

function CustomTooltip({ active, payload, label }) {
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
      <div className="chartTooltipLabel">{label}</div>
      <div className="chartTooltipSub">{d.blocks} blocks · {d.questions} questions</div>
    </div>
  )
}

export default function SubjectBarChart({ data }) {
  if (!data?.length) return null
  const chartData = [...data]
    .sort((a, b) => b.avgScore - a.avgScore)
    .map(d => ({ ...d, name: getSubjectName(d.subject) }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: '#8899AA', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickFormatter={v => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#F1F5F9', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="avgScore" radius={[0, 6, 6, 0]} animationDuration={600} animationEasing="ease-out">
          {chartData.map((entry, i) => (
            <Cell key={i} fill={getSubjectColor(entry.subject)} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
