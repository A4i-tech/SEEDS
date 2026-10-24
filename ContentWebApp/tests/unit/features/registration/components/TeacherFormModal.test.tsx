import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { TeacherFormModal } from '@features/registration/components/TeacherFormModal'
import type { SchoolTeacher } from '@features/registration/types/registration.types'

describe('TeacherFormModal phone field', () => {
  it('displays controlled value', () => {
    const teacher = { id: 't1', name: 'Asha', phone_number: '9876543210' } as SchoolTeacher
    renderWithProviders(<TeacherFormModal teacher={teacher} onClose={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /phone/i })).toHaveValue('9876543210')
  })

  it('labels the phone field as required', () => {
    const teacher = { id: 't1', name: 'Asha', phone_number: '' } as SchoolTeacher
    renderWithProviders(<TeacherFormModal teacher={teacher} onClose={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /phone/i })).toBeRequired()
  })

  it('shows the role picker only when creating', () => {
    renderWithProviders(<TeacherFormModal onClose={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /phone/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /role/i })).toBeInTheDocument()
  })
})

