import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronDown, LogOut, Settings, User, LayoutDashboard, MessageCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import NotificationCenter from './NotificationCenter'
import StatusIndicator from './StatusIndicator'
import { usePresence } from '../context/PresenceContext'
import Dropdown from './ui/Dropdown/Dropdown'
import styles from './TopBar.module.css'

export default function TopBar({ sidebarCollapsed, onToggleSidebar }) {
  const { user, profile, userProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const { myStatus } = usePresence() || {}

  const { data: dmUnread = 0 } = useQuery({
    queryKey: queryKeys.dm.unread(),
    queryFn: () => apiGet('/dm/conversations').then(data => Array.isArray(data) ? data.reduce((sum, c) => sum + (c.unread_count || 0), 0) : 0),
    refetchInterval: 30_000,
    enabled: !!user,
    staleTime: 15_000,
  })

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
      <button className={styles.toggleBtn} onClick={onToggleSidebar} title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
        {sidebarCollapsed ? <PanelLeftOpen size={18} strokeWidth={1.5} /> : <PanelLeftClose size={18} strokeWidth={1.5} />}
      </button>
      <div className={styles.spacer} />
      <div className={styles.right}>
        <NotificationCenter user={user} />
        <Link to="/messages" className={styles.navItem} style={{ position: 'relative' }}>
          <MessageCircle size={20} />
          {dmUnread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{dmUnread}</span>}
        </Link>
        <div className={styles.userMenu}>
          <Dropdown>
            <Dropdown.Trigger asChild>
              <button className={styles.userBtn}>
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
                <ChevronDown size={14} className={styles.chevron} />
              </button>
            </Dropdown.Trigger>
            <Dropdown.Content>
              <Dropdown.Item onSelect={() => navigate(userProfile?.username ? `/u/${userProfile.username}` : `/profile/${user?.id}`)}>
                <User size={15} /> Profile
              </Dropdown.Item>
              <Dropdown.Item onSelect={() => navigate('/dashboard')}>
                <LayoutDashboard size={15} /> Dashboard
              </Dropdown.Item>
              <Dropdown.Item onSelect={() => navigate('/settings')}>
                <Settings size={15} /> Settings
              </Dropdown.Item>
              <Dropdown.Separator />
              <Dropdown.Item className={styles.dropdownDanger} onSelect={async () => { await signOut(); navigate('/') }}>
                <LogOut size={15} /> Sign Out
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown>
        </div>
      </div>
    </div>
  )
}
