const RESEARCH_DISCOVER_PREFIX = ['research', 'discover']
const RESEARCH_MINE_PREFIX = ['research', 'mine']
const RESEARCH_SAVED_PREFIX = ['research', 'saved']
const RESEARCH_LIST_PREFIXES = [RESEARCH_DISCOVER_PREFIX, RESEARCH_MINE_PREFIX]

export function getResearchInvalidation(type, { postId } = {}) {
  const detailKey = postId ? ['research', 'detail', postId] : null
  const detailPrefix = detailKey ? [detailKey] : []

  switch (type) {
    case 'create':
      return RESEARCH_LIST_PREFIXES
    case 'delete':
      return [...RESEARCH_LIST_PREFIXES, RESEARCH_SAVED_PREFIX]
    case 'vote':
    case 'comment':
    case 'help':
      return [...detailPrefix, ...RESEARCH_LIST_PREFIXES]
    case 'bookmark':
    case 'unbookmark':
      return [RESEARCH_SAVED_PREFIX, ...RESEARCH_LIST_PREFIXES]
    default:
      return []
  }
}

export { RESEARCH_DISCOVER_PREFIX, RESEARCH_MINE_PREFIX, RESEARCH_SAVED_PREFIX }
