import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz indisponível');
createRoot(root).render(<App />);
