/**
 * Pure helpers for the Dashboard "Today" contextual shortcuts.
 * No React, no storage access — unit-testable in isolation.
 */

/** Sums the worker's per-deck due-count response ([{ deck_name, count }, ...]).
 *  Returns null when the payload is not the expected array (request failure or
 *  malformed data) so callers never display a fabricated zero. Numeric-string
 *  counts are coerced; malformed entries never produce NaN/Infinity. */
export function sumDueCounts(data) {
  if (!Array.isArray(data)) return null
  let total = 0
  for (const entry of data) {
    const n = Number(entry?.count)
    total += Number.isFinite(n) && n > 0 ? n : 0
  }
  return total
}

/** Decides which contextual shortcuts to show. cardsDue must be a finite
 *  number (a successful, summed response) for Review Anki to appear — null
 *  means the due-count is unknown. */
export function getDashboardShortcuts({ sessionPhase, sessionOutcome, cardsDue }) {
  return {
    startFocus: true,
    continueStudy: sessionPhase === 'paused' && sessionOutcome == null,
    reviewAnki: typeof cardsDue === 'number' && Number.isFinite(cardsDue) && cardsDue > 0,
  }
}
