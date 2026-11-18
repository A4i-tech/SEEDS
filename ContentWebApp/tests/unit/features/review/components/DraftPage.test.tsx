import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { DraftPage } from '@features/review/components/DraftPage'
import { getRemediationImage } from '@features/review/api/review'

vi.mock('@features/review/api/review', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/review/api/review')>()),
  getRemediationImage: vi.fn(),
}))
vi.mock('@features/review/components/MarkdownEditor', () => ({
  MarkdownEditor: ({ value, toolbar }: { value: string; toolbar: boolean }) => (
    <div data-testid="editor" data-toolbar={String(toolbar)}>
      {value}
    </div>
  ),
}))

const markdown = 'Intro\n\n![A plant](images/p-1.png "A green plant")\n\nOutro'

describe('DraftPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'fonts', {
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
    })
    vi.mocked(getRemediationImage).mockResolvedValue('blob:figure')
  })

  it('places the figure between the text around it, with the toolbar on the first editor only', () => {
    renderWithProviders(<DraftPage jobId="job-1" pageIndex={0} markdown={markdown} ariaLabel="Draft" onChange={vi.fn()} />)
    const editors = screen.getAllByTestId('editor')
    expect(editors.map((editor) => editor.textContent)).toEqual(['Intro', 'Outro'])
    expect(editors.map((editor) => editor.getAttribute('data-toolbar'))).toEqual(['true', 'false'])
    const figure = screen.getByLabelText('Alt text')
    expect(editors[0].compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(figure.compareDocumentPosition(editors[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('writes an edited alt text back into the page markdown', () => {
    const onChange = vi.fn()
    renderWithProviders(<DraftPage jobId="job-1" pageIndex={0} markdown={markdown} ariaLabel="Draft" onChange={onChange} />)
    const alt = screen.getByLabelText('Alt text')
    fireEvent.change(alt, { target: { value: 'A fern' } })
    fireEvent.blur(alt)
    expect(onChange).toHaveBeenCalledWith('Intro\n\n![A fern](images/p-1.png "A green plant")\n\nOutro')
  })

  it('does not report a change when the field is left as it was', () => {
    const onChange = vi.fn()
    renderWithProviders(<DraftPage jobId="job-1" pageIndex={0} markdown={markdown} ariaLabel="Draft" onChange={onChange} />)
    fireEvent.blur(screen.getByLabelText('Alt text'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('DraftPage raw blocks', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fonts', {
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
    })
  })

  it('edits a table as text and writes it back untouched around the other text', () => {
    const onChange = vi.fn()
    const page = 'Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
    renderWithProviders(<DraftPage jobId="job-1" pageIndex={0} markdown={page} ariaLabel="Draft" onChange={onChange} />)
    const raw = screen.getByLabelText('Edit table or math as text')
    fireEvent.change(raw, { target: { value: '| A | B |\n| --- | --- |\n| 9 | 2 |' } })
    fireEvent.blur(raw)
    expect(onChange).toHaveBeenCalledWith('Intro\n\n| A | B |\n| --- | --- |\n| 9 | 2 |')
  })
})
