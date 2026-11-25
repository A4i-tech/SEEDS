import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UserAvatar } from '@shared/components/UserAvatar';

import { renderWithProviders } from '../../test-utils/renderWithProviders';

describe('UserAvatar', () => {
  it('shows the first letter for a plain name', () => {
    renderWithProviders(<UserAvatar name="  farman  " />);
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('shows the full emoji for an emoji name', () => {
    renderWithProviders(<UserAvatar name="😀smile" />);
    expect(screen.getByText('😀')).toBeInTheDocument();
  });
});
