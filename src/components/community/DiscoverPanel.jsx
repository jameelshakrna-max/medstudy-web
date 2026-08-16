import { Search, X, Users, ChevronDown } from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { CATEGORY_CONFIG, SORT_OPTIONS } from '../../lib/communityCategories'
import CommunityCard from './CommunityCard'
import s from './communityPanels.module.css'

export default function DiscoverPanel({
  publicCommunities,
  categoryCounts = [],
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
  onCreate,
}) {
  const sectionTitle = searchQuery
    ? 'Search Results'
    : activeCategory !== 'all'
      ? CATEGORY_CONFIG[activeCategory]?.label + ' Communities'
      : 'Discover Communities'

  return (
    <>
      <div className={s.searchWrap}>
        <Search size={16} strokeWidth={1.5} className={s.searchIcon} />
        <input
          className={s.searchInput}
          type="text"
          placeholder="Search public communities..."
          aria-label="Search public communities"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && <X size={14} className={s.clearBtn} onClick={() => onSearchChange('')} />}
      </div>

      <div className={s.filterRow}>
        <div className={s.categoryChips}>
          <button
            className={`${s.categoryChip} ${activeCategory === 'all' ? s.categoryChipActive : ''}`}
            onClick={() => onCategoryChange('all')}
          >
            All
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon
            const count = categoryCounts.find(c => c.category === key)?.count || 0
            return (
              <button
                key={key}
                className={`${s.categoryChip} ${activeCategory === key ? s.categoryChipActive : ''}`}
                onClick={() => onCategoryChange(key)}
                style={activeCategory === key ? { borderColor: cfg.color, color: cfg.color } : {}}
              >
                <Icon size={13} strokeWidth={1.5} />
                {cfg.label}
                {count > 0 && <span className={s.categoryChipCount}>{count}</span>}
              </button>
            )
          })}
        </div>
        <div className={s.sortWrap}>
          <select className={s.sortSelect} value={sortBy} onChange={e => onSortChange(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={14} className={s.sortChevron} />
        </div>
      </div>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>{sectionTitle}</h2>
        {publicCommunities.length === 0 ? (
          <div className={s.empty}>
            <Users size={40} strokeWidth={1} />
            <p>No communities found</p>
            <button className={s.emptyCreate} onClick={onCreate}>Create the first community</button>
          </div>
        ) : (
          <div className={s.grid}>
            {publicCommunities.map(c => (
              <CommunityCard key={c.id} community={c} showStudyHours={sortBy === 'activity'} />
            ))}
          </div>
        )}
      </section>

      <VisuallyHidden aria-live="polite">
        {(searchQuery || activeCategory !== 'all') ? `${publicCommunities.length} communities found` : ''}
      </VisuallyHidden>
    </>
  )
}
