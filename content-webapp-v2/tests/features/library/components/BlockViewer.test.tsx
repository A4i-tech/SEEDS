import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import type { CourseBlock, CourseDetail } from '../../../../src/features/library/api/library'
import { BlockViewer } from '../../../../src/features/library/components/BlockViewer'

function block(overrides: Partial<CourseBlock> = {}): CourseBlock {
  return {
    block_id: 'b1',
    type: 'html',
    display_name: 'Section',
    markdown: '',
    html: '',
    question: '',
    choices: [],
    student_view_data: { sources: [], streams: '', poster: '' },
    ...overrides,
  }
}

function course(blocks: CourseBlock[]): CourseDetail {
  return { title: 'Demo Course', name: '', description: '', hidden: false, blocks }
}

describe('BlockViewer', () => {
  it('shows a no-preview message when the block has no content', () => {
    renderWithProviders(
      <BlockViewer course={course([block()])} courseId="course-1" labels={['Section']} index={0} onSelect={vi.fn()} />,
    )
    expect(screen.getByText(/no preview available/i)).toBeInTheDocument()
  })

  it('disables Previous on the first block and Next on the last block', () => {
    const onSelect = vi.fn()
    const { rerender } = renderWithProviders(
      <BlockViewer
        course={course([block(), block({ block_id: 'b2' })])}
        courseId="course-1"
        labels={['A', 'B']}
        index={0}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onSelect).toHaveBeenCalledWith(1)

    rerender(
      <BlockViewer
        course={course([block(), block({ block_id: 'b2' })])}
        courseId="course-1"
        labels={['A', 'B']}
        index={1}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  it('renders markdown blocks', () => {
    renderWithProviders(
      <BlockViewer
        course={course([block({ markdown: 'Hello world' })])}
        courseId="course-1"
        labels={['Section']}
        index={0}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })
})

