import { render } from '@testing-library/react';

// Mock all the problematic dependencies before importing App
jest.mock('@azure/storage-blob', () => ({
  BlockBlobClient: jest.fn().mockImplementation(() => ({
    upload: jest.fn(),
    download: jest.fn(),
  })),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    })),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

jest.mock('swagger-ui-react', () => {
  return function SwaggerUI() {
    return null;
  };
});

// Now import App after all mocks are set up
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container.firstChild).toHaveClass('App');
  });

  it('contains routing structure', () => {
    const { container } = render(<App />);
    // The app should render without throwing errors
    expect(container.firstChild).toBeInTheDocument();
  });
});