import s from './Skeleton.module.css'

export function SkeletonCircle({ size = 48, style }) {
  return <div className={s.circle} style={{ width: size, height: size, ...style }} />
}

export function SkeletonBar({ width = '100%', height = 12, style, radius }) {
  return <div className={s.bar} style={{ width, height, borderRadius: radius || 6, ...style }} />
}

export function SkeletonRect({ width = '100%', height = 60, style, radius }) {
  return <div className={s.rect} style={{ width, height, borderRadius: radius || 10, ...style }} />
}

export function ProfilePanelSkeleton() {
  return (
    <div className={s.panel}>
      <div style={{ position: 'relative' }}>
        <SkeletonRect height={100} radius={0} />
        <div style={{ position: 'absolute', bottom: -32, left: 20 }}>
          <SkeletonCircle size={64} />
        </div>
      </div>
      <div style={{ padding: '40px 20px 20px' }}>
        <SkeletonBar width={140} height={18} style={{ marginBottom: 6 }} />
        <SkeletonBar width={100} height={12} style={{ marginBottom: 12 }} />
        <SkeletonBar width={80} height={12} style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <SkeletonBar width={80} height={32} radius={8} />
          <SkeletonBar width={80} height={32} radius={8} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ textAlign: 'center' }}>
              <SkeletonBar width={32} height={20} style={{ marginBottom: 4 }} />
              <SkeletonBar width={48} height={10} />
            </div>
          ))}
        </div>
        <SkeletonBar height={8} style={{ marginBottom: 8 }} />
        <SkeletonBar width="60%" height={8} />
      </div>
    </div>
  )
}
