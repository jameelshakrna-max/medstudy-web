import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPut } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import Modal from '../ui/Modal/Modal'
import styles from './ResearchSection.module.css'

const INITIAL_FORM = {
  bio: '',
  institution: '',
  department: '',
  research_interests: '',
  orcid: '',
  google_scholar_url: '',
  researchgate_url: '',
  linkedin_url: '',
  visibility: 'Public',
}

export default function ResearchProfileEditor({ userId, profile, onClose, onSaved }) {
  const queryClient = useQueryClient()

  const [form, setForm] = useState(() => {
    if (!profile) return INITIAL_FORM
    return {
      bio: profile.bio || '',
      institution: profile.institution || '',
      department: profile.department || '',
      research_interests: profile.research_interests || '',
      orcid: profile.orcid || '',
      google_scholar_url: profile.google_scholar_url || '',
      researchgate_url: profile.researchgate_url || '',
      linkedin_url: profile.linkedin_url || '',
      visibility: profile.visibility || 'Public',
    }
  })

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const updateMutation = useMutation({
    mutationFn: (payload) => apiPut(`/users/${userId}/research-profile`, payload),
  })

  const handleSave = async () => {
    await updateMutation.mutateAsync(form)
    await queryClient.invalidateQueries({ queryKey: queryKeys.research.profile(userId) })
    onSaved()
  }

  const isSaving = updateMutation.isPending

  return (
    <Modal open={true} onOpenChange={(v) => { if (!v) onClose() }} size="lg">
      <Modal.Title className={styles.editorTitle}>Edit Research Profile</Modal.Title>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Bio</label>
          <textarea
            className={styles.editorTextarea}
            value={form.bio}
            onChange={e => updateField('bio', e.target.value)}
            placeholder="Tell others about your research background..."
            rows={3}
          />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Institution</label>
          <input className={styles.editorInput} value={form.institution} onChange={e => updateField('institution', e.target.value)} placeholder="University or organization" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Department</label>
          <input className={styles.editorInput} value={form.department} onChange={e => updateField('department', e.target.value)} placeholder="Department name" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Research Interests</label>
          <textarea
            className={styles.editorTextarea}
            value={form.research_interests}
            onChange={e => updateField('research_interests', e.target.value)}
            placeholder="What areas of research interest you?"
            rows={3}
          />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>ORCID</label>
          <input className={styles.editorInput} value={form.orcid} onChange={e => updateField('orcid', e.target.value)} placeholder="0000-0000-0000-0000" />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Google Scholar URL</label>
          <input className={styles.editorInput} value={form.google_scholar_url} onChange={e => updateField('google_scholar_url', e.target.value)} placeholder="https://scholar.google.com/..." />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>ResearchGate URL</label>
          <input className={styles.editorInput} value={form.researchgate_url} onChange={e => updateField('researchgate_url', e.target.value)} placeholder="https://www.researchgate.net/..." />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>LinkedIn URL</label>
          <input className={styles.editorInput} value={form.linkedin_url} onChange={e => updateField('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/..." />
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Visibility</label>
          <select className={styles.editorSelect} value={form.visibility} onChange={e => updateField('visibility', e.target.value)}>
            <option value="Public">Public</option>
            <option value="Private">Private</option>
          </select>
        </div>

        <div className={styles.editorActions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
    </Modal>
  )
}
