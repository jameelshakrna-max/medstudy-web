import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSwipeable } from 'react-swipeable'
import { Virtuoso } from 'react-virtuoso'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunityRealtime } from '../hooks/useCommunityRealtime'
import { ROLES, PERM, hasPermission, hasMinimumRole } from '../lib/permissions'
import { apiGet, apiPost, apiPut, apiDelete, apiJson, formatDate, imageUrl } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import RoleBadge from '../components/RoleBadge'
import CompetitionsTab from '../components/community/CompetitionsTab'
import LeaderboardTab from '../components/community/LeaderboardTab'
import SettingsTab from '../components/community/SettingsTab'
import ModDashboardTab from '../components/community/ModDashboardTab'
import AnnouncementsTab from '../components/community/AnnouncementsTab'
import VoiceRooms from '../components/community/VoiceRooms'
import CalendarHeatmap from '../components/community/CalendarHeatmap.jsx'
import HallOfFameTab from '../components/community/HallOfFameTab'
import {
  MessageSquare, Users, Trophy, Settings, Send, Paperclip, Upload,
  Plus, X, Loader2, ChevronLeft, Shield, ShieldAlert, UserMinus, UserCog, Star,
  Crown, Flag, Clock, Hash, Link as LinkIcon, Check, AlertTriangle,
  Copy, Ban, Pin, FileText, BookOpen, UserPlus, Search, Trash2, Megaphone, Headphones, BarChart3
} from 'lucide-react'
import Modal from '../components/ui/Modal/Modal'
import s from './CommunityDetail.module.css'
import FlashcardShareModal from '../components/FlashcardShareModal'
import MentionText from '../components/MentionText'
import MentionInput from '../components/MentionInput'
import UserCard from '../components/UserCard'
import UserLink from '../components/ui/UserLink/UserLink'
import { useProfilePanel } from '../context/ProfilePanelContext'

const API = import.meta.env.VITE_API_URL || '/api'

const TABS = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
  { id: 'competitions', icon: Trophy, label: 'Competitions' },
  { id: 'voice', icon: Headphones, label: 'Voice' },
  { id: 'stats', icon: BarChart3, label: 'Stats' },
  { id: 'hall-of-fame', icon: Crown, label: 'Hall of Fame' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export default function CommunityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { openProfile } = useProfilePanel()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('chat')
  const [avatarError, setAvatarError] = useState(false)

  const { data: fullData, isLoading, error: fetchError } = useQuery({
    queryKey: queryKeys.communities.detail(id),
    queryFn: () => apiGet('/communities/' + id + '/full'),
    enabled: !!id,
    staleTime: 30_000,
  })

  const community = fullData?.community || null
  const members = Array.isArray(fullData?.members) ? fullData.members : []
  const rules = Array.isArray(fullData?.rules) ? fullData.rules : []
  const settings = fullData?.settings || null
  const bans = Array.isArray(fullData?.bans) ? fullData.bans : []
  const joinRequests = Array.isArray(fullData?.joinRequests) ? fullData.joinRequests : []
  const myMembership = members.find(m => m.user_id === user?.id) || null
  const isAdmin = hasMinimumRole(myMembership?.role, ROLES.ADMINISTRATOR)
  const isMod = hasMinimumRole(myMembership?.role, ROLES.MODERATOR)

  const realtime = useCommunityRealtime(id)
  const chat = realtime
  const [pins, setPins] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [competitions, setCompetitions] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [searchMessages, setSearchMessages] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showFlashcardModal, setShowFlashcardModal] = useState(false)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [accessToken, setAccessToken] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setAccessToken(session.access_token)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) setAccessToken(session.access_token)
    })
    return () => listener?.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    chat.setActive(activeTab === 'chat')
  }, [activeTab, chat])

  useEffect(() => {
    if (realtime.competitions?.length) setCompetitions(realtime.competitions)
  }, [realtime.competitions])

  useEffect(() => {
    if (realtime.pins) setPins(realtime.pins)
  }, [realtime.pins])

  useEffect(() => {
    if (realtime.announcements) setAnnouncements(realtime.announcements)
  }, [realtime.announcements])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchMessages), 300)
    return () => clearTimeout(timer)
  }, [searchMessages])

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: queryKeys.communities.messages(id, debouncedSearch),
    queryFn: () => apiGet(`/communities/${id}/messages?q=${encodeURIComponent(debouncedSearch)}`).then(d => Array.isArray(d) ? d : []),
    enabled: !!debouncedSearch.trim(),
    staleTime: 5_000,
  })

  const handleSend = async () => {
    if (!messageInput.trim() || sending) return
    setSending(true)
    await chat.sendMessage(messageInput.trim())
    setMessageInput('')
    setSending(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const [uploadError, setUploadError] = useState('')
  const [pendingUploads, setPendingUploads] = useState([])

  const uploadFile = async (file, pendingId) => {
    const { data: { session } } = await supabase.auth.getSession()
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(API + '/communities/' + id + '/messages/file', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token },
      body: fd,
    })
    const data = await apiJson(res)
    if (data.success) {
      setPendingUploads(prev => prev.filter(p => p.id !== pendingId))
      chat.fetchNewMessages()
    } else {
      setPendingUploads(prev => prev.map(p => p.id === pendingId ? { ...p, status: 'failed', error: data.error || 'Upload failed' } : p))
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const pendingId = 'pending-' + Date.now()
      const pendingMsg = {
        id: pendingId, pending: true, file_name: file.name,
        file_size: file.size, mime_type: file.type, file,
        user_name: user?.email?.split('@')[0] || 'You',
        created_at: new Date().toISOString(),
        status: 'uploading',
      }
      setPendingUploads(prev => [...prev, pendingMsg])
      await uploadFile(file, pendingId)
    } catch (e) {
      setUploadError(e.message || 'Upload failed')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRetryUpload = async (pendingMsg) => {
    setPendingUploads(prev => prev.map(p => p.id === pendingMsg.id ? { ...p, status: 'uploading', error: null } : p))
    await uploadFile(pendingMsg.file, pendingMsg.id)
  }

  const handleJoin = async () => {
    try {
      const data = await apiPost('/communities/' + id + '/join', {})
      if (data.requires_approval) alert('Join request sent for approval')
      else queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(id) })
    } catch (e) { Sentry.captureException(e); alert(e.message) }
  }

  const handleLeave = async () => {
    if (!confirm('Leave this community?')) return
    try {
      await apiPost('/communities/' + id + '/leave', {})
      navigate('/communities')
    } catch (e) { Sentry.captureException(e); alert(e.message) }
  }

  const handleCopyInvite = () => {
    if (community?.invite_code) {
      navigator.clipboard.writeText(window.location.origin + '/communities/join/' + community.invite_code)
    }
  }

  const handleDeleteMsg = async (msgId) => {
    if (!confirm('Delete this message?')) return
    try {
      await realtime.deleteMessage(msgId)
    } catch (e) { alert(e.message) }
  }

  const handlePinMsg = async (msgId) => {
    try {
      const data = await apiPost('/communities/' + id + '/pins', { message_id: msgId })
      if (data?.pin_id) {
        const msg = chat.messages.find(m => m.id === msgId)
        setPins(prev => [...prev, {
          id: data.pin_id,
          community_id: id,
          message_id: msgId,
          pinned_by: user?.id,
          created_at: new Date().toISOString(),
          message_content: msg?.content || '',
          message_user_name: msg?.user_name || user?.email?.split('@')[0] || '',
        }])
      }
    } catch (e) { alert(e.message) }
  }

  const handleUnpin = async (pinId) => {
    try {
      await apiDelete('/communities/' + id + '/pins/' + pinId)
      setPins(prev => prev.filter(p => p.id !== pinId))
    } catch (e) { alert(e.message) }
  }

  const handleAddToDeck = async (messageId) => {
    try {
      const data = await apiPost(`/community/messages/${messageId}/add-to-deck`, {})
      if (data.success) alert('Flashcard added to your deck!')
    } catch (e) { alert(e.message) }
  }

  const handleRegenerateCode = async () => {
    try {
      const data = await apiPost('/communities/' + id + '/invite-code', {})
      if (data.invite_code) {
        queryClient.setQueryData(queryKeys.communities.detail(id), prev => ({
          ...prev,
          community: { ...prev?.community, invite_code: data.invite_code },
        }))
      }
    } catch {}
  }

  const handleRefreshTab = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.communities.detail(id) })
  }, [queryClient, id])

  const fetchCommunity = handleRefreshTab

  const backSwipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (window.innerWidth <= 768) navigate('/communities')
    },
    delta: 50,
    trackTouch: true,
    trackMouse: false,
    preventScrollOnSwipe: false,
  })

  if (isLoading) return <div className={s.page}><div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading community...</div></div>
  if (fetchError) return <div className={s.page}><div className={s.error}>Failed to load community</div></div>
  if (!community) return <div className={s.page}><div className={s.error}>Community not found</div></div>

  return (
    <div className={s.page} {...backSwipeHandlers}>
      <div className={s.backRow}>
        <button className={s.backBtn} onClick={() => navigate('/communities')}>
          <ChevronLeft size={16} strokeWidth={1.5} />
          Communities
        </button>
      </div>

      <div className={s.commHeader}>
        <div className={s.commInfo}>
          <div className={s.commAvatar}>
            {!avatarError && community.avatar_url ? <img src={imageUrl(community.avatar_url)} onError={() => setAvatarError(true)} alt="" /> : <Users size={24} />}
          </div>
          <div>
            <h1 className={s.commName}>{community.name}</h1>
            <p className={s.commDesc}>{community.description}</p>
            <div className={s.commMeta}>
              <span>{community.member_count || 0} members</span>
              <span className={s.badge}>{community.visibility}</span>
              <span className={s.badge}>{community.join_type}</span>
            </div>
          </div>
        </div>
        <div className={s.commActions}>
          {myMembership ? (
            <>
              <RoleBadge role={myMembership.role} />
              <button className={s.leaveBtn} onClick={handleLeave}>Leave</button>
            </>
          ) : (
            <button className={s.joinBtn} onClick={handleJoin}>
              <UserPlus size={14} strokeWidth={1.5} />
              Join
            </button>
          )}
        </div>
      </div>

      {announcements.length > 0 && (
        <div className={s.announcements}>
          {announcements.map(a => (
            <div key={a.id} className={s.announcement}>
              <div className={s.annTitle}>{a.title}</div>
              <div className={s.annContent}>{a.content}</div>
              {isMod && (
                <button className={s.annDelete} onClick={async () => { await apiDelete('/communities/' + id + '/announcements/' + a.id); setAnnouncements(prev => prev.filter(x => x.id !== a.id)) }}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={s.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${s.tab} ${activeTab === t.id ? s.tabActive : ''}`}
            onClick={() => { setActiveTab(t.id); handleRefreshTab() }}
          >
            <t.icon size={16} strokeWidth={1.5} />
            <span>{t.label}</span>
          </button>
        ))}
        {isMod && (
          <button
            key="mod"
            className={`${s.tab} ${activeTab === 'mod' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('mod')}
          >
            <Shield size={16} strokeWidth={1.5} />
            <span>Mod Dashboard</span>
          </button>
        )}
      </div>

      {activeTab === 'chat' && (
        <div className={s.chatArea}>
          {pins.length > 0 && (
            <div className={s.pinBar}>
              {pins.map(pin => (
                <div key={pin.id} className={s.pinBarItem} onClick={() => document.getElementById('msg-' + pin.message_id)?.scrollIntoView({ behavior: 'smooth' })} style={{cursor: 'pointer'}}>
                  <Pin size={12} strokeWidth={1.5} />
                  <span className={s.pinBarText}>{pin.message_content}</span>
                  {isMod && (
                    <button className={s.pinBarUnpin} onClick={(e) => { e.stopPropagation(); handleUnpin(pin.id) }} title="Unpin">
                      <X size={10} strokeWidth={2} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className={s.messageSearch}>
            <Search size={16} strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchMessages}
              onChange={e => setSearchMessages(e.target.value)}
            />
            {searching && <Loader2 size={14} className={s.spinner} />}
            {searchMessages && !searching && (
              <button className={s.searchClear} onClick={() => { setSearchMessages(''); setDebouncedSearch('') }}>
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
          <div className={s.wsIndicator}>
            <span className={realtime.connected ? s.wsConnected : s.wsDisconnected}>
              {realtime.connected ? '● Live' : '○ Reconnecting'}
            </span>
          </div>
          {searchMessages ? (
            <div className={s.messageList}>
              {searchResults.length === 0 && !searching ? (
                <div className={s.chatEmpty}>
                  <Search size={32} strokeWidth={1} />
                  <p>No messages found</p>
                </div>
              ) : (
                searchResults.map(msg => {
                  const isPinned = pins.some(p => p.message_id === msg.id)
                  const pinRecord = pins.find(p => p.message_id === msg.id)
                  return (
                  <div key={msg.id} id={'msg-' + msg.id} className={`${s.message} ${s.msgRow} ${msg.deleted ? s.deleted : ''} ${msg.user_id === user?.id ? s.own : ''}`}>
                    <div className={s.msgMeta}>
                      <UserCard userId={msg.user_id}><span className={s.msgUser} onClick={(e) => { e.stopPropagation(); openProfile(msg.user_id) }}>{msg.user_name}</span></UserCard>
                      <RoleBadge role={msg.user_role} size="sm" />
                      <span className={s.msgTime}>{formatDate(msg.created_at)}</span>
                    </div>
                    {msg.deleted ? (
                      <div className={s.msgDeleted}>This message was deleted.</div>
                    ) : msg.message_type === 'system' ? (
                      <div className={s.msgSystem}>{msg.content}</div>
                    ) : msg.message_type === 'flashcard' ? (
                      <FlashcardMessage msg={msg} onAddToDeck={handleAddToDeck} />
                    ) : msg.message_type === 'file' ? (
                      <FileMessage msg={msg} accessToken={accessToken} />
                    ) : (
                      <div className={s.msgContent}><MentionText text={msg.content} /></div>
                    )}
                    <div className={s.msgActions}>
                      {isMod && !msg.deleted && msg.message_type !== 'system' && (
                        <button className={`${s.msgActionBtn} ${s.msgActionBtnPin} ${isPinned ? s.msgActionBtnPinned : ''}`} onClick={() => isPinned ? handleUnpin(pinRecord.id) : handlePinMsg(msg.id)} title={isPinned ? 'Unpin' : 'Pin'}>
                          <Pin size={12} strokeWidth={1.5} />
                        </button>
                      )}
                      {(msg.user_id === user?.id || isMod) && !msg.deleted && (
                        <button className={`${s.msgActionBtn} ${s.msgActionBtnDanger}`} onClick={() => handleDeleteMsg(msg.id)} title="Delete">
                          <Trash2 size={12} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                  )
                })
              )}
            </div>
          ) : (
          <div className={s.messageList}>
            {chat.loading && chat.messages.length === 0 ? (
              <div className={s.chatLoading}><Loader2 size={20} className={s.spinner} /></div>
            ) : chat.messages.length === 0 ? (
              <div className={s.chatEmpty}>
                <MessageSquare size={32} strokeWidth={1} />
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <>
                {pendingUploads.map(p => (
                  <div key={p.id} className={`${s.message} ${s.own} ${s.pendingMsg}`}>
                    <div className={s.msgMeta}>
                      <UserLink userId={user?.id} displayName={p.user_name} size="sm" showAvatar={false} />
                      <span className={s.msgTime}>{formatDate(p.created_at)}</span>
                    </div>
                    {p.status === 'uploading' ? (
                      <div className={s.pendingUpload}>
                        <Loader2 size={14} className={s.spinner} />
                        <span>Uploading {p.file_name}...</span>
                      </div>
                    ) : (
                      <div className={s.pendingFailed}>
                        <span>Failed to upload {p.file_name}</span>
                        {p.error && <span className={s.pendingError}>{p.error}</span>}
                        <button className={s.retryBtn} onClick={() => handleRetryUpload(p)}>
                          <Upload size={12} strokeWidth={1.5} /> Retry
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Virtuoso
                    style={{ height: '100%' }}
                    totalCount={chat.messages.length}
                    initialTopMostItemIndex={Math.max(0, chat.messages.length - 1)}
                    followOutput="auto"
                    startReached={() => {
                      if (chat.hasMore && !chat.loading) chat.loadMore()
                    }}
                    itemContent={(index) => {
                      const msg = chat.messages[index]
                      const isPinned = pins.some(p => p.message_id === msg.id)
                      const pinRecord = pins.find(p => p.message_id === msg.id)
                      return (
                      <div key={msg.id} id={'msg-' + msg.id} className={`${s.message} ${s.msgRow} ${msg.deleted ? s.deleted : ''} ${msg.user_id === user?.id ? s.own : ''}`}>
                        <div className={s.msgMeta}>
                          <UserCard userId={msg.user_id}><span className={s.msgUser} onClick={(e) => { e.stopPropagation(); openProfile(msg.user_id) }}>{msg.user_name}</span></UserCard>
                          <RoleBadge role={msg.user_role} size="sm" />
                          <span className={s.msgTime}>{formatDate(msg.created_at)}{msg.is_edited ? ' (edited)' : ''}</span>
                        </div>
                        {msg.deleted ? (
                          <div className={s.msgDeleted}>This message was deleted.</div>
                        ) : msg.message_type === 'system' ? (
                          <div className={s.msgSystem}>{msg.content}</div>
                        ) : msg.message_type === 'flashcard' ? (
                          <FlashcardMessage msg={msg} onAddToDeck={handleAddToDeck} />
                        ) : msg.message_type === 'file' ? (
                          <FileMessage msg={msg} accessToken={accessToken} />
                        ) : (
                          <div className={s.msgContent}><MentionText text={msg.content} /></div>
                        )}
                        <div className={s.msgActions}>
                          {isMod && !msg.deleted && msg.message_type !== 'system' && (
                            <button className={`${s.msgActionBtn} ${s.msgActionBtnPin} ${isPinned ? s.msgActionBtnPinned : ''}`} onClick={() => isPinned ? handleUnpin(pinRecord.id) : handlePinMsg(msg.id)} title={isPinned ? 'Unpin' : 'Pin'}>
                              <Pin size={12} strokeWidth={1.5} />
                            </button>
                          )}
                          {(msg.user_id === user?.id || isMod) && !msg.deleted && (
                            <button className={`${s.msgActionBtn} ${s.msgActionBtnDanger}`} onClick={() => handleDeleteMsg(msg.id)} title="Delete">
                              <Trash2 size={12} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                        {msg.message_type === 'flashcard' && msg.id && (
                          <button className={s.addToDeckBtn} onClick={() => handleAddToDeck(msg.id)}>
                            <BookOpen size={12} strokeWidth={1.5} />
                            Add to My Deck
                          </button>
                        )}
                      </div>
                      )
                    }}
                  />
                </div>
              </>
            )}
          </div>
          )}
          <div className={s.inputBar}>
            {hasPermission(myMembership?.role, PERM.UPLOAD_FILES) && (
              <>
                <button className={s.fileBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={16} className={s.spinner} /> : <Paperclip size={16} strokeWidth={1.5} />}
                </button>
                <input ref={fileInputRef} type="file" className={s.hiddenInput} onChange={handleFileUpload} />
              </>
            )}
            <button className={s.flashcardBtn} onClick={() => setShowFlashcardModal(true)}>
              <BookOpen size={16} strokeWidth={1.5} />
            </button>
            <MentionInput
              value={messageInput}
              onChange={setMessageInput}
              onSubmit={handleSend}
              placeholder="Type a message... Use @ to mention"
            />
            <button className={s.sendBtn} onClick={handleSend} disabled={!messageInput.trim() || sending}>
              {sending ? <Loader2 size={16} className={s.spinner} /> : <Send size={16} strokeWidth={1.5} />}
            </button>
          </div>
          {uploadError && <div className={s.uploadError}>{uploadError}</div>}
          {showFlashcardModal && (
            <FlashcardShareModal
              communityId={id}
               onShare={async (data) => {
                try {
                  await chat.sendFlashcard(data)
                  setShowFlashcardModal(false)
                  chat.fetchNewMessages()
                } catch (e) {
                  alert(e.message || 'Failed to share flashcard')
                }
              }}
              onClose={() => setShowFlashcardModal(false)}
            />
          )}
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <LeaderboardTab
          communityId={id}
          myId={user?.id}
          isAdmin={isAdmin}
          isMod={isMod}
        />
      )}

      {activeTab === 'competitions' && (
        <CompetitionsTab
          competitions={competitions}
          communityId={id}
          myId={user?.id}
          isAdmin={isAdmin}
          isMod={isMod}
          myMembership={myMembership}
          onRefresh={handleRefreshTab}
          realtimeConnected={realtime.connected}
        />
      )}

      {activeTab === 'voice' && (
        <VoiceRooms
          communityId={id}
          myRole={myMembership?.role}
          isMod={isMod}
          isAdmin={isAdmin}
        />
      )}

      {activeTab === 'stats' && (
        <div style={{ padding: '20px 0' }}>
          <CalendarHeatmap communityId={id} />
        </div>
      )}

      {activeTab === 'hall-of-fame' && (
        <HallOfFameTab communityId={id} />
      )}

      {activeTab === 'mod' && (
        <ModDashboardTab
          communityId={id}
          members={members}
          announcements={announcements}
          setAnnouncements={setAnnouncements}
          myId={user?.id}
          isMod={isMod}
          isAdmin={isAdmin}
          onRefresh={handleRefreshTab}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          community={community}
          rules={rules}
          settings={settings}
          members={members}
          announcements={announcements}
          setAnnouncements={setAnnouncements}
          joinRequests={joinRequests}
          bans={bans}
          isAdmin={isAdmin}
          isMod={isMod}
          communityId={id}
          myId={user?.id}
          onUpdate={fetchCommunity}
          onRefresh={handleRefreshTab}
          onRegenerateCode={handleRegenerateCode}
        />
      )}
    </div>
  )
}

function FlashcardMessage({ msg, onAddToDeck }) {
  const [flashcard, setFlashcard] = useState(null)
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    apiGet(`/communities/${msg.community_id}/messages/history?before=${msg.id}&limit=1`)
      .then(data => { if (data?.length) { const m = data[0]; setFlashcard({ front: m.content, back: m.content }) } })
      .catch(() => {})
  }, [msg.id])

  const front = flashcard?.front || msg.content || 'Front side'
  const back = flashcard?.back || msg.content || 'Back side'

  return (
    <div className={s.flashcardMsg}>
      <div className={s.flashcardLabel}>Shared Flashcard</div>
      <div className={s.flashcardPreview} onClick={() => setFlipped(!flipped)}>
        {flipped ? back : front}
      </div>
      <div className={s.flashcardHint}>Tap to flip</div>
    </div>
  )
}

function Lightbox({ src, fileName, accessToken, onClose }) {
  return (
    <Modal open={true} onOpenChange={(v) => { if (!v) onClose() }} size="xl">
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', zIndex: 1 }}
      >
        &times;
      </button>
      <img src={src} alt={fileName} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, display: 'block', margin: '0 auto' }} onClick={e => e.stopPropagation()} />
      {fileName && <div style={{ textAlign: 'center', marginTop: 12, color: 'var(--mist)', fontSize: 13 }}>{fileName}</div>}
    </Modal>
  )
}

function FileMessage({ msg, accessToken }) {
  const [showLightbox, setShowLightbox] = useState(false)
  const isImage = msg.mime_type?.startsWith('image/')
  const tokenSuffix = accessToken ? '?token=' + accessToken : ''
  const fileUrl = API + '/communities/' + msg.community_id + '/files/' + msg.id + tokenSuffix

  return (
    <div className={s.fileMsg}>
      {isImage ? (
        <>
          <img src={fileUrl} alt={msg.file_name} className={s.filePreview} onClick={() => setShowLightbox(true)} loading="lazy" />
          {showLightbox && <Lightbox src={fileUrl} fileName={msg.file_name} accessToken={accessToken} onClose={() => setShowLightbox(false)} />}
        </>
      ) : (
        <div className={s.fileInfo}>
          <FileText size={20} strokeWidth={1.5} />
          <span className={s.fileName}>{msg.file_name}</span>
          <span className={s.fileSize}>{msg.file_size ? (msg.file_size / 1024).toFixed(0) + 'KB' : ''}</span>
          <a href={fileUrl} download={msg.file_name} className={s.fileDownloadBtn}>
            Download
          </a>
        </div>
      )}
    </div>
  )
}
