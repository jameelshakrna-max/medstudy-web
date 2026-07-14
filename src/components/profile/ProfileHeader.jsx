import { Link } from 'react-router-dom'
import { MapPin, ExternalLink, Calendar, Pencil, UserPlus, UserMinus, MessageCircle, Trophy, Loader2 } from 'lucide-react'
import { imageUrl } from '../../lib/api'
import AvatarUpload from '../AvatarUpload'
import s from '../../pages/ProfilePage.module.css'

export default function ProfileHeader({ profile, userId, isOwnProfile, isFollowing, followLoading, user, onFollowToggle, onStartDM }) {
  const displayName = profile.display_name || profile.user_name || 'Student'
  const joinDate = profile.joined_at ? new Date(profile.joined_at) : null

  return (
    <div className={s.headerCard}>
      <div className={s.bannerWrap}>
        {profile.banner_url ? (
          <img className={s.bannerImg} src={imageUrl(profile.banner_url)} alt="Profile banner" />
        ) : (
          <div className={s.bannerPlaceholder}>
            <Trophy size={40} strokeWidth={1} style={{ opacity: 0.3 }} />
          </div>
        )}
      </div>

      <div className={s.avatarRow}>
        <div className={s.avatarWrap}>
          <AvatarUpload
            url={profile.avatar_url}
            size="lg"
            userName={displayName}
            userId={userId}
            editable={isOwnProfile}
            onChange={() => {}}
          />
        </div>
        <div className={s.profileInfo} style={{ flex: 1 }}>
          <h1 className={s.displayName}>{displayName}</h1>
          {profile.username && <p className={s.usernameText}>@{profile.username}</p>}
          {profile.active_title && (
            <div className={s.activeTitle}>{profile.active_title}</div>
          )}
        </div>
        {isOwnProfile ? (
          <Link to="/settings" className={s.editBtn}>
            <Pencil size={14} /> Edit Profile
          </Link>
        ) : user ? (
          <button
            className={`${s.editBtn} ${isFollowing ? s.followingBtn : ''}`}
            onClick={onFollowToggle}
            disabled={followLoading}
          >
            {followLoading ? (
              <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : isFollowing ? (
              <><UserMinus size={14} /> Following</>
            ) : (
              <><UserPlus size={14} /> Follow</>
            )}
          </button>
        ) : null}
        {user && !isOwnProfile && (
          <button className={s.editBtn} onClick={onStartDM} style={{ marginLeft: 8 }}>
            <MessageCircle size={14} /> Message
          </button>
        )}
      </div>

      <div className={s.metaRow}>
        {profile.location && (
          <span className={s.metaItem}><MapPin size={14} /> {profile.location}</span>
        )}
        {profile.website && (
          <a className={s.metaItem} href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>
            <ExternalLink size={14} /> {profile.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        {joinDate && (
          <span className={s.metaItem}><Calendar size={14} /> Joined {joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        )}
      </div>

      <div className={s.statsBar}>
        <div className={s.statItem}>
          <div className={s.statValue}>{Math.round(profile.stats?.study_hours || 0)}</div>
          <div className={s.statLabel}>Study Hours</div>
        </div>
        <div className={s.statItem}>
          <div className={s.statValue}>{profile.stats?.questions_answered || 0}</div>
          <div className={s.statLabel}>Questions</div>
        </div>
        <div className={s.statItem}>
          <div className={s.statValue}>{profile.stats?.current_streak || 0}</div>
          <div className={s.statLabel}>Day Streak</div>
        </div>
        <div className={s.statItem}>
          <div className={s.statValue}>{profile.stats?.communities_count || profile.communities?.length || 0}</div>
          <div className={s.statLabel}>Communities</div>
        </div>
        <div className={s.statItem}>
          <div className={s.statValue}>{profile.stats?.followers_count || 0}</div>
          <div className={s.statLabel}>Followers</div>
        </div>
        <div className={s.statItem}>
          <div className={s.statValue}>{profile.stats?.following_count || 0}</div>
          <div className={s.statLabel}>Following</div>
        </div>
      </div>
    </div>
  )
}
