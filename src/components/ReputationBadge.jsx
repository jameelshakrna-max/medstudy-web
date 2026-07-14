const SIZES = { sm: 12, md: 14, lg: 16 }

export default function ReputationBadge({ reputation, size = 'md' }) {
  if (reputation == null) return null
  const level = Math.floor(Math.sqrt(reputation / 10))
  const fontSize = SIZES[size] || SIZES.md

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 10px',
        borderRadius: 8,
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        fontSize,
        fontWeight: 600,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
      }}
    >
      ⭐ {reputation} XP · Level {level}
    </span>
  )
}
