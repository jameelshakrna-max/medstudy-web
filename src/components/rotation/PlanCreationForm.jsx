import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../../lib/api'
import { getSourceOptions, getRotationsForSource, getTopicsForRotation } from '../../data/studySources'
import { generateSchedule } from '../../services/rotationPlanner'
import Modal from '../ui/Modal/Modal'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'
import styles from './PlanCreationForm.module.css'
import '../../pages/Page.module.css'

const STUDY_STYLES = [
  { value: 'focused', label: 'Focused', desc: 'Skim & highlight high-yield only' },
  { value: 'active', label: 'Active', desc: 'Read, recall, and engage with content' },
  { value: 'detailed', label: 'Detailed', desc: 'In-depth notes and review' },
]

const SCHEDULING_STYLES = [
  { value: 'efficient', label: 'Efficient', desc: 'Study then UWorld, fill remaining capacity' },
  { value: 'focused', label: 'Focused', desc: 'Complete each topic fully before moving on' },
]

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const STEPS = ['Rotation & Source', 'Dates', 'Availability', 'Study Settings', 'Flashcards & Buffer', 'Review']

const defaultAvailability = Array(7).fill(null).map((_, i) => ({
  day_of_week: i,
  available_minutes: i === 0 || i === 6 ? 0 : 240,
  is_hospital_day: 0,
  is_day_off: i === 0 || i === 6 ? 1 : 0,
}))

const defaultForm = {
  name: '',
  rotation: '',
  source_id: 'step-up-medicine-6e-2024',
  start_date: '',
  end_date: '',
  exam_date: '',
  availability: defaultAvailability,
  study_style: 'active',
  uworld_mode: 'timed',
  planning_buffer_minutes: 30,
  uworld_total_questions: 0,
  preferred_questions_per_day: 30,
  questions_per_day_min: 20,
  questions_per_day_max: 40,
  avg_minutes_per_question: 1.5,
  scheduling_style: 'efficient',
  flashcard_review_enabled: 1,
  flashcard_max_minutes: 30,
}

export default function PlanCreationForm({ open, onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ ...defaultForm })

  const sourceOptions = getSourceOptions()
  const rotationOptions = form.source_id ? getRotationsForSource(form.source_id) : []

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateAvailability(dayIndex, key, value) {
    setForm((prev) => ({
      ...prev,
      availability: prev.availability.map((d, i) =>
        i === dayIndex ? { ...d, [key]: value } : d
      ),
    }))
  }

  // When source changes, reset rotation
  function handleSourceChange(sourceId) {
    update('source_id', sourceId)
    update('rotation', '')
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the plan
      const newPlan = await apiPost('/rotations/plans', {
        name: form.name,
        rotation: form.rotation,
        source_id: form.source_id,
        start_date: form.start_date,
        end_date: form.end_date,
        exam_date: form.exam_date || null,
        study_style: form.study_style,
        uworld_mode: form.uworld_mode,
        planning_buffer_minutes: form.planning_buffer_minutes,
        uworld_total_questions: form.uworld_total_questions,
        preferred_questions_per_day: form.preferred_questions_per_day,
        questions_per_day_min: form.questions_per_day_min,
        questions_per_day_max: form.questions_per_day_max,
        avg_minutes_per_question: form.avg_minutes_per_question,
        scheduling_style: form.scheduling_style,
        flashcard_review_enabled: form.flashcard_review_enabled,
        flashcard_max_minutes: form.flashcard_max_minutes,
        availability: form.availability,
      })

      // 2. Get source topics from catalog
      const topics = getTopicsForRotation(form.source_id, form.rotation)

      // 3. Generate schedule client-side
      const schedule = generateSchedule(newPlan, topics, form.availability, 0)

      // 4. Save schedule entries
      await apiPost(`/rotations/plans/${newPlan.id}/generate`, { schedule })

      return newPlan
    },
    onSuccess: () => {
      onCreated()
      setForm({ ...defaultForm })
      setStep(0)
    },
  })

  function handleClose() {
    onClose()
    setStep(0)
    setForm({ ...defaultForm })
  }

  const canAdvance = () => {
    if (step === 0) return form.name.trim() && form.rotation
    if (step === 1) return form.start_date && form.end_date
    return true
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && handleClose()} size="lg">
      <div className={styles.formWrap}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          {STEPS.map((label, i) => (
            <div
              key={i}
              className={`${styles.stepDot} ${i === step ? styles.stepDotActive : i < step ? styles.stepDotDone : ''}`}
              title={label}
            >
              {i < step ? <Check size={12} /> : i + 1}
            </div>
          ))}
        </div>

        <h2 className={styles.formTitle}>{STEPS[step]}</h2>

        {/* Step 0: Rotation & Source */}
        {step === 0 && (
          <div>
            <div className="field">
              <label>Plan Name</label>
              <input
                type="text"
                placeholder="e.g. Cardiology Rotation"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Source</label>
              <select value={form.source_id} onChange={(e) => handleSourceChange(e.target.value)}>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.edition} Ed.)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Rotation</label>
              <select value={form.rotation} onChange={(e) => update('rotation', e.target.value)}>
                <option value="">Select a rotation...</option>
                {rotationOptions.map((r) => (
                  <option key={r.rotation} value={r.rotation}>
                    {r.rotation} ({r.topics} topics, {r.words.toLocaleString()} words)
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 1: Dates */}
        {step === 1 && (
          <div>
            <div className="row2">
              <div className="field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update('start_date', e.target.value)}
                />
              </div>
              <div className="field">
                <label>End Date</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => update('end_date', e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Exam Date (optional)</label>
              <input
                type="date"
                value={form.exam_date}
                onChange={(e) => update('exam_date', e.target.value)}
              />
            </div>
            {form.start_date && form.end_date && (
              <div className={styles.dateInfo}>
                {Math.ceil(
                  (new Date(form.end_date + 'T00:00:00') - new Date(form.start_date + 'T00:00:00')) / 86400000
                ) + 1} days
              </div>
            )}
          </div>
        )}

        {/* Step 2: Availability */}
        {step === 2 && (
          <div>
            <div className={styles.availHeader}>
              <span className={styles.availColLabel}>Day</span>
              <span className={styles.availColLabel}>Minutes</span>
              <span className={styles.availColLabel}>Hospital</span>
              <span className={styles.availColLabel}>Off</span>
            </div>
            {form.availability.map((day, i) => (
              <div key={i} className={styles.availRow}>
                <span className={styles.availDayName}>{DAY_LABELS[i].slice(0, 3)}</span>
                <input
                  type="number"
                  min="0"
                  max="720"
                  step="30"
                  value={day.available_minutes}
                  onChange={(e) => updateAvailability(i, 'available_minutes', parseInt(e.target.value) || 0)}
                  className={styles.availInput}
                  disabled={day.is_day_off}
                />
                <label className={styles.availToggle}>
                  <input
                    type="checkbox"
                    checked={day.is_hospital_day === 1}
                    onChange={(e) => updateAvailability(i, 'is_hospital_day', e.target.checked ? 1 : 0)}
                    disabled={day.is_day_off}
                  />
                  <span className={styles.toggleTrack}>
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                <label className={styles.availToggle}>
                  <input
                    type="checkbox"
                    checked={day.is_day_off === 1}
                    onChange={(e) => {
                      const off = e.target.checked ? 1 : 0
                      updateAvailability(i, 'is_day_off', off)
                      if (off) updateAvailability(i, 'available_minutes', 0)
                    }}
                  />
                  <span className={styles.toggleTrack}>
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
              </div>
            ))}
            <div className={styles.availNote}>
              Hospital days reduce effective study time by 40%. Weekday default: 240 min (4h).
            </div>
          </div>
        )}

        {/* Step 3: Study Settings */}
        {step === 3 && (
          <div>
            <div className="field">
              <label>Study Style</label>
              <div className={styles.radioGroup}>
                {STUDY_STYLES.map((s) => (
                  <label
                    key={s.value}
                    className={`${styles.radioCard} ${form.study_style === s.value ? styles.radioCardActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="study_style"
                      value={s.value}
                      checked={form.study_style === s.value}
                      onChange={() => update('study_style', s.value)}
                      className={styles.radioInput}
                    />
                    <div className={styles.radioLabel}>{s.label}</div>
                    <div className={styles.radioDesc}>{s.desc}</div>
                  </label>
                ))}
              </div>
            </div>

            <div className="row2">
              <div className="field">
                <label>UWorld Mode</label>
                <select value={form.uworld_mode} onChange={(e) => update('uworld_mode', e.target.value)}>
                  <option value="tutor">Tutor</option>
                  <option value="timed">Timed</option>
                </select>
              </div>
              <div className="field">
                <label>Total UWorld Questions</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={form.uworld_total_questions}
                  onChange={(e) => update('uworld_total_questions', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="row2">
              <div className="field">
                <label>Preferred Qs/Day</label>
                <input
                  type="number"
                  min="1"
                  value={form.preferred_questions_per_day}
                  onChange={(e) => update('preferred_questions_per_day', parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="field">
                <label>Avg Min/Question</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={form.avg_minutes_per_question}
                  onChange={(e) => update('avg_minutes_per_question', parseFloat(e.target.value) || 1.5)}
                />
              </div>
            </div>

            <div className="row2">
              <div className="field">
                <label>Min Qs/Day</label>
                <input
                  type="number"
                  min="0"
                  value={form.questions_per_day_min}
                  onChange={(e) => update('questions_per_day_min', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="field">
                <label>Max Qs/Day</label>
                <input
                  type="number"
                  min="1"
                  value={form.questions_per_day_max}
                  onChange={(e) => update('questions_per_day_max', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="field">
              <label>Scheduling Style</label>
              <div className={styles.radioGroup}>
                {SCHEDULING_STYLES.map((s) => (
                  <label
                    key={s.value}
                    className={`${styles.radioCard} ${form.scheduling_style === s.value ? styles.radioCardActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="scheduling_style"
                      value={s.value}
                      checked={form.scheduling_style === s.value}
                      onChange={() => update('scheduling_style', s.value)}
                      className={styles.radioInput}
                    />
                    <div className={styles.radioLabel}>{s.label}</div>
                    <div className={styles.radioDesc}>{s.desc}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Flashcards & Buffer */}
        {step === 4 && (
          <div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={form.flashcard_review_enabled === 1}
                onChange={(e) => update('flashcard_review_enabled', e.target.checked ? 1 : 0)}
              />
              Enable daily flashcard review
            </label>

            {form.flashcard_review_enabled === 1 && (
              <div className="field">
                <label>Max Flashcard Minutes/Day</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="5"
                  value={form.flashcard_max_minutes}
                  onChange={(e) => update('flashcard_max_minutes', parseInt(e.target.value) || 0)}
                />
              </div>
            )}

            <div className="field">
              <label>Planning Buffer (minutes/day)</label>
              <input
                type="number"
                min="0"
                max="120"
                step="5"
                value={form.planning_buffer_minutes}
                onChange={(e) => update('planning_buffer_minutes', parseInt(e.target.value) || 0)}
              />
              <div className={styles.fieldNote}>
                Time reserved each day for breaks, commuting, and transition between tasks.
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className={styles.review}>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Plan Name</span>
              <span className={styles.reviewValue}>{form.name}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Source</span>
              <span className={styles.reviewValue}>
                {sourceOptions.find((s) => s.id === form.source_id)?.title || form.source_id}
              </span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Rotation</span>
              <span className={styles.reviewValue}>{form.rotation}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Dates</span>
              <span className={styles.reviewValue}>{form.start_date} to {form.end_date}</span>
            </div>
            {form.exam_date && (
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Exam Date</span>
                <span className={styles.reviewValue}>{form.exam_date}</span>
              </div>
            )}
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Study Style</span>
              <span className={styles.reviewValue}>{form.study_style}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Scheduling</span>
              <span className={styles.reviewValue}>{form.scheduling_style}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>UWorld</span>
              <span className={styles.reviewValue}>
                {form.uworld_total_questions} Qs ({form.uworld_mode}), {form.preferred_questions_per_day}/day preferred
              </span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Flashcards</span>
              <span className={styles.reviewValue}>
                {form.flashcard_review_enabled ? `${form.flashcard_max_minutes} min/day` : 'Disabled'}
              </span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Buffer</span>
              <span className={styles.reviewValue}>{form.planning_buffer_minutes} min/day</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>Topics</span>
              <span className={styles.reviewValue}>
                {form.source_id && form.rotation
                  ? `${getTopicsForRotation(form.source_id, form.rotation).length} topics`
                  : 'N/A'}
              </span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className={styles.navRow}>
          {step > 0 && (
            <button
              className={styles.navBtn}
              onClick={() => setStep((s) => s - 1)}
            >
              <ChevronLeft size={16} />
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button
              className={`${styles.navBtn} ${styles.navBtnPrimary}`}
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance()}
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              className={`${styles.navBtn} ${styles.navBtnPrimary}`}
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Plan'}
              {!createMutation.isPending && <Check size={16} />}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
