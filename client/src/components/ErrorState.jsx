/**
 * ErrorState - Consistent error feedback with optional retry action.
 * Professional Developer Navy & Royal Blue aesthetic.
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
      className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 sm:p-5 text-center space-y-2.5 shadow-2xs"
    >
      <svg
        className="mx-auto h-8 w-8 text-rose-500"
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
      <h2 className="text-sm sm:text-base font-semibold text-[#111827]">{title}</h2>
      <p className="text-xs text-[#667085] max-w-md mx-auto">{message}</p>
      {onRetry && (
        <div className="pt-1.5">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
