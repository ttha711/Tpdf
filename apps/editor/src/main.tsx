import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { EditorSessionGate } from './auth/EditorSessionGate.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorSessionGate><App /></EditorSessionGate>
  </StrictMode>,
);
