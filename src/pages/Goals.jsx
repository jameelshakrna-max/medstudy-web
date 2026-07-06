import { useState, useEffect, useCallback } from 'react'
import { Target, Plus, Flag, Calendar, CheckCircle, Archive } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import LoadingScreen from '../components/LoadingScreen'
import GoalCard from '../components/GoalCard'
import GoalForm from '../components/GoalForm'
import GoalTemplates from '../components/GoalTemplates'
import GoalCelebration from '../components/GoalCelebration'
import { generate } from '../services/PerformanceEngine'
import { getGoalCategoryLabel } from '../services/goalProgress'
import styles from './Goals.module.css'
import './Page.module.css'

export default function Goals() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState([])
  const [report, setReport] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [celebrationGoal, setCelebrationGoal] = useState(null)
  const [prevGoals, setPrevGoals] = useState([])

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [goalsRes, blocksRes, mrcpRes, boardRes, activityRes] = await Promise.all([
        supabase.from('goals').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('uworld_blocks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('mrcp_topics').select('*').eq('user_id', user.id),
        supabase.from('local_board_cases').select('*').eq('user_id', user.id),
        supabase.from('study_activity').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
      ])

      const perfReport = generate({
        uworld: blocksRes.data || [],
        mrcp: mrcpRes.data || [],
        board: boardRes.data || [],
        activity: activityRes.data || [],
        goals: goalsRes.data || [],
      })

      setReport(perfReport)
      const enriched = perfReport.goals || []
      setGoals(enriched)

      if (prevGoals.length > 0) {
        for (const g of enriched) {
          const prev = prevGoals.find(p => p.id === g.id)
          if (prev && prev.pct < 100 && g.pct >= 100) {
            setCelebrationGoal(g)
            break
          }
        }
      }
      setPrevGoals(enriched)
    } catch (err) {
      console.error('loadData error:', err)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  async function handleCreate(data) {
    const id = crypto.randomUUID()
    const insertData = {
      id,
      user_id: user.id,
      title: data.title,
      goal_type: data.goal_type,
      target_value: data.target_value,
      subject_id: data.subject_id || null,
      module: data.module || null,
      category: data.category || 'long_term',
      deadline: data.deadline || null,
    }

    const { error } = await supabase.from('goals').insert(insertData)
    if (error) { console.error('create goal error:', error); return }
    setShowForm(false)
    loadData()
  }

  async function handleUpdate(data) {
    if (!data.id) return
    const updateData = {
      title: data.title,
      goal_type: data.goal_type,
      target_value: data.target_value,
      subject_id: data.subject_id || null,
      module: data.module || null,
      category: data.category || 'long_term',
      deadline: data.deadline || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('goals').update(updateData).eq('id', data.id).eq('user_id', user.id)
    if (error) { console.error('update goal error:', error); return }
    setEditingGoal(null)
    loadData()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id)
    if (error) { console.error('delete goal error:', error); return }
    loadData()
  }

  function handleTemplateSelect(tmpl) {
    setShowForm(true)
    setEditingGoal({
      title: tmpl.title,
      goal_type: tmpl.goal_type,
      target_value: tmpl.target_value,
      category: tmpl.category,
      subject_id: tmpl.subject_id || '',
      module: tmpl.module || '',
    })
  }

  if (loading) return <LoadingScreen fullPage={false} message="Loading goals..." />

  const activeGoals = goals.filter(g => g.status === 'active' || !g.status || g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')
  const expiredGoals = goals.filter(g => g.status === 'expired')

  const grouped = {}
  for (const g of activeGoals) {
    const cat = g.category || 'long_term'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(g)
  }
  const CAT_ORDER = ['daily', 'weekly', 'long_term']

  return (
    <div className={styles.page}>
      {celebrationGoal && (
        <GoalCelebration goal={celebrationGoal} onDismiss={() => setCelebrationGoal(null)} />
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Study Goals</h1>
        <p className={styles.sub}>
          {activeGoals.length} active · {completedGoals.length} completed · {expiredGoals.length} expired
        </p>
      </div>

      {!showForm && !editingGoal && goals.length > 0 && (
        <GoalTemplates onSelect={handleTemplateSelect} />
      )}

      {!showForm && !editingGoal && (
        <button className={styles.addBtn} onClick={() => { setEditingGoal(null); setShowForm(true) }}>
          <Plus size={16} />
          Add Goal
        </button>
      )}

      {(showForm || editingGoal) && (
        <GoalForm
          initial={editingGoal}
          onSubmit={editingGoal?.id ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingGoal(null) }}
        />
      )}

      {goals.length === 0 && (
        <div className={styles.empty}>
          <Target />
          <div className={styles.emptyTitle}>No study goals yet</div>
          <div className={styles.emptyDesc}>
            Set your first goal to track progress toward your study targets.
            Use the templates above for quick setup.
          </div>
        </div>
      )}

      {activeGoals.length > 0 && CAT_ORDER.map(cat => {
        const items = grouped[cat]
        if (!items?.length) return null
        return (
          <div key={cat}>
            <div className={styles.sectionHeader}>
              <Flag size={16} />
              <span>{getGoalCategoryLabel(cat)} Goals</span>
              <span className={styles.goalCount}>{items.length}</span>
            </div>
            <div className={styles.cardList}>
              {items.map(g => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onEdit={() => { setEditingGoal(g); setShowForm(true) }}
                  onDelete={() => handleDelete(g.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {expiredGoals.length > 0 && (
        <div>
          <div className={styles.sectionHeader}>
            <Archive size={16} />
            <span>Expired</span>
            <span className={styles.goalCount}>{expiredGoals.length}</span>
          </div>
          <div className={styles.cardList}>
            {expiredGoals.map(g => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={() => { setEditingGoal(g); setShowForm(true) }}
                onDelete={() => handleDelete(g.id)}
              />
            ))}
          </div>
        </div>
      )}

      {completedGoals.length > 0 && (
        <div>
          <div className={styles.sectionHeader}>
            <CheckCircle size={16} />
            <span>Completed</span>
            <span className={styles.goalCount}>{completedGoals.length}</span>
          </div>
          <div className={styles.cardList}>
            {completedGoals.map(g => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={() => { setEditingGoal(g); setShowForm(true) }}
                onDelete={() => handleDelete(g.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
