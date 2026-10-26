import { useState, useEffect, useCallback, useRef } from 'react';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import { checkBackendHealth } from './services/health.service.js';

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState('loading');
  const [healthData, setHealthData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastChecked, setLastChecked] = useState(null);

  // Keep track of active controller for cancellation
  const activeControllerRef = useRef(null);

  const performHealthCheck = useCallback(async () => {
    // Cancel any prior in-flight check
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;

    setConnectionStatus('loading');
    setErrorMessage('');

    const result = await checkBackendHealth(controller.signal);

    // If aborted, do nothing as another request has taken over
    if (result.isAborted) {
      return;
    }

    setLastChecked(new Date());

    if (result.ok && result.data) {
      setConnectionStatus('connected');
      setHealthData(result.data);
    } else {
      setConnectionStatus('error');
      setHealthData(null);
      setErrorMessage(result.error || 'Connection failed.');
    }
  }, []);

  useEffect(() => {
    performHealthCheck();

    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [performHealthCheck]);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      {/* Top Banner / Navigation Bar */}
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-xs sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold text-lg shadow-xs" aria-hidden="true">
              M
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-stone-900 leading-none">
                MyNotes
              </h1>
              <p className="text-xs text-stone-500 mt-0.5">
                Personal Knowledge & Activity Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 border border-teal-200">
              Stage 1 Foundation
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Project Introduction */}
        <section aria-labelledby="overview-heading" className="space-y-3">
          <h2 id="overview-heading" className="text-2xl font-bold tracking-tight text-stone-900">
            Runnable Local Foundation
          </h2>
          <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
            Welcome to the local development environment for <strong>MyNotes</strong>. This application is designed as a knowledge-first personal workspace built around the five-step loop:
            <span className="font-medium text-stone-800"> Capture</span> →
            <span className="font-medium text-stone-800"> Organize</span> →
            <span className="font-medium text-stone-800"> Connect</span> →
            <span className="font-medium text-stone-800"> Act</span> →
            <span className="font-medium text-stone-800"> Review</span>.
          </p>
        </section>

        {/* Backend Connection Status Panel */}
        <ConnectionStatus
          status={connectionStatus}
          data={healthData}
          errorMessage={errorMessage}
          lastChecked={lastChecked}
          onRetry={performHealthCheck}
        />

        {/* Architecture Foundation Summary */}
        <section aria-labelledby="foundation-details-heading" className="rounded-xl border border-stone-200 bg-white p-6 shadow-xs space-y-4">
          <h2 id="foundation-details-heading" className="text-base font-semibold text-stone-900">
            Current Implementation Scope
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-stone-600">
            <li className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 border border-stone-100">
              <span className="text-teal-700 font-bold">✓</span>
              <div>
                <strong className="text-stone-800 block">Frontend SPA:</strong>
                React + Vite in pure JavaScript with Tailwind CSS styling.
              </div>
            </li>
            <li className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 border border-stone-100">
              <span className="text-teal-700 font-bold">✓</span>
              <div>
                <strong className="text-stone-800 block">Backend Server:</strong>
                Node.js + Express with separate app and listener architecture.
              </div>
            </li>
            <li className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 border border-stone-100">
              <span className="text-teal-700 font-bold">✓</span>
              <div>
                <strong className="text-stone-800 block">Development Proxy:</strong>
                Vite proxies <code className="bg-stone-200/60 px-1 py-0.5 rounded text-xs">/api</code> requests to localhost:3000.
              </div>
            </li>
            <li className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 border border-stone-100">
              <span className="text-teal-700 font-bold">✓</span>
              <div>
                <strong className="text-stone-800 block">Testing & Linting:</strong>
                Automated tests using Node test runner + ESLint flat config.
              </div>
            </li>
          </ul>

          <div className="pt-2 text-xs text-stone-500 border-t border-stone-100 flex flex-col sm:flex-row justify-between gap-2">
            <span>Next Stage: PostgreSQL Connection & Migrations (Stage 2)</span>
            <span>No external accounts, cloud dependencies, or costs required.</span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-400">
        <p>MyNotes Stage 1 Foundation &bull; Running locally</p>
      </footer>
    </div>
  );
}
