import { forwardRef } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import styles from './Toast.module.css'

const Toast = forwardRef(function Toast({
  open,
  onOpenChange,
  title,
  description,
  variant = 'default', // 'default' | 'success' | 'error'
  duration = 4000,
  ...props
}, ref) {
  const variantClass = {
    default: styles.default,
    success: styles.success,
    error: styles.error,
  }[variant] || styles.default

  return (
    <RadixToast.Root
      ref={ref}
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      className={`${styles.toast} ${variantClass}`}
      {...props}
    >
      {title && <RadixToast.Title className={styles.title}>{title}</RadixToast.Title>}
      {description && <RadixToast.Description className={styles.description}>{description}</RadixToast.Description>}
      <RadixToast.Close className={styles.close} aria-label="Close">&times;</RadixToast.Close>
    </RadixToast.Root>
  )
})

function ToastProvider({ children }) {
  return (
    <RadixToast.Provider swipeDirection="right" duration={4000}>
      {children}
    </RadixToast.Provider>
  )
}

function ToastViewport() {
  return <RadixToast.Viewport className={styles.viewport} />
}

Toast.Provider = ToastProvider
Toast.Viewport = ToastViewport
Toast.Root = RadixToast.Root
Toast.Title = RadixToast.Title
Toast.Description = RadixToast.Description
Toast.Close = RadixToast.Close

export default Toast
