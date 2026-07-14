import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2, Users, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { imageUrl } from '../lib/api'
import s from './People.module.css'

const API = import.meta.env.VITE_API_URL || '/api'

async function apiJson(res) {
  if (!res.ok) {
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text).error || text } catch { msg = text.slice(0, 200) }
    throw new Error(msg || `Request failed (${res.status})`)
  }
  return res.json()
}

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

export default function People() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [suggested, setSuggested] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [avatarErrors, setAvatarErrors] = useState({})

  useEffect(() => {
    apiGet('/users/suggested?limit=10')
      .then(data => setSuggested(data.users || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const data = await apiGet(`/users/search?q=${encodeURIComponent(q)}`)
      setResults(data.users || [])
    } catch {}
    setSearching(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const renderCard = (user, extra) => (
    <div key={user.user_id} className={s.card} onClick={() => navigate('/profile/' + user.user_id)}>
      <div className={s.avatar}>
        {!avatarErrors[user.user_id] && user.avatar_url ? (
          <img src={imageUrl(user.avatar_url)} alt="" onError={() => setAvatarErrors(p => ({...p, [user.user_id]: true}))} />
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
        {query && <X size={14} className={s.clearBtn} onClick={() => { setQuery(''); setResults([]) }} />}
      </div>

      {loading ? (
        <div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading...</div>
      ) : query.length >= 2 ? (
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
