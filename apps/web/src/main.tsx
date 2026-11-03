import { createRoot } from 'react-dom/client';
import { startAnalytics } from './analytics';
import { App } from './app';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz indisponível');
createRoot(root).render(<App />);
startAnalytics({ production: import.meta.env.PROD });
