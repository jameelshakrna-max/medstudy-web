import { isValidTimezone, getDateKeyForTimezone, toEndOfDayUTC } from '../../lib/dateUtils.js'

export function buildAnkiOpenUrl(deckName) {
  return '/anki?deck=' + encodeURIComponent(deckName)
}

export async function computeLinkedDeckStats(env, userId, deckRows, timezone) {
  if (!deckRows || deckRows.length === 0) return []

  const resolvedTimezone = isValidTimezone(timezone) ? timezone : 'UTC'
  const cutoff = toEndOfDayUTC(getDateKeyForTimezone(new Date().toISOString(), resolvedTimezone), resolvedTimezone)
  const cutoffStr = cutoff.toISOString()

  const { results } = await env.DB.prepare(
    `SELECT deck_name,
            COUNT(*) AS total,
            SUM(CASE WHEN last_review IS NOT NULL AND state IN (1, 2, 3) AND next_review IS NOT NULL AND next_review <= ? THEN 1 ELSE 0 END) AS due
     FROM flashcards
     WHERE user_id = ?
     GROUP BY deck_name`
  ).bind(cutoffStr, userId).all()

  const statsByDeck = new Map()
  for (const row of results || []) {
    statsByDeck.set(row.deck_name, { total: Number(row.total) || 0, due: Number(row.due) || 0 })
  }

  return deckRows
    .map(d => {
      const stats = statsByDeck.get(d.deck_name) || { total: 0, due: 0 }
      return {
        deckName: d.deck_name,
        isPrimary: d.is_primary === 1,
        cardCount: stats.total,
        dueCount: stats.due,
        openUrl: buildAnkiOpenUrl(d.deck_name),
      }
    })
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.deckName.localeCompare(b.deckName)
    })
}
