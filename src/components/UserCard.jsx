import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, imageUrl } from '../lib/api'
import { useProfilePanel } from '../context/ProfilePanelContext'
import StatusIndicator from './StatusIndicator'
import Popover from './ui/Popover/Popover'

export default function UserCard({ userId, children, placement = 'bottom', onClick }) {
  const navigate = useNavigate()
  const { openProfile } = useProfilePanel()
  const [visible, setVisible] = useState(false)
  const [cardData, setCardData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)

  const enterTimer = useRef(null)
  const leaveTimer = useRef(null)

  const clearTimers = () => {
    clearTimeout(enterTimer.current)
    clearTimeout(leaveTimer.current)
  }

  const handleEnter = () => {
    clearTimers()
    enterTimer.current = setTimeout(() => setVisible(true), 400)
  }

  const handleLeave = () => {
    clearTimers()
    leaveTimer.current = setTimeout(() => setVisible(false), 200)
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    if (!visible || !userId || cardData) return
    setLoading(true)
    apiGet(`/users/${userId}/card`)
      .then((data) => {
        setCardData(data)
        setIsFollowing(data.is_following)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [visible, userId])

  const handleFollow = async (e) => {
    e.stopPropagation()
    try {
      if (isFollowing) {
        await apiPost(`/users/${userId}/unfollow`)
      } else {
        await apiPost(`/users/${userId}/follow`)
      }
      setIsFollowing(!isFollowing)
    } catch {}
  }

  const handleMessage = async (e) => {
    e.stopPropagation()
    try {
      const res = await apiPost(`/users/${userId}/dm`)
      setVisible(false)
      navigate(`/messages/${res.conversation_id}`)
    } catch {}
  }

  const side = placement === 'left' ? 'left' : 'bottom'

  return (
    <Popover open={visible} onOpenChange={setVisible}>
      <Popover.Anchor asChild>
        <span
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          style={{ display: 'inline' }}
        >
          {children}
        </span>
      </Popover.Anchor>
      <Popover.Content
        side={side}
        sideOffset={8}
        align="start"
        onPointerDownOutside={() => setVisible(false)}
        onMouseEnter={clearTimers}
        onMouseLeave={handleLeave}
        style={{ width: 280, padding: 16, borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading...
          </div>
        ) : cardData ? (
          <>
            <div
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
              onClick={() => { setVisible(false); if (onClick) { onClick(userId); } else { openProfile(userId); } }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {cardData.profile?.avatar_url ? (
                  <img
                    src={imageUrl(cardData.profile.avatar_url)}
                    alt=""
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'var(--navy3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 700,
                      color: 'var(--blue)',
                    }}
                  >
                    {(cardData.display_name || cardData.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 0, right: 0 }}>
                  <StatusIndicator status={cardData.status || 'offline'} size={10} />
                </div>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cardData.display_name || cardData.username}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  @{cardData.username}
                </div>
                {cardData.active_title && (
                  <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>
                    {cardData.active_title}
                  </div>
                )}
              </div>
            </div>

            {cardData.bio && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.4 }}>
                {cardData.bio.length > 80 ? cardData.bio.slice(0, 80) + '...' : cardData.bio}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 4,
                marginTop: 12,
                padding: '10px 0',
                borderTop: '1px solid var(--card-border)',
                borderBottom: '1px solid var(--card-border)',
              }}
            >
              {[
                { label: 'Hours', value: cardData.study_hours ?? 0 },
                { label: 'Followers', value: cardData.followers_count ?? 0 },
                { label: 'Communities', value: cardData.communities_count ?? 0 },
                { label: 'Rep', value: cardData.reputation ?? 0 },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleFollow}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 8,
                  border: isFollowing ? '1px solid var(--card-border)' : 'none',
                  background: isFollowing ? 'transparent' : 'var(--blue)',
                  color: isFollowing ? 'var(--text-secondary)' : '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={handleMessage}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 8,
                  border: '1px solid var(--card-border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Message
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            User not found
          </div>
        )}
      </Popover.Content>
    </Popover>
  )
}
