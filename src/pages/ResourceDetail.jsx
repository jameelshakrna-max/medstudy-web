import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { queryKeys } from '../lib/queryKeys'
import {
  ArrowLeft, Download, ChevronUp, ChevronDown,
  Trash2, MessageCircle, Reply, Loader2, FileText, ExternalLink, Maximize2
} from 'lucide-react'
import s from './ResourceDetail.module.css'

const API = import.meta.env.VITE_API_URL || '/api'

async function apiJson(res) {
  if (!res.ok) {
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text).error || text } catch { msg = text.slice(0, 300) }
    throw new Error(msg || `Request failed (${res.status})`)
  }
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

function formatDate(iso) {
  if (!iso) return ''
  const normalized = iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z')
  const d = new Date(normalized)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago'
  return d.toLocaleDateString()
}

const CATEGORY_COLORS = {
  internal_medicine: 'var(--emerald)',
  surgery: 'var(--red)',
  pharmacology: 'var(--amber)',
  other: 'var(--indigo)',
}

const TYPE_LABELS = {
  book: '📖 Book',
  questions: '❓ Questions',
  summary: '📝 Summary',
  lecture_notes: '📋 Lecture Notes',
  anki_deck: '🃏 Anki Deck',
  cheat_sheet: '📌 Cheat Sheet',
  reference: '📚 Reference',
  practice_test: '✍️ Practice Test',
  flashcards: '🔖 Flashcards',
  video: '🎬 Video',
  audio: '🎧 Audio',
  other: '📁 Other',
}

export default function ResourceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [sessionToken, setSessionToken] = useState('')
  const [userId, setUserId] = useState('')
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [sending, setSending] = useState(false)
  const pdfRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionToken(session.access_token)
        setUserId(session.user?.id || '')
      }
    })
  }, [])

  const resourceQuery = useQuery({
    queryKey: queryKeys.resources.detail(id),
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(API + '/resources/' + id, { headers: { Authorization: 'Bearer ' + session.access_token } })
      return apiJson(res)
    },
    enabled: !!id && !!sessionToken,
    staleTime: 30_000,
  })

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(API + '/categories', { headers: { Authorization: 'Bearer ' + session.access_token } })
      return apiJson(res)
    },
    staleTime: 300_000,
  })

  const commentsQuery = useQuery({
    queryKey: queryKeys.resources.comments(id),
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams()
      if (session?.user?.id) params.set('user_id', session.user.id)
      const res = await fetch(API + '/resources/' + id + '/comments?' + params, {
        headers: { Authorization: 'Bearer ' + session.access_token }
      })
      return apiJson(res)
    },
    enabled: !!id && !!sessionToken,
    staleTime: 15_000,
  })

  const resource = resourceQuery.data
  const categories = categoriesQuery.data ?? []
  const comments = commentsQuery.data ?? []
  const loading = resourceQuery.isLoading

  const handleVote = async (commentId, vote) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(API + '/comments/' + commentId + '/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ vote })
    })
    queryClient.invalidateQueries({ queryKey: queryKeys.resources.comments(id) })
  }

  const handleAddComment = async () => {
    if (!commentText.trim() || sending) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(API + '/resources/' + id + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ content: commentText.trim(), parent_id: replyTo, user_name: profile?.full_name || 'User' })
    })
    setCommentText('')
    setReplyTo(null)
    setSending(false)
    queryClient.invalidateQueries({ queryKey: queryKeys.resources.comments(id) })
  }

  const handleDeleteComment = async (commentId) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(API + '/comments/' + commentId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + session.access_token }
    })
    queryClient.invalidateQueries({ queryKey: queryKeys.resources.comments(id) })
  }

  const handleDeleteResource = async () => {
    if (!confirm('Delete this resource permanently?')) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(API + '/resources/' + id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + session.access_token }
    })
    navigate('/resources')
  }

  const topComments = comments.filter(c => !c.parent_id)
  const replies = comments.filter(c => c.parent_id)

  const fileExt = resource?.file_name?.split('.').pop()?.toLowerCase()
  const isPdf = resource?.mime_type === 'application/pdf' || fileExt === 'pdf'
  const isImage = resource?.mime_type?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fileExt || '')

  if (loading) return (
    <div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading...</div>
  )
  if (!resource) return (
    <div className={s.error}>
      <p>Resource not found</p>
      <button className={s.backBtn} onClick={() => navigate('/resources')}>← Back to Resources</button>
    </div>
  )

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/resources')}>
        <ArrowLeft size={16} strokeWidth={1.5} /> Back to Resources
      </button>

      <div className={s.layout}>
        <div className={s.previewSection}>
          <div className={s.preview}>
            {isPdf ? (
              <>
                <div className={s.pdfDesktop}>
                  <div className={s.pdfWrap}>
                    <iframe
                      ref={pdfRef}
                      src={API + '/resources/' + id + '/file?token=' + sessionToken}
                      className={s.previewFrame}
                      title={resource.title}
                    />
                    <button
                      className={s.fullscreenBtn}
                      onClick={() => pdfRef.current?.requestFullscreen()}
                      title="Fullscreen"
                    >
                      <Maximize2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className={s.pdfOpenLink}>
                    <a
                      href={API + '/resources/' + id + '/file?token=' + sessionToken}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={s.openPdfBtn}
                    >
                      <ExternalLink size={14} strokeWidth={1.5} /> Open in new tab
                    </a>
                  </div>
                </div>
                <div className={s.pdfMobile}>
                  <FileText size={64} strokeWidth={1} />
                  <p>Open PDF to view full content</p>
                  <a
                    href={API + '/resources/' + id + '/file?token=' + sessionToken}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={s.openPdfBig}
                  >
                    <ExternalLink size={18} strokeWidth={1.5} /> Open PDF
                  </a>
                </div>
              </>
            ) : isImage ? (
              <img
                src={API + '/resources/' + id + '/file?token=' + sessionToken}
                alt={resource.title}
                className={s.previewImage}
              />
            ) : (
              <div className={s.previewFallback}>
                <FileText size={64} strokeWidth={1} />
                <p>Preview not available for this file type</p>
                <a href={API + '/resources/' + id + '/download?token=' + sessionToken} className={s.downloadBtn} download>
                  <Download size={16} strokeWidth={1.5} /> Download to view
                </a>
              </div>
            )}
          </div>

          <div className={s.commentsSection}>
            <h3 className={s.commentsTitle}>
              <MessageCircle size={16} strokeWidth={1.5} />
              Comments ({comments.length})
            </h3>

            <div className={s.commentInputWrap}>
              {replyTo && (
                <div className={s.replyIndicator}>
                  Replying to {comments.find(c => c.id === replyTo)?.user_name || 'comment'}
                  <button className={s.cancelReply} onClick={() => setReplyTo(null)}>
                    Cancel
                  </button>
                </div>
              )}
              <textarea
                className={s.commentInput}
                placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
                rows={3}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <div className={s.commentInputActions}>
                <span className={s.commentHint}>Be respectful and constructive</span>
                <button
                  className={s.commentSend}
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || sending}
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>

            <div className={s.commentsList}>
              {topComments.map(comment => (
                <div key={comment.id}>
                  <CommentCard
                    comment={comment}
                    userId={userId}
                    onVote={handleVote}
                    onReply={setReplyTo}
                    onDelete={handleDeleteComment}
                    replyTo={replyTo}
                  />
                  {replies.filter(r => r.parent_id === comment.id).map(reply => (
                    <div key={reply.id} className={s.replyThread}>
                      <div className={s.replyLine} />
                      <CommentCard
                        comment={reply}
                    userId={userId}
                        onVote={handleVote}
                        onReply={setReplyTo}
                        onDelete={handleDeleteComment}
                        replyTo={replyTo}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {comments.length === 0 && (
                <p className={s.noComments}>No comments yet. Be the first to share your thoughts!</p>
              )}
            </div>
          </div>
        </div>

        <div className={s.sideSection}>
          {resource.image_key && (
            <div className={s.coverWrap}>
              <img src={API + '/resources/' + id + '/image?token=' + sessionToken} alt="" className={s.coverImage} loading="lazy" />
            </div>
          )}

          <h1 className={s.resourceTitle}>{resource.title}</h1>

          <div className={s.metaSection}>
            <div className={s.metaRow}>
              <span className={s.metaLabel}>Category</span>
              <span className={s.metaValue} style={{ color: CATEGORY_COLORS[resource.category] || 'var(--blue)' }}>
                {categories.find(c => c.id === resource.category)?.name || resource.category}
              </span>
            </div>
            {resource.type && (
              <div className={s.metaRow}>
                <span className={s.metaLabel}>Type</span>
                <span className={s.metaValue}>{TYPE_LABELS[resource.type] || resource.type}</span>
              </div>
            )}
            <div className={s.metaRow}>
              <span className={s.metaLabel}>Uploaded by</span>
              <span className={s.metaValue}>
                <span
                  onClick={() => navigate(`/profile/${resource.user_id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/profile/${resource.user_id}`)}
                  style={{ cursor: 'pointer', color: 'var(--blue)' }}
                >
                  {resource.user_name}
                </span>
              </span>
            </div>
            <div className={s.metaRow}>
              <span className={s.metaLabel}>Date</span>
              <span className={s.metaValue}>{formatDate(resource.created_at)}</span>
            </div>
            <div className={s.metaRow}>
              <span className={s.metaLabel}>File</span>
              <span className={s.metaValue}>{resource.file_name}</span>
            </div>
            <div className={s.metaRow}>
              <span className={s.metaLabel}>Size</span>
              <span className={s.metaValue}>{formatFileSize(resource.file_size)}</span>
            </div>
          </div>

          {resource.description && (
            <div className={s.description}>
              <h4>Description</h4>
              <p>{resource.description}</p>
            </div>
          )}

          {resource.tags?.length > 0 && (
            <div className={s.tagsSection}>
              <h4>Tags</h4>
              <div className={s.tagsList}>
                {resource.tags.map(t => <span key={t} className={s.tag}>{t}</span>)}
              </div>
            </div>
          )}

          <a href={API + '/resources/' + id + '/download?token=' + sessionToken} className={s.downloadBig} download>
            <Download size={18} strokeWidth={1.5} /> Download File
          </a>

          {resource.user_id === userId && (
            <button className={s.deleteBtn} onClick={handleDeleteResource}>
              <Trash2 size={16} strokeWidth={1.5} /> Delete Resource
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CommentCard({ comment, userId, onVote, onReply, onDelete, replyTo }) {
  const navigate = useNavigate()
  const isOwn = userId === comment.user_id
  const netVotes = (comment.upvotes || 0) - (comment.downvotes || 0)

  return (
    <div className={`${s.commentCard} ${comment.removed ? s.commentRemoved : ''}`}>
      <div className={s.commentVotes}>
        <button
          className={`${s.voteBtn} ${comment.user_vote === 1 ? s.votedUp : ''}`}
          onClick={() => onVote(comment.id, comment.user_vote === 1 ? 0 : 1)}
          title="Upvote"
        >
          <ChevronUp size={16} strokeWidth={2} />
        </button>
        <span className={`${s.voteCount} ${netVotes > 0 ? s.positive : netVotes < 0 ? s.negative : ''}`}>
          {netVotes}
        </span>
        <button
          className={`${s.voteBtn} ${comment.user_vote === -1 ? s.votedDown : ''}`}
          onClick={() => onVote(comment.id, comment.user_vote === -1 ? 0 : -1)}
          title="Downvote"
        >
          <ChevronDown size={16} strokeWidth={2} />
        </button>
      </div>
      <div className={s.commentContent}>
        <div className={s.commentHeader}>
          <span
            className={s.commentAuthor}
            onClick={() => navigate(`/profile/${comment.user_id}`)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/profile/${comment.user_id}`)}
            style={{ cursor: 'pointer' }}
          >
            {comment.user_name}
          </span>
          <span className={s.commentTime}>{formatDate(comment.created_at)}</span>
          {comment.removed && <span className={s.removedBadge}>Removed</span>}
        </div>
        <p className={s.commentText}>{comment.content}</p>
        {!comment.removed && (
          <div className={s.commentActions}>
            <button className={s.commentAction} onClick={() => onReply(comment.id)}>
              <Reply size={12} strokeWidth={1.5} /> Reply
            </button>
            {isOwn && (
              <button className={s.commentAction} onClick={() => onDelete(comment.id)}>
                <Trash2 size={12} strokeWidth={1.5} /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
