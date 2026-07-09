import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Loader2, Search, BrainCircuit, ChevronLeft, ChevronRight } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || '/api'

async function apiJson(res) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 110,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)', padding: 20,
  },
  modal: {
    background: 'var(--page-bg)', border: '1px solid var(--card-border)',
    borderRadius: 24, width: '100%', maxWidth: 520,
    maxHeight: '80vh', display: 'flex', flexDirection: 'column',
    backdropFilter: 'blur(16px)', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '24px 28px 0',
  },
  title: { fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--text-primary)' },
  close: { color: 'var(--mist)', cursor: 'pointer', padding: 4, borderRadius: 8 },
  body: { padding: '20px 28px', overflow: 'auto', flex: 1 },
  searchWrap: {
    position: 'relative', marginBottom: 16,
  },
  searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--mist)', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '10px 36px', background: 'var(--input-bg)',
    border: '1px solid var(--card-border)', borderRadius: 12,
    color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  },
  deckBtn: {
    width: '100%', padding: '12px 16px', background: 'var(--card-bg)',
    border: '1px solid var(--card-border)', borderRadius: 12,
    color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
    marginBottom: 8, transition: 'all 0.2s',
  },
  cardItem: {
    padding: '12px 16px', background: 'var(--input-bg)',
    border: '1px solid var(--card-border)', borderRadius: 10,
    marginBottom: 8, cursor: 'pointer', transition: 'all 0.2s',
  },
  cardFront: { fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 },
  cardBack: { fontSize: 13, color: 'var(--mist)' },
  deckName: { fontSize: 11, color: 'var(--blue)', marginTop: 4 },
  footer: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    padding: '0 28px 24px',
  },
  cancelBtn: {
    padding: '10px 20px', background: 'var(--input-bg)',
    border: '1px solid var(--card-border)', borderRadius: 12,
    color: 'var(--mist)', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  shareBtn: {
    padding: '10px 24px', background: 'linear-gradient(135deg, var(--blue), var(--blue2))',
    color: 'var(--navy)', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 12,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  navRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--mist)', cursor: 'pointer',
    padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
  },
  loading: { textAlign: 'center', padding: 40, color: 'var(--mist)' },
  spinner: { animation: 'spin 0.8s linear infinite' },
  empty: { textAlign: 'center', padding: 40, color: 'var(--mist)', fontSize: 14 },
}

export default function FlashcardShareModal({ communityId, onShare, onClose }) {
  const [decks, setDecks] = useState([])
  const [cards, setCards] = useState([])
  const [selectedDeck, setSelectedDeck] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/decks').then(d => {
      setDecks(d || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedDeck) return
    setLoading(true)
    apiGet(`/flashcards?deck_id=${encodeURIComponent(selectedDeck)}&limit=200`).then(c => {
      setCards(c || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedDeck])

  const filteredCards = search
    ? cards.filter(c =>
        (c.front || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.back || '').toLowerCase().includes(search.toLowerCase())
      )
    : cards

  const handleShare = async () => {
    if (!selectedCard) return
    const card = selectedCard
    await onShare({
      front: card.front,
      back: card.back,
      image_url: card.image_url || null,
      tags: card.tags || null,
      deck_name: selectedDeck,
    })
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Share Flashcard</h2>
          <div style={styles.close} onClick={onClose}>
            <X size={18} />
          </div>
        </div>

        <div style={styles.body}>
          {selectedDeck ? (
            <>
              <div style={styles.navRow}>
                <button style={styles.backBtn} onClick={() => { setSelectedDeck(null); setSelectedCard(null); setSearch('') }}>
                  <ChevronLeft size={16} strokeWidth={1.5} />
                  Back to decks
                </button>
              </div>

              <div style={styles.searchWrap}>
                <Search size={16} strokeWidth={1.5} style={styles.searchIcon} />
                <input
                  style={styles.searchInput}
                  type="text"
                  placeholder="Search flashcards..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div style={styles.loading}><Loader2 size={20} style={styles.spinner} /> Loading cards...</div>
              ) : filteredCards.length === 0 ? (
                <div style={styles.empty}>No flashcards in this deck</div>
              ) : (
                filteredCards.map(c => (
                  <div
                    key={c.id}
                    style={{
                      ...styles.cardItem,
                      borderColor: selectedCard?.id === c.id ? 'var(--blue)' : 'var(--card-border)',
                      background: selectedCard?.id === c.id ? 'var(--blueL)' : 'var(--input-bg)',
                    }}
                    onClick={() => setSelectedCard(c)}
                  >
                    <div style={styles.cardFront}>{c.front}</div>
                    <div style={styles.cardBack}>{c.back}</div>
                    <div style={styles.deckName}>{selectedDeck}</div>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--mist)', marginBottom: 16 }}>Select a deck to share a flashcard from:</p>
              {decks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--mist)' }}>
                  <BrainCircuit size={40} strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p>No decks yet. Create flashcards first!</p>
                </div>
              ) : (
                decks.map(d => (
                  <button key={d.id} style={styles.deckBtn} onClick={() => setSelectedDeck(d.name)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BrainCircuit size={16} strokeWidth={1.5} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                      {d.name}
                      <ChevronRight size={14} strokeWidth={1.5} style={{ marginLeft: 'auto', color: 'var(--mist)' }} />
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.shareBtn, opacity: selectedCard ? 1 : 0.5 }}
            disabled={!selectedCard}
            onClick={handleShare}
          >
            Share to Chat
          </button>
        </div>
      </div>
    </div>
  )
}
