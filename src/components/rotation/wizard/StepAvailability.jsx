import { useMemo } from 'react'
import styles from '../PlanCreationForm.module.css'

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function StepAvailability({ form, onFormChange, errors }) {
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
    const updated = form.availability.map((day, i) =>
      i === index ? { ...day, isDayOff: checked, availableMinutes: checked ? 0 : day.availableMinutes } : day
    )
    onFormChange({ availability: updated })
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.availabilityGrid} role="group" aria-label="Weekly availability">
        {form.availability.map((day, i) => (
          <div key={day.weekday} className={styles.availabilityRow}>
            <span className={styles.dayLabel}>{DAY_LABELS[day.weekday]}</span>
            <label htmlFor={`wiz-minutes-${day.weekday}`} className="sr-only">
              Minutes for {DAY_LABELS[day.weekday]}
            </label>
            <input
              id={`wiz-minutes-${day.weekday}`}
              type="number"
              min="0"
              step="15"
              value={day.isDayOff ? 0 : day.availableMinutes}
              onChange={(e) => handleMinutesChange(i, e.target.value)}
              disabled={day.isDayOff}
              className={styles.inputSmall}
              aria-label={`Minutes available on ${DAY_LABELS[day.weekday]}`}
            />
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={day.isDayOff}
                onChange={(e) => handleDayOffChange(i, e.target.checked)}
                aria-label={`Mark ${DAY_LABELS[day.weekday]} as day off`}
              />
              Day off
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
