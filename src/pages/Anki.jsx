import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function Anki() {
  const [cards, setCards] = useState([])
  const [decks, setDecks] = useState([])
  const [filter, setFilter] = useState('due')
  const [form, setForm] = useState({ front:'', back:'', deck_id:'', high_yield:false })
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const today = new Date().toISOString().split('T')[0]
    const [c, d] = await Promise.all([
      supabase.from('anki_cards').select('*').order('next_review_date'),
      supabase.from('anki_decks').select('*').order('name'),
    ])
    setCards(c.data||[])
    setDecks(d.data||[])
    setLoading(false)
  }

  async function review(id, outcome, card) {
    const efMap = { Again: Math.max(1.3, card.ease_factor-0.2), Hard: Math.max(1.3, card.ease_factor-0.15), Good: card.ease_factor, Easy: card.ease_factor+0.1 }
    const intMap = { Again: 1, Hard: Math.max(1, Math.floor(card.interval_days*1.2)), Good: Math.max(1, Math.floor(card.interval_days*card.ease_factor)), Easy: Math.max(1, Math.floor(card.interval_days*card.ease_factor*1.3)) }
    const newEF = efMap[outcome]
    const newInt = intMap[outcome]
    const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + newInt)
    await supabase.from('anki_cards').update({ review_outcome: outcome, ease_factor: newEF, interval_days: newInt, times_reviewed: card.times_reviewed+1, last_reviewed: new Date().toISOString().split('T')[0], next_review_date: nextDate.toISOString().split('T')[0] }).eq('id', id)
    loadData()
  }

  async function addCard() {
    if (!form.front || !form.back) return
    setAdding(true)
    await supabase.from('anki_cards').insert({ front:form.front, back:form.back, deck_id:form.deck_id||null, high_yield:form.high_yield })
    setForm({ front:'', back:'', deck_id:'', high_yield:false })
    setAdding(false)
    loadData()
  }

  const today = new Date().toISOString().split('T')[0]
  const filtered = filter==='due' ? cards.filter(c => c.next_review_date <= today) : filter==='new' ? cards.filter(c => !c.last_reviewed) : cards
  const dueCount = cards.filter(c => c.next_review_date <= today).length

  if (loading) return <div className={styles.loading}>Loading Anki...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🃏 Anki — SM-2 Tracker</h1>
        <p className={styles.sub}>{dueCount} cards due today · {cards.length} total</p>
      </div>

      <div className={styles.tabs}>
        {[['due','Due Today'],['new','New'],['all','All Cards'],['add','+ Add Card']].map(([v,l]) => (
          <button key={v} className={`${styles.tab} ${filter===v?styles.tabActive:''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {filter === 'add' ? (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Add New Flashcard</h3>
          <div className={styles.field}><label>Front</label><textarea rows={3} value={form.front} onChange={e => setForm({...form,front:e.target.value})} placeholder="Question or concept..." /></div>
          <div className={styles.field}><label>Back</label><textarea rows={3} value={form.back} onChange={e => setForm({...form,back:e.target.value})} placeholder="Answer or explanation..." /></div>
          <div className={styles.field}><label>Deck</label>
            <select value={form.deck_id} onChange={e => setForm({...form,deck_id:e.target.value})}>
              <option value="">No deck</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <label className={styles.checkRow}><input type="checkbox" checked={form.high_yield} onChange={e => setForm({...form,high_yield:e.target.checked})} /> ⭐ High Yield</label>
          <button className={styles.primaryBtn} onClick={addCard} disabled={adding}>{adding?'Adding...':'Add Card'}</button>
        </div>
      ) : (
        <div className={styles.cardList}>
          {filtered.length === 0 && <div className={styles.empty}>No cards in this view 🎉</div>}
          {filtered.map(c => (
            <div key={c.id} className={styles.ankiCard}>
              <div className={styles.ankiMeta}>
                <span className={styles.dueStatus} style={{color: c.due_status==='Due Now'?'var(--coral)':c.due_status==='New'?'var(--teal)':'var(--sage)'}}>{c.due_status}</span>
                <span className={styles.maturity}>{c.card_maturity}</span>
                {c.high_yield && <span className={styles.hyBadge}>⭐</span>}
              </div>
              <div className={styles.ankiFront}>{c.front}</div>
              <div className={styles.ankiBack}>{c.back}</div>
              <div className={styles.ankiStats}>
                <span>EF: {Number(c.ease_factor).toFixed(2)}</span>
                <span>Interval: {c.interval_days}d</span>
                <span>Reviews: {c.times_reviewed}</span>
              </div>
              <div className={styles.reviewBtns}>
                {['Again','Hard','Good','Easy'].map(o => (
                  <button key={o} className={`${styles.reviewBtn} ${styles['r'+o]}`} onClick={() => review(c.id, o, c)}>{o}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
