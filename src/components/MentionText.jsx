export default function MentionText({ text }) {
  if (!text) return null
  const parts = text.split(/(@[a-z0-9][a-z0-9-]{2,19})/gi)
  return (
    <span>
      {parts.map((part, i) => {
        if (/^@[a-z0-9][a-z0-9-]{2,19}$/i.test(part)) {
          const username = part.slice(1)
          return (
            <a
              key={i}
              href={`/u/${username}`}
              style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}
            >
              {part}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}
