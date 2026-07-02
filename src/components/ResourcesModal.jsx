import { X, ExternalLink } from 'lucide-react'
import { PARTNERS, RESOURCES } from '../data/partners'
import s from './ResourcesModal.module.css'

export default function ResourcesModal({ open, onClose }) {
  if (!open) return null

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <h2 className={s.title}>Study Resources</h2>
          <X size={18} className={s.close} onClick={onClose} />
        </div>

        <div className={s.body}>
          {/* Success Partners */}
          <div className={s.section}>
            <h3 className={s.sectionTitle}>Success Partners</h3>
            <p className={s.sectionSub}>Exclusive discounts and tools recommended by the community</p>
            <div className={s.partnerGrid}>
              {PARTNERS.map(p => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className={s.partnerCard}
                  style={{ '--p-color': p.color }}>
                  <div className={s.partnerLogo} style={{ background: p.gradient }}>
                    {p.logo}
                  </div>
                  <div className={s.partnerInfo}>
                    <div className={s.partnerName}>{p.name}</div>
                    <div className={s.partnerDesc}>{p.description}</div>
                  </div>
                  <div className={s.partnerBadge}>{p.discount}</div>
                  <div className={s.partnerCode}>Code: <strong>{p.discountCode}</strong></div>
                  <ExternalLink size={12} className={s.partnerLink} />
                </a>
              ))}
            </div>
          </div>

          {/* Regular Resources */}
          <div className={s.section}>
            <h3 className={s.sectionTitle}>Resources</h3>
            <div className={s.resourceList}>
              {RESOURCES.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className={s.resourceItem}>
                  {r.label}
                  <ExternalLink size={12} strokeWidth={1.5} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
