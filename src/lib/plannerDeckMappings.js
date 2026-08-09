export const MAPPING_EMPTY_STATE = {
  noLinkedDecks: "Link an Anki deck to this rotation before mapping it to a planner topic.",
  linkedUnmapped: "Your linked Anki decks aren't mapped to planner topics yet.",
  mapTopicsAction: "Map topics",
}

export function getMappingEmptyState({ hasLinkedDecks, hasMappings }) {
  if (!hasLinkedDecks) {
    return { copy: MAPPING_EMPTY_STATE.noLinkedDecks, action: null }
  }
  if (!hasMappings) {
    return { copy: MAPPING_EMPTY_STATE.linkedUnmapped, action: MAPPING_EMPTY_STATE.mapTopicsAction }
  }
  return null
}
