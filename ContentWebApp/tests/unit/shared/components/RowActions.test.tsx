import { Anchor } from '@mantine/core'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RowActions } from '@shared/components/RowActions'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

describe('RowActions', () => {
  it('renders each child and fires onClick', () => {
    const onEdit = vi.fn()
    renderWithProviders(
      <RowActions>
        <Anchor component="button" type="button" onClick={onEdit}>
          Edit
        </Anchor>
        <Anchor component="button" type="button">
          Delete
        </Anchor>
      </RowActions>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('puts a dot between actions only', () => {
    const three = renderWithProviders(
      <RowActions>
        <Anchor component="button">A</Anchor>
        <Anchor component="button">B</Anchor>
        <Anchor component="button">C</Anchor>
      </RowActions>,
    )
    expect(three.container.querySelectorAll('[data-separator]').length).toBe(2)
    three.unmount()
    const one = renderWithProviders(
      <RowActions>
        <Anchor component="button">A</Anchor>
      </RowActions>,
    )
    expect(one.container.querySelectorAll('[data-separator]').length).toBe(0)
  })

  it('skips absent actions and their dots', () => {
    const { container } = renderWithProviders(
      <RowActions>
        {[<Anchor key="e" component="button">Edit</Anchor>, false && <Anchor key="d" component="button">Delete</Anchor>]}
      </RowActions>,
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(container.querySelectorAll('[data-separator]').length).toBe(0)
  })
})
