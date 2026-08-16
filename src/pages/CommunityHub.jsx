import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Hash, Loader2, UserPlus } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { readInviteCode } from '../lib/communityInvite'
import { invalidateCommunityQueries } from '../lib/socialInvalidation'
import { QueryErrorState, RefetchWarning } from '../components/QueryState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui'
import CommunityOverview from '../components/community/CommunityOverview'
import MyCommunitiesPanel from '../components/community/MyCommunitiesPanel'
import DiscoverPanel from '../components/community/DiscoverPanel'
import CreateCommunityModal from '../components/community/CreateCommunityModal'
import s from '../components/community/communityPanels.module.css'
import hub from './CommunityHub.module.css'

const People = lazy(() => import('./People'))
const Leaderboard = lazy(() => import('./Leaderboard'))

const TABS = [
  { id: 'overview', label: 'Overview', path: '/communities' },
  { id: 'mine', label: 'My Communities', path: '/communities/mine' },
  { id: 'discover', label: 'Discover', path: '/communities/discover' },
  { id: 'people', label: 'People', path: '/communities/people' },
  { id: 'leaderboard', label: 'Leaderboard', path: '/communities/leaderboard' },
]

function getTabFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '')
  const tab = TABS.find(t => t.path === normalized)
  return tab ? tab.id : 'overview'
}

function ListBoundary({ isLoading, hasError, hasData, onRetry, children }) {
  if (isLoading) {
    return (
      <div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading...</div>
    )
  }
  if (hasError && !hasData) {
    return <QueryErrorState message="Could not load communities." onRetry={onRetry} />
  }
  return (
    <>
      {hasError && <RefetchWarning onRetry={onRetry} />}
      {children}
    </>
  )
}

export default function CommunityHub() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState('members')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data = {}, isLoading, error: listError, refetch: refetchList } = useQuery({
    queryKey: queryKeys.communities.list(sortBy, searchQuery, activeCategory),
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy })
      if (searchQuery) params.set('search', searchQuery)
      if (activeCategory !== 'all') params.set('category', activeCategory)
      return apiGet(`/communities?${params}`)
    },
    staleTime: 15_000,
  })

  const myCommunities = data.mine || []
  const publicCommunities = data.communities || []
  const categoryCounts = data.categories || []

  const joinMutation = useMutation({
    mutationFn: (code) => apiPost('/communities/join-by-code', { code }),
    onSuccess: (result) => {
      if (result.community) {
        invalidateCommunityQueries(queryClient)
        navigate('/communities/' + result.community.id)
      } else if (result.requires_approval) {
        setJoinError('Join request sent for approval')
      } else {
        setJoinError(result.error || 'Failed to join')
      }
    },
    onError: (err) => setJoinError(err.message || 'Failed to join'),
  })

  const inviteHandled = useRef(false)

  useEffect(() => {
    if (inviteHandled.current) return
    const code = readInviteCode(searchParams)
    if (!code) return
    inviteHandled.current = true
    setJoinCode(code)
    joinMutation.mutate(code)
    const params = new URLSearchParams(searchParams)
    params.delete('invite')
    setSearchParams(params, { replace: true })
  }, [])

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return
    setJoinError('')
    joinMutation.mutate(joinCode.trim())
  }

  const activeTab = getTabFromPath(location.pathname)

  const handleTabChange = (value) => {
    const tab = TABS.find(t => t.id === value)
    if (tab && tab.path !== location.pathname) navigate(tab.path)
  }

  const listBoundaryProps = {
    isLoading,
    hasError: !!listError,
    hasData: myCommunities.length > 0 || publicCommunities.length > 0,
    onRetry: refetchList,
  }

  return (
    <div className={hub.page}>
      <div className={hub.header}>
        <h1 className={hub.title}>Community</h1>
        <button className={hub.createBtn} onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Create
        </button>
      </div>

      <div className={hub.joinRow}>
        <div className={hub.joinWrap}>
          <Hash size={16} strokeWidth={1.5} className={hub.joinIcon} />
          <input
            className={hub.joinInput}
            type="text"
            placeholder="Enter invite code..."
            aria-label="Enter invite code"
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value); setJoinError('') }}
            onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
          />
          <button className={hub.joinBtn} onClick={handleJoinByCode} disabled={!joinCode.trim() || joinMutation.isPending}>
            {joinMutation.isPending ? <Loader2 size={14} className={s.spinner} /> : <UserPlus size={14} strokeWidth={1.5} />}
            Join
          </button>
        </div>
        {joinError && <span className={hub.joinError}>{joinError}</span>}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className={hub.tabList} aria-label="Community sections">
          {TABS.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id} className={hub.tab}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <ListBoundary {...listBoundaryProps}>
            <CommunityOverview myCommunities={myCommunities} />
          </ListBoundary>
        </TabsContent>

        <TabsContent value="mine">
          <ListBoundary {...listBoundaryProps}>
            <MyCommunitiesPanel myCommunities={myCommunities} />
          </ListBoundary>
        </TabsContent>

        <TabsContent value="discover">
          <ListBoundary {...listBoundaryProps}>
            <DiscoverPanel
              publicCommunities={publicCommunities}
              categoryCounts={categoryCounts}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onCreate={() => setShowCreate(true)}
            />
          </ListBoundary>
        </TabsContent>

        <TabsContent value="people">
          <Suspense fallback={<div className={s.loading}><Loader2 size={20} className={s.spinner} /> Loading...</div>}>
            <People embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Suspense fallback={<div className={s.loading}><Loader2 size={20} className={s.spinner} /> Loading...</div>}>
            <Leaderboard embedded />
          </Suspense>
        </TabsContent>
      </Tabs>

      <CreateCommunityModal open={showCreate} onOpenChange={setShowCreate} />
    </div>
  )
}
