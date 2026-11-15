/**
 * PS5 Emu Shell — Android Entry Point
 *
 * Bootstraps the React application with strict mode and global styles.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/shell.css';
import './styles/home.css';
import './styles/library.css';
import './styles/settings.css';
import './styles/collections.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html contains <div id="root">.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);