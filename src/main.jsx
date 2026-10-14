import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import App from './App.jsx';
import { initTheme } from './theme.js';

initTheme();

// No hover explanations (except on the tools on the left): titles are turned into labels for screen
// readers as soon as the pointer gets to them, before a tooltip can show.
document.addEventListener('mouseover', (e) => {
  // The tools on the left keep their explanation.
  if (e.target.closest?.('.toolbar-v')) return;
  for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) {
    const t = el.getAttribute('title');
    if (t === null) continue;
    if (t && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', t);
    el.removeAttribute('title');
  }
}, true);

// The project is saved on disk continuously, so after an unexpected error
// reloading the window brings everything back.
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="welcome">
        <h1>Algo ha fallado</h1>
        <p>Tu proyecto está guardado. Recarga la ventana para seguir.</p>
        <p className="hint">{String(this.state.error?.message || this.state.error)}</p>
        <div className="welcome-actions">
          <button className="primary" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
