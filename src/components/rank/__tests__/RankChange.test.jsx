// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RankChange from '../RankChange'

describe('RankChange', () => {
  it('renders nothing when change is undefined', () => {
    const { container } = render(<RankChange />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when change is null', () => {
    const { container } = render(<RankChange change={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a dash when change is zero', () => {
    const { container } = render(<RankChange change={0} />)
    expect(container.textContent).toBe('—')
  })

  it('renders an up arrow with the positive change', () => {
    const { container } = render(<RankChange change={2} />)
    expect(container.textContent).toBe('↑2')
  })

  it('renders a down arrow with the absolute negative change', () => {
    const { container } = render(<RankChange change={-1} />)
    expect(container.textContent).toBe('↓1')
  })
})
