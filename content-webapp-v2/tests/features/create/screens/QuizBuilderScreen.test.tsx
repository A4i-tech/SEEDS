import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { QuizBuilderScreen } from '@features/create/screens/QuizBuilderScreen'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@shared/services/languages', () => ({
  getLanguages: vi.fn().mockResolvedValue([
    { code: 'en', name: 'English' },
    { code: 'kn', name: 'Kannada' },
  ]),
}))

vi.mock('@features/create/api/quiz', () => ({
  createQuiz: vi.fn().mockResolvedValue(undefined),
}))

describe('QuizBuilderScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  })

  it('renders metadata fields and one question by default', () => {
    renderWithProviders(<QuizBuilderScreen />)
    // Role queries: visible labels carry a required "*" suffix, and each
    // Option label is shared by a Radio and its TextInput.
    expect(screen.getByRole('textbox', { name: 'Quiz name' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Question 1' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Option A' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Option B' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Option C' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Option D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add question' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to Library' })).toBeInTheDocument()
  })

  it('adds a new question field when Add question is clicked', () => {
    renderWithProviders(<QuizBuilderScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }))
    expect(screen.getByRole('textbox', { name: 'Question 1' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Question 2' })).toBeInTheDocument()
  })
})

