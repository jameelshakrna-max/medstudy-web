import { useEffect, useState } from 'react'
import Toast from './ui/Toast/Toast'

export default function GoalCelebration({ goal, onDismiss }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setOpen(true))
  }, [])

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen)
    if (!nextOpen) onDismiss()
  }

  return (
    <>
      <Toast open={open} onOpenChange={handleOpenChange} variant="success" duration={4000}>
        <Toast.Title>Goal Complete!</Toast.Title>
        <Toast.Description>{goal.title} — {goal.pct}% achieved</Toast.Description>
      </Toast>
      <Toast.Viewport />
    </>
  )
}
