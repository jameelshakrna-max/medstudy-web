import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunityRealtime } from '../hooks/useCommunityRealtime'
import { ROLES, PERM, hasPermission, hasMinimumRole } from '../lib/permissions'
import { apiGet, apiPost, apiPut, apiDelete, apiJson, formatDate } from '../lib/api'
import RoleBadge from '../components/RoleBadge'
import MembersTab from '../components/community/MembersTab'
import CompetitionsTab from '../components/community/CompetitionsTab'
import SettingsTab from '../components/community/SettingsTab'
import ModDashboardTab from '../components/community/ModDashboardTab'
import {
  MessageSquare, Users, Trophy, Settings, Send, Paperclip, Upload,
  Plus, X, Loader2, ChevronLeft, Shield, UserMinus, UserCog, Star,
  Crown, Flag, Clock, Hash, Link as LinkIcon, Check, AlertTriangle,
  Copy, Ban,   Pin, FileText, BookOpen, UserPlus, Search
} from 'lucide-react'
import s from './CommunityDetail.module.css'
import FlashcardShareModal from '../components/FlashcardShareModal'

const API = import.meta.env.VITE_API_URL || '/api'

const TABS = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'members', icon: Users, label: 'Members' },
  { id: 'competitions', icon: Trophy, label: 'Competitions' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]

export default function CommunityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [community, setCommunity] = useState(null)
  const [members, setMembers] = useState([])
  const [myMembership, setMyMembership] = useState(null)
  const [activeTab, setActiveTab] = useState('chat')
  useEffect(() => { console.log('[CommunityDetail] activeTab changed to:', activeTab) }, [activeTab])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rules, setRules] = useState([])
  const [pins, setPins] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [settings, setSettings] = useState(null)
  const [levels, setLevels] = useState([])
  const [competitions, setCompetitions] = useState([])
  const [joinRequests, setJoinRequests] = useState([])
  const [bans, setBans] = useState([])

  const realtime = useCommunityRealtime(id)
  const chat = realtime
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [searchMessages, setSearchMessages] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
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

    const isAdmin = hasMinimumRole(myMembership?.role, ROLES.ADMINISTRATOR)
    const isMod = hasMinimumRole(myMembership?.role, ROLES.MODERATOR)

  const fetchCommunity = useCallback(async () => {
    try {
      const data = await apiGet('/communities/' + id + '/full')
      setCommunity(data.community)
      setMembers(Array.isArray(data.members) ? data.members : [])
      setLevels(Array.isArray(data.levels) ? data.levels : [])
      setCompetitions(Array.isArray(data.competitions) ? data.competitions : [])
      setRules(Array.isArray(data.rules) ? data.rules : [])
      setPins(Array.isArray(data.pins) ? data.pins : [])
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : [])
      setSettings(data.settings || null)
      setBans(Array.isArray(data.bans) ? data.bans : [])
      setJoinRequests(Array.isArray(data.joinRequests) ? data.joinRequests : [])
      const me = Array.isArray(data.members) ? data.members.find(m => m.user_id === user?.id) : null
      setMyMembership(me || null)
    } catch (e) {
      setError('Failed to load community')
    }
    setLoading(false)
  }, [id, user])

  useEffect(() => { fetchCommunity() }, [fetchCommunity])

  useEffect(() => {
    chat.setActive(activeTab === 'chat')
  }, [activeTab, chat])

  useEffect(() => {
    if (realtime.competitions?.length) setCompetitions(realtime.competitions)
  }, [realtime.competitions])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.messages])

  useEffect(() => {
    if (!searchMessages.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await apiGet(`/communities/${id}/messages?q=${encodeURIComponent(searchMessages)}`)
        setSearchResults(Array.isArray(data) ? data : [])
      } catch {}
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchMessages, id])

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
      else fetchCommunity()
    } catch (e) { alert(e.message) }
  }

  const handleLeave = async () => {
    if (!confirm('Leave this community?')) return
    try {
      await apiPost('/communities/' + id + '/leave', {})
      navigate('/communities')
    } catch (e) { alert(e.message) }
  }

  const handleCopyInvite = () => {
    if (community?.invite_code) {
      navigator.clipboard.writeText(window.location.origin + '/communities/join/' + community.invite_code)
    }
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
      if (data.invite_code) setCommunity(prev => ({ ...prev, invite_code: data.invite_code }))
    } catch {}
  }

  const handleRefreshTab = async (tab) => {
    try {
      if (tab === 'members') {
        const m = await apiGet('/communities/' + id + '/members')
        setMembers(Array.isArray(m) ? m : [])
      }
      if (tab === 'competitions') {
        const c = await apiGet('/communities/' + id + '/competitions')
        setCompetitions(Array.isArray(c) ? c : [])
      }
      if (tab === 'settings') {
        const r = await apiGet('/communities/' + id + '/rules')
        setRules(Array.isArray(r) ? r : [])
        const l = await apiGet('/communities/' + id + '/levels')
        setLevels(Array.isArray(l) ? l : [])
        setSettings(await apiGet('/communities/' + id + '/settings'))
        if (isMod) {
          const jr = await apiGet('/communities/' + id + '/join-requests')
          setJoinRequests(Array.isArray(jr) ? jr : [])
          const bn = await apiGet('/communities/' + id + '/bans')
          setBans(Array.isArray(bn) ? bn : [])
        } else {
          setJoinRequests([])
          setBans([])
        }
      }
    } catch {}
  }

  if (loading) return <div className={s.page}><div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading community...</div></div>
  if (error) return <div className={s.page}><div className={s.error}>{error}</div></div>
  if (!community) return <div className={s.page}><div className={s.error}>Community not found</div></div>

  return (
    <div className={s.page}>
      <div className={s.backRow}>
        <button className={s.backBtn} onClick={() => navigate('/communities')}>
          <ChevronLeft size={16} strokeWidth={1.5} />
          Communities
        </button>
      </div>

      <div className={s.commHeader}>
        <div className={s.commInfo}>
          <div className={s.commAvatar}>
            {community.avatar_url ? <img src={community.avatar_url} alt="" /> : <Users size={24} />}
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
            onClick={() => { setActiveTab(t.id); handleRefreshTab(t.id) }}
          >
            <t.icon size={16} strokeWidth={1.5} />
            {t.label}
          </button>
        ))}
        {isMod && (
          <button
            key="mod"
            className={`${s.tab} ${activeTab === 'mod' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('mod')}
          >
            Mod Dashboard
          </button>
        )}
      </div>

      {activeTab === 'chat' && (
        <div className={s.chatArea}>
          {pins.length > 0 && (
            <div className={s.pinBar}>
              <Pin size={12} strokeWidth={1.5} />
              <span>{pins[0].message_content}</span>
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
              <button className={s.searchClear} onClick={() => setSearchMessages('')}>
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
          {searchMessages ? (
            <div className={s.messageList}>
              {searchResults.length === 0 && !searching ? (
                <div className={s.chatEmpty}>
                  <Search size={32} strokeWidth={1} />
                  <p>No messages found</p>
                </div>
              ) : (
                searchResults.map(msg => (
                  <div key={msg.id} className={`${s.message} ${msg.deleted ? s.deleted : ''} ${msg.user_id === user?.id ? s.own : ''}`}>
                    <div className={s.msgMeta}>
                      <span className={s.msgUser}>{msg.user_name}</span>
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
                      <div className={s.msgContent}>{msg.content}</div>
                    )}
                  </div>
                ))
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
                {chat.hasMore && (
                  <button className={s.loadMore} onClick={chat.loadMore}>Load older messages</button>
                )}
                {pendingUploads.map(p => (
                  <div key={p.id} className={`${s.message} ${s.own} ${s.pendingMsg}`}>
                    <div className={s.msgMeta}>
                      <span className={s.msgUser}>{p.user_name}</span>
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
                {chat.messages.map(msg => (
                  <div key={msg.id} className={`${s.message} ${msg.deleted ? s.deleted : ''} ${msg.user_id === user?.id ? s.own : ''}`}>
                    <div className={s.msgMeta}>
                      <span className={s.msgUser}>{msg.user_name}</span>
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
                      <div className={s.msgContent}>{msg.content}</div>
                    )}
                    {msg.message_type === 'flashcard' && msg.id && (
                      <button className={s.addToDeckBtn} onClick={() => handleAddToDeck(msg.id)}>
                        <BookOpen size={12} strokeWidth={1.5} />
                        Add to My Deck
                      </button>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
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
            <input
              className={s.chatInput}
              type="text"
              placeholder="Type a message..."
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
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

      {activeTab === 'members' && (
        <MembersTab
          members={members}
          myId={user?.id}
          levels={levels}
          isAdmin={isAdmin}
          isMod={isMod}
          communityId={id}
          onRefresh={() => handleRefreshTab('members')}
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
          onRefresh={() => handleRefreshTab('competitions')}
          realtimeConnected={realtime.connected}
        />
      )}

      {activeTab === 'mod' && (() => { console.log('[CommunityDetail] rendering ModDashboardTab, setActiveTab is', typeof setActiveTab); return <ModDashboardTab communityId={id} onNavigate={setActiveTab} /> })()}

      {activeTab === 'settings' && (
        <SettingsTab
          community={community}
          rules={rules}
          levels={levels}
          settings={settings}
          joinRequests={joinRequests}
          bans={bans}
          isAdmin={isAdmin}
          isMod={isMod}
          communityId={id}
          onUpdate={fetchCommunity}
          onRefresh={() => handleRefreshTab('settings')}
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
    apiGet(`/communities/${msg.community_id}/messages/history?before=${msg.id}&limit=1`).catch(() => {})
  }, [msg.id])

  return (
    <div className={s.flashcardMsg}>
      <div className={s.flashcardLabel}>Shared Flashcard</div>
      <div className={s.flashcardPreview} onClick={() => setFlipped(!flipped)}>
        {flipped ? msg.content : msg.content || 'Front side'}
      </div>
      <div className={s.flashcardHint}>Tap to flip</div>
    </div>
  )
}

function Lightbox({ src, fileName, accessToken, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={s.lightboxOverlay} onClick={onClose}>
      <button className={s.lightboxClose} onClick={onClose} aria-label="Close">&times;</button>
      <img src={src} alt={fileName} className={s.lightboxImage} onClick={e => e.stopPropagation()} />
      {fileName && <div className={s.lightboxInfo}>{fileName}</div>}
    </div>
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
          <img src={fileUrl} alt={msg.file_name} className={s.filePreview} onClick={() => setShowLightbox(true)} />
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


