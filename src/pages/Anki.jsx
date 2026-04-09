import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function Anki() {
  const { user } = useAuth()
  const [cards, setCards] = useState([])
  const [decks, setDecks] = useState([])
  const [filter, setFilter] = useState('due')
  const [form, setForm] = useState({ front: '', back: '', deck_id: '', high_yield: false })
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [c, d] = await Promise.all([
        supabase.from('anki_cards').select('*').order('next_review_date'),
        supabase.from('anki_decks').select('*').order('name'),
      ])
      if (c.error) console.error('Error loading cards:', c.error)
      if (d.error) console.error('Error loading decks:', d.error)
      setCards(c.data || [])
      setDecks(d.data || [])
    } catch (err) {
      console.error('loadData error:', err)
    }
    setLoading(false)
  }

  // Compute derived fields client-side (not stored in DB)
  function getDueStatus(card) {
    const today = new Date().toISOString().split('T')[0]
    if (!card.last_reviewed) return 'New'
    if (card.next_review_date <= today) return 'Due Now'
    return 'Later'
  }

  function getCardMaturity(card) {
    if (!card.last_reviewed) return 'New'
    if ((card.times_reviewed || 0) >= 5) return 'Mature'
    return 'Learning'
  }

  async function review(id, outcome, card) {
    try {
      const efMap = {
        Again: Math.max(1.3, (card.ease_factor || 2.5) - 0.2),
        Hard: Math.max(1.3, (card.ease_factor || 2.5) - 0.15),
        Good: (card.ease_factor || 2.5),
        Easy: (card.ease_factor || 2.5) + 0.1
      }
      const intMap = {
        Again: 1,
        Hard: Math.max(1, Math.floor((card.interval_days || 1) * 1.2)),
        Good: Math.max(1, Math.floor((card.interval_days || 1) * (card.ease_factor || 2.5))),
        Easy: Math.max(1, Math.floor((card.interval_days || 1) * (card.ease_factor || 2.5) * 1.3))
      }
      const newEF = efMap[outcome]
      const newInt = intMap[outcome]
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + newInt)
      const { error } = await supabase.from('anki_cards').update({
        ease_factor: newEF,
        interval_days: newInt,
        times_reviewed: (card.times_reviewed || 0) + 1,
        last_reviewed: new Date().toISOString().split('T')[0],
        next_review_date: nextDate.toISOString().split('T')[0]
      }).eq('id', id)
      if (error) {
        console.error('Error reviewing card:', error)
        alert('Error reviewing card: ' + error.message)
        return
      }
      loadData()
    } catch (err) {
      console.error('review error:', err)
    }
  }

  async function addCard() {
    if (!form.front || !form.back) return
    setAdding(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('anki_cards').insert({
        user_id: user.id,
        front: form.front,
        back: form.back,
        deck_id: form.deck_id || null,
        high_yield: form.high_yield,
        ease_factor: 2.5,
        interval_days: 0,
        times_reviewed: 0,
        last_reviewed: null,
        next_review_date: today
      })
      if (error) {
        console.error('Error adding card:', error)
        alert('Error adding card: ' + error.message)
        return
      }
      setForm({ front: '', back: '', deck_id: '', high_yield: false })
      setFilter('all')
      loadData()
    } catch (err) {
      console.error('addCard error:', err)
    }
    setAdding(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const filtered = filter === 'due' ? cards.filter(c => (c.next_review_date || c.created_at?.split('T')[0]) <= today)
    : filter === 'new' ? cards.filter(c => !c.last_reviewed)
    : cards
  const dueCount = cards.filter(c => (c.next_review_date || c.created_at?.split('T')[0]) <= today).length

  if (loading) return <div className={styles.loading}>Loading Anki...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🃏 Anki — SM-2 Tracker</h1>
        <p className={styles.sub}>{dueCount} cards due today · {cards.length} total</p>
      </div>

      <div className={styles.tabs}>
        {[['due', 'Due Today'], ['new', 'New'], ['all', 'All Cards'], ['add', '+ Add Card']].map(([v, l]) => (
          <button key={v} className={`${styles.tab} ${filter === v ? styles.tabActive : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {filter === 'add' ? (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Add New Flashcard</h3>
          <div className={styles.field}><label>Front</label><textarea rows={3} value={form.front} onChange={e => setForm({ ...form, front: e.target.value })} placeholder="Question or concept..." /></div>
          <div className={styles.field}><label>Back</label><textarea rows={3} value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} placeholder="Answer or explanation..." /></div>
          <div className={styles.field}><label>Deck</label>
            <select value={form.deck_id} onChange={e => setForm({ ...form, deck_id: e.target.value })}>
              <option value="">No deck</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <label className={styles.checkRow}><input type="checkbox" checked={form.high_yield} onChange={e => setForm({ ...form, high_yield: e.target.checked })} /> ⭐ High Yield</label>
          <button className={styles.primaryBtn} onClick={addCard} disabled={adding}>{adding ? 'Adding...' : 'Add Card'}</button>
        </div>
      ) : (
        <div className={styles.cardList}>
          {filtered.length === 0 && <div className={styles.empty}>No cards in this view 🎉</div>}
          {filtered.map(c => {
            const dueStatus = getDueStatus(c)
            const maturity = getCardMaturity(c)
            return (
              <div key={c.id} className={styles.ankiCard}>
                <div className={styles.ankiMeta}>
                  <span className={styles.dueStatus} style={{ color: dueStatus === 'Due Now' ? 'var(--coral)' : dueStatus === 'New' ? 'var(--teal)' : 'var(--sage)' }}>{dueStatus}</span>
                  <span className={styles.maturity}>{maturity}</span>
                  {c.high_yield && <span className={styles.hyBadge}>⭐</span>}
                </div>
                <div className={styles.ankiFront}>{c.front}</div>
                <div className={styles.ankiBack}>{c.back}</div>
                <div className={styles.ankiStats}>
                  <span>EF: {Number(c.ease_factor || 2.5).toFixed(2)}</span>
                  <span>Interval: {c.interval_days || 0}d</span>
                  <span>Reviews: {c.times_reviewed || 0}</span>
                </div>
                <div className={styles.reviewBtns}>
                  {['Again', 'Hard', 'Good', 'Easy'].map(o => (
                    <button key={o} className={`${styles.reviewBtn} ${styles['r' + o]}`} onClick={() => review(c.id, o, c)}>{o}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
