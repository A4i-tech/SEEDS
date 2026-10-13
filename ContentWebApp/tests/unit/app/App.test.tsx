import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '@app/App'

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />)
    expect(container.firstChild).not.toBeNull()
  })

  it('contains routing structure', async () => {
    const { container, findByRole } = render(<App />)
    expect(container.firstChild).toBeInTheDocument()
    expect(await findByRole('button', { name: 'Log in' })).toBeInTheDocument()
  })
})
