import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import styles from './Dropdown.module.css'

function Dropdown({ children, ...props }) {
  return <DropdownMenu.Root {...props}>{children}</DropdownMenu.Root>
}

Dropdown.Trigger = DropdownMenu.Trigger
Dropdown.Portal = DropdownMenu.Portal
Dropdown.Content = function DropdownContent({ className, ...props }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className={`${styles.content} ${className || ''}`}
        sideOffset={4}
        align="end"
        {...props}
      />
    </DropdownMenu.Portal>
  )
}
Dropdown.Item = function DropdownItem({ className, ...props }) {
  return <DropdownMenu.Item className={`${styles.item} ${className || ''}`} {...props} />
}
Dropdown.Separator = function DropdownSeparator({ className, ...props }) {
  return <DropdownMenu.Separator className={`${styles.separator} ${className || ''}`} {...props} />
}
Dropdown.Label = function DropdownLabel({ className, ...props }) {
  return <DropdownMenu.Label className={`${styles.label} ${className || ''}`} {...props} />
}

export default Dropdown
