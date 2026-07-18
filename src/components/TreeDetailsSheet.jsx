import { useEffect, useRef } from 'react'
import { X, Clock, Calendar, FileText, TreePine } from 'lucide-react'
import { getTreeById } from '../lib/treeTypes'
import { getSubjectColor, getSubjectName } from '../lib/subjectColors'
import { formatDate } from '../lib/forestUtils'
import TreePreview from './TreePreview'
import s from './TreeDetailsSheet.module.css'

export default function TreeDetailsSheet({ session, onClose }) {
  const ref = useRef(null)
  const tree = getTreeById(session?.tree_type) || getTreeById('oak')
  const subjectColor = getSubjectColor(session?.subject_id)

  useEffect(() => {
    if (!session) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [session, onClose])

  useEffect(() => {
    if (session) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [session])

  if (!session) return null

  return (
    <div className={s.overlay} onClick={onClose}>
      <div ref={ref} className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <button className={s.closeBtn} onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className={s.preview}>
          <TreePreview treeId={session.tree_type} size="md" />
        </div>

        <h3 className={s.treeName}>{tree?.name || 'Oak'}</h3>
        <p className={s.subject} style={{ color: subjectColor }}>
          {getSubjectName(session.subject_id)}
        </p>

        <div className={s.details}>
          <div className={s.row}>
            <Clock size={14} />
            <span>{session.duration_min} minutes</span>
          </div>
          <div className={s.row}>
            <Calendar size={14} />
            <span>{formatDate(session.date)}</span>
          </div>
          {session.notes && (
            <div className={s.row}>
              <FileText size={14} />
              <span>{session.notes}</span>
            </div>
          )}
        </div>

        {session.subject_name && (
          <div className={s.subjectTag}>
            <TreePine size={12} />
            <span>{session.subject_name}</span>
          </div>
        )}
      </div>
    </div>
  )
}
