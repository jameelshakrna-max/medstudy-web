export default function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '50vh', padding: 40, textAlign: 'center', fontFamily: "'DM Sans', sans-serif",
    }}>
      <h2 style={{ fontSize: 24, marginBottom: 12, color: 'var(--text-primary)' }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: 'var(--mist)', marginBottom: 20, maxWidth: 400 }}>
        {error?.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={resetErrorBoundary}
        style={{
          padding: '10px 24px', background: 'var(--blue)', color: '#fff', border: 'none',
          borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
