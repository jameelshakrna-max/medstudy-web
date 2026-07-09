import { ChevronDown, Check } from 'lucide-react'
import * as RadixSelect from '@radix-ui/react-select'
import styles from './Select.module.css'

export default function FormSelect({ value, onChange, options, placeholder, className }) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger className={`${styles.trigger} ${className || ''}`}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className={styles.icon}>
          <ChevronDown size={16} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={4}>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map(opt => (
              <RadixSelect.Item key={opt.value} value={opt.value} className={styles.item} disabled={opt.disabled}>
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className={styles.itemIndicator}>
                  <Check size={14} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
