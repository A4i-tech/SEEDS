import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@shared/i18n'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { MakeAccessibleScreen } from '@features/make-accessible/screens/MakeAccessibleScreen'
import { createBook, createRemediationJob } from '@features/make-accessible/api/remediation'
import { getLanguages } from '@shared/services/languages'
import { volunteerRole } from '@shared/utils/jwt'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@features/make-accessible/api/remediation', () => ({ createRemediationJob: vi.fn(), createBook: vi.fn() }))
vi.mock('@shared/services/languages', () => ({ getLanguages: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))
vi.mock('@shared/components/BookOrganiser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/components/BookOrganiser')>()),
  BookOrganiser: ({
    items,
    onChange,
  }: {
    items: { id: string; name: string }[]
    onChange: (items: { id: string; name: string }[]) => void
  }) => (
    <div>
      <ol aria-label="rows">
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ol>
      <button onClick={() => onChange([...items].reverse())}>Reverse</button>
      {items.map((item) => (
        <button key={item.id} onClick={() => onChange(items.filter((other) => other.id !== item.id))}>
          Remove {item.name}
        </button>
      ))}
    </div>
  ),
}))

const MB = 1024 * 1024

function pdf(name: string, sizeMb = 1) {
  const file = new File(['%PDF-'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: sizeMb * MB })
  return file
}

function choose(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input missing')
  fireEvent.change(input, { target: { files } })
}

const bookButton = (count: number) =>
  screen.getByRole('button', { name: i18n.t('makeAccessible.uploadBook', { count }) })

const nameField = () => screen.getByRole('textbox', { name: /Book name/ })

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  vi.mocked(getLanguages).mockResolvedValue([])
})

describe('MakeAccessibleScreen', () => {
  it('keeps the one-file flow for a single file', async () => {
    vi.mocked(createRemediationJob).mockResolvedValue('job-1')
    renderWithProviders(<MakeAccessibleScreen />)
    const file = pdf('one.pdf')

    choose([file])
    expect(screen.queryByText('Organise the book')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }))

    expect(createRemediationJob).toHaveBeenCalledWith(file, '')
    expect(createBook).not.toHaveBeenCalled()
  })

  it('shows the organiser and the book button for three files', () => {
    renderWithProviders(<MakeAccessibleScreen />)

    choose([pdf('c.pdf'), pdf('a.pdf'), pdf('b.pdf')])

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
    expect(screen.getByRole('button', { name: 'Upload 3 PDFs as one book' })).toBeEnabled()
    expect(nameField()).toHaveValue('a')
  })

  it('disables the book button for an over-limit file and for a blank book name', async () => {
    renderWithProviders(<MakeAccessibleScreen />)

    choose([pdf('a.pdf'), pdf('b.pdf', 11)])
    expect(bookButton(2)).toBeDisabled()

    choose([pdf('a.pdf'), pdf('b.pdf')])
    expect(bookButton(2)).toBeEnabled()
    await userEvent.clear(nameField())
    expect(bookButton(2)).toBeDisabled()
    await userEvent.tab()
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(i18n.t('makeAccessible.bookNameRequired'))).toBeInTheDocument()
  })

  it('sends the files in list order with the trimmed title', async () => {
    vi.mocked(createBook).mockResolvedValue({ book_id: 'b1', job_ids: ['j1', 'j2', 'j3'] })
    renderWithProviders(<MakeAccessibleScreen />)
    choose([pdf('b.pdf'), pdf('c.pdf'), pdf('a.pdf')])
    await userEvent.click(screen.getByRole('button', { name: 'Reverse' }))
    await userEvent.clear(nameField())
    await userEvent.type(nameField(), '  My Book  ')
    await userEvent.click(bookButton(3))

    await waitFor(() => expect(createBook).toHaveBeenCalled())
    const [sent, title, language] = vi.mocked(createBook).mock.calls[0]
    expect(sent.map((f: File) => f.name)).toEqual(['c.pdf', 'b.pdf', 'a.pdf'])
    expect([title, language]).toEqual(['My Book', ''])
  })

  it('keeps the list and shows the server message when the submit fails', async () => {
    vi.mocked(createBook).mockRejectedValue(new Error('Server said no'))
    renderWithProviders(<MakeAccessibleScreen />)
    choose([pdf('a.pdf'), pdf('b.pdf')])

    await userEvent.click(bookButton(2))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Server said no')
    expect(alert).toHaveTextContent(i18n.t('makeAccessible.bookFailed'))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(bookButton(2)).toBeEnabled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('clears the list, shows the toast and goes to Jobs on success', async () => {
    vi.mocked(createBook).mockResolvedValue({ book_id: 'b1', job_ids: ['j1', 'j2'] })
    renderWithProviders(<MakeAccessibleScreen />)
    choose([pdf('a.pdf'), pdf('b.pdf')])

    await userEvent.click(bookButton(2))

    await waitFor(() => expect(notifications.show).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith({ to: '/jobs' })
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.queryByRole('textbox', { name: /Book name/ })).toBeNull()

    const { message } = vi.mocked(notifications.show).mock.calls[0][0]
    renderWithProviders(<>{message}</>)
    expect(screen.getByText(i18n.t('makeAccessible.bookQueued', { count: 2 }))).toBeInTheDocument()
    navigate.mockClear()
    await userEvent.click(screen.getByRole('button', { name: i18n.t('makeAccessible.bookQueuedLink') }))
    expect(navigate).toHaveBeenCalledWith({ to: '/jobs' })
  })

  it('switches to the one-file flow and focuses Choose PDF files when one row is left', async () => {
    renderWithProviders(<MakeAccessibleScreen />)
    choose([pdf('a.pdf'), pdf('b.pdf')])

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.pdf' }))

    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.getByText(i18n.t('makeAccessible.selectedFile', { name: 'b.pdf' }))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
    expect(screen.getByRole('button', { name: i18n.t('makeAccessible.browse') })).toHaveFocus()
  })

  it('shows a volunteer only the volunteer sentence', () => {
    useAuthStore.setState({ status: 'authenticated', role: volunteerRole })
    renderWithProviders(<MakeAccessibleScreen />)

    expect(screen.getByText(i18n.t('makeAccessible.volunteerNote'))).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('skips non-PDF files in a multi-selection and says so', () => {
    renderWithProviders(<MakeAccessibleScreen />)

    choose([pdf('a.pdf'), pdf('b.pdf'), new File(['x'], 'notes.txt', { type: 'text/plain' })])

    expect(notifications.show).toHaveBeenCalledWith({
      message: i18n.t('makeAccessible.skippedNonPdf', { names: 'notes.txt' }),
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('accepts exactly 50 PDFs', () => {
    renderWithProviders(<MakeAccessibleScreen />)

    choose(Array.from({ length: 50 }, (_, i) => pdf(`c${i}.pdf`)))

    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Upload 50 PDFs as one book' })).toBeEnabled()
  })

  it('rejects a selection over the chapter limit', () => {
    renderWithProviders(<MakeAccessibleScreen />)

    choose(Array.from({ length: 51 }, (_, i) => pdf(`c${i}.pdf`)))

    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('makeAccessible.tooManyFiles', { limit: 50, count: 51 }))
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('disables Upload and shows the message for a single over-limit file', () => {
    renderWithProviders(<MakeAccessibleScreen />)

    choose([pdf('big.pdf', 11)])

    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
    expect(
      screen.getByText(i18n.t('bookOrganiser.tooBig', { name: 'big.pdf', size: '11.0', limit: 10 })),
    ).toBeInTheDocument()
  })
})
