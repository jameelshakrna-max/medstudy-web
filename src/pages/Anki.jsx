import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "../lib/supabase"
import s from "./Anki.module.css"

const API = "/api"

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: "Bearer " + session.access_token }
  })
  return res.json()
}

async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + session.access_token
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiPut(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + session.access_token
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiDel(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + session.access_token }
  })
  return res.json()
}

function sm2(quality, card) {
  let ease_factor = Number(card.ease_factor) || 2.5
  let interval = Number(card.interval) || 0
  let repetitions = Number(card.repetitions) || 0
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
  return { ease_factor, interval, repetitions, next_review: next_review.toISOString(), last_review: new Date().toISOString() }
}

function maturityLabel(card) {
  const reps = Number(card.repetitions) || 0
  const intv = Number(card.interval) || 0
  if (reps === 0) return "New"
  if (reps === 1) return "Learning"
  if (intv <= 21) return "Young"
  return "Mature"
}

function reviewClass(card) {
  if (!card.next_review) return "nr_due"
  const diff = (new Date(card.next_review) - new Date()) / 86400000
  if (isNaN(diff)) return "nr_due"
  if (diff <= 0) return "nr_due"
  if (diff <= 3) return "nr_soon"
  if (diff <= 7) return "nr_mid"
  return "nr_later"
}

function reviewLabel(card) {
  if (!card.next_review) return "Due now"
  const diff = (new Date(card.next_review) - new Date()) / 86400000
  if (isNaN(diff) || diff <= 0) return "Due now"
  return "in " + Math.ceil(diff) + "d"
}

export default function Anki() {
  const [decks, setDecks] = useState([])
  const [cards, setCards] = useState([])
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [view, setView] = useState("decks")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ front: "", back: "", deck_id: "" })
  const [newDeckName, setNewDeckName] = useState("")
  const [reviewCards, setReviewCards] = useState([])
  const [reviewIdx, setReviewIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(false)
  const hasFetched = useRef(false)

  const fetchDecks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet("/decks")
      if (!data.error) setDecks(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  const fetchCards = useCallback(async (deckId) => {
    setLoading(true)
    try {
      const data = await apiGet("/flashcards?deck_id=" + deckId)
      if (!data.error) setCards(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!hasFetched.current) { fetchDecks(); hasFetched.current = true }
  }, [fetchDecks])

  useEffect(() => {
    if (activeDeckId) fetchCards(activeDeckId)
    else setCards([])
  }, [activeDeckId, fetchCards])

  async function createDeck(e) {
    e.preventDefault()
    if (!newDeckName.trim()) return
    try {
      const res = await apiPost("/decks", { name: newDeckName.trim() })
      if (res.error) throw new Error(res.error)
      setDecks(prev => [...prev, res])
      setNewDeckName("")
    } catch (e) { alert(e.message) }
  }

  async function deleteDeck(id) {
    if (!confirm("Delete this deck and all its cards?")) return
    try {
      const res = await apiDel("/decks/" + id)
      if (res.error) throw new Error(res.error)
      if (activeDeckId === id) { setActiveDeckId(null); setView("decks") }
      setDecks(prev => prev.filter(d => d.id !== id))
    } catch (e) { alert(e.message) }
  }

  function openDeck(id) {
    setActiveDeckId(id)
    setView("cards")
    setShowForm(false)
  }

  async function createCard(e) {
    e.preventDefault()
    if (!form.front.trim() || !form.back.trim() || !form.deck_id) return
    try {
      const res = await apiPost("/flashcards", {
        deck_id: form.deck_id,
        front: form.front.trim(),
        back: form.back.trim()
      })
      if (res.error) throw new Error(res.error)
      setCards(prev => [...prev, res])
      setForm({ front: "", back: "", deck_id: form.deck_id })
      setShowForm(false)
    } catch (e) { alert(e.message) }
  }

  async function deleteCard(cardId) {
    if (!confirm("Delete this card?")) return
    try {
      const res = await apiDel("/flashcards/" + cardId)
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
    if (!due.length) return alert("No cards due for review!")
    setReviewCards(due)
    setReviewIdx(0)
    setShowAnswer(false)
    setView("review")
  }

  async function rateCard(quality) {
    const card = reviewCards[reviewIdx]
    const updated = sm2(quality, card)
    try {
      const res = await apiPut("/flashcards/" + card.id, {
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
        setView("cards")
      }
    } catch (e) { alert(e.message) }
  }

  const totalCards = cards.length
  const dueCards = cards.filter(c => {
    if (!c.next_review) return true
    return new Date(c.next_review) <= new Date()
  }).length

  const activeDeck = decks.find(d => d.id === activeDeckId)

  /* ---- REVIEW MODE ---- */
  if (view === "review") {
    const card = reviewCards[reviewIdx]
    if (!card) return null
    const pct = ((reviewIdx + 1) / reviewCards.length * 100).toFixed(0)
    return (
      <div className={s.page}>
        <div className={s.reviewHeader}>
          <button className={s.exitReviewBtn} onClick={() => setView("cards")}>&#8592;</button>
          <span className={s.reviewProgress}>{reviewIdx + 1} / {reviewCards.length}</span>
          <div className={s.reviewProgBar}>
            <div className={s.reviewProgFill} style={{ width: pct + "%" }}></div>
          </div>
        </div>
        <div className={s.reviewCard}>
          {activeDeck && <span className={s.reviewDeckLabel}>{activeDeck.name}</span>}
          <div className={s.reviewLabel}>Question</div>
          <div className={s.reviewContent}>{card.front}</div>
          {showAnswer && (
            <div className={s.reviewAnswer}>
              <div className={s.reviewLabel}>Answer</div>
              <div className={s.reviewContent}>{card.back}</div>
            </div>
          )}
          {!showAnswer ? (
            <button className={s.showAnswerBtn} onClick={() => setShowAnswer(true)}>Show Answer</button>
          ) : (
            <div className={s.reviewBtns}>
              <button className={s.revBtn + " " + s.rev_again} onClick={() => rateCard(1)}>Again</button>
              <button className={s.revBtn + " " + s.rev_hard} onClick={() => rateCard(3)}>Hard</button>
              <button className={s.revBtn + " " + s.rev_good} onClick={() => rateCard(4)}>Good</button>
              <button className={s.revBtn + " " + s.rev_easy} onClick={() => rateCard(5)}>Easy</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ---- CARD LIST VIEW ---- */
  if (view === "cards") {
    return (
      <div className={s.page}>
        <div className={s.breadcrumb}>
          <button className={s.breadLink} onClick={() => { setView("decks"); setActiveDeckId(null) }}>Decks</button>
          <span className={s.breadSep}>&#8250;</span>
          <span className={s.breadCurrent}>{activeDeck?.name || "Cards"}</span>
        </div>

        <div className={s.header}>
          <div>
            <div className={s.title}>{activeDeck?.name || "Cards"}</div>
            <div className={s.sub}>{totalCards} cards</div>
          </div>
          <div className={s.pills}>
            <div className={s.pill}><strong>{dueCards}</strong> due</div>
            <div className={s.pill}><strong>{totalCards - dueCards}</strong> later</div>
          </div>
        </div>

        {dueCards > 0 && (
          <button className={s.reviewAllBtn} onClick={startReview}>
            Review {dueCards} Due Card{dueCards !== 1 ? "s" : ""}
          </button>
        )}

        {!showForm ? (
          <button className={s.tabAdd} onClick={() => { setShowForm(true); setForm({ ...form, deck_id: activeDeckId }) }}>
            + Add Card
          </button>
        ) : (
          <div className={s.formCard}>
            <div className={s.formTitle}>New Card</div>
            <form onSubmit={createCard}>
              <div className={s.field}>
                <label>Front (Question)</label>
                <input value={form.front} onChange={e => setForm({ ...form, front: e.target.value })} placeholder="Enter question..." />
              </div>
              <div className={s.field}>
                <label>Back (Answer)</label>
                <input value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} placeholder="Enter answer..." />
              </div>
              <button type="submit" className={s.primaryBtn}>Create Card</button>
            </form>
            <button className={s.cancelBtn} onClick={() => setShowForm(false)} style={{ marginTop: 10 }}>Cancel</button>
          </div>
        )}

        {loading ? (
          <div className={s.empty}>Loading...</div>
        ) : cards.length === 0 ? (
          <div className={s.empty}>No cards in this deck yet. Click "Add Card" to create one.</div>
        ) : (
          <div className={s.cardList}>
            {cards.map(card => (
              <div key={card.id} className={s.ankiCard}>
                <div className={s.ankiTopRow}>
                  <div className={s.badges}>
                    <span className={s.badgeMaturity}>{maturityLabel(card)}</span>
                    <span className={s.badgeReview + " " + s[reviewClass(card)]}>{reviewLabel(card)}</span>
                  </div>
                  <button className={s.delBtn} onClick={() => deleteCard(card.id)}>&#10005;</button>
                </div>
                <div className={s.ankiFront}>{card.front}</div>
                <div className={s.ankiBack}>{card.back}</div>
                <div className={s.ankiStats}>
                  <span>EF: {Number(card.ease_factor).toFixed(2)}</span>
                  <span>Interval: {Number(card.interval) || 0}d</span>
                  <span>Reps: {Number(card.repetitions) || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ---- DECKS VIEW (default) ---- */
  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <div className={s.title}>Flashcards</div>
          <div className={s.sub}>{decks.length} deck{decks.length !== 1 ? "s" : ""}</div>
        </div>
        <div className={s.pills}>
          <div className={s.pill}><strong>{cards.length}</strong> total cards</div>
        </div>
      </div>

      <div className={s.createDeckRow}>
        <input
          className={s.createDeckInput}
          value={newDeckName}
          onChange={e => setNewDeckName(e.target.value)}
          placeholder="New deck name..."
          onKeyDown={e => { if (e.key === "Enter") createDeck(e) }}
        />
        <button className={s.createDeckBtn} onClick={createDeck} disabled={!newDeckName.trim()}>Create</button>
      </div>

      {loading ? (
        <div className={s.empty}>Loading decks...</div>
      ) : decks.length === 0 ? (
        <div className={s.empty}>No decks yet. Create your first deck above.</div>
      ) : (
        <div className={s.deckGrid}>
          {decks.map(deck => (
            <div key={deck.id} className={s.deckCard} onClick={() => openDeck(deck.id)}>
              <button className={s.deckDelBtn} onClick={e => { e.stopPropagation(); deleteDeck(deck.id) }}>&#10005;</button>
              <div className={s.deckName}>{deck.name}</div>
              <div className={s.deckMeta}>
                <span><strong>0</strong> cards</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}