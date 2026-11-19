import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyPerfMode } from './lib/perfMode';
import { applyUiScale } from './lib/uiScale';

applyPerfMode();
applyUiScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
