import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronDown, LogOut, Settings, User, LayoutDashboard, MessageCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import NotificationCenter from './NotificationCenter'
import StatusIndicator from './StatusIndicator'
import { usePresence } from '../context/PresenceContext'
import styles from './TopBar.module.css'

export default function TopBar() {
  const { user, profile, userProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()
  const { myStatus } = usePresence() || {}

  const { data: dmUnread = 0 } = useQuery({
    queryKey: queryKeys.dm.unread(),
    queryFn: () => apiGet('/dm/conversations').then(data => Array.isArray(data) ? data.reduce((sum, c) => sum + (c.unread_count || 0), 0) : 0),
    refetchInterval: 30_000,
    enabled: !!user,
    staleTime: 15_000,
  })

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
        <Link to="/messages" className={styles.navItem} style={{ position: 'relative' }}>
          <MessageCircle size={20} />
          {dmUnread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{dmUnread}</span>}
        </Link>
        <div className={styles.userMenu} ref={menuRef}>
          <button className={styles.userBtn} onClick={() => setMenuOpen(!menuOpen)}>
            <div style={{ position: 'relative' }}>
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
              <StatusIndicator status={myStatus || 'online'} />
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
