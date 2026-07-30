import { useState, useEffect } from 'react'
import styles from '../PlanCreationForm.module.css'

const UNLOCK_MODES = [
  {
    value: 'learning_completed',
    label: 'After learning is completed',
    desc: 'Recommend new cards only after topic learning is finished',
  },
  {
    value: 'learning_started',
    label: 'After learning is started',
    desc: 'Recommend new cards once topic learning has begun',
  },
]

export default function StepFlashcardSettings({ form, onFormChange, errors }) {
  const settings = form.flashcardSettings ?? {}
  const forecastEnabled = settings.maxProjectedFlashcardReviewMinutesPerDay !== null && settings.maxProjectedFlashcardReviewMinutesPerDay !== undefined
  const [limitInput, setLimitInput] = useState(
    forecastEnabled ? String(settings.maxProjectedFlashcardReviewMinutesPerDay) : ''
  )

  useEffect(() => {
    const s = form.flashcardSettings ?? {}
    const enabled = s.maxProjectedFlashcardReviewMinutesPerDay !== null && s.maxProjectedFlashcardReviewMinutesPerDay !== undefined
    if (enabled && s.maxProjectedFlashcardReviewMinutesPerDay > 0) {
      setLimitInput(String(s.maxProjectedFlashcardReviewMinutesPerDay))
    } else if (!enabled) {
      setLimitInput('')
    }
  }, [form.flashcardSettings])

  function handleToggle(enabled) {
    if (enabled) {
      const prev = limitInput ? parseInt(limitInput, 10) : 0
      const valid = prev > 0 && prev <= 1440 ? prev : 30
      setLimitInput(String(valid))
      onFormChange({
        flashcardSettings: {
          ...settings,
          maxProjectedFlashcardReviewMinutesPerDay: valid,
        },
      })
    } else {
      onFormChange({
        flashcardSettings: {
          ...settings,
          maxProjectedFlashcardReviewMinutesPerDay: null,
        },
      })
    }
  }

  function handleLimitChange(val) {
    setLimitInput(val)
    const num = parseInt(val, 10)
    if (val !== '' && !isNaN(num) && num >= 1 && num <= 1440) {
      onFormChange({
        flashcardSettings: {
          ...settings,
          maxProjectedFlashcardReviewMinutesPerDay: num,
        },
      })
    }
  }

  function handleUnlockModeChange(mode) {
    onFormChange({
      flashcardSettings: {
        ...settings,
        learningUnlockMode: mode,
      },
    })
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.formField}>
        <label className={styles.label}>Flashcard Capacity</label>
        <p className={styles.hint}>Control how safe-new-card recommendations work for this plan.</p>
      </div>

      <div className={styles.formField}>
        <div className={styles.toggleRow}>
          <label htmlFor="fc-forecast-toggle" className={styles.label}>Safe-new-card forecasting</label>
          <label className={styles.availToggle}>
            <input
              id="fc-forecast-toggle"
              type="checkbox"
              checked={forecastEnabled}
              onChange={e => handleToggle(e.target.checked)}
            />
            <span className={styles.toggleTrack}>
              <span className={styles.toggleThumb} />
            </span>
          </label>
        </div>
        {forecastEnabled && (
          <div className={styles.formField}>
            <label htmlFor="fc-limit" className={styles.label}>Daily projected review limit (minutes)</label>
            <input
              id="fc-limit"
              type="number"
              min="1"
              max="1440"
              value={limitInput}
              onChange={e => handleLimitChange(e.target.value)}
              placeholder="e.g. 30"
              className={styles.input}
            />
            <p className={styles.hint}>Maximum 1440 minutes per day.</p>
          </div>
        )}
      </div>

      <div className={styles.formField}>
        <label htmlFor="fc-unlock-mode" className={styles.label}>Learning unlock mode</label>
        <div className={styles.radioGroup}>
          {UNLOCK_MODES.map(m => (
            <label key={m.value} className={`${styles.radioCard} ${settings.learningUnlockMode === m.value ? styles.radioCardActive : ''}`}>
              <input
                type="radio"
                name="learningUnlockMode"
                value={m.value}
                checked={settings.learningUnlockMode === m.value}
                onChange={() => handleUnlockModeChange(m.value)}
                className={styles.radioInput}
              />
              <span className={styles.radioLabel}>{m.label}</span>
              <span className={styles.hint}>{m.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.infoBox}>
        <p className={styles.hint}>Due reviews have priority over learning capacity.</p>
        <p className={styles.hint}>New-card recommendations are advisory and do not automatically introduce cards.</p>
      </div>
    </div>
  )
}
