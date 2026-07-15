import * as RadixPopover from '@radix-ui/react-popover'
import styles from './Popover.module.css'

function Popover({ children, ...props }) {
  return <RadixPopover.Root {...props}>{children}</RadixPopover.Root>
}

Popover.Trigger = RadixPopover.Trigger
Popover.Anchor = RadixPopover.Anchor
Popover.Portal = RadixPopover.Portal
Popover.Content = function PopoverContent({ className, ...props }) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        className={`${styles.content} ${className || ''}`}
        sideOffset={8}
        align="start"
        {...props}
      />
    </RadixPopover.Portal>
  )
}
Popover.Close = RadixPopover.Close
Popover.Arrow = RadixPopover.Arrow

export default Popover
