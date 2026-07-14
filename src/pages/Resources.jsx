import { useEffect, useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Upload, Search, ArrowUpDown, X, FileText, Image,
  Download, Eye, Plus, Loader2, FolderOpen
} from 'lucide-react'
import s from './Resources.module.css'

const API = import.meta.env.VITE_API_URL || '/api'

const MIME_ICONS = {
  'application/pdf': '📄',
  'image/': '🖼️',
  'application/zip': '📦',
  'text/': '📝',
}

const RESOURCE_TYPES = [
  { value: '', label: 'Select type...' },
  { value: 'book', label: '📖 Book' },
  { value: 'questions', label: '❓ Questions' },
  { value: 'summary', label: '📝 Summary' },
  { value: 'lecture_notes', label: '📋 Lecture Notes' },
  { value: 'anki_deck', label: '🃏 Anki Deck' },
  { value: 'cheat_sheet', label: '📌 Cheat Sheet' },
  { value: 'reference', label: '📚 Reference' },
  { value: 'practice_test', label: '✍️ Practice Test' },
  { value: 'flashcards', label: '🔖 Flashcards' },
  { value: 'video', label: '🎬 Video' },
  { value: 'audio', label: '🎧 Audio' },
  { value: 'other', label: '📁 Other' },
]

const TYPE_LABELS = Object.fromEntries(RESOURCE_TYPES.filter(t => t.value).map(t => [t.value, t.label]))

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'book', label: '📖 Book' },
  { value: 'questions', label: '❓ Questions' },
  { value: 'summary', label: '📝 Summary' },
  { value: 'lecture_notes', label: '📋 Notes' },
  { value: 'anki_deck', label: '🃏 Anki' },
  { value: 'video', label: '🎬 Video' },
  { value: 'audio', label: '🎧 Audio' },
  { value: 'other', label: '📁 Other' },
]

function fileIcon(mime, name) {
  for (const [prefix, icon] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(prefix)) return icon
  }
  const ext = name?.split('.').pop()?.toLowerCase()
  const extMap = { doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📽️', pptx: '📽️', mp4: '🎬', mov: '🎬', mp3: '🎵' }
  return extMap[ext] || '📄'
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
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

const CATEGORY_COLORS = {
  internal_medicine: 'var(--emerald)',
  surgery: 'var(--red)',
  pharmacology: 'var(--amber)',
  other: 'var(--indigo)',
}

export default function Resources() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [resources, setResources] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState('created_at')
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [sessionToken, setSessionToken] = useState('')

  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formType, setFormType] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formFile, setFormFile] = useState(null)
  const [formImage, setFormImage] = useState(null)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const fileRef = useRef(null)
  const imageRef = useRef(null)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [imageDragOver, setImageDragOver] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { console.warn('fetchCategories: no session'); return }
      const res = await fetch(API + '/categories', {
        headers: { Authorization: 'Bearer ' + session.access_token }
      })
      if (res.ok) setCategories(await apiJson(res))
      else console.error('fetchCategories failed:', res.status, await res.text().catch(() => ''))
    } catch (e) { console.error('fetchCategories error:', e) }
  }, [])

  const fetchResources = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const params = new URLSearchParams()
      if (selectedCategory) params.set('category', selectedCategory)
      if (selectedType) params.set('type', selectedType)
      if (searchQuery) params.set('search', searchQuery)
      params.set('sort', sort)
      const res = await fetch(API + '/resources?' + params, {
        headers: { Authorization: 'Bearer ' + session.access_token }
      })
      if (res.ok) setResources(await apiJson(res))
    } catch {} // silently fail
    setLoading(false)
  }, [selectedCategory, selectedType, searchQuery, sort])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setSessionToken(session.access_token)
    })
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])
  useEffect(() => { fetchResources() }, [fetchResources])

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(API + '/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ name: newCategoryName.trim() })
    })
    const cat = await apiJson(res)
    setCategories(prev => [...prev, cat])
    setFormCategory(cat.id)
    setShowNewCategory(false)
    setNewCategoryName('')
  }

  const handleUpload = async () => {
    if (!formTitle.trim() || !formCategory || !formFile) return
    setUploading(true)
    setUploadProgress(0)

    const { data: { session } } = await supabase.auth.getSession()
    const fd = new FormData()
    fd.append('title', formTitle.trim())
    fd.append('category', formCategory)
    fd.append('type', formType)
    fd.append('description', formDescription)
    fd.append('tags', JSON.stringify(formTags.split(',').map(t => t.trim()).filter(Boolean)))
    fd.append('user_name', profile?.full_name || 'User')
    fd.append('file', formFile)
    if (formImage) fd.append('image', formImage)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
    })

    try {
      const result = await new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) }
            catch { resolve({}) }
          } else reject(new Error(xhr.responseText || 'Upload failed'))
        })
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('POST', API + '/resources')
        xhr.setRequestHeader('Authorization', 'Bearer ' + session.access_token)
        xhr.send(fd)
      })
      setUploadOpen(false)
      resetForm()
      fetchResources()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const resetForm = () => {
    setFormTitle('')
    setFormCategory('')
    setFormType('')
    setFormDescription('')
    setFormTags('')
    setFormFile(null)
    setFormImage(null)
    setShowNewCategory(false)
    setNewCategoryName('')
  }

  const handleFileDrop = (e, isImage) => {
    e.preventDefault()
    setFileDragOver(false)
    setImageDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      if (isImage) setFormImage(file)
      else setFormFile(file)
    }
  }

  const sizeWarning = formFile && formFile.size > 90 * 1024 * 1024

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerTop}>
          <h1 className={s.title}>Resources</h1>
          <button className={s.uploadBtn} onClick={() => setUploadOpen(true)} disabled={uploading}>
            <Upload size={16} strokeWidth={1.5} />
            Upload
          </button>
        </div>
        <div className={s.toolbar}>
          <div className={s.searchWrap}>
            <Search size={16} strokeWidth={1.5} className={s.searchIcon} />
            <input
              className={s.searchInput}
              type="text"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && <X size={14} className={s.clearBtn} onClick={() => setSearchQuery('')} />}
          </div>
          <div className={s.sortWrap}>
            <ArrowUpDown size={14} strokeWidth={1.5} />
            <select className={s.sortSelect} value={sort} onChange={e => setSort(e.target.value)}>
              <option value="created_at">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">A–Z</option>
              <option value="largest">Largest</option>
              <option value="smallest">Smallest</option>
            </select>
          </div>
        </div>
      </div>

      <div className={s.tabs}>
        {['', ...categories].map(cat => {
          const isAll = cat === ''
          const id = isAll ? '' : cat.id
          const name = isAll ? 'All' : cat.name
          const active = isAll ? !selectedCategory : selectedCategory === id
          return (
            <button
              key={isAll ? 'all' : cat.id}
              className={`${s.tab} ${active ? s.tabActive : ''}`}
              style={{
                ...(active ? { '--tab-color': isAll ? 'var(--blue)' : CATEGORY_COLORS[cat.id] || 'var(--blue)' } : {})
              }}
              onClick={() => setSelectedCategory(id)}
            >{name}</button>
          )
        })}
      </div>

      <div className={s.typeTabs}>
        {TYPE_FILTERS.map(t => (
          <button
            key={t.value}
            className={`${s.tab} ${selectedType === t.value ? s.tabActive : ''}`}
            style={{
              ...(selectedType === t.value ? { '--tab-color': 'var(--blue)' } : {})
            }}
            onClick={() => setSelectedType(t.value)}
          >{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading...</div>
      ) : resources.length === 0 ? (
        <div className={s.empty}>
          <FolderOpen size={40} strokeWidth={1} />
          <p>No resources found</p>
          <button className={s.emptyUpload} onClick={() => setUploadOpen(true)}>Upload your first resource</button>
        </div>
      ) : (
        <div className={s.grid}>
          {resources.map(r => (
            <div
              key={r.id}
              className={s.card}
              style={{ '--card-accent': CATEGORY_COLORS[r.category] || 'var(--blue)' }}
              onClick={() => navigate('/resources/' + r.id)}
            >
              {r.image_key ? (
                <div className={s.cardImageWrap}>
                  <img src={API + '/resources/' + r.id + '/image?token=' + sessionToken} alt="" className={s.cardImage} loading="lazy" />
                </div>
              ) : (
                <div className={s.cardImagePlaceholder} style={{ background: CATEGORY_COLORS[r.category] || 'var(--blue)' }}>
                  <span className={s.cardEmoji}>{fileIcon(r.mime_type, r.file_name)}</span>
                </div>
              )}
              <div className={s.cardBody}>
                <h3 className={s.cardTitle}>{r.title}</h3>
                <div className={s.cardMeta}>
                  <span className={s.cardCategory} style={{ color: CATEGORY_COLORS[r.category] || 'var(--blue)' }}>
                    {categories.find(c => c.id === r.category)?.name || r.category}
                  </span>
                  {r.type && <span className={s.cardType}>{TYPE_LABELS[r.type] || r.type}</span>}
                  <span className={s.cardSize}>{formatSize(r.file_size)}</span>
                  <span className={s.cardDate}>{formatDate(r.created_at)}</span>
                </div>
                {r.tags?.length > 0 && (
                  <div className={s.cardTags}>
                    {r.tags.slice(0, 3).map(t => <span key={t} className={s.tag}>{t}</span>)}
                    {r.tags.length > 3 && <span className={s.tagMore}>+{r.tags.length - 3}</span>}
                  </div>
                )}
                <div className={s.cardActions}>
                  <span className={s.cardUser}>{r.user_name}</span>
                  <div className={s.cardActionBtns} onClick={e => e.stopPropagation()}>
                    <a href={API + '/resources/' + r.id + '/download?token=' + sessionToken} className={s.actionBtn} title="Download" download>
                      <Download size={14} strokeWidth={1.5} />
                    </a>
                    <Link to={'/resources/' + r.id} className={s.actionBtn} title="View">
                      <Eye size={14} strokeWidth={1.5} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && (
        <div className={s.modalOverlay} onClick={() => !uploading && setUploadOpen(false)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Upload Resource</h2>
              {!uploading && <X size={18} className={s.modalClose} onClick={() => { setUploadOpen(false); resetForm() }} />}
            </div>

            <div className={s.modalBody}>
              <div className={s.field}>
                <label>Title *</label>
                <input type="text" placeholder="Resource title" value={formTitle} onChange={e => setFormTitle(e.target.value)} disabled={uploading} />
              </div>

              <div className={s.field}>
                <label>Category *</label>
                {!showNewCategory ? (
                  <div className={s.categoryRow}>
                    <select value={formCategory} onChange={e => {
                      if (e.target.value === '__new__') setShowNewCategory(true)
                      else setFormCategory(e.target.value)
                    }} disabled={uploading}>
                      <option value="">Select category...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      <option value="__new__">+ Add new category...</option>
                    </select>
                  </div>
                ) : (
                  <div className={s.categoryRow}>
                    <input
                      type="text" placeholder="New category name"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      disabled={uploading}
                    />
                    <button className={s.addCatBtn} onClick={handleAddCategory} disabled={!newCategoryName.trim() || uploading}>
                      <Plus size={16} />
                    </button>
                    <button className={s.cancelCatBtn} onClick={() => { setShowNewCategory(false); setNewCategoryName('') }} disabled={uploading}>
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className={s.field}>
                <label>Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} disabled={uploading}>
                  {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className={s.field}>
                <label>Description</label>
                <textarea
                  placeholder="Optional description..."
                  rows={3}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  disabled={uploading}
                />
              </div>

              <div className={s.field}>
                <label>Tags (comma separated)</label>
                <input
                  type="text" placeholder="cardiology, heart, notes"
                  value={formTags}
                  onChange={e => setFormTags(e.target.value)}
                  disabled={uploading}
                />
              </div>

              <div className={s.field}>
                <label>File *</label>
                <div
                  className={`${s.dropZone} ${fileDragOver ? s.dropActive : ''}`}
                  onDragOver={e => { e.preventDefault(); setFileDragOver(true) }}
                  onDragLeave={() => setFileDragOver(false)}
                  onDrop={e => handleFileDrop(e, false)}
                  onClick={() => fileRef.current?.click()}
                >
                  {formFile ? (
                    <div className={s.dropFileInfo}>
                      <span>{fileIcon(formFile.type, formFile.name)}</span>
                      <span className={s.dropFileName}>{formFile.name}</span>
                      <span className={s.dropFileSize}>{formatSize(formFile.size)}</span>
                      {!uploading && <X size={14} className={s.dropRemove} onClick={e => { e.stopPropagation(); setFormFile(null) }} />}
                    </div>
                  ) : (
                    <>
                      <Upload size={24} strokeWidth={1} />
                      <p>Drag & drop a file or click to browse</p>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" className={s.hiddenInput} onChange={e => setFormFile(e.target.files[0])} disabled={uploading} />
                {sizeWarning && <p className={s.sizeWarning}>⚠️ File is large (~{formatSize(formFile.size)}). It may take a while to upload. Recommended max: 100MB.</p>}
              </div>

              <div className={s.field}>
                <label>Cover Image (optional)</label>
                <div
                  className={`${s.dropZone} ${s.dropSmall} ${imageDragOver ? s.dropActive : ''}`}
                  onDragOver={e => { e.preventDefault(); setImageDragOver(true) }}
                  onDragLeave={() => setImageDragOver(false)}
                  onDrop={e => handleFileDrop(e, true)}
                  onClick={() => imageRef.current?.click()}
                >
                  {formImage ? (
                    <div className={s.dropFileInfo}>
                      <Image size={16} />
                      <span className={s.dropFileName}>{formImage.name}</span>
                      {!uploading && <X size={14} className={s.dropRemove} onClick={e => { e.stopPropagation(); setFormImage(null) }} />}
                    </div>
                  ) : (
                    <>
                      <Image size={20} strokeWidth={1} />
                      <p>Cover image</p>
                    </>
                  )}
                </div>
                <input ref={imageRef} type="file" accept="image/*" className={s.hiddenInput} onChange={e => setFormImage(e.target.files[0])} disabled={uploading} />
              </div>

              {uploading && (
                <div className={s.progressWrap}>
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: uploadProgress + '%' }} />
                  </div>
                  <span className={s.progressText}>{uploadProgress}% uploading...</span>
                </div>
              )}
            </div>

            <div className={s.modalFooter}>
              <button className={s.cancelBtn} onClick={() => { setUploadOpen(false); resetForm() }} disabled={uploading}>Cancel</button>
              <button
                className={s.submitBtn}
                onClick={handleUpload}
                disabled={!formTitle.trim() || !formCategory || !formFile || uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
