import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, CalendarRange, Timer, MoreHorizontal,
  BookOpen, BrainCircuit, FolderOpen, BarChart3, Target, Users, FlaskConical, Settings,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import MobileSheet from './ui/MobileSheet/MobileSheet'
import { UserLink, Badge } from './ui'
import { getProfilePath, isFocusPath, matchesPath } from '../lib/nav'
import s from './BottomNav.module.css'

const TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home', isActive: (p) => matchesPath(p, '/dashboard') },
  { to: '/rotations', icon: CalendarRange, label: 'Plan', isActive: (p) => matchesPath(p, '/rotations') },
  { to: '/focus', icon: Timer, label: 'Focus', isActive: isFocusPath },
]

const MORE_ITEMS = [
  { to: '/curriculum', icon: BookOpen, label: 'Curriculum' },
  { to: '/anki', icon: BrainCircuit, label: 'Anki' },
  { to: '/resources', icon: FolderOpen, label: 'Resources' },
  { to: '/progress', icon: BarChart3, label: 'Progress' },
  { to: '/goals', icon: Target, label: 'Goals' },
  { to: '/communities', icon: Users, label: 'Community' },
  { to: '/research', icon: FlaskConical, label: 'Research' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function BottomNav() {
  const { user, profile, userProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const pathname = location.pathname
  const isMoreActive = !TABS.some(tab => tab.isActive(pathname))

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const planLabel = profile?.plan
    ? profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)
    : 'Free'

  function goToProfile() {
    const path = getProfilePath(userProfile, user)
    if (path) navigate(path)
    setOpen(false)
  }

  return (
    <>
      <nav className={s.bar} aria-label="Bottom navigation">
        {TABS.map(({ to, icon: Icon, label, isActive }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive: active }) => `${s.tab} ${active ? s.active : ''}`}
            isActive={(match, loc) => isActive(loc.pathname)}
          >
            <Icon size={20} strokeWidth={1.5} />
            <span className={s.label}>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`${s.tab} ${isMoreActive ? s.active : ''}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="More menu"
        >
          <MoreHorizontal size={20} strokeWidth={1.5} />
          <span className={s.label}>More</span>
        </button>
      </nav>

      <MobileSheet open={open} onOpenChange={setOpen} title="More" closeLabel="Close menu">
        <div className={s.sheetList}>
          {MORE_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={s.sheetItem} onClick={() => setOpen(false)}>
              <Icon size={18} strokeWidth={1.5} className={s.sheetIcon} />
              <span>{label}</span>
            </NavLink>
          ))}
          {user && (
            <UserLink
              userId={user.id}
              username={userProfile?.username}
              displayName={userProfile?.display_name || profile?.full_name || profile?.email?.split('@')[0] || 'Student'}
              avatar={userProfile?.avatar_url}
              showHandle={!!userProfile?.username}
              badge={<Badge tone="brand" size="sm">{planLabel}</Badge>}
              className={s.sheetItem}
              onClick={goToProfile}
            />
          )}
        </div>
      </MobileSheet>
    </>
  )
}
