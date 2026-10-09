import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api/applications.js', () => ({
  listApplications: vi.fn().mockResolvedValue([]),
  getApplication: vi.fn(),
  createApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));

import App from './App.jsx';

describe('App', () => {
  beforeEach(() => {
    // A real session in localStorage, exactly as AuthProvider stores one
    // after login/register - the router redirects to /login without it.
    localStorage.setItem(
      'ci_auth_session',
      JSON.stringify({ token: 'test-token', user: { id: 'user_1', name: 'Test User', email: 'test@example.com' } }),
    );
  });

  it('renders the applications dashboard by default', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Applications' })).toBeInTheDocument();
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });
});
