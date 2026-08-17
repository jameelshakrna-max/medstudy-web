import { ExternalLink, ArrowUp, MessageSquare, CheckCircle, Bookmark, BookmarkCheck, Clock, Trash2 } from 'lucide-react'
import { UserLink } from '../ui'
import s from './ResearchPostCard.module.css'

export const CATEGORY_COLORS = {
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

export function timeAgo(dateStr) {
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

export default function ResearchPostCard({ post, onOpen, onVote, onBookmark, onDelete, user }) {
  return (
    <article className={s.postCard} data-testid="research-post-card">
      <div className={s.postHeader}>
        <UserLink userId={post.user_id} username={post.username} avatar={post.avatar_url} size="sm" />
        <div className={s.postUserInfo}>
          {post.reputation > 0 && <span className={s.postRep}>{post.reputation} rep</span>}
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

      <button className={s.postTitle} onClick={() => onOpen(post)} type="button" data-testid="post-title-btn">
        {post.title}
      </button>

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

      {post.description && <div className={s.postDesc}>{post.description}</div>}

      {post.tags?.length > 0 && (
        <div className={s.tags}>
          {post.tags.map((tag) => <span key={tag} className={s.tag}>{tag}</span>)}
        </div>
      )}

      <div className={s.postFooter}>
        <button
          className={`${s.postAction} ${post.user_vote === 1 ? s.postActionActive : ''}`}
          onClick={(e) => { e.stopPropagation(); if (!user) return; onVote(post.id, 1) }}
          aria-label="Upvote"
        >
          <ArrowUp size={14} /> {post.upvotes_count || 0}
        </button>
        <button
          className={s.postAction}
          onClick={(e) => { e.stopPropagation(); onOpen(post) }}
          aria-label={`${post.comments_count || 0} comments`}
        >
          <MessageSquare size={14} /> {post.comments_count || 0}
        </button>
        <span className={s.postAction}>
          <CheckCircle size={14} /> {post.helped_count || 0}
        </span>
        {user && (
          <button
            className={`${s.postAction} ${post.is_bookmarked ? s.postActionActive : ''}`}
            onClick={(e) => { e.stopPropagation(); onBookmark(post.id) }}
            aria-label={post.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            {post.is_bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>
        )}
        <span className={s.postTimestamp}>
          <Clock size={11} /> {timeAgo(post.created_at)}
        </span>
        {user && post.user_id === user.id && (
          <button
            className={`${s.postAction} ${s.deleteAction}`}
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this post?')) onDelete(post.id) }}
            aria-label="Delete post"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </article>
  )
}
