import { render, screen } from '@testing-library/react';
import App from './App';

test('affiche l\'interface du serveur MCP', () => {
  render(<App />);
  expect(screen.getByText(/serveur mcp/i)).toBeInTheDocument();
});