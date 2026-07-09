import { useState } from 'react'
import { GraduationCap, FileText, Layers, Users, Stethoscope } from 'lucide-react'
import communityTemplates from '../../data/communityTemplates'

const iconMap = {
  'graduation-cap': GraduationCap,
  'file-text': FileText,
  'layers': Layers,
  'users': Users,
  'stethoscope': Stethoscope,
}

export default function TemplatePicker({ onSelect, onBack }) {
  const [selected, setSelected] = useState(null)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'var(--input-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: 12,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              padding: '8px 16px',
            }}
          >
            ← Back
          </button>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          Choose a Template
        </h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>
        Start with pre-configured settings for your community type
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {communityTemplates.map(t => {
          const Icon = iconMap[t.icon] || GraduationCap
          const isSelected = selected === t.id
          return (
            <div
              key={t.id}
              onClick={() => setSelected(isSelected ? null : t.id)}
              style={{
                cursor: 'pointer',
                border: isSelected ? '2px solid var(--blue)' : '2px solid var(--card-border)',
                borderRadius: 16,
                padding: 16,
                background: 'var(--card-bg)',
                transition: 'border-color 0.15s',
              }}
            >
              <Icon size={24} strokeWidth={1.5} color="var(--blue)" />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>
                {t.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mist)', marginTop: 4 }}>
                {t.description}
              </div>
            </div>
          )
        })}
      </div>
      <button
        disabled={!selected}
        style={{
          marginTop: 20,
          opacity: selected ? 1 : 0.5,
          padding: '10px 24px',
          background: 'linear-gradient(135deg, var(--blue), var(--blue2))',
          color: 'var(--navy)',
          fontSize: 14,
          fontWeight: 700,
          border: 'none',
          borderRadius: 12,
          cursor: selected ? 'pointer' : 'not-allowed',
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: selected ? '0 4px 20px var(--accent-glow)' : 'none',
        }}
        onClick={() => {
          if (selected) onSelect(communityTemplates.find(t => t.id === selected))
        }}
      >
        Use Template
      </button>
    </div>
  )
}
