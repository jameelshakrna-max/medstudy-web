import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TREES } from '../lib/treeTypes'
import { supabase } from '../lib/supabase'
import { ForestTree } from './ForestTree'
import ForestTreeOld from './ForestTreeOld'
import s from './TreePicker.module.css'

export default function TreePicker({ selectedTree, onSelect, subjectColor, ownedTrees = ['oak', 'sakura'], coins = 0, onPurchase }) {
  const scrollRef = useRef(null)
  const [showLocked, setShowLocked] = useState(null)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')

  const handlePurchase = async () => {
    if (!showLocked || purchasing) return
    setPurchasing(true)
    setPurchaseError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setPurchaseError('Not logged in'); setPurchasing(false); return }
      const API = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${API}/forest/purchase-tree`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ treeId: showLocked.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPurchaseError(data.error || 'Purchase failed')
        setPurchasing(false)
        return
      }
      if (onPurchase) onPurchase(showLocked.id, data.newBalance)
      setShowLocked(null)
      setPurchasing(false)
    } catch (err) {
      setPurchaseError('Something went wrong')
      setPurchasing(false)
    }
  }

  const handleSelect = (tree) => {
    if (!ownedTrees.includes(tree.id)) {
      setShowLocked(tree)
      return
    }
    onSelect(tree.id)
  }

  const renderPreview = (tree) => {
    if (tree.id === 'oak') {
      return <ForestTree progress={1} state="paused" preview size="100%" />
    }
    return <ForestTreeOld tree={tree} progress={1} status="IDLE" subjectColor={subjectColor} />
  }

  return (
    <div className={s.picker}>
      <div className={s.scroll} ref={scrollRef}>
        {TREES.map(tree => {
          const isSelected = selectedTree === tree.id
          const isOwned = ownedTrees.includes(tree.id)
          return (
            <button key={tree.id}
              className={`${s.card} ${isSelected ? s.selected : ''}`}
              style={!isOwned ? { opacity: 0.6 } : undefined}
              onClick={() => handleSelect(tree)}>
              <div className={s.treePreview}>
                {renderPreview(tree)}
                {!isOwned && <span className={s.lockBadge}>🔒</span>}
                {isOwned && isSelected && <span className={s.checkBadge}>✓</span>}
              </div>
              <span className={s.name}>{tree.name}</span>
            </button>
          )
        })}
      </div>

      {/* Locked tree preview modal */}
      {showLocked && (
        <div className={s.lockedOverlay} onClick={() => { setShowLocked(null); setPurchaseError('') }}>
          <div className={s.lockedModal} onClick={e => e.stopPropagation()}>
            <div className={s.lockedPreview}>
              {renderPreview(showLocked)}
            </div>
            <h3 className={s.lockedName}>{showLocked.name}</h3>
            <p className={s.lockedDesc}>{showLocked.description}</p>
            <div className={s.lockedPrice}>
              <Sparkles size={14} />
              <span>{showLocked.price} coins</span>
            </div>
            <div className={s.lockedBalance}>
              Your balance: {coins} coins
            </div>
            {purchaseError && (
              <div className={s.purchaseError}>{purchaseError}</div>
            )}
            <div className={s.lockedActions}>
              <button className={s.closeBtn} onClick={() => { setShowLocked(null); setPurchaseError('') }}>Close</button>
              <button
                className={`${s.purchaseBtn} ${coins < showLocked.price ? s.purchaseBtnDisabled : ''}`}
                disabled={coins < showLocked.price || purchasing}
                onClick={handlePurchase}
              >
                {purchasing ? 'Buying...' : coins < showLocked.price ? 'Not enough coins' : 'Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
