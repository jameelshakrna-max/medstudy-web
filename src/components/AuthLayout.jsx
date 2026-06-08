import { Link } from 'react-router-dom'
import './AuthLayout.css'

export default function AuthLayout({ title, sub, children }) {
  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-blob1" />
        <div className="auth-blob2" />
      </div>
      <Link to="/" className="auth-back">← MedStudy OS</Link>
      <div className="auth-card">
        <div className="auth-icon">🏥</div>
        <h1 className="auth-title">{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
    </div>
  )
}
