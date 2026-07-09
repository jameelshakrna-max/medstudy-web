import { User, GraduationCap, Star, Shield, Crown } from 'lucide-react'
import { ROLES } from '../lib/permissions'

const ROLE_CONFIG = {
  [ROLES.MEMBER]: {
    label: 'Member',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.12)',
    Icon: User,
  },
  [ROLES.SCHOLAR]: {
    label: 'Scholar',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    Icon: GraduationCap,
  },
  [ROLES.MENTOR]: {
    label: 'Mentor',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    Icon: Star,
  },
  [ROLES.MODERATOR]: {
    label: 'Moderator',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.12)',
    Icon: Shield,
  },
  [ROLES.ADMINISTRATOR]: {
    label: 'Administrator',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    Icon: Crown,
  },
}

export default function RoleBadge({ role, size = 'sm' }) {
  const config = ROLE_CONFIG[role]
  if (!config) return null
  const { label, color, bg, Icon } = config
  const isSm = size === 'sm'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? 3 : 5,
        padding: isSm ? '1px 7px' : '3px 12px',
        borderRadius: 100,
        background: bg,
        color,
        fontSize: isSm ? 10 : 12,
        fontWeight: 600,
        lineHeight: isSm ? '18px' : '22px',
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={isSm ? 11 : 14} strokeWidth={2} />
      {label}
    </span>
  )
}
