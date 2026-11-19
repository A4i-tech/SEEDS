import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import type { CourseBlock, CourseDetail } from '../../../../../src/features/library/api/library'
import { BlockViewer } from '../../../../../src/features/library/components/BlockViewer'

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
      <BlockViewer course={course([block()])} courseId="course-1" index={0} onSelect={vi.fn()} />,
    )
    expect(screen.getByText(/no preview available/i)).toBeInTheDocument()
  })

  it('renders sanitised markdown with images and maths and strips scripts', () => {
    const markdown = 'Hi <script>alert(1)</script>\n\n![alt text](http://x/y.png)\n\n$x^2$'
    const { container } = renderWithProviders(
      <BlockViewer course={course([block({ markdown })])} courseId="course-1" index={0} onSelect={vi.fn()} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByRole('img', { name: 'alt text' })).toHaveAttribute('src', 'http://x/y.png')
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('embeds a YouTube video when the block has streams and no direct source', () => {
    const video = block({
      type: 'video',
      student_view_data: { sources: [], streams: '1.50:zzz,1.00:abc123', poster: '' },
    })
    const { container } = renderWithProviders(
      <BlockViewer course={course([video])} courseId="course-1" index={0} onSelect={vi.fn()} />,
    )
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube.com/embed/abc123')
  })

  it('plays a direct video source with its poster', () => {
    const video = block({
      type: 'video',
      student_view_data: { sources: ['http://x/v.mp4'], streams: '1.00:abc123', poster: 'http://x/p.png' },
    })
    const { container } = renderWithProviders(
      <BlockViewer course={course([video])} courseId="course-1" index={0} onSelect={vi.fn()} />,
    )
    expect(container.querySelector('video')).toHaveAttribute('poster', 'http://x/p.png')
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('tells the user to open a drag-and-drop exercise in Subodha', () => {
    renderWithProviders(
      <BlockViewer course={course([block({ type: 'drag-and-drop-v2' })])} courseId="course-1" index={0} onSelect={vi.fn()} />,
    )
    expect(screen.getByText(/open it in Subodha/i)).toBeInTheDocument()
  })

  it('disables Previous on the first block and Next on the last block', () => {
    const onSelect = vi.fn()
    const { rerender } = renderWithProviders(
      <BlockViewer
        course={course([block(), block({ block_id: 'b2' })])}
        courseId="course-1"
        index={0}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onSelect).toHaveBeenCalledWith(1)

    rerender(
      <BlockViewer
        course={course([block(), block({ block_id: 'b2' })])}
        courseId="course-1"
        index={1}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Prev' })).toBeEnabled()
  })

  it('drops the problem edit state when moving to another block', () => {
    const problem = (id: string, question: string) =>
      block({ block_id: id, type: 'problem', question, choices: [{ value: 'a', text: 'A' }] })
    const blocks = [problem('p1', 'First question'), problem('p2', 'Second question')]
    const view = (index: number) => (
      <BlockViewer course={course(blocks)} courseId="course-1" index={index} onSelect={vi.fn()} />
    )
    const { rerender } = renderWithProviders(view(0))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    rerender(view(1))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByText('Second question')).toBeTruthy()
  })

  it('renders markdown blocks', () => {
    renderWithProviders(
      <BlockViewer
        course={course([block({ markdown: 'Hello world' })])}
        courseId="course-1"
        index={0}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })
})

