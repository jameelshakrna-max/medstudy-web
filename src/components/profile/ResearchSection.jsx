import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import {
  Award, BookOpen, ExternalLink, Globe, Link,
  Plus, GraduationCap, BarChart3, Star, User
} from 'lucide-react'
import SkillEditor from './SkillEditor'
import PortfolioForm from './PortfolioForm'
import ResearchProfileEditor from './ResearchProfileEditor'
import styles from './ResearchSection.module.css'

const LEVEL_CONFIG = {
  beginner:      { label: 'Beginner',      stars: 2, title: 'Beginner Research Contributor',      color: styles.levelBeginner,      barColor: '#9ca3af', threshold: 100 },
  intermediate:  { label: 'Intermediate',  stars: 3, title: 'Intermediate Research Contributor',  color: styles.levelIntermediate,  barColor: 'var(--blue)',  threshold: 400 },
  advanced:      { label: 'Advanced',      stars: 4, title: 'Advanced Research Contributor',      color: styles.levelAdvanced,      barColor: 'var(--green)', threshold: 900 },
  expert:        { label: 'Expert',        stars: 5, title: 'Expert Research Contributor',        color: styles.levelExpert,        barColor: '#f59e0b',      threshold: Infinity },
}

function getLevel(score) {
  if (score >= 900) return 'expert'
  if (score >= 400) return 'advanced'
  if (score >= 100) return 'intermediate'
  return 'beginner'
}

const STAT_LABELS = {
  posts_shared: 'Posts Shared',
  comments: 'Comments',
  upvotes_received: 'Upvotes',
  helpful_marks: 'Helpful Marks',
  surveys_completed: 'Surveys',
  collaborations: 'Collaborations',
  papers_shared: 'Papers',
}

const STAT_ICONS = {
  posts_shared: BookOpen,
  comments: BarChart3,
  upvotes_received: Star,
  helpful_marks: Award,
  surveys_completed: GraduationCap,
  collaborations: User,
  papers_shared: BookOpen,
}

const PROFICIENCY_DOT = {
  beginner: styles.dotBeginner,
  intermediate: styles.dotIntermediate,
  advanced: styles.dotAdvanced,
  expert: styles.dotExpert,
}

const PROFICIENCY_LABEL = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

const ACHIEVEMENT_ICONS = {
  research_first_post: '📝',
  research_reviewer: '🔍',
  research_collaborator: '🤝',
  research_paper_shared: '📄',
  research_helpful: '💡',
  research_survey: '📊',
}

const LINK_ICONS = {
  orcid: ExternalLink,
  google_scholar: GraduationCap,
  researchgate: BookOpen,
  linkedin: Globe,
}

const LINK_LABELS = {
  orcid: 'ORCID',
  google_scholar: 'Google Scholar',
  researchgate: 'ResearchGate',
  linkedin: 'LinkedIn',
}

function buildProfileLinks(profile) {
  const links = []
  if (profile?.orcid) links.push({ key: 'orcid', url: `https://orcid.org/${profile.orcid}`, label: 'ORCID' })
  if (profile?.google_scholar_url) links.push({ key: 'google_scholar', url: profile.google_scholar_url, label: 'Google Scholar' })
  if (profile?.researchgate_url) links.push({ key: 'researchgate', url: profile.researchgate_url, label: 'ResearchGate' })
  if (profile?.linkedin_url) links.push({ key: 'linkedin', url: profile.linkedin_url, label: 'LinkedIn' })
  return links
}

export default function ResearchSection({ userId, isOwnProfile }) {
  const [editingSkills, setEditingSkills] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [addingProject, setAddingProject] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState(null)

  const { data: stats } = useQuery({
    queryKey: queryKeys.research.stats(userId),
    queryFn: () => apiGet(`/users/${userId}/research-stats`).then(d => d.stats),
    enabled: !!userId,
  })

  const { data: skills = [] } = useQuery({
    queryKey: queryKeys.research.skills(userId),
    queryFn: () => apiGet(`/users/${userId}/research-skills`).then(d => d.skills || []),
    enabled: !!userId,
  })

  const { data: portfolio = [] } = useQuery({
    queryKey: queryKeys.research.portfolio(userId),
    queryFn: () => apiGet(`/users/${userId}/portfolio`).then(d => d.portfolio || []),
    enabled: !!userId,
  })

  const { data: researchProfile } = useQuery({
    queryKey: queryKeys.research.profile(userId),
    queryFn: () => apiGet(`/users/${userId}/research-profile`).then(d => d.profile),
    enabled: !!userId,
  })

  const { data: achievements = [] } = useQuery({
    queryKey: queryKeys.profile.achievements(userId),
    queryFn: () => apiGet(`/users/${userId}/achievements`).then(d => Array.isArray(d) ? d : []),
    enabled: !!userId,
  })

  const hasActivity =
    (stats && stats.score > 0) ||
    skills.length > 0 ||
    portfolio.length > 0 ||
    (researchProfile && (researchProfile.bio || researchProfile.institution || researchProfile.orcid))

  if (!hasActivity) {
    if (!isOwnProfile) return null
    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <BarChart3 size={16} /> Research
        </div>
        <div className={styles.emptyState}>
          <p>No research activity yet.</p>
          <div className={styles.emptyActions}>
            <button className={styles.addBtn} onClick={() => setEditingSkills(true)}>Add Skills</button>
            <button className={styles.addBtn} onClick={() => setAddingProject(true)}>Add Project</button>
            <button className={styles.editBtn} onClick={() => setEditingProfile(true)}>Edit Research Profile</button>
          </div>
        </div>
        {editingSkills && (
          <SkillEditor userId={userId} skills={skills} onClose={() => setEditingSkills(false)} onSaved={() => setEditingSkills(false)} />
        )}
        {addingProject && (
          <PortfolioForm userId={userId} entry={null} onClose={() => setAddingProject(false)} onSaved={() => setAddingProject(false)} />
        )}
        {editingProfile && (
          <ResearchProfileEditor userId={userId} profile={researchProfile} onClose={() => setEditingProfile(false)} onSaved={() => setEditingProfile(false)} />
        )}
      </div>
    )
  }

  const level = getLevel(stats?.score || 0)
  const levelConfig = LEVEL_CONFIG[level]
  const score = stats?.score || 0
  const progressPercent = levelConfig.threshold === Infinity
    ? 100
    : Math.min((score / levelConfig.threshold) * 100, 100)
  const nextThreshold = levelConfig.threshold === Infinity ? null : levelConfig.threshold

  const researchAchievements = achievements.filter(
    a => a.type?.startsWith('research_')
  )

  const profileLinks = buildProfileLinks(researchProfile)

  const handleEditEntry = (entryId) => {
    setEditingEntryId(entryId)
    setAddingProject(true)
  }

  return (
    <div>
      {/* Reputation */}
      {stats && stats.score > 0 && (
        <div className={styles.section}>
          <div className={styles.repCard}>
            <div className={styles.repStars}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < levelConfig.stars ? styles.starFilled : styles.starEmpty}>
                  ★
                </span>
              ))}
            </div>
            <div className={`${styles.repLevel} ${levelConfig.color}`}>{levelConfig.title}</div>
            <div className={styles.repScore}>{score}</div>
            {nextThreshold && (
              <>
                <div className={styles.repProgress}>
                  <div
                    className={styles.repProgressBar}
                    style={{ width: `${progressPercent}%`, background: levelConfig.barColor }}
                  />
                </div>
                <div className={styles.repNextLevel}>{score} / {nextThreshold} to next level</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Research Contributions */}
      {stats && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <BarChart3 size={16} /> Research Contributions
          </div>
          <div className={styles.statsGrid}>
            {Object.entries(STAT_LABELS).map(([key, label]) => {
              const value = stats[key] || 0
              if (value === 0 && key !== 'posts_shared') return null
              const Icon = STAT_ICONS[key]
              return (
                <div key={key} className={styles.statCard}>
                  <div className={styles.statNumber}>{value}</div>
                  <div className={styles.statLabel}>{label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Research Skills */}
      {(skills.length > 0 || isOwnProfile) && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle} style={{ marginBottom: 0 }}>
              <GraduationCap size={16} /> Research Skills
            </div>
            {isOwnProfile && (
              <button className={styles.addBtn} onClick={() => setEditingSkills(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={14} /> {skills.length > 0 ? 'Edit Skills' : 'Add Skills'}
              </button>
            )}
          </div>
          {skills.length > 0 ? (
            <div className={styles.skillsList}>
              {skills.map((s, i) => (
                <span key={s.skill_id || i} className={styles.skillPill}>
                  <span className={`${styles.skillDot} ${PROFICIENCY_DOT[s.proficiency] || styles.dotBeginner}`} />
                  {s.skill}
                  <span className={styles.skillLabel}>{PROFICIENCY_LABEL[s.proficiency] || 'Beginner'}</span>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--mist)', textAlign: 'center', padding: '12px 0' }}>
              No research skills added yet.
            </div>
          )}
        </div>
      )}

      {/* Research Badges */}
      {researchAchievements.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Award size={16} /> Research Badges
          </div>
          <div className={styles.badgesList}>
            {researchAchievements.map(a => (
              <div key={a.id || a.type} className={styles.badge} title={a.description || a.name}>
                <span className={styles.badgeIcon}>
                  {ACHIEVEMENT_ICONS[a.type] || '🏆'}
                </span>
                {a.name || a.type.replace('research_', '').replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research Portfolio */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle} style={{ marginBottom: 0 }}>
            <BookOpen size={16} /> Research Portfolio
          </div>
          {isOwnProfile && (
            <button
              className={styles.addBtn}
              onClick={() => { setEditingEntryId(null); setAddingProject(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={14} /> Add Project
            </button>
          )}
        </div>
        {portfolio.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--mist)', textAlign: 'center', padding: '16px 0' }}>
            No research projects yet.
          </div>
        ) : (
          <div className={styles.portfolioList}>
            {portfolio.map(entry => (
              <div key={entry.id} className={styles.portfolioItem} onClick={() => isOwnProfile && handleEditEntry(entry.id)} style={isOwnProfile ? { cursor: 'pointer' } : undefined}>
                <div className={styles.portfolioTitle}>{entry.title}</div>
                <div className={styles.portfolioMeta}>
                  {entry.role && <span className={`${styles.portfolioBadge} ${styles.roleBadge}`}>{entry.role}</span>}
                  {entry.status && (
                    <span className={`${styles.portfolioBadge} ${entry.status === 'Ongoing' ? styles.statusOngoing : styles.statusBadge}`}>
                      {entry.status}
                    </span>
                  )}
                </div>
                {entry.journal && <div className={styles.portfolioJournal}>{entry.journal}</div>}
                <div className={styles.portfolioLinks} onClick={e => e.stopPropagation()}>
                  {entry.doi && (
                    <a className={styles.portfolioLink} href={`https://doi.org/${entry.doi}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} /> DOI
                    </a>
                  )}
                  {entry.github_url && (
                    <a className={styles.portfolioLink} href={entry.github_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} /> Code
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Research Profile */}
      {(profileLinks.length > 0 || researchProfile?.institution || researchProfile?.department || researchProfile?.research_interests || researchProfile?.bio || isOwnProfile) && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle} style={{ marginBottom: 0 }}>
              <User size={16} /> Research Profile
            </div>
            {isOwnProfile && (
              <button className={styles.editBtn} onClick={() => setEditingProfile(true)}>Edit</button>
            )}
          </div>
          {researchProfile?.bio && (
            <div className={styles.profileBio}>{researchProfile.bio}</div>
          )}
          {(researchProfile?.institution || researchProfile?.department) && (
            <div className={styles.profileInfoGrid}>
              {researchProfile.institution && (
                <div className={styles.profileInfoItem}>
                  <div className={styles.profileInfoLabel}>Institution</div>
                  <div className={styles.profileInfoValue}>{researchProfile.institution}</div>
                </div>
              )}
              {researchProfile.department && (
                <div className={styles.profileInfoItem}>
                  <div className={styles.profileInfoLabel}>Department</div>
                  <div className={styles.profileInfoValue}>{researchProfile.department}</div>
                </div>
              )}
            </div>
          )}
          {researchProfile?.research_interests && (
            <div className={styles.profileInterests}>
              <div className={styles.profileInfoLabel}>Research Interests</div>
              <div className={styles.profileInfoValue}>{researchProfile.research_interests}</div>
            </div>
          )}
          {profileLinks.length > 0 && (
            <div className={styles.profileLinks}>
              {profileLinks.map(link => {
                const Icon = LINK_ICONS[link.key] || ExternalLink
                return (
                  <a key={link.key} className={styles.profileLink} href={link.url} target="_blank" rel="noopener noreferrer">
                    <Icon size={14} /> {link.label}
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Editors */}
      {editingSkills && (
        <SkillEditor
          userId={userId}
          skills={skills}
          onClose={() => setEditingSkills(false)}
          onSaved={() => setEditingSkills(false)}
        />
      )}

      {addingProject && (
        <PortfolioForm
          userId={userId}
          entry={editingEntryId ? portfolio.find(p => p.id === editingEntryId) : null}
          onClose={() => { setAddingProject(false); setEditingEntryId(null) }}
          onSaved={() => { setAddingProject(false); setEditingEntryId(null) }}
        />
      )}

      {editingProfile && (
        <ResearchProfileEditor
          userId={userId}
          profile={researchProfile}
          onClose={() => setEditingProfile(false)}
          onSaved={() => setEditingProfile(false)}
        />
      )}
    </div>
  )
}
