import * as RadixTooltip from '@radix-ui/react-tooltip'
import styles from './Tooltip.module.css'

function TooltipProvider({ children, ...props }) {
  return <RadixTooltip.Provider {...props}>{children}</RadixTooltip.Provider>
}

function Tooltip({ children, ...props }) {
  return <RadixTooltip.Root delayDuration={300} {...props}>{children}</RadixTooltip.Root>
}

Tooltip.Trigger = RadixTooltip.Trigger
Tooltip.Portal = RadixTooltip.Portal
Tooltip.Content = function TooltipContent({ className, side = 'top', ...props }) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        className={`${styles.content} ${className || ''}`}
        side={side}
        sideOffset={6}
        {...props}
      />
    </RadixTooltip.Portal>
  )
}
Tooltip.Arrow = RadixTooltip.Arrow

export { TooltipProvider }
export default Tooltip
