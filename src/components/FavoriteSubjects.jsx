export default function FavoriteSubjects({ subjects }) {
  if (!subjects) return null

  let list = subjects
  if (typeof subjects === 'string') {
    try {
      list = JSON.parse(subjects)
    } catch {
      return null
    }
  }

  if (!Array.isArray(list) || list.length === 0) return null

  const top = list.slice(0, 5)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {top.map((s, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 13,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          {s.emoji && <span>{s.emoji}</span>}
          {s.name}
        </span>
      ))}
    </div>
  )
}
