import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { GOAL_TEMPLATES as goalTemplates } from '../data/goalTemplates'
import styles from './GoalTemplates.module.css'

export default function GoalTemplates({ onSelect }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className={styles.toggleBtn}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Quick Templates
      </button>

      {open && (
        <div className={styles.panel}>
          {goalTemplates.map((tpl, i) => (
            <button key={i} onClick={() => onSelect(tpl)} className={styles.templateBtn}>
              <div className={styles.templateTitle}>{tpl.title}</div>
              <div className={styles.templateMeta}>
                {tpl.goal_type} · target: {tpl.target_value}{tpl.category ? ` · ${tpl.category}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
