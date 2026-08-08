import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import styles from '../PlanCreationForm.module.css'

export default function StepAnkiDecks({ form, onFormChange, errors }) {
  const { data: decksData, isLoading: decksLoading } = useQuery({
    queryKey: queryKeys.flashcards.decks(),
    queryFn: () => apiGet('/api/flashcards/decks'),
  })
  const decks = Array.isArray(decksData) ? decksData : []
  const linkedNames = Array.isArray(form.linkedDeckNames) ? form.linkedDeckNames : []
  const primaryDeckName = form.primaryDeckName ?? null

  const linkedSet = useMemo(() => new Set(linkedNames), [linkedNames])

  function handleToggle(deckName, checked) {
    const nextNames = checked
      ? [...linkedNames, deckName]
      : linkedNames.filter(n => n !== deckName)
    const nextPrimary = nextNames.includes(primaryDeckName) ? primaryDeckName : null
    onFormChange({ linkedDeckNames: nextNames, primaryDeckName: nextPrimary })
  }

  function handlePrimaryChange(deckName) {
    onFormChange({ linkedDeckNames: linkedNames, primaryDeckName: deckName })
  }

  if (decksLoading) {
    return (
      <div className={styles.stepContent}>
        <p className={styles.hint}>Loading decks...</p>
      </div>
    )
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.formField}>
        <p className={styles.label}>Linked Anki Decks</p>
        <p className={styles.hint}>Choose the decks associated with this rotation. Linked decks are display and organizational only — they do not change scheduling.</p>
      </div>

      {decks.length === 0 ? (
        <div className={styles.infoBox}>
          <p className={styles.hint}>No Anki decks found. Create decks in the Anki section first, then return here to link them.</p>
        </div>
      ) : (
        <>
          <div className={styles.formField}>
            <p className={styles.label}>Decks</p>
            {decks.map(deck => (
              <label key={deck.id} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={linkedSet.has(deck.name)}
                  onChange={e => handleToggle(deck.name, e.target.checked)}
                />
                <span>{deck.name}</span>
                <span className={styles.topicCount}>
                  {deck.card_count} card{deck.card_count !== 1 ? 's' : ''}
                </span>
              </label>
            ))}
          </div>

          <div className={styles.formField}>
            <p className={styles.label}>Primary Deck</p>
            <p className={styles.hint}>The primary deck is the main deck for this rotation's reviews.</p>
            {linkedNames.length === 0 ? (
              <p className={styles.hint}>Select at least one deck to choose a primary deck.</p>
            ) : (
              <div className={styles.radioGroup}>
                {decks.filter(deck => linkedSet.has(deck.name)).map(deck => (
                  <label key={deck.id} className={`${styles.radioCard} ${primaryDeckName === deck.name ? styles.radioCardActive : ''}`}>
                    <input
                      type="radio"
                      name="primaryDeckName"
                      value={deck.name}
                      checked={primaryDeckName === deck.name}
                      onChange={() => handlePrimaryChange(deck.name)}
                      className={styles.radioInput}
                    />
                    <span className={styles.radioLabel}>{deck.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.infoBox}>
        <p className={styles.hint}>Linking decks only organizes which decks appear for this rotation. Due counts and review scheduling are unaffected.</p>
      </div>
    </div>
  )
}
