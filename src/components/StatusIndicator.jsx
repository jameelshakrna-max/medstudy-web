const STATUS_COLORS = {
  online: '#22c55e',
  studying: '#eab308',
  reviewing: '#3b82f6',
  in_voice: '#ef4444',
  away: '#a78bfa',
  offline: '#525252',
}

const STATUS_LABELS = {
  online: 'Online',
  studying: 'Studying',
  reviewing: 'Reviewing',
  in_voice: 'In Voice',
  away: 'Away',
  offline: 'Offline',
}

const pulseKeyframes = `
@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
`

export default function StatusIndicator({ status, size = 8, className }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline
  const shouldPulse = status === 'studying' || status === 'in_voice'

  return (
    <>
      {shouldPulse && <style>{pulseKeyframes}</style>}
      <span
        className={className}
        title={STATUS_LABELS[status] || 'Offline'}
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          ...(shouldPulse
            ? { animation: 'statusPulse 2s ease-in-out infinite' }
            : {}),
        }}
      />
    </>
  )
}
