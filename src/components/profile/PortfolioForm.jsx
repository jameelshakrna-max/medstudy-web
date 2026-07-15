import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost, apiPut } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import Modal from '../ui/Modal/Modal'
import styles from './ResearchSection.module.css'

const RESEARCH_TYPES = ['Original Study', 'Review', 'Meta-Analysis', 'Case Report', 'Letter', 'Editorial', 'Other']
const ROLES = ['First Author', 'Co-Author', 'Statistician', 'Data Collector', 'Reviewer', 'Other']
const STATUSES = ['Ongoing', 'Submitted', 'Accepted', 'Published']

const INITIAL_FORM = {
  title: '',
  research_type: '',
  role: '',
  status: '',
  specialty: '',
  journal: '',
  publication_date: '',
  doi: '',
  pmid: '',
  github_url: '',
  authors: '',
  abstract: '',
}

export default function PortfolioForm({ userId, entry, onClose, onSaved }) {
  const queryClient = useQueryClient()
  const isEditing = !!entry

  const [form, setForm] = useState(() => {
    if (!entry) return INITIAL_FORM
    return {
      title: entry.title || '',
      research_type: entry.research_type || '',
      role: entry.role || '',
      status: entry.status || '',
      specialty: entry.specialty || '',
      journal: entry.journal || '',
      publication_date: entry.publication_date || '',
      doi: entry.doi || '',
      pmid: entry.pmid || '',
      github_url: entry.github_url || '',
      authors: Array.isArray(entry.authors) ? entry.authors.join(', ') : (entry.authors || ''),
      abstract: entry.abstract || '',
    }
  })

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const createMutation = useMutation({
    mutationFn: (payload) => apiPost(`/users/${userId}/portfolio`, payload),
  })

  const updateMutation = useMutation({
    mutationFn: (payload) => apiPut(`/users/${userId}/portfolio/${entry.id}`, payload),
  })

  const handleSave = async () => {
    const payload = {
      ...form,
      authors: form.authors ? form.authors.split(',').map(a => a.trim()).filter(Boolean) : [],
    }

    if (isEditing) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.research.portfolio(userId) })
    onSaved()
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isDisabled = !form.title.trim() || isSaving

  return (
    <Modal open={true} onOpenChange={(v) => { if (!v) onClose() }} size="lg">
      <Modal.Title className={styles.editorTitle}>
        {isEditing ? 'Edit Project' : 'Add Project'}
      </Modal.Title>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Title *</label>
          <input
            className={styles.editorInput}
            value={form.title}
            onChange={e => updateField('title', e.target.value)}
            placeholder="Project title"
          />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Research Type</label>
          <select className={styles.editorSelect} value={form.research_type} onChange={e => updateField('research_type', e.target.value)}>
            <option value="">Select type</option>
            {RESEARCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Role</label>
          <select className={styles.editorSelect} value={form.role} onChange={e => updateField('role', e.target.value)}>
            <option value="">Select role</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Status</label>
          <select className={styles.editorSelect} value={form.status} onChange={e => updateField('status', e.target.value)}>
            <option value="">Select status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Specialty</label>
          <input className={styles.editorInput} value={form.specialty} onChange={e => updateField('specialty', e.target.value)} placeholder="e.g. Cardiology" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Journal</label>
          <input className={styles.editorInput} value={form.journal} onChange={e => updateField('journal', e.target.value)} placeholder="Journal name" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Publication Date</label>
          <input className={styles.editorInput} type="date" value={form.publication_date} onChange={e => updateField('publication_date', e.target.value)} />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>DOI</label>
          <input className={styles.editorInput} value={form.doi} onChange={e => updateField('doi', e.target.value)} placeholder="10.xxxx/xxxxx" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>PMID</label>
          <input className={styles.editorInput} value={form.pmid} onChange={e => updateField('pmid', e.target.value)} placeholder="PubMed ID" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>GitHub URL</label>
          <input className={styles.editorInput} value={form.github_url} onChange={e => updateField('github_url', e.target.value)} placeholder="https://github.com/..." />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Authors (comma-separated)</label>
          <input className={styles.editorInput} value={form.authors} onChange={e => updateField('authors', e.target.value)} placeholder="John Doe, Jane Smith" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Abstract</label>
          <textarea className={styles.editorTextarea} value={form.abstract} onChange={e => updateField('abstract', e.target.value)} placeholder="Brief abstract..." rows={4} />
        </div>

        <div className={styles.editorActions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={isDisabled}>
            {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Add'}
          </button>
        </div>
    </Modal>
  )
}
