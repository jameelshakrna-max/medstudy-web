import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Layout } from 'lucide-react'
import { apiPost } from '../../lib/api'
import { invalidateCommunityListQueries } from '../../lib/socialInvalidation'
import Modal from '../ui/Modal/Modal'
import TemplatePicker from './TemplatePicker'
import { CATEGORY_CONFIG } from '../../lib/communityCategories'
import s from './communityPanels.module.css'

export default function CreateCommunityModal({ open, onOpenChange }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createVisibility, setCreateVisibility] = useState('public')
  const [createJoinType, setCreateJoinType] = useState('anyone')
  const [createCategory, setCreateCategory] = useState('general')

  const createMutation = useMutation({
    mutationFn: (body) => apiPost('/communities', body),
    onSuccess: (result) => {
      if (result.id) {
        invalidateCommunityListQueries(queryClient)
        navigate('/communities/' + result.id)
      }
    },
  })

  const createFromTemplateMutation = useMutation({
    mutationFn: (body) => apiPost('/communities/from-template', body),
    onSuccess: (result) => {
      if (result.id) {
        invalidateCommunityListQueries(queryClient)
        navigate('/communities/' + result.id)
      }
    },
  })

  const creating = createMutation.isPending || createFromTemplateMutation.isPending

  const close = () => {
    if (creating) return
    onOpenChange(false)
    setShowTemplates(false)
    setSelectedTemplate(null)
  }

  const handleCreate = () => {
    if (!createName.trim()) return
    createMutation.mutate({
      name: createName.trim(),
      description: createDesc.trim(),
      visibility: createVisibility,
      join_type: createJoinType,
      category: createCategory,
    })
  }

  const handleCreateFromTemplate = () => {
    if (!createName.trim() || !selectedTemplate) return
    createFromTemplateMutation.mutate({
      templateId: selectedTemplate.id,
      name: createName.trim(),
      description: createDesc.trim(),
    })
  }

  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl)
    setShowTemplates(false)
    setCreateVisibility(tmpl.defaults.type === 'private' ? 'private' : 'public')
    setCreateJoinType(tmpl.defaults.settings.require_approval ? 'approval' : 'anyone')
  }

  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) close() }} size="md">
      {showTemplates ? (
        <div className={s.modalBody}>
          <TemplatePicker
            onSelect={handleSelectTemplate}
            onBack={() => setShowTemplates(false)}
          />
        </div>
      ) : (
        <>
          <div className={s.modalHeader}>
            <h2 className={s.modalTitle}>Create Community</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!selectedTemplate && (
                <button
                  onClick={() => setShowTemplates(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', background: 'var(--input-bg)',
                    border: '1px solid var(--card-border)', borderRadius: 8,
                    color: 'var(--blue)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <Layout size={14} strokeWidth={1.5} />
                  Use Template
                </button>
              )}
              {!creating && <X size={18} className={s.modalClose} onClick={() => { onOpenChange(false); setSelectedTemplate(null) }} />}
            </div>
          </div>
          <div className={s.modalBody}>
            {selectedTemplate && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', background: 'var(--blueL)',
                border: '1px solid var(--blue)', borderRadius: 12,
                marginBottom: 16, fontSize: 13, color: 'var(--blue)',
              }}>
                <Layout size={16} strokeWidth={1.5} />
                <span>Template: <strong>{selectedTemplate.name}</strong></span>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: 2 }}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            )}
            {selectedTemplate && (
              <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Template settings:</div>
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>{selectedTemplate.defaults.settings.allow_competitions ? 'Competitions enabled' : 'Competitions disabled'}</li>
                  <li>{selectedTemplate.defaults.settings.require_approval ? 'Requires approval to join' : 'Open join'}</li>
                  <li>{selectedTemplate.defaults.settings.allow_file_sharing ? 'File sharing enabled' : 'File sharing disabled'}</li>
                </ul>
              </div>
            )}
            {selectedTemplate && (
              <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Pre-defined rules:</div>
                <ol style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                  {selectedTemplate.defaults.rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              </div>
            )}
            <div className={s.field}>
              <label>Name *</label>
              <input type="text" placeholder="Community name" value={createName} onChange={e => setCreateName(e.target.value)} disabled={creating} />
            </div>
            <div className={s.field}>
              <label>Description</label>
              <textarea rows={3} placeholder="What is this community about?" value={createDesc} onChange={e => setCreateDesc(e.target.value)} disabled={creating} />
            </div>
            {!selectedTemplate && (
              <div className={s.row2}>
                <div className={s.field}>
                  <label>Visibility</label>
                  <select value={createVisibility} onChange={e => setCreateVisibility(e.target.value)} disabled={creating}>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className={s.field}>
                  <label>Join Type</label>
                  <select value={createJoinType} onChange={e => setCreateJoinType(e.target.value)} disabled={creating}>
                    <option value="anyone">Anyone</option>
                    <option value="approval">Requires Approval</option>
                    <option value="code">Invite Code</option>
                    <option value="invite_only">Invite Only</option>
                  </select>
                </div>
              </div>
            )}
            {!selectedTemplate && (
              <div className={s.field}>
                <label>Category</label>
                <select value={createCategory} onChange={e => setCreateCategory(e.target.value)} disabled={creating}>
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className={s.modalFooter}>
            <button className={s.cancelBtn} onClick={close} disabled={creating}>Cancel</button>
            <button className={s.submitBtn} onClick={selectedTemplate ? handleCreateFromTemplate : handleCreate} disabled={!createName.trim() || creating}>
              {creating ? 'Creating...' : selectedTemplate ? 'Create from Template' : 'Create Community'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
