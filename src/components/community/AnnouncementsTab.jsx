import { useState } from 'react'
import { Megaphone, Plus, X, Edit3, Loader2 } from 'lucide-react'
import { apiPost, apiPut, apiDelete } from '../../lib/api'
import s from '../../pages/CommunityDetail.module.css'

export default function AnnouncementsTab({ announcements, setAnnouncements, communityId, isMod }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      const result = await apiPost(`/communities/${communityId}/announcements`, { title, content })
      if (result?.id) {
        setAnnouncements(prev => prev.some(x => x.id === result.id) ? prev : [result, ...prev])
      }
      setTitle('')
      setContent('')
      setShowForm(false)
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  const handleEdit = async (id) => {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      await apiPut(`/communities/${communityId}/announcements/${id}`, { title, content })
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, title, content } : a))
      setEditingId(null)
      setTitle('')
      setContent('')
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return
    try {
      await apiDelete(`/communities/${communityId}/announcements/${id}`)
      setAnnouncements(prev => prev.filter(a => a.id !== id))
    } catch (e) { alert(e.message) }
  }

  const startEdit = (a) => {
    setEditingId(a.id)
    setTitle(a.title)
    setContent(a.content)
    setShowForm(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setTitle('')
    setContent('')
  }

  const sorted = [...announcements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div>
      <div className={s.annTabHeader}>
        <h3 className={s.annTabTitle}>Announcements</h3>
        {isMod && !editingId && (
          <button className={s.createAnnBtn} onClick={() => { setShowForm(!showForm); setTitle(''); setContent('') }}>
            <Plus size={14} strokeWidth={1.5} /> New
          </button>
        )}
      </div>

      {showForm && (
        <form className={s.annForm} onSubmit={handleCreate}>
          <input className={s.annFormInput} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className={s.annFormTextarea} placeholder="Content" value={content} onChange={e => setContent(e.target.value)} rows={3} />
          <div className={s.annFormActions}>
            <button className={s.saveBtn} type="submit" disabled={saving || !title.trim() || !content.trim()}>
              {saving && <Loader2 size={14} className={s.spinner} />} Create
            </button>
            <button className={s.cancelBtn} type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {editingId && (
        <form className={s.annForm} onSubmit={(e) => { e.preventDefault(); handleEdit(editingId) }}>
          <input className={s.annFormInput} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className={s.annFormTextarea} placeholder="Content" value={content} onChange={e => setContent(e.target.value)} rows={3} />
          <div className={s.annFormActions}>
            <button className={s.saveBtn} type="submit" disabled={saving || !title.trim() || !content.trim()}>
              {saving && <Loader2 size={14} className={s.spinner} />} Save
            </button>
            <button className={s.cancelBtn} type="button" onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className={s.empty}>
          <Megaphone size={32} strokeWidth={1} />
          <p>No announcements yet.</p>
        </div>
      ) : (
        <div className={s.annList}>
          {sorted.map(a => (
            <div key={a.id} className={s.annCard}>
              <div className={s.annCardTitle}>{a.title}</div>
              <div className={s.annCardContent}>{a.content}</div>
              <div className={s.annCardMeta}>
                <span>{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              {isMod && (
                <div className={s.annCardActions}>
                  <button className={s.iconBtnSm} onClick={() => startEdit(a)}><Edit3 size={12} strokeWidth={1.5} /> Edit</button>
                  <button className={s.iconBtnSmDanger} onClick={() => handleDelete(a.id)}><X size={12} strokeWidth={1.5} /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
