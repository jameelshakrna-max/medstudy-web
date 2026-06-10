import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "../lib/supabase"
import { parseFile } from "../lib/fileParser"
import s from "./Anki.module.css"

const API = "/api"

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, { headers: { Authorization: "Bearer " + session.access_token } })
  return res.json()
}

async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiPut(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiDel(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, { method: "DELETE", headers: { Authorization: "Bearer " + session.access_token } })
  return res.json()
}

function sm2(quality, card) {
  let ease_factor = Number(card.ease_factor) || 2.5
  let interval = Number(card.interval) || 0
  let repetitions = Number(card.repetitions) || 0
  if (quality >= 3) {
    if (quality === 5 && repetitions === 0) { interval = 6; repetitions = 2 }
    else if (repetitions === 0) { interval = 1; repetitions = 1 }
    else if (repetitions === 1) { interval = 6; repetitions = 2 }
    else { interval = Math.round(interval * ease_factor); repetitions += 1 }
  } else { repetitions = 0; interval = 1 }
  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  const nr = new Date()
  nr.setDate(nr.getDate() + interval)
  return { ease_factor, interval, repetitions, next_review: nr.toISOString(), last_review: new Date().toISOString() }
}

function matLabel(card) {
  const r = Number(card.repetitions) || 0, iv = Number(card.interval) || 0
  if (r === 0) return "New"
  if (r === 1) return "Learning"
  if (iv <= 21) return "Young"
  return "Mature"
}

function revClass(card) {
  if (!card.next_review) return "nr_due"
  const d = (new Date(card.next_review) - new Date()) / 86400000
  if (isNaN(d) || d <= 0) return "nr_due"
  if (d <= 3) return "nr_soon"
  if (d <= 7) return "nr_mid"
  return "nr_later"
}

function revLabel(card) {
  if (!card.next_review) return "Due now"
  const d = (new Date(card.next_review) - new Date()) / 86400000
  if (isNaN(d) || d <= 0) return "Due now"
  return "in " + Math.ceil(d) + "d"
}

export default function Anki() {
  const [decks, setDecks] = useState([])
  const [cards, setCards] = useState([])
  const [activeDeckId, setActiveDeckId] = useState(null)
  const [view, setView] = useState("decks")
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState("manual")
  const [form, setForm] = useState({ front: "", back: "", deck_id: "" })
  const [newDeckName, setNewDeckName] = useState("")
  const [reviewCards, setReviewCards] = useState([])
  const [reviewIdx, setReviewIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [parsedCards, setParsedCards] = useState([])
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [uploadProgress, setUploadProgress] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const hasFetched = useRef(false)

  const fetchDecks = useCallback(async () => {
    setLoading(true)
    try { const d = await apiGet("/decks"); if (!d.error) setDecks(d) } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  const fetchCards = useCallback(async (did) => {
    setLoading(true)
    try { const d = await apiGet("/flashcards?deck_id=" + did); if (!d.error) setCards(d) } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { if (!hasFetched.current) { fetchDecks(); hasFetched.current = true } }, [fetchDecks])
  useEffect(() => { if (activeDeckId) fetchCards(activeDeckId); else setCards([]) }, [activeDeckId, fetchCards])

  async function createDeck(e) {
    e.preventDefault()
    if (!newDeckName.trim()) return
    try { const r = await apiPost("/decks", { name: newDeckName.trim() }); if (r.error) throw new Error(r.error); setDecks(p => [...p, r]); setNewDeckName("") }
    catch (ex) { alert(ex.message) }
  }

  async function deleteDeck(id) {
    if (!confirm("Delete this deck and all its cards?")) return
    try { const r = await apiDel("/decks/" + id); if (r.error) throw new Error(r.error); if (activeDeckId === id) { setActiveDeckId(null); setView("decks") } setDecks(p => p.filter(d => d.id !== id)) }
    catch (ex) { alert(ex.message) }
  }

  function openDeck(id) { setActiveDeckId(id); setView("cards"); setShowForm(false) }

  async function createCard(e) {
    e.preventDefault()
    if (!form.front.trim() || !form.back.trim() || !form.deck_id) return
    try {
      const r = await apiPost("/flashcards", { deck_id: form.deck_id, front: form.front.trim(), back: form.back.trim() })
      if (r.error) throw new Error(r.error)
      setCards(p => [...p, r]); setForm({ front: "", back: "", deck_id: form.deck_id }); setShowForm(false)
    } catch (ex) { alert(ex.message) }
  }

  async function deleteCard(cid) {
    if (!confirm("Delete this card?")) return
    try { const r = await apiDel("/flashcards/" + cid); if (r.error) throw new Error(r.error); setCards(p => p.filter(c => c.id !== cid)) }
    catch (ex) { alert(ex.message) }
  }

  function startReview() {
    const now = new Date()
    const due = cards.filter(c => { if (!c.next_review) return true; return new Date(c.next_review) <= now })
    if (!due.length) return alert("No cards due for review!")
    setReviewCards(due); setReviewIdx(0); setShowAnswer(false); setView("review")
  }

  async function rateCard(quality) {
    const card = reviewCards[reviewIdx]
    const u = sm2(quality, card)
    try {
      const r = await apiPut("/flashcards/" + card.id, { ease_factor: u.ease_factor, interval: u.interval, repetitions: u.repetitions, next_review: u.next_review, last_review: u.last_review })
      if (r.error) throw new Error(r.error)
      setCards(p => p.map(c => c.id === card.id ? { ...c, ...r } : c))
      if (reviewIdx + 1 < reviewCards.length) { setReviewIdx(p => p + 1); setShowAnswer(false) } else setView("cards")
    } catch (ex) { alert(ex.message) }
  }

  async function handleFile(file) {
    setUploadFile(file); setUploadError(""); setUploadLoading(true); setParsedCards([]); setUploadProgress("Parsing file...")
    try { const r = await parseFile(file, m => setUploadProgress(m)); setParsedCards(r) }
    catch (ex) { setUploadError(ex.message) }
    finally { setUploadLoading(false) }
  }

  async function importParsedCards() {
    if (!parsedCards.length || !activeDeckId) return
    setUploadLoading(true)
    try {
      const withDeck = parsedCards.map(c => Object.assign({}, c, { deck_id: activeDeckId }))
      const r = await apiPost("/flashcards", { cards: withDeck })
      if (r.error) throw new Error(r.error)
      setCards(p => p.concat(r)); setParsedCards([]); setUploadFile(null); setShowForm(false)
    } catch (ex) { setUploadError(ex.message) }
    finally { setUploadLoading(false) }
  }

  function onDrop(e) { e.preventDefault(); setDragOver(false); var f = e.dataTransfer.files[0]; if (f) handleFile(f) }
  function onFileInput(e) { var f = e.target.files[0]; if (f) handleFile(f) }

  const totalCards = cards.length
  const dueCards = cards.filter(c => { if (!c.next_review) return true; return new Date(c.next_review) <= new Date() }).length
  const activeDeck = decks.find(d => d.id === activeDeckId)

  if (view === "review") {
    const card = reviewCards[reviewIdx]
    if (!card) return null
    const pct = ((reviewIdx + 1) / reviewCards.length * 100).toFixed(0)
    return (
      <div className={s.page}>
        <div className={s.reviewHeader}>
          <button className={s.exitReviewBtn} onClick={() => setView("cards")}>&#8592;</button>
          <span className={s.reviewProgress}>{reviewIdx + 1} / {reviewCards.length}</span>
          <div className={s.reviewProgBar}><div className={s.reviewProgFill} style={{ width: pct + "%" }}></div></div>
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

  if (view === "cards") {
    return (
      <div className={s.page}>
        <div className={s.breadcrumb}>
          <button className={s.breadLink} onClick={() => { setView("decks"); setActiveDeckId(null) }}>Decks</button>
          <span className={s.breadSep}>&#8250;</span>
          <span className={s.breadCurrent}>{activeDeck ? activeDeck.name : "Cards"}</span>
        </div>

        <div className={s.header}>
          <div>
            <div className={s.title}>{activeDeck ? activeDeck.name : "Cards"}</div>
            <div className={s.sub}>{totalCards} cards</div>
          </div>
          <div className={s.pills}>
            <div className={s.pill}><strong>{dueCards}</strong> due</div>
            <div className={s.pill}><strong>{totalCards - dueCards}</strong> later</div>
          </div>
        </div>

        {dueCards > 0 && <button className={s.reviewAllBtn} onClick={startReview}>Review {dueCards} Due Card{dueCards !== 1 ? "s" : ""}</button>}

        {!showForm ? (
          <div className={s.tabs}>
            <button className={s.tabAdd} onClick={() => { setShowForm(true); setFormMode("manual"); setForm(Object.assign({}, form, { deck_id: activeDeckId })) }}>+ Add Card</button>
            <button className={s.tabReview} onClick={() => { setShowForm(true); setFormMode("upload"); setUploadError(""); setParsedCards([]); setUploadFile(null) }}>Import File</button>
          </div>
        ) : (
          <div>
            <div className={s.tabs} style={{ marginBottom: 16 }}>
              <button className={formMode === "manual" ? s.tabOn : s.tab} onClick={() => setFormMode("manual")}>Manual</button>
              <button className={formMode === "upload" ? s.tabOn : s.tab} onClick={() => { setFormMode("upload"); setUploadError(""); setParsedCards([]); setUploadFile(null) }}>Import File</button>
              <button className={s.tab} onClick={() => { setShowForm(false); setUploadError("") }}>&#10005; Close</button>
            </div>

            {formMode === "manual" && (
              <div className={s.formCard}>
                <div className={s.formTitle}>New Card</div>
                <form onSubmit={createCard}>
                  <div className={s.field}>
                    <label>Front (Question)</label>
                    <input value={form.front} onChange={e => setForm(Object.assign({}, form, { front: e.target.value }))} placeholder="Enter question..." />
                  </div>
                  <div className={s.field}>
                    <label>Back (Answer)</label>
                    <input value={form.back} onChange={e => setForm(Object.assign({}, form, { back: e.target.value }))} placeholder="Enter answer..." />
                  </div>
                  <button type="submit" className={s.primaryBtn}>Create Card</button>
                </form>
              </div>
            )}

            {formMode === "upload" && (
              <div className={s.formCard}>
                <div className={s.formTitle}>Import Flashcards</div>
                <div className={s.uploadDesc}>Upload a file to bulk-import cards. Supports CSV, TSV, TXT, APKG (Anki), and images (OCR with English + Arabic).</div>

                {uploadError && <div className={s.parseError}>{uploadError}</div>}

                <div className={dragOver ? s.dropZone + " " + s.dragOver : s.dropZone}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => document.getElementById("anki-file-input").click()}>
                  <div className={s.dropIcon}>{uploadLoading ? "..." : uploadFile ? uploadFile.name : "Drop file here or click to browse"}</div>
                  <div className={s.dropText}>{uploadLoading ? uploadProgress : "Supports .csv .tsv .txt .apkg .jpg .png .webp"}</div>
                  <div className={s.dropFormats}>Arabic and English supported</div>
                  <input id="anki-file-input" type="file" accept=".csv,.tsv,.txt,.apkg,.jpg,.jpeg,.png,.gif,.bmp,.webp" onChange={onFileInput} style={{ display: "none" }} />
                </div>

                {parsedCards.length > 0 && (
                  <div className={s.uploadSection}>
                    <div className={s.previewList}>
                      <div className={s.previewHeader}>Preview - {parsedCards.length} cards</div>
                      {parsedCards.slice(0, 10).map((c, i) => (
                        <div key={i} className={s.previewRow}>
                          <span className={s.previewFront}>{c.front}</span>
                          <span className={s.previewArrow}>&#8594;</span>
                          <span className={s.previewBack}>{c.back}</span>
                        </div>
                      ))}
                      {parsedCards.length > 10 && <div className={s.previewMore}>+ {parsedCards.length - 10} more</div>}
                    </div>
                    <div className={s.uploadActions}>
                      <button className={s.primaryBtn} onClick={importParsedCards} disabled={uploadLoading}>
                        {uploadLoading ? "Importing..." : "Import " + parsedCards.length + " Cards"}
                      </button>
                      <button className={s.cancelBtn} onClick={() => { setParsedCards([]); setUploadFile(null); setUploadError("") }}>Clear</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {loading ? <div className={s.empty}>Loading...</div> : cards.length === 0 && !showForm ? <div className={s.empty}>No cards yet. Click "Add Card" or "Import File" to get started.</div> : (
          <div className={s.cardList}>
            {cards.map(card => (
              <div key={card.id} className={s.ankiCard}>
                <div className={s.ankiTopRow}>
                  <div className={s.badges}>
                    <span className={s.badgeMaturity}>{matLabel(card)}</span>
                    <span className={s.badgeReview + " " + s[revClass(card)]}>{revLabel(card)}</span>
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
        <input className={s.createDeckInput} value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="New deck name..." onKeyDown={e => { if (e.key === "Enter") createDeck(e) }} />
        <button className={s.createDeckBtn} onClick={createDeck} disabled={!newDeckName.trim()}>Create</button>
      </div>

      {loading ? <div className={s.empty}>Loading decks...</div> : decks.length === 0 ? <div className={s.empty}>No decks yet. Create your first deck above.</div> : (
        <div className={s.deckGrid}>
          {decks.map(deck => (
            <div key={deck.id} className={s.deckCard} onClick={() => openDeck(deck.id)}>
              <button className={s.deckDelBtn} onClick={e => { e.stopPropagation(); deleteDeck(deck.id) }}>&#10005;</button>
              <div className={s.deckName}>{deck.name}</div>
              <div className={s.deckMeta}><span><strong>0</strong> cards</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}