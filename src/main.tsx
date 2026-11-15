import { markMissingFeatures } from './tv/polyfills';
import { isTV } from './tv/platform';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import { App } from './app/App';
import { PlayerWindow } from './app/PlayerWindow';

markMissingFeatures();
if (isTV) document.documentElement.classList.add('tv');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#player' ? <PlayerWindow /> : <App />}
  </StrictMode>,
);
