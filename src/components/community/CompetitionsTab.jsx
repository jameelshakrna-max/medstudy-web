import { useState, useEffect } from 'react'
import { ROLES, PERM, hasPermission } from '../../lib/permissions'
import { apiGet, apiPost, apiPut, formatDate, formatCountdown } from '../../lib/api'
import { Search, Trophy, Plus, X, Loader2, Check, Flag, UserPlus, Clock, Users, BarChart3 } from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'

const COMPETITION_DURATIONS = [
  { value: '1_week', label: '1 Week' },
  { value: '1_month', label: '1 Month' },
  { value: '6_months', label: '6 Months' },
  { value: '1_year', label: '1 Year' },
]

export default function CompetitionsTab({ competitions, communityId, myId, isAdmin, isMod, myMembership, onRefresh, realtimeConnected }) {
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [duration, setDuration] = useState('1_month')
  const [creating, setCreating] = useState(false)
  const [leaderboards, setLeaderboards] = useState({})
  const [filterTab, setFilterTab] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [createError, setCreateError] = useState('')

  const canModerate = isAdmin || isMod

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'rejected', label: 'Rejected' },
  ]

  const activeComp = competitions.find(c => c.status === 'active')
  const pendingRequests = competitions.filter(c => c.status === 'pending' && !c.approved)
  const myRanks = {}
  Object.entries(leaderboards).forEach(([compId, lb]) => {
    const idx = lb.findIndex(p => p.user_id === myId)
    myRanks[compId] = idx >= 0 ? { rank: idx + 1, hours: lb[idx].total_hours } : null
  })

  let filtered = competitions.filter(c => c.id !== activeComp?.id)
  if (filterTab !== 'all') filtered = filtered.filter(c => c.status === filterTab)
  if (searchText.trim()) {
    const q = searchText.toLowerCase()
    filtered = filtered.filter(c => c.title.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
  }

  const loadLeaderboard = async (compId) => {
    try {
      const data = await apiGet(`/competitions/${compId}/leaderboard`)
      setLeaderboards(prev => ({ ...prev, [compId]: data }))
    } catch {}
  }

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const data = await apiPost(`/communities/${communityId}/competitions`, { title: title.trim(), description: desc.trim(), duration })
      if (data?.error) { setCreateError(data.error); return }
      setShowCreate(false)
      setTitle('')
      setDesc('')
      setDuration('1_month')
      onRefresh()
    } catch (e) { setCreateError(e.message || 'Failed to create competition') }
    setCreating(false)
  }

  const handleJoin = async (compId) => {
    try {
      await apiPost(`/competitions/${compId}/join`, {})
      onRefresh()
    } catch {}
  }

  const handleLeave = async (compId) => {
    try {
      await apiPost(`/competitions/${compId}/leave`, {})
      onRefresh()
    } catch {}
  }

  const handleApprove = async (compId) => {
    try {
      await apiPut(`/competitions/${compId}/approve`, {})
      onRefresh()
    } catch {}
  }

  const handleReject = async (compId) => {
    try {
      await apiPut(`/competitions/${compId}/reject`, { reason: rejectReason })
      setRejecting(null)
      setRejectReason('')
      onRefresh()
    } catch {}
  }

  const handleEnd = async (compId) => {
    if (!confirm('End this competition early?')) return
    try {
      await apiPut(`/competitions/${compId}/end`, {})
      onRefresh()
    } catch {}
  }

  useEffect(() => {
    if (realtimeConnected) return
    const interval = setInterval(onRefresh, 30000)
    return () => clearInterval(interval)
  }, [onRefresh, realtimeConnected])

  useEffect(() => {
    if (activeComp && !leaderboards[activeComp.id]) {
      loadLeaderboard(activeComp.id)
    }
  }, [activeComp?.id])

  const renderCard = (c, hero) => {
    const now = Date.now()
    const start = new Date(c.starts_at?.replace(' ', 'T') + 'Z').getTime()
    const end = new Date(c.ends_at?.replace(' ', 'T') + 'Z').getTime()
    const total = end - start
    const elapsed = Math.max(0, Math.min(100, ((now - start) / (!total ? 1 : total)) * 100))
    const isCompleted = c.status === 'completed'
    const isRejected = c.status === 'rejected'
    const lb = leaderboards[c.id]
    const myRank = myRanks[c.id]
    const hasJoined = c.has_joined || myRank !== null

    const content = (
      <>
        <div className={s.compTop}>
          <div>
            <div className={hero ? s.heroName : s.compName}>{c.title}</div>
            {c.description && <div className={hero ? s.heroDesc : s.compDesc}>{c.description}</div>}
          </div>
          <span className={`${s.compStatus} ${s['status_' + c.status]}`}>{c.status}</span>
        </div>
        {!isCompleted && !isRejected && total > 0 && (
          <div className={hero ? s.heroProgress : s.compProgress}>
            <div className={`${hero ? s.heroProgressFill : s.compProgressFill}`}
                 style={{ width: Math.min(elapsed, 100) + '%' }} />
          </div>
        )}
        <div className={hero ? s.heroMeta : s.compMeta}>
          {!isRejected && <span><Clock size={hero ? 14 : 12} strokeWidth={1.5} /> {formatCountdown(c.ends_at)}</span>}
          <span>{c.duration.replace('_', ' ')}</span>
          <span className={s.compParticipants}>
            <Users size={hero ? 14 : 12} strokeWidth={1.5} />
            {c.participant_count ?? 0}
          </span>
          {myRank && <span className={s.myRank}>#{myRank.rank} · {Math.round(myRank.hours)}h</span>}
          {!c.approved && c.status !== 'rejected' && <span className={s.pendingBadge}>Pending approval</span>}
          {isRejected && c.rejection_reason && <span className={s.rejectionReason}>Reason: {c.rejection_reason}</span>}
        </div>
        {hero && lb && lb.length > 0 && (
          <div className={s.heroCharts}>
            <div className={s.heroGaugeWrap}>
              <div className={s.gauge}>
                {(() => {
                  const pos = lb.findIndex(p => p.user_id === myId)
                  const r = pos >= 0 ? pos + 1 : null
                  const prog = lb.length > 1 && r ? 1 - (r - 1) / (lb.length - 1) : 1
                  const deg = prog * 180
                  return (
                    <>
                      <div className={s.gaugeArc} style={{
                        background: `conic-gradient(from 180deg, var(--blue) 0deg ${deg}deg, var(--input-bg) ${deg}deg 360deg)`,
                      }} />
                      <div className={s.gaugeValue}>
                        <div className={s.gaugeRank}>#{r || '—'}</div>
                        <div className={s.gaugeLabel}>of {lb.length}</div>
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className={s.heroGaugeLabel}>
                <BarChart3 size={12} strokeWidth={1.5} /> Your Position
              </div>
            </div>
            <div className={s.heroBarChart}>
              <div className={s.barChartTitle}><BarChart3 size={12} strokeWidth={1.5} /> Top Participants</div>
              {lb.slice(0, 5).map(p => {
                const maxHours = Math.max(...lb.map(x => x.total_hours), 1)
                const w = (p.total_hours / maxHours) * 100
                return (
                  <div key={p.id} className={`${s.barChartRow} ${p.user_id === myId ? s.barChartRowActive : ''}`}>
                    <span className={s.barChartName}>{p.user_id === myId ? 'You' : (p.user_name || p.user_id?.slice(0, 8))}</span>
                    <div className={s.barChartTrack}>
                      <div className={s.barChartFill} style={{ width: w + '%' }} />
                    </div>
                    <span className={s.barChartHours}>{Math.round(p.total_hours)}h</span>
                  </div>
                )
              })}
              {lb.length > 5 && <div className={s.barChartMore}>+{lb.length - 5} more</div>}
            </div>
          </div>
        )}
        <div className={s.compActions}>
          {c.status === 'active' && !hasJoined && (
            <button className={s.joinCompBtn} onClick={() => handleJoin(c.id)}>
              <UserPlus size={12} strokeWidth={1.5} /> Join
            </button>
          )}
          {c.status === 'active' && hasJoined && (
            <button className={s.leaveCompBtn} onClick={() => handleLeave(c.id)}>
              <X size={12} strokeWidth={1.5} /> Leave
            </button>
          )}
          {c.status === 'pending' && !c.approved && !hasJoined && (
            <button className={s.joinCompBtn} onClick={() => handleJoin(c.id)}>
              <UserPlus size={12} strokeWidth={1.5} /> Join
            </button>
          )}
          {canModerate && !c.approved && c.status !== 'rejected' && (
            <>
              <button className={s.approveBtn} onClick={() => handleApprove(c.id)}>
                <Check size={12} strokeWidth={1.5} /> Approve
              </button>
              <button className={s.rejectBtn} onClick={() => setRejecting(c)}>
                <X size={12} strokeWidth={1.5} /> Reject
              </button>
            </>
          )}
          {canModerate && c.status !== 'completed' && c.status !== 'rejected' && (
            <button className={s.endBtn} onClick={() => handleEnd(c.id)}>
              <Flag size={12} strokeWidth={1.5} /> End
            </button>
          )}
          <button className={s.leaderboardBtn} onClick={() => loadLeaderboard(c.id)}>
            <Trophy size={12} strokeWidth={1.5} /> {lb ? 'Hide' : 'Leaderboard'}
          </button>
        </div>
        {lb && (
          <div className={s.leaderboard}>
            <div className={s.lbTitle}>
              <Trophy size={12} strokeWidth={1.5} /> Leaderboard
            </div>
            {lb.length === 0 ? (
              <div className={s.lbEmpty}>No participants yet</div>
            ) : (
              lb.map((p, i) => {
                const medal = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : null
                return (
                <div key={p.id} className={`${s.lbRow} ${p.user_id === myId ? s.lbRowMe : ''}`}>
                  <span className={`${s.lbRank} ${i === 0 ? s.lbRankGold : i === 1 ? s.lbRankSilver : i === 2 ? s.lbRankBronze : ''}`}>
                    {medal || `#${i + 1}`}
                  </span>
                  <span className={`${s.lbName} ${i === 0 ? s.lbNameWinner : ''} ${p.user_id === myId ? s.lbNameMe : ''}`}>
                    {p.user_id === myId ? 'You' : (p.user_name || p.user_id?.slice(0, 8))}
                  </span>
                  <span className={s.lbHours}>{Math.round(p.total_hours)}h</span>
                </div>
                )
              })
            )}
          </div>
        )}
      </>
    )

    if (hero) {
      return (
        <div key={c.id} className={s.heroCard}>
          {content}
        </div>
      )
    }

    const isWinner = lb?.[0]?.user_id === myId
    return (
      <div key={c.id} className={`${s.compCard} ${isWinner ? s.compCardWinner : ''} ${isRejected ? s.compCardRejected : ''}`}>
        {content}
      </div>
    )
  }

  return (
    <div className={s.compsArea}>
      <div className={s.compsHeader}>
        <h3 className={s.compsTitle}>
          <Trophy size={18} strokeWidth={1.5} /> Compete
        </h3>
        {hasPermission(myMembership?.role, PERM.CREATE_COMPETITION) && (
          <button className={s.createCompBtn} onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={1.5} />
            {isAdmin ? 'Create' : 'Request'}
          </button>
        )}
      </div>

      <div className={s.compsToolbar}>
        <div className={s.compsSearch}>
          <Search size={14} strokeWidth={1.5} />
          <input type="text" placeholder="Search competitions..." value={searchText} onChange={e => setSearchText(e.target.value)} />
        </div>
        <div className={s.compsFilters}>
          {FILTERS.map(f => (
            <button key={f.id} className={`${s.compFilterBtn} ${filterTab === f.id ? s.compFilterActive : ''}`} onClick={() => setFilterTab(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {canModerate && pendingRequests.length > 0 && filterTab === 'all' && !searchText.trim() && (
        <div className={s.pendingSection}>
          <div className={s.compsSectionLabel}>Pending Requests ({pendingRequests.length})</div>
          {pendingRequests.map(c => (
            <div key={c.id} className={s.compCard}>
              <div className={s.compTop}>
                <div>
                  <div className={s.compName}>{c.title}</div>
                  {c.description && <div className={s.compDesc}>{c.description}</div>}
                  <div className={s.compMeta}>
                    <span>by {c.created_by === myId ? 'You' : c.created_by?.slice(0, 8)}</span>
                    <span>{c.duration.replace('_', ' ')}</span>
                  </div>
                </div>
                <span className={`${s.compStatus} ${s.status_pending}`}>pending</span>
              </div>
              <div className={s.compActions}>
                <button className={s.approveBtn} onClick={() => handleApprove(c.id)}>
                  <Check size={12} strokeWidth={1.5} /> Approve
                </button>
                <button className={s.rejectBtn} onClick={() => setRejecting(c)}>
                  <X size={12} strokeWidth={1.5} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeComp && (filterTab === 'all' || filterTab === 'active') && !searchText.trim() && renderCard(activeComp, true)}

      {competitions.length === 0 ? (
        <div className={s.empty}>No competitions yet</div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>No matching competitions</div>
      ) : (
        <div className={s.compsList}>
          {activeComp && filterTab === 'all' && !searchText.trim() && (
            <div className={s.compsSectionLabel}>All Competitions</div>
          )}
          {filtered.map(c => renderCard(c, false))}
        </div>
      )}

      {showCreate && (
        <div className={s.modalOverlay} onClick={() => !creating && (setShowCreate(false), setCreateError(''))}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>{isAdmin ? 'Create Competition' : 'Request Competition'}</h3>
              {!creating && <X size={18} className={s.modalClose} onClick={() => { setShowCreate(false); setCreateError('') }} />}
            </div>
            <div className={s.modalBody}>
              {createError && <div className={s.createError}>{createError}</div>}
              <div className={s.field}>
                <label>Title *</label>
                <input type="text" placeholder="Competition name" value={title} onChange={e => setTitle(e.target.value)} disabled={creating} />
              </div>
              <div className={s.field}>
                <label>Description</label>
                <textarea rows={3} placeholder="Rules or description" value={desc} onChange={e => setDesc(e.target.value)} disabled={creating} />
              </div>
              <div className={s.field}>
                <label>Duration</label>
                <select value={duration} onChange={e => setDuration(e.target.value)} disabled={creating}>
                  {COMPETITION_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={s.cancelBtn} onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
              <button className={s.submitBtn} onClick={handleCreate} disabled={!title.trim() || creating}>
                {creating ? 'Creating...' : isAdmin ? 'Create' : 'Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className={s.modalOverlay} onClick={() => { setRejecting(null); setRejectReason('') }}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Reject &ldquo;{rejecting.title}&rdquo;</h3>
              <X size={18} className={s.modalClose} onClick={() => { setRejecting(null); setRejectReason('') }} />
            </div>
            <div className={s.modalBody}>
              <div className={s.field}>
                <label>Reason (optional)</label>
                <textarea rows={3} placeholder="Why is this being rejected?" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={s.cancelBtn} onClick={() => { setRejecting(null); setRejectReason('') }}>Cancel</button>
              <button className={s.rejectBtn} onClick={() => handleReject(rejecting.id)}>
                <X size={12} strokeWidth={1.5} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
