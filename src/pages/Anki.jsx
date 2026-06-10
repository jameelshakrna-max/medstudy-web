import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const API = '/api'

let cachedSession = null
async function getToken() {
  if (cachedSession) {
    const { data: { session: fresh } } = await supabase.auth.getSession()
    if (fresh) { cachedSession = fresh; return fresh.access_token }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (session) cachedSession = session
  return session?.access_token
}

async function apiGet(path) {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

async function apiPost(path, body) {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function apiPut(path, body) {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function apiDel(path) {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

const RATING_MAP = { again: 1, hard: 3, good: 4, easy: 5 }

function sm2(rating, card) {
  const quality = RATING_MAP[rating] || rating
  let { ease_factor = 2.5, interval_days = 0, times_reviewed = 0 } = card
  let interval = interval_days
  let repetitions = times_reviewed
  if (quality >= 3) {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * ease_factor)
    repetitions += 1
  } else {
    repetitions = 0
    interval = 1
  }
  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  const now = new Date()
  const next = new Date(now)
  next.setDate(next.getDate() + interval)
  return {
    ease_factor,
    interval_days: interval,
    times_reviewed: repetitions,
    last_reviewed: now.toISOString(),
    next_review_date: next.toISOString(),
  }
}

function maturityBadge(card) {
  if (!card.times_reviewed || card.times_reviewed === 0) return <span style={{ background: '#6366f1', color: '#fff', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600 }}>New</span>
  if (card.times_reviewed < 3) return <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600 }}>Learning</span>
  if (card.interval_days < 21) return <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600 }}>Young</span>
  return <span style={{ background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600 }}>Mature</span>
}

function nextReviewLabel(card) {
  if (!card.next_review_date) return <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Due now</span>
  const now = new Date()
  const nr = new Date(card.next_review_date)
  const diffMs = nr - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return <span style={{ color: '#ef4444', fontWeight: 600 }}>Due now</span>
  if (diffDays === 1) return <span style={{ color: '#f59e0b' }}>Tomorrow</span>
  if (diffDays < 7) return <span style={{ color: '#3b82f6' }}>In {diffDays} days</span>
  if (diffDays < 30) return <span style={{ color: '#10b981' }}>In {Math.round(diffDays / 7)} weeks</span>
  return <span style={{ color: '#6b7280' }}>In {Math.round(diffDays / 30)} months</span>
}

export default function Anki() {
  const [decks, setDecks] = useState([])
  const [allCards, setAllCards] = useState([])
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [form, setForm] = useState({ front: '', back: '', high_yield: false })
  const [bulkText, setBulkText] = useState('')
  const [newDeckName, setNewDeckName] = useState('')
  const [showDeckForm, setShowDeckForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewCards, setReviewCards] = useState([])
  const [reviewIdx, setReviewIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [ratingCard, setRatingCard] = useState(null)
  const hasFetched = useRef(false)

  const fetchDecks = useCallback(async () => {
    const data = await apiGet('/decks')
    if (Array.isArray(data)) setDecks(data)
  }, [])

  const fetchCards = useCallback(async () => {
    setLoading(true)
    const data = await apiGet('/flashcards')
    if (Array.isArray(data)) setAllCards(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      Promise.all([fetchDecks(), fetchCards()])
    }
  }, [fetchDecks, fetchCards])

  const deckCards = useMemo(() => {
    let cards = activeDeckId ? allCards.filter(c => c.deck_id === activeDeckId) : allCards
    const now = new Date()
    if (filter === 'due') cards = cards.filter(c => !c.next_review_date || new Date(c.next_review_date) <= now)
    else if (filter === 'new') cards = cards.filter(c => !c.times_reviewed || c.times_reviewed === 0)
    return cards
  }, [allCards, activeDeckId, filter])

  const stats = useMemo(() => {
    const pool = activeDeckId ? allCards.filter(c => c.deck_id === activeDeckId) : allCards
    const now = new Date()
    const total = pool.length
    const due = pool.filter(c => !c.next_review_date || new Date(c.next_review_date) <= now).length
    const newCount = pool.filter(c => !c.times_reviewed || c.times_reviewed === 0).length
    const learning = pool.filter(c => c.times_reviewed > 0 && c.times_reviewed < 3).length
    const mature = pool.filter(c => c.times_reviewed >= 3 && c.interval_days >= 21).length
    const hyCount = pool.filter(c => c.high_yield).length
    const retention = total > 0 ? Math.round(((total - due) / total) * 100) : 100
    return { total, due, new: newCount, learning, mature, highYield: hyCount, retention }
  }, [allCards, activeDeckId])

  function startReview() {
    const now = new Date()
    const due = (activeDeckId ? allCards.filter(c => c.deck_id === activeDeckId) : allCards).filter(c => !c.next_review_date || new Date(c.next_review_date) <= now)
    if (!due.length) return alert('No cards due for review!')
    setReviewCards(due)
    setReviewIdx(0)
    setShowAnswer(false)
    setReviewMode(true)
  }

  async function handleRate(rating) {
    const card = ratingCard || reviewCards[reviewIdx]
    if (!card) return
    const updated = sm2(rating, card)
    const res = await apiPut(`/flashcards/${card.id}`, updated)
    if (!res.error) {
      setAllCards(prev => prev.map(c => c.id === card.id ? { ...c, ...updated } : c))
    }
    setRatingCard(null)
    if (reviewMode) {
      if (reviewIdx + 1 < reviewCards.length) {
        setReviewIdx(prev => prev + 1)
        setShowAnswer(false)
      } else {
        setReviewMode(false)
      }
    }
  }

  async function createDeck(e) {
    e.preventDefault()
    if (!newDeckName.trim()) return
    const res = await apiPost('/decks', { name: newDeckName.trim() })
    if (!res.error) {
      setDecks(prev => [...prev, res])
      setNewDeckName('')
      setShowDeckForm(false)
    }
  }

  async function deleteDeck(id) {
    if (!confirm('Delete this deck and all its cards?')) return
    const res = await apiDel(`/decks/${id}`)
    if (!res.error) {
      setDecks(prev => prev.filter(d => d.id !== id))
      setAllCards(prev => prev.filter(c => c.deck_id !== id))
      if (activeDeckId === id) setActiveDeckId(null)
    }
  }

  async function createCard(e) {
    e.preventDefault()
    if (!form.front.trim() || !form.back.trim()) return
    const res = await apiPost('/flashcards', { deck_id: activeDeckId, front: form.front.trim(), back: form.back.trim(), high_yield: form.high_yield })
    if (!res.error) {
      setAllCards(prev => [...prev, res])
      setForm({ front: '', back: '', high_yield: false })
      setShowForm(false)
    }
  }

  async function createBulkCards(e) {
    e.preventDefault()
    if (!bulkText.trim()) return
    const lines = bulkText.trim().split('\n')
    const parsed = []
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i]?.trim() && lines[i + 1]?.trim()) {
        parsed.push({ deck_id: activeDeckId, front: lines[i].trim(), back: lines[i + 1].trim() })
      }
    }
    if (!parsed.length) return alert('No valid card pairs found')
    const res = await apiPost('/flashcards', parsed)
    const arr = Array.isArray(res) ? res : [res]
    if (!arr[0]?.error) {
      setAllCards(prev => [...prev, ...arr])
      setBulkText('')
      setBulkMode(false)
      setShowForm(false)
    }
  }

  async function deleteCard(id) {
    const res = await apiDel(`/flashcards/${id}`)
    if (!res.error) setAllCards(prev => prev.filter(c => c.id !== id))
  }

  // Review mode overlay
  if (reviewMode) {
    const card = reviewCards[reviewIdx]
    if (!card) return null
    const progress = ((reviewIdx + 1) / reviewCards.length) * 100
    return (
      <div style={{ padding: 24, maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={() => setReviewMode(false)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.95rem' }}>← Exit Review</button>
          <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 9999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 9999, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{reviewIdx + 1} / {reviewCards.length}</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '40px 32px', minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Question</span>
          <p style={{ fontSize: '1.2rem', lineHeight: 1.7, color: '#1f2937' }}>{card.front}</p>
          {showAnswer && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }} />
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Answer</span>
              <p style={{ fontSize: '1.2rem', lineHeight: 1.7, color: '#1f2937' }}>{card.back}</p>
            </>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {!showAnswer ? (
            <button onClick={() => setShowAnswer(true)} style={{ padding: '14px 40px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: '1.05rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
              Show Answer
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'again', label: 'Again', color: '#ef4444', bg: '#fef2f2' },
                { key: 'hard', label: 'Hard', color: '#f59e0b', bg: '#fffbeb' },
                { key: 'good', label: 'Good', color: '#10b981', bg: '#ecfdf5' },
                { key: 'easy', label: 'Easy', color: '#3b82f6', bg: '#eff6ff' },
              ].map(r => (
                <button key={r.key} onClick={() => handleRate(r.key)} style={{ padding: '10px 24px, background: r.bg, color: r.color, border: `2px solid ${r.color}`, borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main view
  const activeDeck = decks.find(d => d.id === activeDeckId)
  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827', margin: 0 }}>Anki</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '4px 0 0' }}>
            {activeDeck ? activeDeck.name : 'All Cards'} · {stats.total} cards
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={startReview} disabled={stats.due === 0} style={{ padding: '10px 20px, background: stats.due > 0 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: stats.due > 0 ? 'pointer' : 'default', boxShadow: stats.due > 0 ? '0 2px 12px rgba(99,102,241,0.3)' : 'none' }}>
            Review ({stats.due})
          </button>
          <button onClick={() => { setShowForm(!showForm); setBulkMode(false); setForm({ front: '', back: '', high_yield: false }) }} style={{ padding: '10px 20px, background: '#fff', color: '#374151', border: '2px solid #d1d5db', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
            + Add Card
          </button>
          <button onClick={() => setShowDeckForm(!showDeckForm)} style={{ padding: '10px 20px, background: '#fff', color: '#374151', border: '2px solid #d1d5db', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>
            + New Deck
          </button>
        </div>
      </div>

      {/* Deck selector tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        <button onClick={() => setActiveDeckId(null)} style={{ padding: '6px 16px, borderRadius: 9999, border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', background: !activeDeckId ? '#6366f1' : '#f3f4f6', color: !activeDeckId ? '#fff' : '#374151', whiteSpace: 'nowrap' }}>
          All Cards
        </button>
        {decks.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setActiveDeckId(d.id)} style={{ padding: '6px 16px, borderRadius: 9999, border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', background: activeDeckId === d.id ? '#6366f1' : '#f3f4f6', color: activeDeckId === d.id ? '#fff' : '#374151', whiteSpace: 'nowrap' }}>
              {d.name}
            </button>
            {activeDeckId === d.id && (
              <button onClick={() => deleteDeck(d.id)} title="Delete deck" style={{ background: '#fef2f2', border: 'none', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444', fontSize: '0.75rem' }}>×</button>
            )}
          </div>
        ))}
      </div>

      {/* New Deck form */}
      {showDeckForm && (
        <form onSubmit={createDeck} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="Deck name..." required style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem' }} />
          <button type="submit" style={{ padding: '8px 18px, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Create</button>
          <button type="button" onClick={() => setShowDeckForm(false)} style={{ padding: '8px 18px, background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        </form>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: stats.total, color: '#6366f1' },
          { label: 'Due', value: stats.due, color: '#ef4444' },
          { label: 'New', value: stats.new, color: '#8b5cf6' },
          { label: 'Learning', value: stats.learning, color: '#f59e0b' },
          { label: 'Mature', value: stats.mature, color: '#10b981' },
          { label: 'High Yield', value: stats.highYield, color: '#ec4899' },
          { label: 'Retention', value: `${stats.retention}%`, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'due', 'new'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 18px, borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', background: filter === f ? '#6366f1' : '#f3f4f6', color: filter === f ? '#fff' : '#374151' }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${deckCards.length})`}
            {f === 'due' && ` (${stats.due})`}
            {f === 'new' && ` (${stats.new})`}
          </button>
        ))}
      </div>

      {/* Add card form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => setBulkMode(false)} style={{ padding: '4px 14px, borderRadius: 6, border: 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', background: !bulkMode ? '#6366f1' : '#f3f4f6', color: !bulkMode ? '#fff' : '#374151' }}>Single</button>
            <button onClick={() => setBulkMode(true)} style={{ padding: '4px 14px, borderRadius: 6, border: 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', background: bulkMode ? '#6366f1' : '#f3f4f6', color: bulkMode ? '#fff' : '#374151' }}>Bulk</button>
          </div>
          {!bulkMode ? (
            <form onSubmit={createCard}>
              <input value={form.front} onChange={e => setForm({ ...form, front: e.target.value })} placeholder="Front (question)..." required style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10, fontSize: '0.9rem', boxSizing: 'border-box' }} />
              <textarea value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} placeholder="Back (answer)..." required rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10, fontSize: '0.9rem', boxSizing: 'border-box', resize: 'vertical' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.high_yield} onChange={e => setForm({ ...form, high_yield: e.target.checked })} /> High Yield
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '8px 20px, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Save Card</button>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px, background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          ) : (
            <form onSubmit={createBulkCards}>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 8 }}>Enter pairs: question on one line, answer on the next line.</p>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} required placeholder={'Question 1\nAnswer 1\nQuestion 2\nAnswer 2'} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10, fontSize: '0.85rem', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '8px 20px, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Import Cards</button>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px, background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Cards list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading cards...</div>
      ) : deckCards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
          {filter === 'all' ? 'No cards yet. Add some above!' : filter === 'due' ? 'No cards due for review.' : 'No new cards.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {deckCards.map(card => {
            const deckName = decks.find(d => d.id === card.deck_id)?.name
            const isDue = !card.next_review_date || new Date(card.next_review_date) <= new Date()
            return (
              <div key={card.id} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 14, borderLeft: isDue ? '4px solid #ef4444' : '4px solid transparent', transition: 'border-color 0.2s' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: '#111827', fontSize: '0.95rem' }}>{card.front}</span>
                    {maturityBadge(card)}
                    {card.high_yield && <span style={{ background: '#fce7f3', color: '#ec4899', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600 }}>HY</span>}
                    {deckName && <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem' }}>{deckName}</span>}
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 6px', lineHeight: 1.5 }}>{card.back}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem', color: '#9ca3af' }}>
                    <span>{nextReviewLabel(card)}</span>
                    <span>·</span>
                    <span>EF: {card.ease_factor?.toFixed(2) || '2.50'}</span>
                    <span>·</span>
                    <span>Interval: {card.interval_days || 0}d</span>
                    <span>·</span>
                    <span>Reviews: {card.times_reviewed || 0}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isDue && !reviewMode && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['again', 'hard', 'good', 'easy'].map(r => (
                        <button key={r} onClick={() => { setRatingCard(card); handleRate(r) }} style={{ padding: '4px 10px, borderRadius: 6, border: 'none', fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer', textTransform: 'capitalize',
                          background: r === 'again' ? '#fef2f2' : r === 'hard' ? '#fffbeb' : r === 'good' ? '#ecfdf5' : '#eff6ff',
                          color: r === 'again' ? '#ef4444' : r === 'hard' ? '#f59e0b' : r === 'good' ? '#10b981' : '#3b82f6',
                        }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => deleteCard(card.id)} title="Delete card" style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}