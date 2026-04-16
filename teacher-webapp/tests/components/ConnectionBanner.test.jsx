import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectionBanner } from '../../src/components/ConnectionBanner';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('renders nothing when status is online with no prior disruption', () => {
  const { container } = render(
    <ConnectionBanner status="online" prevStatus="online" />
  );
  expect(container.firstChild).toBeNull();
});

test('renders error alert when offline', () => {
  render(<ConnectionBanner status="offline" prevStatus="online" />);
  expect(screen.getByRole('alert')).toHaveTextContent('No internet connection');
});

test('renders warning alert when degraded', () => {
  render(<ConnectionBanner status="degraded" prevStatus="online" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Weak connection detected');
});

test('renders success alert when restored, then auto-dismisses after 3s', () => {
  render(<ConnectionBanner status="online" prevStatus="offline" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Connection restored');
  act(() => jest.advanceTimersByTime(3100));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('renders success alert when restored from degraded', () => {
  render(<ConnectionBanner status="online" prevStatus="degraded" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Connection restored');
});
