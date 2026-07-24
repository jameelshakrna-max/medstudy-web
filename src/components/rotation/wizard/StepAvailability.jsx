import { useMemo, useRef } from 'react'
import styles from '../PlanCreationForm.module.css'

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function StepAvailability({ form, onFormChange, errors }) {
  const savedMinutesRef = useRef({})

  const totalMinutes = useMemo(() => {
    return form.availability.reduce((sum, day) => sum + (day.isDayOff ? 0 : day.availableMinutes), 0)
  }, [form.availability])

  function handleMinutesChange(index, value) {
    const parsed = parseInt(value, 10)
    const minutes = isNaN(parsed) || parsed < 0 ? 0 : parsed
    const updated = form.availability.map((day, i) =>
      i === index ? { ...day, availableMinutes: minutes } : day
    )
    onFormChange({ availability: updated })
  }

  function handleDayOffChange(index, checked) {
    const updated = form.availability.map((day, i) => {
      if (i !== index) return day
      if (checked) {
        savedMinutesRef.current[i] = day.availableMinutes || 60
        return { ...day, isDayOff: true, availableMinutes: 0 }
      } else {
        return { ...day, isDayOff: false, availableMinutes: savedMinutesRef.current[i] || 60 }
      }
    })
    onFormChange({ availability: updated })
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.availabilityGrid} role="group" aria-label="Weekly availability">
        {form.availability.map((day, i) => (
          <div key={day.weekday} className={`${styles.availabilityRow} ${day.isDayOff ? styles.availabilityRowDayOff : ''}`}>
            <span className={styles.dayLabel}>{DAY_LABELS[day.weekday]}</span>
            <input
              id={`wiz-minutes-${day.weekday}`}
              type="number"
              min="0"
              step="15"
              value={day.isDayOff ? 0 : day.availableMinutes}
              onChange={(e) => handleMinutesChange(i, e.target.value)}
              disabled={day.isDayOff}
              className={`${styles.inputSmall} ${day.isDayOff ? styles.inputDisabled : ''}`}
              aria-label={`Minutes available on ${DAY_LABELS[day.weekday]}`}
            />
            <label className={styles.availToggle}>
              <input
                type="checkbox"
                checked={day.isDayOff}
                onChange={(e) => handleDayOffChange(i, e.target.checked)}
                aria-label={`Mark ${DAY_LABELS[day.weekday]} as day off`}
              />
              <span className={styles.toggleTrack}>
                <span className={styles.toggleThumb} />
              </span>
            </label>
          </div>
        ))}
      </div>
      <p className={styles.hint}>
        Total weekly capacity: {totalMinutes} minutes ({Math.round(totalMinutes / 60)} hrs)
      </p>
    </div>
  )
}
