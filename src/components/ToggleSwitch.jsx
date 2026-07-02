export default function ToggleSwitch({ checked, onChange, label }) {
  return (
    <label className="toggleWrap">
      <style>{`
        .toggleWrap { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px; color: var(--text-secondary); user-select: none; }
        .toggleTrack { position: relative; width: 40px; height: 22px; background: var(--toggle-bg); border-radius: 11px; transition: background 0.2s; flex-shrink: 0; }
        .toggleTrack.active { background: var(--blue); }
        .toggleKnob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: var(--toggle-knob); border-radius: 50%; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .toggleTrack.active .toggleKnob { transform: translateX(18px); }
      `}</style>
      <div className={`toggleTrack ${checked ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); onChange(!checked) }}>
        <div className="toggleKnob" />
      </div>
      {label && <span>{label}</span>}
    </label>
  )
}
