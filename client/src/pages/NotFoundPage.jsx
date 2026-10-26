import { Link } from "react-router-dom";

/**
 * NotFoundPage - Displayed when no route matches the current URL.
 * Provides a helpful message and a link back to the root.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4 text-center">
      <div
        className="h-16 w-16 rounded-2xl bg-teal-800 text-white flex items-center justify-center font-bold text-3xl shadow-sm mb-8"
        aria-hidden="true"
      >
        M
      </div>
      <h1 className="text-6xl font-bold text-stone-300 mb-4">404</h1>
      <h2 className="text-xl font-semibold text-stone-800 mb-2">Page not found</h2>
      <p className="text-sm text-stone-500 mb-8 max-w-xs">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        Go to home
      </Link>
    </div>
  );
}
