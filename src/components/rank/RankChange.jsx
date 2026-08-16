import s from './RankChange.module.css'

export default function RankChange({ change }) {
  if (change == null) return null
  if (change === 0) return <span className={`${s.rankChange} ${s.rankNeutral}`}>—</span>
  if (change > 0) return <span className={`${s.rankChange} ${s.rankUp}`}>↑{change}</span>
  return <span className={`${s.rankChange} ${s.rankDown}`}>↓{Math.abs(change)}</span>
}
