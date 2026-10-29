/**
 * Component displaying backend connection status with accessible states and retry action.
 * Professional Developer Navy & Royal Blue aesthetic.
 */
export default function ConnectionStatus({
  status,
  data,
  errorMessage,
  lastChecked,
  onRetry,
}) {
  const isLoading = status === 'loading';
  const isConnected = status === 'connected';
  const isError = status === 'error';

  return (
    <section
      aria-labelledby="connection-status-heading"
      className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E6EAF2]">
        <div>
          <h2 id="connection-status-heading" className="text-base font-semibold text-[#111827]">
            Backend Service Status
          </h2>
          <p className="text-sm text-[#667085]">
            Monitors connectivity between the Vite frontend proxy and Express API.
          </p>
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          aria-label="Retry connection to backend server"
        >
          {isLoading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Checking...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Check Connection</span>
            </>
          )}
        </button>
      </div>

      {/* Accessible Live Region */}
      <div role="status" aria-live="polite" className="pt-4">
        {isLoading && (
          <div className="flex items-center gap-3 rounded-xl bg-[#F7F9FD] p-3.5 border border-[#E6EAF2]">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
            <span className="text-sm font-medium text-[#374151]">
              State: Connecting to backend service at <code className="text-xs bg-white px-1 py-0.5 rounded border border-[#E6EAF2] text-[#111827]">/api/health</code>...
            </span>
          </div>
        )}

        {isConnected && (
          <div className="flex flex-col gap-2 rounded-xl bg-[#EEF3FF] p-4 border border-[#C7D7FE]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#365CF5]" aria-hidden="true" />
              <span className="text-sm font-semibold text-[#111827]">
                State: Connected — Backend API is online and responding.
              </span>
            </div>
            <div className="text-xs text-[#374151] space-y-1 pl-4">
              <p>
                <span className="font-medium text-[#111827]">Service identifier:</span> {data?.service}
              </p>
              <p>
                <span className="font-medium text-[#111827]">Health status:</span> {data?.status}
              </p>
              {lastChecked && (
                <p className="text-[#2948D8]">
                  Last verified: {lastChecked.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-col gap-2 rounded-lg bg-amber-50/70 p-4 border border-amber-200">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden="true" />
              <span className="text-sm font-semibold text-amber-950">
                State: Offline — Could not reach backend API.
              </span>
            </div>
            <div className="text-xs text-amber-900 pl-4 space-y-2">
              <p className="font-mono bg-amber-100/60 p-2 rounded text-amber-950">
                {errorMessage}
              </p>
              <p>
                <strong>Troubleshooting:</strong> Confirm that the backend server is running in a separate terminal via <code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">npm run dev</code> from the <code className="font-mono">server/</code> directory on port 3000.
              </p>
              {lastChecked && (
                <p className="text-amber-800">
                  Attempted: {lastChecked.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
