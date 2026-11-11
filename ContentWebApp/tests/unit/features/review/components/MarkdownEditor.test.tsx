import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { MarkdownEditor } from '@features/review/components/MarkdownEditor'

const SOURCE = '<!-- page 2 -->\n\nhello world AB > DE $x$\n\n![fig](images/a.jpg "t")'

describe('MarkdownEditor', () => {
  it('shows page, math and figure placeholders as chips and keeps them on edit', async () => {
    const onChange = vi.fn()
    renderWithProviders(<MarkdownEditor value={SOURCE} onChange={onChange} ariaLabel="Edit" />)
    expect(await screen.findByText('Page 2')).toBeTruthy()
    expect(screen.getByText('Math')).toBeTruthy()
    expect(screen.getByText('Figure')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const saved = onChange.mock.calls.at(-1)?.[0] as string
    expect(saved).toContain('<!-- page 2 -->')
    expect(saved).toContain('$x$')
    expect(saved).toContain('![fig](images/a.jpg "t")')
    expect(saved).toContain('AB > DE')
  })

  it('offers bold, italic and heading but no underline', async () => {
    renderWithProviders(<MarkdownEditor value="text" onChange={vi.fn()} ariaLabel="Edit" />)
    expect(await screen.findByRole('button', { name: 'Italic' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /underline/i })).toBeNull()
  })
})
