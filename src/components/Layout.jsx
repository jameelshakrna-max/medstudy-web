import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import {
  LayoutDashboard, Timer, CalendarRange,
  BookOpen, BrainCircuit, FolderOpen,
  BarChart3, Target,
  Users, FlaskConical,
  Settings, LogOut, Menu,
} from 'lucide-react'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import { BrandLogo, Tooltip, TooltipProvider, UserLink, Badge } from './ui'
import { getProfilePath, isFocusPath, isProgressPath, matchesPath } from '../lib/nav'
import styles from './Layout.module.css'

const NAV_GROUPS = [
  {
    label: 'Today',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
      { to: '/focus', icon: Timer, label: 'Focus' },
      { to: '/rotations', icon: CalendarRange, label: 'Study Plan' },
    ],
  },
  {
    label: 'Study',
    items: [
      { to: '/curriculum', icon: BookOpen, label: 'Curriculum' },
      { to: '/anki', icon: BrainCircuit, label: 'Anki' },
      { to: '/resources', icon: FolderOpen, label: 'Resources' },
    ],
  },
  {
    label: 'Progress',
    items: [
      { to: '/progress', icon: BarChart3, label: 'Progress' },
      { to: '/goals', icon: Target, label: 'Goals' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/communities', icon: Users, label: 'Community' },
      { to: '/research', icon: FlaskConical, label: 'Research' },
    ],
  },
]

function isActiveFor(to, pathname) {
  if (to === '/focus') return isFocusPath(pathname)
  if (to === '/progress') return isProgressPath(pathname)
  return matchesPath(pathname, to)
}

export default function Layout() {
  const { user, profile, userProfile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true' } catch { return false }
  })

  const profilePath = getProfilePath(userProfile, user)
  const planLabel = profile?.plan
    ? profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)
    : 'Free'

  function toggleSidebar() {
    setSidebarCollapsed(v => {
      const next = !v
      try { localStorage.setItem('sidebarCollapsed', next) } catch {}
      return next
    })
  }

  const sidebarSwipe = useSwipeable({
    onSwipedRight: () => { if (window.innerWidth <= 768 && !mobileOpen) setMobileOpen(true) },
    onSwipedLeft: () => { if (window.innerWidth <= 768 && mobileOpen) setMobileOpen(false) },
    delta: 40,
    trackTouch: true,
    trackMouse: false,
    preventScrollOnSwipe: false,
  })

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  function renderNavItem(item) {
    const { to, icon: Icon, label } = item
    const link = (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
        onClick={() => setMobileOpen(false)}
        isActive={(match, loc) => isActiveFor(to, loc.pathname)}
      >
        <Icon size={18} strokeWidth={1.5} className={styles.navIcon} />
        <span className={styles.navLabel}>{label}</span>
      </NavLink>
    )
    if (!sidebarCollapsed) return link
    return (
      <Tooltip key={to}>
        <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="right">{label}</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip>
    )
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.sidebarTop}>
          {sidebarCollapsed
            ? <BrandLogo variant="symbol" size={36} linkToHome className={styles.logoSymbol} />
            : <BrandLogo variant="horizontal" size={180} linkToHome />}
        </div>

        <nav className={styles.nav} aria-label="Primary">
          <TooltipProvider delayDuration={300}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} className={styles.navGroup}>
                <span className={styles.groupLabel}>{group.label}</span>
                {group.items.map(renderNavItem)}
              </div>
            ))}
          </TooltipProvider>
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.bottomLinks}>
            <NavLink
              to="/settings"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
              onClick={() => setMobileOpen(false)}
              isActive={(match, loc) => matchesPath(loc.pathname, '/settings')}
            >
              <Settings size={18} strokeWidth={1.5} className={styles.navIcon} />
              <span className={styles.navLabel}>Settings</span>
            </NavLink>
            {user && (
              <UserLink
                userId={user.id}
                username={userProfile?.username}
                displayName={userProfile?.display_name || profile?.full_name || profile?.email?.split('@')[0] || 'Student'}
                avatar={userProfile?.avatar_url}
                showName={!sidebarCollapsed}
                badge={!sidebarCollapsed ? <Badge tone="brand" size="sm">{planLabel}</Badge> : null}
                className={`${styles.navItem} ${styles.profileItem}`}
                onClick={() => { if (profilePath) navigate(profilePath) }}
              />
            )}
          </div>
          <button className={styles.signOutBtn} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={1.5} className={styles.signOutIcon} />
            <span className={styles.signOutLabel}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <main className={`${styles.main} ${sidebarCollapsed ? styles.mainCollapsed : ''}`} {...sidebarSwipe}>
        <div className={styles.mobileHeader}>
          <button className={styles.menuBtn} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation menu">
            <Menu size={20} strokeWidth={1.5} />
          </button>
          <BrandLogo variant="horizontal" size={150} linkToHome />
        </div>
        <TopBar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
