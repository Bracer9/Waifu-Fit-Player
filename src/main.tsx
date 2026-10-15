import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-900.css';
import './styles.css';
createRoot(document.getElementById('root')!).render(<App />);
