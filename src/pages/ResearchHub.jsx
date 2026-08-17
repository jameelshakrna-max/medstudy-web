import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { useAuth } from '../context/AuthContext'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Plus, ExternalLink, ArrowUp, MessageSquare, CheckCircle,
  Bookmark, Flag, Loader2, X, Send, ChevronDown, Clock, Users, Trash2
} from 'lucide-react'
import Modal from '../components/ui/Modal/Modal'
import { UserLink } from '../components/ui'
import { QueryErrorState, RefetchWarning } from '../components/QueryState'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs/Tabs'
import { getResearchTab, setResearchTab, RESEARCH_TABS } from '../lib/researchTabs'
import { getResearchInvalidation } from '../lib/researchInvalidation'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import ResearchPostCard, { CATEGORY_COLORS, timeAgo } from '../components/research/ResearchPostCard'
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

export default function ResearchHub() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = getResearchTab(searchParams)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [showNewPostModal, setShowNewPostModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)

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

  const debouncedSearch = useDebouncedValue(searchQuery)

  useEffect(() => {
    const canonical = setResearchTab(searchParams, activeTab)
    if (canonical.toString() !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true })
    }
  }, [searchParams, activeTab, setSearchParams])

  const handleTabChange = (nextTab) => {
    setSearchParams((prev) => setResearchTab(prev, nextTab))
  }

  const discoverQuery = useQuery({
    queryKey: queryKeys.research.discover(activeCategory, debouncedSearch, sortBy),
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy, page: '1' })
      if (activeCategory !== 'all') params.set('category', activeCategory)
      if (debouncedSearch) params.set('search', debouncedSearch)
      return apiGet(`/research?${params}`)
    },
    staleTime: 15_000,
  })

  const mineQuery = useQuery({
    queryKey: queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy),
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy, page: '1', user_id: user.id })
      if (activeCategory !== 'all') params.set('category', activeCategory)
      if (debouncedSearch) params.set('search', debouncedSearch)
      return apiGet(`/research?${params}`)
    },
    enabled: activeTab === 'mine' && !!user?.id,
    staleTime: 15_000,
  })

  const savedQuery = useQuery({
    queryKey: queryKeys.research.saved(),
    queryFn: () => apiGet('/research/bookmarks'),
    enabled: activeTab === 'saved' && !!user,
    staleTime: 15_000,
  })

  const { data: skillsData } = useQuery({
    queryKey: queryKeys.research.predefinedSkills(),
    queryFn: () => apiGet('/research/skills/predefined'),
    staleTime: 300_000,
  })

  const savedPosts = useMemo(() => {
    return (savedQuery.data?.bookmarks || []).map((post) => ({
      ...post,
      reputation: post.reputation || 0,
      user_vote: 0,
      is_bookmarked: true,
    }))
  }, [savedQuery.data])

  const activeData = activeTab === 'mine' ? mineQuery : activeTab === 'saved' ? savedQuery : discoverQuery
  const posts = activeTab === 'saved' ? savedPosts : activeData.data?.posts || []
  const isLoading = activeData.isLoading
  const listError = activeData.error
  const refetchList = activeData.refetch

  function cancelListQueries() {
    return Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.research.discover(activeCategory, debouncedSearch, sortBy) }),
      queryClient.cancelQueries({ queryKey: queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy) }),
    ])
  }

  function patchPostInLists(postId, patcher) {
    const discoverKey = queryKeys.research.discover(activeCategory, debouncedSearch, sortBy)
    const mineKey = queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy)
    for (const key of [discoverKey, mineKey]) {
      queryClient.setQueryData(key, (old) => {
        if (!old?.posts) return old
        return { ...old, posts: old.posts.map(p => p.id === postId ? { ...p, ...patcher(p) } : p) }
      })
    }
  }

  function getListSnapshot() {
    return {
      discover: queryClient.getQueryData(queryKeys.research.discover(activeCategory, debouncedSearch, sortBy)),
      mine: queryClient.getQueryData(queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy)),
    }
  }

  function restoreListSnapshot(prev) {
    if (prev.discover) queryClient.setQueryData(queryKeys.research.discover(activeCategory, debouncedSearch, sortBy), prev.discover)
    if (prev.mine) queryClient.setQueryData(queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy), prev.mine)
  }

  function patchDetail(old, postId, patcher) {
    if (!old || old.id !== postId) return old
    return { ...old, ...patcher(old) }
  }

  const createMutation = useMutation({
    mutationFn: (body) => apiPost('/research', body),
    onMutate: async (body) => {
      const discoverKey = queryKeys.research.discover(activeCategory, debouncedSearch, sortBy)
      const mineKey = queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy)
      await cancelListQueries()
      const prevDiscover = queryClient.getQueryData(discoverKey)
      const prevMine = queryClient.getQueryData(mineKey)
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
      queryClient.setQueryData(discoverKey, (old) => old ? { ...old, posts: [optimisticPost, ...old.posts] } : old)
      queryClient.setQueryData(mineKey, (old) => old ? { ...old, posts: [optimisticPost, ...old.posts] } : old)
      return { prevDiscover, prevMine }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevDiscover) queryClient.setQueryData(queryKeys.research.discover(activeCategory, debouncedSearch, sortBy), ctx.prevDiscover)
      if (ctx?.prevMine) queryClient.setQueryData(queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy), ctx.prevMine)
    },
    onSuccess: (data, body) => {
      const discoverKey = queryKeys.research.discover(activeCategory, debouncedSearch, sortBy)
      const mineKey = queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy)
      for (const key of [discoverKey, mineKey]) {
        queryClient.setQueryData(key, (old) => {
          if (!old?.posts) return old
          const optimistic = old.posts.find(p => String(p.id).startsWith('__optimistic_'))
          if (optimistic && data?.post) {
            return { ...old, posts: old.posts.map(p => p.id === optimistic.id ? { ...data.post, tags: body?.tags || [] } : p) }
          }
          return old
        })
      }
      setShowNewPostModal(false)
      resetNewPostForm()
    },
    onSettled: () => {
      for (const key of getResearchInvalidation('create')) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })

  const voteMutation = useMutation({
    mutationFn: ({ postId, vote }) => apiPost(`/research/${postId}/vote`, { vote }),
    onMutate: async ({ postId, vote }) => {
      await cancelListQueries()
      const prev = getListSnapshot()
      const prevDetail = selectedPost === postId ? queryClient.getQueryData(queryKeys.research.detail(postId)) : null
      patchPostInLists(postId, (p) => {
        const wasVoted = p.user_vote === 1
        const newVote = wasVoted ? 0 : 1
        const delta = wasVoted ? -1 : 1
        return { user_vote: newVote, upvotes_count: (p.upvotes_count || 0) + delta }
      })
      if (prevDetail) {
        queryClient.setQueryData(queryKeys.research.detail(postId), (old) => patchDetail(old, postId, (p) => {
          const wasVoted = p.user_vote === 1
          const newVote = wasVoted ? 0 : 1
          const delta = wasVoted ? -1 : 1
          return { user_vote: newVote, upvotes_count: (p.upvotes_count || 0) + delta }
        }))
      }
      return { prev, prevDetail }
    },
    onError: (_err, { postId }, ctx) => {
      if (ctx?.prev) restoreListSnapshot(ctx.prev)
      if (ctx?.prevDetail) queryClient.setQueryData(queryKeys.research.detail(postId), ctx.prevDetail)
    },
    onSettled: () => {
      for (const key of getResearchInvalidation('vote')) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: (postId) => apiPost(`/research/${postId}/bookmark`, {}),
    onMutate: async (postId) => {
      await cancelListQueries()
      const prev = getListSnapshot()
      patchPostInLists(postId, (p) => ({
        is_bookmarked: !p.is_bookmarked,
      }))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) restoreListSnapshot(ctx.prev)
    },
    onSettled: () => {
      for (const key of getResearchInvalidation('bookmark')) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })

  const deletePostMutation = useMutation({
    mutationFn: (postId) => apiDelete(`/research/${postId}`),
    onMutate: async (postId) => {
      await cancelListQueries()
      const prev = getListSnapshot()
      const discoverKey = queryKeys.research.discover(activeCategory, debouncedSearch, sortBy)
      const mineKey = queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy)
      for (const key of [discoverKey, mineKey]) {
        queryClient.setQueryData(key, (old) => old ? { ...old, posts: old.posts.filter(p => p.id !== postId) } : old)
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) restoreListSnapshot(ctx.prev)
    },
    onSuccess: () => {
      setSelectedPost(null)
    },
    onSettled: () => {
      for (const key of getResearchInvalidation('delete')) {
        queryClient.invalidateQueries({ queryKey: key })
      }
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
      for (const key of getResearchInvalidation('comment', { postId })) {
        queryClient.invalidateQueries({ queryKey: key })
      }
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
      for (const key of getResearchInvalidation('help', { postId })) {
        queryClient.invalidateQueries({ queryKey: key })
      }
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

  const { data: postDetail, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = useQuery({
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

  function handleRefreshTab() {
    if (activeTab === 'discover') queryClient.invalidateQueries({ queryKey: queryKeys.research.discover(activeCategory, debouncedSearch, sortBy) })
    else if (activeTab === 'mine') queryClient.invalidateQueries({ queryKey: queryKeys.research.mine(user?.id, activeCategory, debouncedSearch, sortBy) })
    else if (activeTab === 'saved') queryClient.invalidateQueries({ queryKey: queryKeys.research.saved() })
  }

  function renderPostCards(postList) {
    return postList.map((post) => (
      <ResearchPostCard
        key={post.id}
        post={post}
        onOpen={handleOpenPost}
        onVote={(id, vote) => voteMutation.mutate({ postId: id, vote })}
        onBookmark={(id) => bookmarkMutation.mutate(id)}
        onDelete={(id) => deletePostMutation.mutate(id)}
        user={user}
      />
    ))
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>Research Hub</h1>
          <p className={s.subtitle}>Share research, find collaborators, build your research reputation</p>
        </div>
        {user && (
          <button className={s.newPostBtn} onClick={() => setShowNewPostModal(true)}>
            <Plus size={16} /> Share Research
          </button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className={s.filterBar}>
          <TabsList className={s.tabs} aria-label="Research sections">
            {RESEARCH_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className={s.tab}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {activeTab === 'discover' && (
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
              aria-label="Search research posts"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="discover">
          {isLoading ? (
            <div className={s.loading}>
              <Loader2 className={s.spin} size={20} /> Loading...
            </div>
          ) : listError && posts.length === 0 ? (
            <QueryErrorState message="Could not load research posts." onRetry={refetchList} />
          ) : posts.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}><Users size={40} /></div>
              {debouncedSearch || activeCategory !== 'all' ? 'No research posts match your search.' : 'No research posts yet. Be the first to share!'}
            </div>
          ) : (
            <>
              {listError && <RefetchWarning onRetry={refetchList} />}
              {renderPostCards(posts)}
            </>
          )}
        </TabsContent>

        <TabsContent value="mine">
          {!user ? (
            <div className={s.empty}>Sign in to see your posts.</div>
          ) : mineQuery.isLoading ? (
            <div className={s.loading}>
              <Loader2 className={s.spin} size={20} /> Loading...
            </div>
          ) : listError && posts.length === 0 ? (
            <QueryErrorState message="Could not load your posts." onRetry={refetchList} />
          ) : posts.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}><Users size={40} /></div>
              You haven't shared any research yet.
              <button className={s.shareBtn} onClick={() => setShowNewPostModal(true)}>
                Share Research
              </button>
            </div>
          ) : (
            <>
              {listError && <RefetchWarning onRetry={refetchList} />}
              {renderPostCards(posts)}
            </>
          )}
        </TabsContent>

        <TabsContent value="saved">
          {!user ? (
            <div className={s.empty}>Sign in to see saved posts.</div>
          ) : savedQuery.isLoading ? (
            <div className={s.loading}>
              <Loader2 className={s.spin} size={20} /> Loading...
            </div>
          ) : savedQuery.error ? (
            <QueryErrorState message="Could not load saved posts." onRetry={refetchList} compact />
          ) : savedPosts.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}><Bookmark size={40} /></div>
              You haven't saved any research posts yet.
            </div>
          ) : (
            renderPostCards(savedPosts)
          )}
        </TabsContent>
      </Tabs>

      {showNewPostModal && (
        <Modal open={showNewPostModal} onOpenChange={(v) => { if (!v) setShowNewPostModal(false) }} size="lg">
          <Modal.Title style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--text-primary)', marginBottom: 20 }}>
            Share Research
          </Modal.Title>
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
        </Modal>
      )}

      {selectedPost && (
        <Modal open={!!selectedPost} onOpenChange={(v) => { if (!v) { setSelectedPost(null); setCommentInput(''); setShowHelpDropdown(null) } }} size="lg">
          <div className={s.detailPanel}>
            {detailLoading ? (
              <div className={s.loading}><Loader2 className={s.spin} size={20} /> Loading...</div>
            ) : detailError ? (
              <QueryErrorState message="Could not load this post." onRetry={refetchDetail} compact />
            ) : postDetail ? (
              <>
                <div className={s.detailHeader}>
                  <div>
                    <div className={s.detailMeta}>
                      <UserLink userId={postDetail.user_id} username={postDetail.username} avatar={postDetail.avatar_url} size="sm" />
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

                <div className={s.commentsSection}>
                  <div className={s.commentsTitle}>
                    <MessageSquare size={14} /> Comments
                  </div>
                  {(postDetail.comments || []).length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--mist)' }}>No comments yet.</p>
                  )}
                  {(postDetail.comments || []).map((comment) => (
                    <div key={comment.id} className={s.commentItem}>
                      <div className={s.commentBody}>
                        <UserLink userId={comment.user_id} username={comment.username} avatar={comment.avatar_url} size="sm" />
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
        </Modal>
      )}

      <VisuallyHidden aria-live="polite">
        {activeTab === 'discover' && !discoverQuery.isLoading ? `${posts.length} research posts` : ''}
        {activeTab === 'mine' && !mineQuery.isLoading ? `${posts.length} your posts` : ''}
        {activeTab === 'saved' && !savedQuery.isLoading ? `${savedPosts.length} saved posts` : ''}
      </VisuallyHidden>
    </div>
  )
}
