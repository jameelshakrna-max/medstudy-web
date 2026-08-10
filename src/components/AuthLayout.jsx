import { Link } from 'react-router-dom'
import { BrandLogo } from './ui'
import './AuthLayout.css'

export default function AuthLayout({ title, sub, children }) {
  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-blob1" />
        <div className="auth-blob2" />
      </div>
      <Link to="/" className="auth-back" aria-label="Back to MedStudy OS home">
        <BrandLogo variant="horizontal" size={150} />
      </Link>
      <div className="auth-card">
        <div className="auth-icon">
          <BrandLogo variant="symbol" size={52} />
        </div>
        <h1 className="auth-title">{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
    </div>
  )
}
