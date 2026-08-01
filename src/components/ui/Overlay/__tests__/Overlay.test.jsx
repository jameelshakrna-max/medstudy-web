// @vitest-environment jsdom
import { createRef, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import * as Dialog from '@radix-ui/react-dialog'
import { LayerProvider } from '../../../../context/LayerContext'
import Overlay from '../Overlay'
import BaseDialog from '../../BaseDialog/BaseDialog'
import styles from '../Overlay.module.css'

vi.mock('../Overlay.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

function flushTimers() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button>Open dialog</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <Overlay data-testid="dialog-overlay" />
        </Dialog.Overlay>
        <Dialog.Content data-testid="dialog-content">
          <p>Dialog body</p>
          <Dialog.Close asChild>
            <button>Close dialog</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

describe('Overlay', () => {
  it('forwards the ref to the overlay DOM element', () => {
    const ref = createRef()
    render(<Overlay ref={ref} data-testid="overlay" />)
    expect(ref.current).toBeInstanceOf(HTMLElement)
    expect(ref.current).toBe(screen.getByTestId('overlay'))
  })

  it('merges the module overlay class with a passed className', () => {
    render(<Overlay className="custom-overlay" data-testid="overlay" />)
    const el = screen.getByTestId('overlay')
    expect(el.className).toContain(styles.overlay)
    expect(el.className).toContain('custom-overlay')
  })

  it('forwards additional props and event handlers', () => {
    const onClick = vi.fn()
    render(<Overlay data-testid="overlay" aria-hidden="true" onClick={onClick} />)
    const el = screen.getByTestId('overlay')
    expect(el).toHaveAttribute('data-testid', 'overlay')
    expect(el).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders inside a Radix dialog without a "cannot be given refs" warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      render(
        <LayerProvider>
          <BaseDialog open onOpenChange={() => {}}>
            <p>Dialog body</p>
          </BaseDialog>
        </LayerProvider>
      )
      expect(screen.getByText('Dialog body')).toBeInTheDocument()
      const refWarnings = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .map((call) => call.map(String).join(' '))
        .filter((msg) => msg.includes('cannot be given refs') || msg.includes('forwardRef'))
      expect(refWarnings, `Ref warnings detected:\n${refWarnings.join('\n') || '(none)'}`).toEqual([])
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('closes the dialog when the overlay is clicked', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
    await flushTimers()
    await user.click(screen.getByTestId('dialog-overlay'))
    expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
  })

  it('traps focus inside the dialog and restores it on close', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(opener)
    const content = screen.getByTestId('dialog-content')
    expect(content.contains(document.activeElement)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(opener).toHaveFocus()
  })

  it('closes the dialog on Escape', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
  })
})
