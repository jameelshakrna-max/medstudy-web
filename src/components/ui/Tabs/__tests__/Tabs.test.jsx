// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../Tabs'

describe('Tabs', () => {
  it('renders triggers and switches content on click', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Content A')).toBeInTheDocument()
    expect(screen.queryByText('Content B')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Tab B'))

    expect(screen.queryByText('Content A')).not.toBeInTheDocument()
    expect(screen.getByText('Content B')).toBeInTheDocument()
  })

  it('marks active trigger with aria-selected', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Tab A')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Tab B')).toHaveAttribute('aria-selected', 'false')
  })

  it('works in controlled mode', () => {
    const onChange = vi.fn()
    render(
      <Tabs value="b" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Content B')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Tab A'))
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('does not switch in controlled mode without state update', () => {
    const onChange = vi.fn()
    render(
      <Tabs value="a" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    fireEvent.click(screen.getByText('Tab B'))
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.getByText('Content A')).toBeInTheDocument()
    expect(screen.queryByText('Content B')).not.toBeInTheDocument()
  })

  it('disables trigger when disabled prop is true', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b" disabled>Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Tab B')).toBeDisabled()
  })

  it('wires tabpanel id, aria-labelledby and trigger aria-controls to matching ids', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    const tabA = screen.getByText('Tab A')
    const tabB = screen.getByText('Tab B')
    const panelA = screen.getByRole('tabpanel')

    expect(tabA).toHaveAttribute('aria-controls', panelA.id)
    expect(panelA).toHaveAttribute('aria-labelledby', tabA.id)

    // Every trigger carries an aria-controls target, even inactive ones.
    expect(tabB).toHaveAttribute('aria-controls')
  })

  it('only keeps the active tab in the tab order', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('Tab A')).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('Tab B')).toHaveAttribute('tabindex', '-1')
  })

  it('uses instance-scoped ids so multiple Tabs do not collide', () => {
    render(
      <>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Tab A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Content A</TabsContent>
        </Tabs>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Tab A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Content A</TabsContent>
        </Tabs>
      </>
    )

    const triggers = screen.getAllByText('Tab A')
    const panels = screen.getAllByRole('tabpanel')

    expect(triggers[0].id).not.toBe(triggers[1].id)
    expect(panels[0].id).not.toBe(panels[1].id)
    expect(panels[0]).toHaveAttribute('aria-labelledby', triggers[0].id)
    expect(panels[1]).toHaveAttribute('aria-labelledby', triggers[1].id)
  })

  it('moves focus with ArrowRight and ArrowLeft without activating', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
          <TabsTrigger value="c">Tab C</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
        <TabsContent value="c">Content C</TabsContent>
      </Tabs>
    )

    screen.getByText('Tab A').focus()

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab B')
    expect(screen.getByText('Content A')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab C')

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(document.activeElement).toHaveTextContent('Tab B')
  })

  it('ArrowRight with no tab focused moves to the first tab', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab A')
    expect(screen.getByText('Content A')).toBeInTheDocument()
  })

  it('wraps around when arrow navigation reaches the edges', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    // Start focus on the first tab.
    screen.getByText('Tab A').focus()

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(document.activeElement).toHaveTextContent('Tab B')

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab A')
  })

  it('Home moves focus to the first tab and End to the last', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
          <TabsTrigger value="c">Tab C</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    screen.getByText('Tab C').focus()
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' })
    expect(document.activeElement).toHaveTextContent('Tab A')

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' })
    expect(document.activeElement).toHaveTextContent('Tab C')
  })

  it('Enter activates the focused tab', () => {
    const onChange = vi.fn()
    render(
      <Tabs defaultValue="a" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    screen.getByText('Tab A').focus()
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab B')

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.getByText('Content B')).toBeInTheDocument()
  })

  it('Space activates the focused tab', () => {
    const onChange = vi.fn()
    render(
      <Tabs defaultValue="a" onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    screen.getByText('Tab A').focus()
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab B')

    fireEvent.keyDown(screen.getByRole('tablist'), { key: ' ' })
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.getByText('Content B')).toBeInTheDocument()
  })

  it('skips disabled tabs when navigating with arrows', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b" disabled>Tab B</TabsTrigger>
          <TabsTrigger value="c">Tab C</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    screen.getByText('Tab A').focus()
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('Tab C')
  })

  it('throws when compound components used outside Tabs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TabsTrigger value="x">Bad</TabsTrigger>)).toThrow(
      'Tabs compound components must be used within <Tabs>'
    )
    consoleSpy.mockRestore()
  })
})

describe('TabsContent forceMount', () => {
  const getPanelForTrigger = (triggerText) => {
    const trigger = screen.getByText(triggerText)
    return document.getElementById(trigger.getAttribute('aria-controls'))
  }

  it('defaults to lazy mount: inactive panel is not in the DOM', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    )

    expect(screen.getByRole('tabpanel', { name: 'Tab A' })).toBeInTheDocument()
    expect(screen.queryByText('Content B')).not.toBeInTheDocument()
    expect(screen.queryByRole('tabpanel', { hidden: true, name: 'Tab B' })).not.toBeInTheDocument()
  })

  it('forceMount keeps an inactive panel mounted but hidden with tabIndex -1', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b" forceMount>Content B</TabsContent>
      </Tabs>
    )

    const tabB = screen.getByText('Tab B')
    const panelB = getPanelForTrigger('Tab B')

    expect(panelB).toBeInTheDocument()
    expect(panelB).toHaveAttribute('hidden')
    expect(panelB).toHaveAttribute('tabindex', '-1')
    expect(panelB).toHaveAttribute('role', 'tabpanel')
    expect(panelB.id).toBe(tabB.getAttribute('aria-controls'))
    expect(panelB).toHaveAttribute('aria-labelledby', tabB.id)
  })

  it('forceMount renders the active panel visible with tabIndex 0 and no hidden', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" forceMount>Content A</TabsContent>
        <TabsContent value="b" forceMount>Content B</TabsContent>
      </Tabs>
    )

    const panelA = getPanelForTrigger('Tab A')

    expect(panelA).not.toHaveAttribute('hidden')
    expect(panelA).toHaveAttribute('tabindex', '0')
  })

  it('switching tabs with forceMount keeps both panels mounted; only active lacks hidden', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" forceMount>Content A</TabsContent>
        <TabsContent value="b" forceMount>Content B</TabsContent>
      </Tabs>
    )

    expect(getPanelForTrigger('Tab A')).not.toHaveAttribute('hidden')
    expect(getPanelForTrigger('Tab B')).toHaveAttribute('hidden')

    fireEvent.click(screen.getByText('Tab B'))

    expect(getPanelForTrigger('Tab A')).toHaveAttribute('hidden')
    expect(getPanelForTrigger('Tab B')).not.toHaveAttribute('hidden')
  })

  it('trigger aria-controls still points at a force-mounted hidden panel id', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b" forceMount>Content B</TabsContent>
      </Tabs>
    )

    const tabB = screen.getByText('Tab B')
    const panelB = getPanelForTrigger('Tab B')

    expect(tabB).toHaveAttribute('aria-controls', panelB.id)
  })

  it('overrides a caller-provided hidden prop with forceMount state', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" forceMount hidden={false}>Content A</TabsContent>
        <TabsContent value="b" forceMount hidden={false}>Content B</TabsContent>
      </Tabs>
    )

    expect(getPanelForTrigger('Tab A')).not.toHaveAttribute('hidden')
    expect(getPanelForTrigger('Tab B')).toHaveAttribute('hidden')
  })
})
