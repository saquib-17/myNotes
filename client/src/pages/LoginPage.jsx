import { useState, useId } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError } from '../services/auth.service.js';

/**
 * LoginPage — Accessible login form with explicit loading, validation,
 * and error feedback states.
 *
 * Password and email are validated client-side before submission to provide
 * immediate guidance, but the server is the authoritative source of truth.
 *
 * After successful login the user is redirected to the originally requested
 * private route (location.state.from), defaulting to '/dashboard'.
 */
export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated (e.g. browser back button), redirect away
  if (isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    // Minimal client-side pre-checks (server validates fully)
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // 401 → generic message to avoid account enumeration
        if (err.status === 401) {
          setErrorMessage('Invalid email or password. Please try again.');
        } else if (err.status === 429) {
          setErrorMessage('Too many login attempts. Please wait 15 minutes and try again.');
        } else {
          setErrorMessage(err.message || 'Login failed. Please try again.');
        }
      } else {
        setErrorMessage('Unable to reach the server. Check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Skip link */}
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium"
      >
        Skip to login form
      </a>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Logo / Brand */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div
              className="h-10 w-10 rounded-xl bg-teal-800 text-white flex items-center justify-center font-bold text-xl shadow-sm"
              aria-hidden="true"
            >
              M
            </div>
            <span className="text-2xl font-bold tracking-tight text-stone-900">
              MyNotes
            </span>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-stone-200 bg-white px-8 py-8 shadow-sm">
            <h1 className="text-xl font-semibold text-stone-900 mb-1">
              Sign in to your account
            </h1>
            <p className="text-sm text-stone-500 mb-6">
              Enter your credentials to access your workspace.
            </p>

            {/* Error alert */}
            {errorMessage && (
              <div
                id={errorId}
                role="alert"
                aria-live="assertive"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0v-4.5a.75.75 0 00-1.5 0v4.5zm0-7.5a.75.75 0 011.5 0 .75.75 0 01-1.5 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            <form
              id="login-form"
              onSubmit={handleSubmit}
              noValidate
              aria-describedby={errorMessage ? errorId : undefined}
            >
              {/* Email field */}
              <div className="mb-4">
                <label
                  htmlFor={emailId}
                  className="block text-sm font-medium text-stone-700 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 shadow-xs transition-colors focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                  aria-required="true"
                />
              </div>

              {/* Password field */}
              <div className="mb-6">
                <label
                  htmlFor={passwordId}
                  className="block text-sm font-medium text-stone-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Your password"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-stone-900 placeholder:text-stone-400 shadow-xs transition-colors focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                    aria-required="true"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-600 focus-visible:outline-2 focus-visible:outline-teal-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Signing in…</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-stone-500">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-teal-700 hover:text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 rounded"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-stone-400">
        MyNotes &mdash; Running locally
      </footer>
    </div>
  );
}
