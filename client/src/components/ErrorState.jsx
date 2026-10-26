/**
 * ErrorState - Consistent error feedback with optional retry action.
 *
 * @param {{
 *   title?: string,
 *   message: string,
 *   onRetry?: () => void
 * }} props
 */
export default function ErrorState({
  title = "Unable to load content",
  message,
  onRetry,
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border border-red-200 bg-red-50/50 p-6 sm:p-8 text-center space-y-3"
    >
      <svg
        className="mx-auto h-10 w-10 text-red-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <p className="text-sm text-stone-600 max-w-md mx-auto">{message}</p>
      {onRetry && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
