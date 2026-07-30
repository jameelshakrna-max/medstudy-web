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

  it('provides correct ARIA attributes for panels', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
      </Tabs>
    )

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-a')
    expect(screen.getByText('Tab A')).toHaveAttribute('aria-controls', 'panel-a')
  })

  it('throws when compound components used outside Tabs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TabsTrigger value="x">Bad</TabsTrigger>)).toThrow(
      'Tabs compound components must be used within <Tabs>'
    )
    consoleSpy.mockRestore()
  })
})
