import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Settings, User, LayoutDashboard } from 'lucide-react'
import NotificationCenter from './NotificationCenter'
import styles from './TopBar.module.css'

export default function TopBar() {
  const { user, profile, userProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()

  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const avatarUrl = userProfile?.avatar_url
  const initials = (userProfile?.display_name || profile?.full_name || profile?.email || 'S')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'Student'

  return (
    <div className={styles.topBar}>
      <div className={styles.spacer} />
      <div className={styles.right}>
        <NotificationCenter user={user} />
        <div className={styles.userMenu} ref={menuRef}>
          <button className={styles.userBtn} onClick={() => setMenuOpen(!menuOpen)}>
            {avatarUrl ? (
              <img
                className={styles.userAvatar}
                src={avatarUrl}
                alt=""
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
              />
            ) : null}
            <div
              className={styles.userAvatar}
              style={{ display: avatarUrl ? 'none' : 'flex' }}
            >
              {initials}
            </div>
            <span className={styles.userName}>{displayName}</span>
            <ChevronDown size={14} className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ''}`} />
          </button>
          {menuOpen && (
            <div className={styles.dropdown}>
              <button className={styles.dropdownItem} onClick={() => { setMenuOpen(false); navigate(userProfile?.username ? `/u/${userProfile.username}` : `/profile/${user?.id}`) }}>
                <User size={15} /> Profile
              </button>
              <button className={styles.dropdownItem} onClick={() => { setMenuOpen(false); navigate('/dashboard') }}>
                <LayoutDashboard size={15} /> Dashboard
              </button>
              <button className={styles.dropdownItem} onClick={() => { setMenuOpen(false); navigate('/settings') }}>
                <Settings size={15} /> Settings
              </button>
              <div className={styles.dropdownDivider} />
              <button className={`${styles.dropdownItem} ${styles.dropdownDanger}`} onClick={async () => { await signOut(); navigate('/') }}>
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
