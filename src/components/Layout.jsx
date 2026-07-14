import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import {
  LayoutDashboard, BookOpen, BrainCircuit,
  BarChart3, Timer, ClipboardList, Settings,
  FolderOpen, LogOut, Menu, ChevronRight, Target, Users, UserSearch,
} from 'lucide-react'
import TopBar from './TopBar'
import styles from './Layout.module.css'

const NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/curriculum', icon: BookOpen, label: 'Curriculum' },
  { to: '/anki',       icon: BrainCircuit,  label: 'Anki' },
  { to: '/uworld',     icon: BarChart3,     label: 'Tracking Hub' },
  { to: '/goals',      icon: Target,        label: 'Goals' },
  { to: '/pomodoro',   icon: Timer,         label: 'Pomodoro' },
  { to: '/communities', icon: Users,        label: 'Communities' },
  { to: '/people',      icon: UserSearch,    label: 'People' },
  { to: '/resources',  icon: FolderOpen,    label: 'Resources' },
  { to: '/sessions',   icon: ClipboardList, label: 'Sessions' },
  { to: '/settings',   icon: Settings,      label: 'Settings' }
]

const PLAN_ICONS = { pro: 'Pro', core: 'Core', free: 'Free' }

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarTop}>
          <div className={styles.logo}>
            <img src="/icon.svg" alt="MedStudy" className={styles.logoIcon} />
            <span className={styles.logoText}>MedStudy OS</span>
          </div>

        </div>

        <nav className={styles.nav}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} strokeWidth={1.5} className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
              <ChevronRight size={14} strokeWidth={1.5} className={styles.navChevron} />
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.planBadge}>
            {PLAN_ICONS[profile?.plan] || 'Free'}
          </div>
          <button className={styles.signOutBtn} onClick={handleSignOut}>
            <LogOut size={14} strokeWidth={1.5} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.mobileHeader}>
          <button className={styles.menuBtn} onClick={() => setMobileOpen(!mobileOpen)}>
            <Menu size={20} strokeWidth={1.5} />
          </button>
        </div>
        <TopBar />
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
