import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const API = '/api'

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  return res.json()
}

async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiPut(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiDel(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  return res.json()
}

function sm2(quality, card) {
  let { ease_factor, interval, repetitions } = card
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
  const next_review = new Date()
  next_review.setDate(next_review.getDate() + interval)
  return { ...card, ease_factor, interval, repetitions, next_review: next_review.toISOString(), last_review: new Date().toISOString() }
}

export default function Anki() {
  const [decks, setDecks] = useState([])
  const [cards, setCards] = useState([])
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [view, setView] = useState('decks')
  const [reviewCards, setReviewCards] = useState([])
  const [reviewIdx, setReviewIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ front: '', back: '', deck_id: '' })
  const [newDeckName, setNewDeckName] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const hasFetched = useRef(false)

  const fetchDecks = useCallback(async () => {
    try {
      const data = await apiGet('/decks')
      if (!data.error) setDecks(data)
    } catch (e) { console.error(e) }
  }, [])

  const fetchCards = useCallback(async (deckId) => {
    try {
      const data = await apiGet(`/flashcards?deck_id=${deckId}`)
      if (!data.error) setCards(data)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    if (!hasFetched.current) { fetchDecks(); hasFetched.current = true }
  }, [fetchDecks])

  useEffect(() => {
    if (activeDeckId) fetchCards(activeDeckId)
  }, [activeDeckId, fetchCards])

  async function createDeck(e) {
    e.preventDefault()
    if (!newDeckName.trim()) return
    try {
      const res = await apiPost('/decks', { name: newDeckName.trim() })
      if (res.error) throw new Error(res.error)
      setDecks(prev => [...prev, res])
      setNewDeckName('')
    } catch (e) { alert(e.message) }
  }

  async function deleteDeck(id) {
    if (!confirm('Delete deck and all its cards?')) return
    try {
      const res = await apiDel(`/decks/${id}`)
      if (res.error) throw new Error(res.error)
      if (activeDeckId === id) { setActiveDeckId(null); setView('decks') }
      setDecks(prev => prev.filter(d => d.id !== id))
    } catch (e) { alert(e.message) }
  }

  function openDeck(id) {
    setActiveDeckId(id)
    setView('cards')
  }

  async function createCard(e) {
    e.preventDefault()
    if (!form.front.trim() || !form.back.trim() || !form.deck_id) return
    try {
      const res = await apiPost('/flashcards', {
        deck_id: form.deck_id,
        front: form.front.trim(),
        back: form.back.trim()
      })
      if (res.error) throw new Error(res.error)
      setCards(prev => [...prev, res])
      setForm({ front: '', back: '', deck_id: form.deck_id })
      setShowForm(false)
    } catch (e) { alert(e.message) }
  }

  async function createBulkCards(e) {
    e.preventDefault()
    if (!bulkText.trim() || !form.deck_id) return
    const lines = bulkText.trim().split('\n')
    const parsed = []
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i] && lines[i + 1]) {
        parsed.push({ deck_id: form.deck_id, front: lines[i].trim(), back: lines[i + 1].trim() })
      }
    }
    if (!parsed.length) return alert('No valid card pairs found')
    try {
      const res = await apiPost('/flashcards', { cards: parsed })
      if (res.error) throw new Error(res.error)
      setCards(prev => [...prev, ...res])
      setBulkText('')
      setBulkMode(false)
      setShowForm(false)
    } catch (e) { alert(e.message) }
  }

  async function deleteCard(cardId) {
    if (!confirm('Delete this card?')) return
    try {
      const res = await apiDel(`/flashcards/${cardId}`)
      if (res.error) throw new Error(res.error)
      setCards(prev => prev.filter(c => c.id !== cardId))
    } catch (e) { alert(e.message) }
  }

  function startReview() {
    const now = new Date()
    const due = cards.filter(c => {
      if (!c.next_review) return true
      return new Date(c.next_review) <= now
    })
    if (!due.length) return alert('No cards due for review!')
    setReviewCards(due)
    setReviewIdx(0)
    setShowAnswer(false)
    setView('review')
  }

  async function rateCard(quality) {
    const card = reviewCards[reviewIdx]
    const updated = sm2(quality, card)
    try {
      const res = await apiPut(`/flashcards/${card.id}`, {
        ease_factor: updated.ease_factor,
        interval: updated.interval,
        repetitions: updated.repetitions,
        next_review: updated.next_review,
        last_review: updated.last_review
      })
      if (res.error) throw new Error(res.error)
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...res } : c))
      if (reviewIdx + 1 < reviewCards.length) {
        setReviewIdx(prev => prev + 1)
        setShowAnswer(false)
      } else {
        setView('cards')
      }
    } catch (e) { alert(e.message) }
  }

  if (view === 'decks') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Flashcard Decks</h1>
        <form onSubmit={createDeck} className="flex gap-2 mb-6">
          <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="Deck name..." className="flex-1 px-4 py-2 rounded-lg border dark:bg-gray-700 dark:border-gray-600" required />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
        </form>
        {decks.length === 0 && <p className="text-gray-500">No decks yet. Create one above.</p>}
        <div className="space-y-2">
          {decks.map(deck => (
            <div key={deck.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
              <button onClick={() => openDeck(deck.id)} className="text-left font-medium hover:text-blue-600">{deck.name}</button>
              <button onClick={() => deleteDeck(deck.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'review') {
    const card = reviewCards[reviewIdx]
    if (!card) return null
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <p className="text-sm text-gray-500 mb-4">Card {reviewIdx + 1} of {reviewCards.length}</p>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-6 min-h-[200px] flex flex-col justify-center">
          <p className="text-xl mb-2 text-gray-500 text-sm">Question</p>
          <p className="text-lg">{card.front}</p>
          {showAnswer && (
            <>
              <hr className="my-4" />
              <p className="text-xl mb-2 text-gray-500 text-sm">Answer</p>
              <p className="text-lg">{card.back}</p>
            </>
          )}
        </div>
        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-lg">Show Answer</button>
        ) : (
          <div className="flex justify-center gap-3 flex-wrap">
            <button onClick={() => rateCard(1)} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Again</button>
            <button onClick={() => rateCard(3)} className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">Hard</button>
            <button onClick={() => rateCard(4)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">Good</button>
            <button onClick={() => rateCard(5)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Easy</button>
          </div>
        )}
        <button onClick={() => setView('cards')} className="mt-4 text-gray-500 hover:text-gray-700 text-sm">Back to cards</button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setView('decks')} className="text-blue-600 hover:text-blue-800">Back to Decks</button>
        <button onClick={startReview} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Review Due Cards</button>
      </div>
      <h1 className="text-2xl font-bold mb-4">{decks.find(d => d.id === activeDeckId)?.name || 'Cards'}</h1>
      {!showForm ? (
        <button onClick={() => { setShowForm(true); setForm({ ...form, deck_id: activeDeckId }); setBulkMode(false) }} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Card</button>
      ) : (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="flex gap-2 mb-3">
            <button onClick={() => setBulkMode(false)} className={`px-3 py-1 rounded text-sm ${!bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>Single</button>
            <button onClick={() => setBulkMode(true)} className={`px-3 py-1 rounded text-sm ${bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>Bulk</button>
          </div>
          {!bulkMode ? (
            <form onSubmit={createCard}>
              <input value={form.front} onChange={e => setForm({ ...form, front: e.target.value })} placeholder="Front (question)..." className="w-full px-4 py-2 mb-2 rounded-lg border dark:bg-gray-700 dark:border-gray-600" required />
              <input value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} placeholder="Back (answer)..." className="w-full px-4 py-2 mb-2 rounded-lg border dark:bg-gray-700 dark:border-gray-600" required />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg">Cancel</button>
              </div>
            </form>
          ) : (
            <form onSubmit={createBulkCards}>
              <p className="text-sm text-gray-500 mb-2">Enter pairs: question on one line, answer on next line</p>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} className="w-full px-4 py-2 mb-2 rounded-lg border dark:bg-gray-700 dark:border-gray-600 font-mono text-sm" placeholder={"Question 1\nAnswer 1\nQuestion 2\nAnswer 2"} required />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Import Cards</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {cards.length === 0 && <p className="text-gray-500">No cards in this deck yet.</p>}
      <div className="space-y-2">
        {cards.map(card => (
          <div key={card.id} className="flex items-start justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div>
              <p className="font-medium">{card.front}</p>
              <p className="text-gray-500 text-sm">{card.back}</p>
              <p className="text-xs text-gray-400 mt-1">
                {card.next_review ? `Next: ${new Date(card.next_review).toLocaleDateString()}` : 'New card'}
                {' | Ease: '}{card.ease_factor?.toFixed(2) || '2.50'}
                {' | Interval: '}{card.interval || 0}d
              </p>
            </div>
            <button onClick={() => deleteCard(card.id)} className="text-red-500 hover:text-red-700 text-sm ml-4">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}