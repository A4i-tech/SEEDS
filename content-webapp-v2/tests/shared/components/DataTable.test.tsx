import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test-utils/renderWithProviders'
import { DataTable } from '../../../src/shared/components/DataTable'

const columns = [{ key: 'name', header: 'Name', render: (r: { name: string }) => r.name }]
const rows = [{ id: '1', name: 'Alpha' }]

describe('DataTable', () => {
  it('renders emptyMessage when rows is empty', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(r: { id: string }) => r.id}
        page={1}
        pageSize={10}
        emptyMessage="No items"
      />,
    )
    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('renders a row per item with actions', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderWithProviders(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        page={1}
        pageSize={10}
        emptyMessage="No items"
        actionsLabel="Actions"
        actions={(row) => (
          <>
            <button onClick={() => onEdit(row)}>Edit</button>
            <button onClick={() => onDelete(row)}>Delete</button>
          </>
        )}
      />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledWith(rows[0])
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith(rows[0])
  })
})

