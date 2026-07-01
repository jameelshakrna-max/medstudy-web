import { Link } from 'react-router-dom'
import { GraduationCap, ArrowLeft } from 'lucide-react'
import './AuthLayout.css'

export default function AuthLayout({ title, sub, children }) {
  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-blob1" />
        <div className="auth-blob2" />
      </div>
      <Link to="/" className="auth-back">
        <ArrowLeft size={14} strokeWidth={1.5} />
        MedStudy OS
      </Link>
      <div className="auth-card">
        <div className="auth-icon">
          <GraduationCap size={36} strokeWidth={1.5} />
        </div>
        <h1 className="auth-title">{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
    </div>
  )
}
