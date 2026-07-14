import { useNavigate } from 'react-router-dom'

export default function MentionText({ text }) {
  const navigate = useNavigate()
  if (!text) return null
  const parts = text.split(/(@[a-z0-9][a-z0-9-]{2,19})/gi)
  return (
    <span>
      {parts.map((part, i) => {
        if (/^@[a-z0-9][a-z0-9-]{2,19}$/i.test(part)) {
          const username = part.slice(1)
          return (
            <span
              key={i}
              onClick={() => navigate(`/u/${username}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/u/${username}`)}
              style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}
