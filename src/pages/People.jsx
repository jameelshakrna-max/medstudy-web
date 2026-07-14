import { useState, useEffect } from 'react'
import { Search, X, Loader2, Users, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { imageUrl, apiGet } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { useProfilePanel } from '../context/ProfilePanelContext'
import s from './People.module.css'

export default function People() {
  const { openProfile, preloadProfile, cancelPreload } = useProfilePanel()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [avatarErrors, setAvatarErrors] = useState({})

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: suggestedData, isLoading } = useQuery({
    queryKey: queryKeys.people.suggested(10),
    queryFn: () => apiGet('/users/suggested?limit=10').then(d => d.users || []),
    staleTime: 60_000,
  })

  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: queryKeys.people.search(debouncedQuery),
    queryFn: () => apiGet(`/users/search?q=${encodeURIComponent(debouncedQuery)}`).then(d => d.users || []),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  })

  const suggested = suggestedData || []
  const results = searchData || []

  const renderCard = (user, extra) => (
    <div
      key={user.user_id}
      className={s.card}
      onClick={() => openProfile(user.user_id)}
      onMouseEnter={() => preloadProfile(user.user_id)}
      onMouseLeave={cancelPreload}
    >
      <div className={s.avatar}>
        {!avatarErrors[user.user_id] && user.avatar_url ? (
          <img src={imageUrl(user.avatar_url)} alt="" onError={() => setAvatarErrors(p => ({...p, [user.user_id]: true}))} loading="lazy" />
        ) : (
          (user.display_name || user.user_name || '?')[0]?.toUpperCase()
        )}
      </div>
      <div className={s.info}>
        <div className={s.name}>{user.display_name || user.user_name}</div>
        <div className={s.username}>@{user.user_name}</div>
        {user.bio && <div className={s.bio}>{user.bio}</div>}
      </div>
      {extra}
    </div>
  )

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>People</h1>
      </div>

      <div className={s.searchWrap}>
        <Search size={16} strokeWidth={1.5} className={s.searchIcon} />
        <input
          className={s.searchInput}
          type="text"
          placeholder="Search users by username..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {query && <X size={14} className={s.clearBtn} onClick={() => { setQuery(''); setDebouncedQuery('') }} />}
      </div>

      {isLoading ? (
        <div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading...</div>
      ) : debouncedQuery.length >= 2 ? (
        searching ? (
          <div className={s.loading}><Loader2 size={20} className={s.spinner} /> Searching...</div>
        ) : results.length === 0 ? (
          <div className={s.empty}><Users size={40} strokeWidth={1} /><p>No users found</p></div>
        ) : (
          <div className={s.grid}>
            {results.map(u => renderCard(u))}
          </div>
        )
      ) : suggested.length > 0 ? (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Suggested Connections</h2>
          <p className={s.hint}>People who share communities with you</p>
          <div className={s.grid}>
            {suggested.map(u => renderCard(u,
              u.shared_communities > 0 && (
                <span className={s.sharedBadge}>{u.shared_communities} shared</span>
              )
            ))}
          </div>
        </section>
      ) : (
        <div className={s.empty}>
          <UserPlus size={40} strokeWidth={1} />
          <p>Search for users or join communities to find connections</p>
        </div>
      )}
    </div>
  )
}
