// src/index.tsx
import { render } from 'solid-js/web';
import App from '@/App';
import '@/App.css';

render(() => <App />, document.getElementById('root') as HTMLElement);