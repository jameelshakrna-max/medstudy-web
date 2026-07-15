import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { X, Plus, Search } from 'lucide-react'
import Modal from '../ui/Modal/Modal'
import styles from './ResearchSection.module.css'

const PROFICIENCY_OPTIONS = ['beginner', 'intermediate', 'advanced', 'expert']

export default function SkillEditor({ userId, skills: initialSkills, onClose, onSaved }) {
  const queryClient = useQueryClient()
  const [currentSkills, setCurrentSkills] = useState(
    initialSkills.map(s => ({
      skill_id: s.skill_id,
      skill: s.skill,
      proficiency: s.proficiency,
      is_custom: s.is_custom,
    }))
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [customSkillInput, setCustomSkillInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const { data: predefinedSkills = [] } = useQuery({
    queryKey: ['research', 'predefinedSkills'],
    queryFn: () => apiGet('/research/skills/predefined').then(d => d.skills || []),
  })

  const filteredSuggestions = predefinedSkills.filter(
    s => s.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !currentSkills.some(cs => cs.skill.toLowerCase() === s.toLowerCase())
  )

  const addSkillMutation = useMutation({
    mutationFn: (payload) => apiPost(`/users/${userId}/research-skills`, payload),
  })

  const removeSkillMutation = useMutation({
    mutationFn: (skillId) => apiDelete(`/users/${userId}/research-skills/${skillId}`),
  })

  const handleAddSkill = (skillName, isCustom = false) => {
    if (!skillName.trim()) return
    if (currentSkills.some(s => s.skill.toLowerCase() === skillName.toLowerCase())) return

    setCurrentSkills(prev => [
      ...prev,
      { skill_id: null, skill: skillName.trim(), proficiency: 'beginner', is_custom: isCustom },
    ])
    setSearchQuery('')
    setCustomSkillInput('')
    setShowSuggestions(false)
  }

  const handleRemoveSkill = (index) => {
    setCurrentSkills(prev => prev.filter((_, i) => i !== index))
  }

  const handleProficiencyChange = (index, proficiency) => {
    setCurrentSkills(prev => prev.map((s, i) => i === index ? { ...s, proficiency } : s))
  }

  const handleSave = async () => {
    const toAdd = currentSkills.filter(s => !s.skill_id)
    const toRemove = initialSkills.filter(s => !currentSkills.some(cs => cs.skill_id === s.skill_id))

    await Promise.all([
      ...toAdd.map(s =>
        addSkillMutation.mutateAsync({
          skill: s.skill,
          proficiency: s.proficiency,
          is_custom: s.is_custom,
        })
      ),
      ...toRemove.map(s =>
        removeSkillMutation.mutateAsync(s.skill_id)
      ),
    ])

    await queryClient.invalidateQueries({ queryKey: queryKeys.research.skills(userId) })
    onSaved()
  }

  const isSaving = addSkillMutation.isPending || removeSkillMutation.isPending

  return (
    <Modal open={true} onOpenChange={(v) => { if (!v) onClose() }} size="lg">
      <Modal.Title className={styles.editorTitle}>Edit Research Skills</Modal.Title>

        {currentSkills.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {currentSkills.map((s, i) => (
              <div key={i} className={styles.skillRow}>
                <span
                  className={`${styles.skillDot} ${styles[`dot${s.proficiency.charAt(0).toUpperCase() + s.proficiency.slice(1)}`]}`}
                />
                <span style={{ flex: 1, fontSize: 13 }}>{s.skill}</span>
                <select
                  className={styles.editorSelect}
                  value={s.proficiency}
                  onChange={e => handleProficiencyChange(i, e.target.value)}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                >
                  {PROFICIENCY_OPTIONS.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <button className={styles.skillRemove} onClick={() => handleRemoveSkill(i)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.skillSearch}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--mist)' }} />
              <input
                className={styles.editorInput}
                placeholder="Search skills..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                style={{ paddingLeft: 28 }}
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className={styles.skillSuggestions}>
                  {filteredSuggestions.map(s => (
                    <button key={s} className={styles.skillSuggestion} onMouseDown={() => handleAddSkill(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            className={styles.editorInput}
            placeholder="Add custom skill..."
            value={customSkillInput}
            onChange={e => setCustomSkillInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddSkill(customSkillInput, true)
              }
            }}
            style={{ flex: 1 }}
          />
          <button
            className={styles.addBtn}
            onClick={() => handleAddSkill(customSkillInput, true)}
            disabled={!customSkillInput.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            <Plus size={14} /> Add
          </button>
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
