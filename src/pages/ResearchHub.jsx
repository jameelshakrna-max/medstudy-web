import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { useAuth } from '../context/AuthContext'
import { useProfilePanel } from '../context/ProfilePanelContext'
import {
  Search, Plus, ExternalLink, ArrowUp, MessageSquare, CheckCircle,
  Bookmark, BookmarkCheck, Flag, Loader2, X, Send, ChevronDown, Clock, Users, Trash2
} from 'lucide-react'
import s from './ResearchHub.module.css'

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'questionnaire', label: 'Questionnaire' },
  { value: 'collaboration', label: 'Collaboration' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'statistics', label: 'Statistics Help' },
  { value: 'literature', label: 'Literature Review' },
  { value: 'data_collection', label: 'Data Collection' },
  { value: 'case_report', label: 'Case Report' },
  { value: 'funding', label: 'Funding' },
  { value: 'paper', label: 'Published Paper' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_COLORS = {
  questionnaire: '#3b82f6',
  collaboration: '#8b5cf6',
  recruitment: '#f59e0b',
  statistics: '#10b981',
  literature: '#6366f1',
  data_collection: '#ec4899',
  case_report: '#f97316',
  funding: '#14b8a6',
  paper: '#06b6d4',
  other: '#6b7280',
}

const HELP_TYPES = [
  { value: 'helped', label: 'Helped' },
  { value: 'completed_survey', label: 'Completed Survey' },
  { value: 'collaborated', label: 'Collaborated' },
  { value: 'reviewed_paper', label: 'Reviewed Paper' },
  { value: 'statistical_help', label: 'Statistical Help' },
  { value: 'data_collection', label: 'Data Collection' },
]

const PREDEFINED_TAGS = [
  'cardiology', 'neurology', 'oncology', 'pediatrics', 'psychiatry',
  'surgery', 'internal_medicine', 'epidemiology', 'biostatistics',
  'systematic_review', 'meta_analysis', 'cross_sectional', 'cohort',
  'case_control', 'randomized_controlled_trial', 'qualitative',
  'mixed_methods', 'survey_design', 'patient_outcomes', 'clinical_trial',
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'top', label: 'Top' },
  { value: 'oldest', label: 'Oldest' },
]

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr + 'Z')
  const seconds = Math.floor((now - date) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function truncateUrl(url) {
  if (!url) return ''
  return url.length > 60 ? url.slice(0, 57) + '...' : url
}

export default function ResearchHub() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const { openProfile } = useProfilePanel()

  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [showNewPostModal, setShowNewPostModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [viewMode, setViewMode] = useState('feed')

  const [newTitle, setNewTitle] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState('other')
  const [newTags, setNewTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [newExpiration, setNewExpiration] = useState('')

  const [commentInput, setCommentInput] = useState('')
  const [showHelpDropdown, setShowHelpDropdown] = useState(null)
  const [helpType, setHelpType] = useState('')
  const [helpNote, setHelpNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.research.list(activeCategory, searchQuery, sortBy, 'all', null, 1),
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy, page: '1' })
      if (activeCategory !== 'all') params.set('category', activeCategory)
      if (searchQuery) params.set('search', searchQuery)
      return apiGet(`/research?${params}`)
    },
    staleTime: 15_000,
  })

  const { data: skillsData } = useQuery({
    queryKey: queryKeys.research.predefinedSkills(),
    queryFn: () => apiGet('/research/skills/predefined'),
    staleTime: 300_000,
  })

  const { data: bookmarksData, isLoading: bookmarksLoading } = useQuery({
    queryKey: queryKeys.research.bookmarks(),
    queryFn: () => apiGet('/research/bookmarks'),
    enabled: viewMode === 'saved' && !!user,
  })

  const posts = data?.posts || []

  const listKey = queryKeys.research.list(activeCategory, searchQuery, sortBy, 'all', null, 1)

  function patchPostInList(old, postId, patcher) {
    if (!old?.posts) return old
    return { ...old, posts: old.posts.map(p => p.id === postId ? { ...p, ...patcher(p) } : p) }
  }

  function patchDetail(old, postId, patcher) {
    if (!old || old.id !== postId) return old
    return { ...old, ...patcher(old) }
  }

  const createMutation = useMutation({
    mutationFn: (body) => apiPost('/research', body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData(listKey)
      const optimisticPost = {
        id: '__optimistic_' + Date.now(),
        user_id: user?.id,
        title: body.title,
        description: body.description,
        url: body.url,
        category: body.category,
        tags: body.tags,
        upvotes_count: 0, comments_count: 0, helped_count: 0,
        user_vote: 0, is_bookmarked: false,
        created_at: new Date().toISOString(),
        username: profile?.username || profile?.user_name || 'You',
        avatar_url: profile?.avatar_url || null,
      }
      queryClient.setQueryData(listKey, (old) => old ? { ...old, posts: [optimisticPost, ...old.posts] } : old)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous)
    },
    onSuccess: (data, body) => {
      queryClient.setQueryData(listKey, (old) => {
        if (!old?.posts) return old
        const optimistic = old.posts.find(p => String(p.id).startsWith('__optimistic_'))
        if (optimistic && data?.post) {
          return { ...old, posts: old.posts.map(p => p.id === optimistic.id ? { ...data.post, tags: body?.tags || [] } : p) }
        }
        return old
      })
      setShowNewPostModal(false)
      resetNewPostForm()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.all })
    },
  })

  const voteMutation = useMutation({
    mutationFn: ({ postId, vote }) => apiPost(`/research/${postId}/vote`, { vote }),
    onMutate: async ({ postId, vote }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.research.all })
      const prevList = queryClient.getQueryData(listKey)
      const prevDetail = selectedPost === postId ? queryClient.getQueryData(queryKeys.research.detail(postId)) : null
      queryClient.setQueryData(listKey, (old) => patchPostInList(old, postId, (p) => {
        const wasVoted = p.user_vote === 1
        const newVote = wasVoted ? 0 : 1
        const delta = wasVoted ? -1 : 1
        return { user_vote: newVote, upvotes_count: (p.upvotes_count || 0) + delta }
      }))
      if (prevDetail) {
        queryClient.setQueryData(queryKeys.research.detail(postId), (old) => patchDetail(old, postId, (p) => {
          const wasVoted = p.user_vote === 1
          const newVote = wasVoted ? 0 : 1
          const delta = wasVoted ? -1 : 1
          return { user_vote: newVote, upvotes_count: (p.upvotes_count || 0) + delta }
        }))
      }
      return { prevList, prevDetail }
    },
    onError: (_err, { postId }, ctx) => {
      if (ctx?.prevList) queryClient.setQueryData(listKey, ctx.prevList)
      if (ctx?.prevDetail) queryClient.setQueryData(queryKeys.research.detail(postId), ctx.prevDetail)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.all })
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: (postId) => apiPost(`/research/${postId}/bookmark`, {}),
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.research.all })
      const prevList = queryClient.getQueryData(listKey)
      queryClient.setQueryData(listKey, (old) => patchPostInList(old, postId, (p) => ({
        is_bookmarked: !p.is_bookmarked,
      })))
      return { prevList }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList) queryClient.setQueryData(listKey, ctx.prevList)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.all })
    },
  })

  const deletePostMutation = useMutation({
    mutationFn: (postId) => apiDelete(`/research/${postId}`),
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.research.all })
      const prevList = queryClient.getQueryData(listKey)
      queryClient.setQueryData(listKey, (old) => old ? { ...old, posts: old.posts.filter(p => p.id !== postId) } : old)
      return { prevList }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList) queryClient.setQueryData(listKey, ctx.prevList)
    },
    onSuccess: () => {
      setSelectedPost(null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.all })
    },
  })

  const commentMutation = useMutation({
    mutationFn: ({ postId, content }) => apiPost(`/research/${postId}/comments`, { content }),
    onMutate: async ({ postId, content }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.research.detail(postId) })
      const previous = queryClient.getQueryData(queryKeys.research.detail(postId))
      const optimisticComment = {
        id: '__optimistic_c_' + Date.now(),
        post_id: postId,
        user_id: user?.id,
        content,
        created_at: new Date().toISOString(),
        username: profile?.username || profile?.user_name || 'You',
        avatar_url: profile?.avatar_url || null,
      }
      queryClient.setQueryData(queryKeys.research.detail(postId), (old) => {
        if (!old) return old
        return { ...old, comments: [...(old.comments || []), optimisticComment], comments_count: (old.comments_count || 0) + 1 }
      })
      return { previous, postId }
    },
    onError: (_err, { postId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.research.detail(postId), ctx.previous)
    },
    onSuccess: () => {
      setCommentInput('')
    },
    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.detail(postId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.research.all })
    },
  })

  const markHelpedMutation = useMutation({
    mutationFn: ({ postId, helpType, note }) => apiPost(`/research/${postId}/help`, { help_type: helpType, note }),
    onMutate: async ({ postId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.research.detail(postId) })
      const previous = queryClient.getQueryData(queryKeys.research.detail(postId))
      queryClient.setQueryData(queryKeys.research.detail(postId), (old) => {
        if (!old) return old
        return { ...old, helped_count: (old.helped_count || 0) + 1 }
      })
      return { previous, postId }
    },
    onError: (_err, { postId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.research.detail(postId), ctx.previous)
    },
    onSuccess: () => {
      setShowHelpDropdown(null)
      setHelpType('')
      setHelpNote('')
    },
    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.detail(postId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.research.all })
    },
  })

  function resetNewPostForm() {
    setNewTitle('')
    setNewUrl('')
    setNewDesc('')
    setNewCategory('other')
    setNewTags([])
    setTagInput('')
    setNewExpiration('')
  }

  function handleAddTag(tag) {
    const t = tag.trim().toLowerCase()
    if (t && !newTags.includes(t) && newTags.length < 10) {
      setNewTags([...newTags, t])
    }
    setTagInput('')
  }

  function handleRemoveTag(tag) {
    setNewTags(newTags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && newTags.length) {
      setNewTags(newTags.slice(0, -1))
    }
  }

  function handleSubmitPost(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    createMutation.mutate({
      title: newTitle.trim(),
      url: newUrl.trim() || null,
      description: newDesc.trim() || null,
      category: newCategory,
      tags: newTags,
      expires_at: newExpiration || null,
    })
  }

  const filteredSuggestions = useMemo(() => {
    if (!tagInput) return PREDEFINED_TAGS.filter((t) => !newTags.includes(t)).slice(0, 8)
    return PREDEFINED_TAGS.filter(
      (t) => t.includes(tagInput.toLowerCase()) && !newTags.includes(t)
    ).slice(0, 6)
  }, [tagInput, newTags])

  function handleOpenPost(post) {
    setSelectedPost(post.id)
  }

  const { data: postDetail, isLoading: detailLoading } = useQuery({
    queryKey: queryKeys.research.detail(selectedPost),
    queryFn: () => apiGet(`/research/${selectedPost}`),
    enabled: !!selectedPost,
  })

  function handleSubmitComment() {
    if (!commentInput.trim() || !selectedPost) return
    commentMutation.mutate({ postId: selectedPost, content: commentInput.trim() })
  }

  function handleMarkHelped() {
    if (!helpType || !selectedPost) return
    markHelpedMutation.mutate({ postId: selectedPost, helpType, note: helpNote.trim() || null })
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>Research Hub</h1>
          <p className={s.subtitle}>Share research, find collaborators, build your research reputation</p>
        </div>
        {user && (
          <button className={s.newPostBtn} onClick={() => setShowNewPostModal(true)}>
            <Plus size={16} /> New Post
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className={s.filterBar}>
        <div className={s.viewTabs}>
          <button className={`${s.viewTab} ${viewMode === 'feed' ? s.viewTabActive : ''}`} onClick={() => setViewMode('feed')}>Feed</button>
          {user && <button className={`${s.viewTab} ${viewMode === 'saved' ? s.viewTabActive : ''}`} onClick={() => setViewMode('saved')}>Saved</button>}
        </div>

        {viewMode === 'feed' && (
          <div className={s.categories}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                className={`${s.categoryPill} ${activeCategory === cat.value ? s.categoryPillActive : ''}`}
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        <select className={s.sortSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            className={s.searchInput}
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Feed */}
      {viewMode === 'saved' ? (
        bookmarksLoading ? (
          <div className={s.loading}>
            <Loader2 className={s.spin} size={20} /> Loading...
          </div>
        ) : (bookmarksData?.bookmarks || []).length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}><Bookmark size={40} /></div>
            No saved posts yet. Bookmark posts to see them here.
          </div>
        ) : (
          (bookmarksData?.bookmarks || []).map((post) => (
            <div
              key={post.id}
              className={s.postCard}
              onClick={() => handleOpenPost(post)}
            >
            <div className={s.postHeader}>
              {post.avatar_url ? (
                <img
                  src={post.avatar_url}
                  alt=""
                  className={s.avatar}
                  onClick={(e) => { e.stopPropagation(); openProfile(post.user_id) }}
                />
              ) : (
                <div
                  className={s.avatarFallback}
                  onClick={(e) => { e.stopPropagation(); openProfile(post.user_id) }}
                >
                  {(post.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div className={s.postUserInfo}>
                <span
                  className={s.postUser}
                  onClick={(e) => { e.stopPropagation(); openProfile(post.user_id) }}
                >
                  {post.username}
                </span>
                {post.reputation > 0 && (
                  <span className={s.postRep}>{post.reputation} rep</span>
                )}
              </div>
              {post.category && (
                <span
                  className={s.categoryBadge}
                  style={{ background: CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other }}
                >
                  {post.category.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className={s.postTitle}>{post.title}</div>

            {post.url && (
              <a
                className={s.postUrl}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} /> {truncateUrl(post.url)}
              </a>
            )}

            {post.description && (
              <div className={s.postDesc}>{post.description}</div>
            )}

            {post.tags?.length > 0 && (
              <div className={s.tags}>
                {post.tags.map((tag) => (
                  <span key={tag} className={s.tag}>{tag}</span>
                ))}
              </div>
            )}

            <div className={s.postFooter}>
              <button
                className={`${s.postAction} ${post.user_vote === 1 ? s.postActionActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!user) return
                  voteMutation.mutate({ postId: post.id, vote: 1 })
                }}
              >
                <ArrowUp size={14} /> {post.upvotes_count || 0}
              </button>

              <span className={s.postAction} onClick={(e) => { e.stopPropagation(); handleOpenPost(post) }}>
                <MessageSquare size={14} /> {post.comments_count || 0}
              </span>

              <span className={s.postAction}>
                <CheckCircle size={14} /> {post.helped_count || 0}
              </span>

              {user && (
                <button
                  className={`${s.postAction} ${post.is_bookmarked ? s.postActionActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    bookmarkMutation.mutate(post.id)
                  }}
                >
                  {post.is_bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
              )}

              {post.is_expired && <span className={`${s.statusBadge} ${s.expired}`}>Expired</span>}
              {post.is_closed && <span className={`${s.statusBadge} ${s.closed}`}>Closed</span>}

              <span className={s.postTimestamp}>
                <Clock size={11} /> {timeAgo(post.created_at)}
              </span>

              {user && post.user_id === user.id && (
                <button
                  className={`${s.postAction} ${s.deleteAction}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Delete this post?')) deletePostMutation.mutate(post.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}

            </div>
          </div>
        ))
      )
      ) : (
        isLoading ? (
          <div className={s.loading}>
            <Loader2 className={s.spin} size={20} /> Loading...
          </div>
        ) : posts.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}><Users size={40} /></div>
            No research posts yet. Be the first to share!
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className={s.postCard}
              onClick={() => handleOpenPost(post)}
            >
            <div className={s.postHeader}>
              {post.avatar_url ? (
                <img
                  src={post.avatar_url}
                  alt=""
                  className={s.avatar}
                  onClick={(e) => { e.stopPropagation(); openProfile(post.user_id) }}
                />
              ) : (
                <div
                  className={s.avatarFallback}
                  onClick={(e) => { e.stopPropagation(); openProfile(post.user_id) }}
                >
                  {(post.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div className={s.postUserInfo}>
                <span
                  className={s.postUser}
                  onClick={(e) => { e.stopPropagation(); openProfile(post.user_id) }}
                >
                  {post.username}
                </span>
                {post.reputation > 0 && (
                  <span className={s.postRep}>{post.reputation} rep</span>
                )}
              </div>
              {post.category && (
                <span
                  className={s.categoryBadge}
                  style={{ background: CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other }}
                >
                  {post.category.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className={s.postTitle}>{post.title}</div>

            {post.url && (
              <a
                className={s.postUrl}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} /> {truncateUrl(post.url)}
              </a>
            )}

            {post.description && (
              <div className={s.postDesc}>{post.description}</div>
            )}

            {post.tags?.length > 0 && (
              <div className={s.tags}>
                {post.tags.map((tag) => (
                  <span key={tag} className={s.tag}>{tag}</span>
                ))}
              </div>
            )}

            <div className={s.postFooter}>
              <button
                className={`${s.postAction} ${post.user_vote === 1 ? s.postActionActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!user) return
                  voteMutation.mutate({ postId: post.id, vote: 1 })
                }}
              >
                <ArrowUp size={14} /> {post.upvotes_count || 0}
              </button>

              <span className={s.postAction} onClick={(e) => { e.stopPropagation(); handleOpenPost(post) }}>
                <MessageSquare size={14} /> {post.comments_count || 0}
              </span>

              <span className={s.postAction}>
                <CheckCircle size={14} /> {post.helped_count || 0}
              </span>

              {user && (
                <button
                  className={`${s.postAction} ${post.is_bookmarked ? s.postActionActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    bookmarkMutation.mutate(post.id)
                  }}
                >
                  {post.is_bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
              )}

              {post.is_expired && <span className={`${s.statusBadge} ${s.expired}`}>Expired</span>}
              {post.is_closed && <span className={`${s.statusBadge} ${s.closed}`}>Closed</span>}

              <span className={s.postTimestamp}>
                <Clock size={11} /> {timeAgo(post.created_at)}
              </span>

              {user && post.user_id === user.id && (
                <button
                  className={`${s.postAction} ${s.deleteAction}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Delete this post?')) deletePostMutation.mutate(post.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}

            </div>
          </div>
        ))
        )
      )}
      {showNewPostModal && (
        <div className={s.modalOverlay} onClick={() => setShowNewPostModal(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalTitle}>Share Research</div>
            <form onSubmit={handleSubmitPost}>
              <div className={s.modalField}>
                <label className={s.modalLabel}>Title *</label>
                <input
                  className={s.modalInput}
                  placeholder="Research title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className={s.modalField}>
                <label className={s.modalLabel}>URL</label>
                <input
                  className={s.modalInput}
                  placeholder="https://..."
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>

              <div className={s.modalField}>
                <label className={s.modalLabel}>Description</label>
                <textarea
                  className={`${s.modalInput} ${s.modalTextarea}`}
                  placeholder="Describe your research or what you're looking for..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <div className={s.modalField}>
                <label className={s.modalLabel}>Category</label>
                <select
                  className={`${s.modalInput} ${s.modalSelect}`}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className={s.modalField}>
                <label className={s.modalLabel}>Tags</label>
                <div className={s.tagsInput}>
                  {newTags.map((tag) => (
                    <span key={tag} className={s.tagPill}>
                      {tag}
                      <button type="button" className={s.tagRemove} onClick={() => handleRemoveTag(tag)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    className={s.tagsField}
                    placeholder={newTags.length === 0 ? 'Add tags...' : ''}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => { if (tagInput.trim()) handleAddTag(tagInput) }}
                  />
                </div>
                {filteredSuggestions.length > 0 && (
                  <div className={s.tagSuggestions}>
                    {filteredSuggestions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={s.tagSuggestion}
                        onMouseDown={(e) => { e.preventDefault(); handleAddTag(tag) }}
                      >
                        + {tag.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={s.modalField}>
                <label className={s.modalLabel}>Expiration Date (optional)</label>
                <input
                  type="date"
                  className={s.modalInput}
                  value={newExpiration}
                  onChange={(e) => setNewExpiration(e.target.value)}
                />
              </div>

              <div className={s.modalActions}>
                <button type="button" className={s.cancelBtn} onClick={() => setShowNewPostModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={s.submitBtn}
                  disabled={createMutation.isPending || !newTitle.trim()}
                >
                  {createMutation.isPending ? <Loader2 className={s.spin} size={14} /> : 'Share Research'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Detail */}
      {selectedPost && (
        <div className={s.modalOverlay} onClick={() => { setSelectedPost(null); setCommentInput(''); setShowHelpDropdown(null) }}>
          <div className={s.detailPanel} onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className={s.loading}><Loader2 className={s.spin} size={20} /> Loading...</div>
            ) : postDetail ? (
              <>
                <div className={s.detailHeader}>
                  <div>
                    <div className={s.detailMeta}>
                      {postDetail.avatar_url ? (
                        <img
                          src={postDetail.avatar_url}
                          alt=""
                          className={s.avatar}
                          onClick={() => openProfile(postDetail.user_id)}
                          style={{ cursor: 'pointer' }}
                        />
                      ) : (
                        <div className={s.avatarFallback}>
                          {(postDetail.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <span
                        className={s.postUser}
                        style={{ cursor: 'pointer' }}
                        onClick={() => openProfile(postDetail.user_id)}
                      >
                        {postDetail.username}
                      </span>
                      {postDetail.reputation > 0 && (
                        <span className={s.postRep}>{postDetail.reputation} rep</span>
                      )}
                      {postDetail.category && (
                        <span
                          className={s.categoryBadge}
                          style={{ background: CATEGORY_COLORS[postDetail.category] || CATEGORY_COLORS.other }}
                        >
                          {postDetail.category.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <h2 className={s.detailTitle}>{postDetail.title}</h2>
                  </div>
                  {user && postDetail.user_id === user.id && (
                    <button
                      className={s.detailDelete}
                      onClick={() => {
                        if (confirm('Delete this post?')) {
                          deletePostMutation.mutate(postDetail.id)
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button className={s.detailClose} onClick={() => { setSelectedPost(null); setCommentInput('') }}>
                    <X size={20} />
                  </button>
                </div>

                {postDetail.url && (
                  <a className={s.detailUrl} href={postDetail.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} /> {postDetail.url}
                  </a>
                )}

                {postDetail.description && (
                  <div className={s.detailDesc}>{postDetail.description}</div>
                )}

                {postDetail.tags?.length > 0 && (
                  <div className={s.detailTags}>
                    {postDetail.tags.map((tag) => (
                      <span key={tag} className={s.detailTag}>{tag}</span>
                    ))}
                  </div>
                )}

                <div className={s.detailFooter}>
                  <button
                    className={`${s.postAction} ${postDetail.user_vote === 1 ? s.postActionActive : ''}`}
                    onClick={() => {
                      if (!user) return
                      voteMutation.mutate({ postId: postDetail.id, vote: 1 })
                    }}
                  >
                    <ArrowUp size={14} /> {postDetail.upvotes_count || 0}
                  </button>
                  <span className={s.postAction}>
                    <MessageSquare size={14} /> {postDetail.comments_count || 0}
                  </span>
                  <span className={s.postAction}>
                    <CheckCircle size={14} /> {postDetail.helped_count || 0}
                  </span>
                  <span className={s.postTimestamp}>
                    <Clock size={11} /> {timeAgo(postDetail.created_at)}
                  </span>

                  {user?.id === postDetail.user_id && (
                    <div className={s.helpWrap}>
                      <button
                        className={s.postAction}
                        onClick={() => setShowHelpDropdown(showHelpDropdown ? null : 'main')}
                      >
                        <CheckCircle size={14} /> Mark Helped
                      </button>
                      {showHelpDropdown && (
                        <div className={s.helpDropdown}>
                          {HELP_TYPES.map((ht) => (
                            <button
                              key={ht.value}
                              className={s.helpOption}
                              onClick={() => { setHelpType(ht.value); setShowHelpDropdown('note') }}
                            >
                              {ht.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {showHelpDropdown === 'note' && (
                        <div className={s.helpDropdown}>
                          <input
                            className={s.helpNoteInput}
                            placeholder="Add a note (optional)"
                            value={helpNote}
                            onChange={(e) => setHelpNote(e.target.value)}
                          />
                          <button className={s.helpSubmitBtn} onClick={handleMarkHelped}>
                            Confirm
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div className={s.commentsSection}>
                  <div className={s.commentsTitle}>
                    <MessageSquare size={14} /> Comments
                  </div>
                  {(postDetail.comments || []).length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--mist)' }}>No comments yet.</p>
                  )}
                  {(postDetail.comments || []).map((comment) => (
                    <div key={comment.id} className={s.commentItem}>
                      <img src={comment.avatar_url || undefined} alt="" className={s.commentAvatar} />
                      <div className={s.commentBody}>
                        <div className={s.commentAuthor}>{comment.username}</div>
                        <div className={s.commentContent}>{comment.content}</div>
                        <div className={s.commentMeta}>{timeAgo(comment.created_at)}</div>
                      </div>
                    </div>
                  ))}

                  {user && (
                    <div className={s.commentInput}>
                      <input
                        placeholder="Write a comment..."
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment() } }}
                      />
                      <button
                        className={s.commentSubmitBtn}
                        onClick={handleSubmitComment}
                        disabled={!commentInput.trim() || commentMutation.isPending}
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
