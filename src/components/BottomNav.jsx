import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, BrainCircuit, MessageSquare, User } from 'lucide-react'
import s from './BottomNav.module.css'

const TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/communities', icon: Users, label: 'Communities' },
  { to: '/anki', icon: BrainCircuit, label: 'Study' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/settings', icon: User, label: 'Profile' },
]

export default function BottomNav() {
  return (
    <nav className={s.bar}>
      {TABS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}
          end={to === '/settings'}
        >
          <Icon size={20} strokeWidth={1.5} />
          <span className={s.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
