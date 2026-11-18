import { fireEvent, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { BookOrganiser, sortByName, type OrganiserItem } from '@shared/components/BookOrganiser'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

const ITEMS: OrganiserItem[] = [
  { id: 'a', name: 'Unit_10.pdf', sizeMb: 1 },
  { id: 'b', name: 'Unit_2.pdf', sizeMb: 2 },
  { id: 'c', name: 'Unit_1.pdf', sizeMb: 3 },
]

interface HarnessProps {
  initial?: OrganiserItem[]
  allowRemove?: boolean
  onChange?: (items: OrganiserItem[]) => void
}

function Harness({ initial = ITEMS, allowRemove = false, onChange = vi.fn() }: HarnessProps) {
  const [items, setItems] = useState(initial)
  return (
    <BookOrganiser
      items={items}
      allowRemove={allowRemove}
      onChange={(next) => {
        onChange(next)
        setItems(next)
      }}
    />
  )
}

const rows = () => screen.getAllByRole('listitem')
const names = () => rows().map((row) => within(row).getByText(/\.pdf$/).textContent)
const button = (name: string) => screen.getByRole('button', { name })

describe('BookOrganiser', () => {
  it('shows the title, hints and one row per item', () => {
    renderWithProviders(<Harness />)
    expect(screen.getByText('Organise the book')).toBeInTheDocument()
    expect(screen.getByText('Top to bottom is the book order.')).toBeInTheDocument()
    expect(screen.getByText(/press Alt with the up or down arrow key/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Book order' })).toBeInTheDocument()
    expect(names()).toEqual(['Unit_10.pdf', 'Unit_2.pdf', 'Unit_1.pdf'])
    expect(screen.getByText('2.0 MB')).toBeInTheDocument()
  })

  it('moves a row down and up with the buttons', () => {
    renderWithProviders(<Harness />)
    fireEvent.click(button('Move Unit_10.pdf down, now position 2 of 3'))
    expect(names()).toEqual(['Unit_2.pdf', 'Unit_10.pdf', 'Unit_1.pdf'])
    fireEvent.click(button('Move Unit_1.pdf up, now position 2 of 3'))
    expect(names()).toEqual(['Unit_2.pdf', 'Unit_1.pdf', 'Unit_10.pdf'])
  })

  it('disables Move up on the first row and Move down on the last row', () => {
    renderWithProviders(<Harness />)
    expect(button('Move Unit_10.pdf up')).toBeDisabled()
    expect(button('Move Unit_1.pdf down')).toBeDisabled()
    expect(button('Move Unit_2.pdf up, now position 1 of 3')).toBeEnabled()
    expect(button('Move Unit_2.pdf down, now position 3 of 3')).toBeEnabled()
  })

  it('moves a row with Alt+ArrowDown and Alt+ArrowUp', () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    fireEvent.keyDown(rows()[0], { key: 'ArrowDown', altKey: true })
    expect(names()).toEqual(['Unit_2.pdf', 'Unit_10.pdf', 'Unit_1.pdf'])
    fireEvent.keyDown(rows()[2], { key: 'ArrowUp', altKey: true })
    expect(names()).toEqual(['Unit_2.pdf', 'Unit_1.pdf', 'Unit_10.pdf'])
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('ignores plain arrow keys and keys at the list edge', () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    fireEvent.keyDown(rows()[1], { key: 'ArrowDown' })
    fireEvent.keyDown(rows()[1], { key: 'ArrowUp' })
    fireEvent.keyDown(rows()[0], { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(rows()[2], { key: 'ArrowDown', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
    expect(names()).toEqual(['Unit_10.pdf', 'Unit_2.pdf', 'Unit_1.pdf'])
  })

  it('keeps focus on the same button of the moved row', () => {
    renderWithProviders(<Harness />)
    const down = button('Move Unit_10.pdf down, now position 2 of 3')
    down.focus()
    fireEvent.click(down)
    expect(button('Move Unit_10.pdf down, now position 3 of 3')).toHaveFocus()
  })

  it('moves focus to the other move button when the clicked one becomes disabled', () => {
    renderWithProviders(<Harness />)
    fireEvent.click(button('Move Unit_2.pdf up, now position 1 of 3'))
    expect(button('Move Unit_2.pdf up')).toBeDisabled()
    expect(button('Move Unit_2.pdf down, now position 2 of 3')).toHaveFocus()
    fireEvent.click(button('Move Unit_2.pdf down, now position 2 of 3'))
    fireEvent.click(button('Move Unit_2.pdf down, now position 3 of 3'))
    expect(button('Move Unit_2.pdf down')).toBeDisabled()
    expect(button('Move Unit_2.pdf up, now position 2 of 3')).toHaveFocus()
  })

  it('puts focus on a move button of the row moved by keyboard', () => {
    renderWithProviders(<Harness />)
    fireEvent.keyDown(rows()[0], { key: 'ArrowDown', altKey: true })
    expect(button('Move Unit_10.pdf down, now position 3 of 3')).toHaveFocus()
    fireEvent.keyDown(rows()[1], { key: 'ArrowUp', altKey: true })
    expect(button('Move Unit_10.pdf up')).toBeDisabled()
    expect(button('Move Unit_10.pdf down, now position 2 of 3')).toHaveFocus()
  })

  it('hides Remove unless allowRemove is set', () => {
    renderWithProviders(<Harness />)
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
  })

  it('removes a row, calls onChange without it and focuses the neighbour Remove button', () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness allowRemove onChange={onChange} />)
    fireEvent.click(button('Remove Unit_2.pdf'))
    expect(onChange).toHaveBeenCalledWith([ITEMS[0], ITEMS[2]])
    expect(names()).toEqual(['Unit_10.pdf', 'Unit_1.pdf'])
    expect(button('Remove Unit_1.pdf')).toHaveFocus()
  })

  it('focuses the new last Remove button after removing the last row', () => {
    renderWithProviders(<Harness allowRemove />)
    fireEvent.click(button('Remove Unit_1.pdf'))
    expect(button('Remove Unit_2.pdf')).toHaveFocus()
  })

  it('still renders when only one item is left', () => {
    renderWithProviders(<Harness allowRemove initial={ITEMS.slice(0, 2)} />)
    fireEvent.click(button('Remove Unit_2.pdf'))
    expect(names()).toEqual(['Unit_10.pdf'])
    expect(button('Move Unit_10.pdf up')).toBeDisabled()
    expect(button('Move Unit_10.pdf down')).toBeDisabled()
    expect(button('Remove Unit_10.pdf')).toHaveFocus()
  })

  it('renders an empty list after the last item is removed', () => {
    renderWithProviders(<Harness allowRemove initial={ITEMS.slice(0, 1)} />)
    fireEvent.click(button('Remove Unit_10.pdf'))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Unit_10.pdf removed. 0 chapters left')
  })

  it('sorts names with numbers by value', () => {
    expect(sortByName(ITEMS).map((item) => item.name)).toEqual(['Unit_1.pdf', 'Unit_2.pdf', 'Unit_10.pdf'])
    expect(ITEMS.map((item) => item.name)).toEqual(['Unit_10.pdf', 'Unit_2.pdf', 'Unit_1.pdf'])
  })

  it('calls onChange with sorted items', () => {
    const onChange = vi.fn()
    renderWithProviders(<Harness onChange={onChange} />)
    fireEvent.click(button('Sort by name'))
    expect(onChange).toHaveBeenCalledWith(sortByName(ITEMS))
    expect(names()).toEqual(['Unit_1.pdf', 'Unit_2.pdf', 'Unit_10.pdf'])
  })

  it('shows the problem text for a file over the size limit', () => {
    renderWithProviders(<Harness initial={[{ id: 'x', name: 'big.pdf', sizeMb: 12 }, ITEMS[1]]} />)
    const problem =
      'big.pdf is 12.0 MB. The limit is 10 MB. Split the book into chapter PDFs or compress the file, then choose it again.'
    expect(screen.getByText(problem)).toBeVisible()
    expect(rows()[0]).toHaveAccessibleDescription(problem)
    expect(screen.getAllByText(/The limit is/)).toHaveLength(1)
  })

  it('shows no problem for a file of exactly the size limit', () => {
    renderWithProviders(<Harness initial={[{ id: 'x', name: 'edge.pdf', sizeMb: 10 }]} />)
    expect(screen.getByText('10.0 MB')).toBeInTheDocument()
    expect(screen.queryByText(/The limit is/)).not.toBeInTheDocument()
    expect(rows()[0]).not.toHaveAttribute('aria-describedby')
  })

  it('shows no size for an item without sizeMb', () => {
    renderWithProviders(<Harness initial={[{ id: 'x', name: 'plain.pdf' }]} />)
    expect(screen.queryByText(/MB/)).not.toBeInTheDocument()
  })

  it('announces a move, a remove and a sort', () => {
    renderWithProviders(<Harness allowRemove />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    fireEvent.click(button('Move Unit_10.pdf down, now position 2 of 3'))
    expect(status).toHaveTextContent('Unit_10.pdf moved to position 2 of 3')
    fireEvent.click(button('Remove Unit_2.pdf'))
    expect(status).toHaveTextContent('Unit_2.pdf removed. 2 chapters left')
    fireEvent.click(button('Sort by name'))
    expect(status).toHaveTextContent('Sorted by name')
  })

  describe('drag and drop', () => {
    const makeTransfer = () => ({ setData: vi.fn(), effectAllowed: '' })

    it('marks the drop target during drag over and reorders on drop', () => {
      renderWithProviders(<Harness />)
      const dataTransfer = makeTransfer()
      fireEvent.dragStart(rows()[0], { dataTransfer })
      expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'a')
      fireEvent.dragOver(rows()[2], { dataTransfer })
      expect(rows()[2]).toHaveAttribute('data-drop-target')
      expect(rows()[0]).not.toHaveAttribute('data-drop-target')
      fireEvent.drop(rows()[2], { dataTransfer })
      expect(names()).toEqual(['Unit_2.pdf', 'Unit_1.pdf', 'Unit_10.pdf'])
      rows().forEach((row) => expect(row).not.toHaveAttribute('data-drop-target'))
    })

    it('shows no drop target over the dragged row itself', () => {
      renderWithProviders(<Harness />)
      const dataTransfer = makeTransfer()
      fireEvent.dragStart(rows()[1], { dataTransfer })
      fireEvent.dragOver(rows()[1], { dataTransfer })
      expect(rows()[1]).not.toHaveAttribute('data-drop-target')
    })

    it('clears the drop target on drag end without changing the order', () => {
      renderWithProviders(<Harness />)
      const dataTransfer = makeTransfer()
      fireEvent.dragStart(rows()[0], { dataTransfer })
      fireEvent.dragOver(rows()[1], { dataTransfer })
      fireEvent.dragEnd(rows()[0], { dataTransfer })
      expect(rows()[1]).not.toHaveAttribute('data-drop-target')
      expect(names()).toEqual(['Unit_10.pdf', 'Unit_2.pdf', 'Unit_1.pdf'])
    })
  })
})
