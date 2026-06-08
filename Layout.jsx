import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import MiniTimer from './MiniTimer'
import styles from './Layout.module.css'

const NAV = [
  { to: '/dashboard',  icon: '🏠', label: 'Dashboard' },
  { to: '/curriculum', icon: '📚', label: 'Curriculum' },
  { to: '/anki',       icon: '🃏', label: 'Anki' },
  { to: '/uworld',     icon: '📊', label: 'UWorld' },
  { to: '/pomodoro',   icon: '🍅', label: 'Pomodoro' },
  { to: '/sessions',   icon: '📖', label: 'Sessions' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
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
          <div className={styles.logo}>🏥 MedStudy OS</div>
          <div className={styles.userChip}>
            <div className={styles.userDot} />
            <span>{profile?.full_name || profile?.email?.split('@')[0] || 'Student'}</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.navLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.planBadge}>
            {profile?.plan === 'pro' ? '🏆 Pro' : profile?.plan === 'core' ? '🎓 Core' : '🆓 Free'}
          </div>
          <button className={styles.signOutBtn} onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.mobileHeader}>
          <button className={styles.menuBtn} onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
          <div className={styles.mobileLogo}>🏥 MedStudy OS</div>
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>

      {/* Floating Mini Timer — visible on all pages except /pomodoro */}
      <MiniTimer />
    </div>
  )
}
