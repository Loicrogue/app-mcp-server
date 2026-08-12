import { render, screen } from '@testing-library/react';
import App from './App';

test('affiche l\'interface du serveur MCP', async () => {
  render(<App />);
  expect(await screen.findByText(/serveur mcp/i)).toBeInTheDocument();
});