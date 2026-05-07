import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

test('renders tazviro hiring portal welcome screen', () => {
  render(<App />);
  expect(screen.getByText(/welcome to tazviro technologies hiring portal/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /start candidate registration/i })).toBeInTheDocument();
});

test('shows a custom role input when other designation is selected', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /start candidate registration/i }));
  fireEvent.change(screen.getByLabelText(/designation/i), { target: { value: '__custom_designation__' } });

  expect(screen.getByLabelText(/enter your role/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/enter your role/i), { target: { value: 'DevOps Engineer' } });
  expect(screen.getByDisplayValue('DevOps Engineer')).toBeInTheDocument();
});

test('starts the assessment even when camera permission is denied', async () => {
  const originalFetch = global.fetch;
  const originalMediaDevices = navigator.mediaDevices;
  const requestFullscreen = jest.fn().mockResolvedValue();
  const exitFullscreen = jest.fn().mockResolvedValue();

  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  });

  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: jest.fn().mockRejectedValue(new Error('Permission denied')),
    },
  });

  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        candidate: { id: 1, name: 'Jane Doe', email: 'jane@example.com' },
        attempt: { id: 101 },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        questions: [
          {
            id: 'q1',
            question: 'Sample aptitude question',
            options: ['A', 'B', 'C', 'D'],
          },
        ],
      }),
    });

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /start candidate registration/i }));
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText(/email id/i), { target: { value: 'jane@example.com' } });
  fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '9876543210' } });
  fireEvent.change(screen.getByLabelText(/resume upload/i), {
    target: {
      files: [new File(['resume'], 'resume.pdf', { type: 'application/pdf' })],
    },
  });

  fireEvent.click(screen.getByRole('button', { name: /start test/i }));

  expect(await screen.findByRole('heading', { name: /aptitude round/i })).toBeInTheDocument();
  expect(screen.getByText(/camera and microphone access is optional/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  global.fetch = originalFetch;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: originalMediaDevices,
  });
});
