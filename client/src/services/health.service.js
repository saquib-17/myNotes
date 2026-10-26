/**
 * Service to check backend API health status.
 * Relies on the Vite development proxy (/api) in development.
 */

/**
 * Checks process health of the backend API.
 * @param {AbortSignal} [signal] Optional AbortSignal to cancel in-flight requests.
 * @returns {Promise<{ ok: boolean, data?: { status: string, service: string }, error?: string }>}
 */
export async function checkBackendHealth(signal) {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      let errorMessage = `Server responded with HTTP status ${response.status} (${response.statusText})`;
      try {
        const errorBody = await response.json();
        if (errorBody && errorBody.message) {
          errorMessage = errorBody.message;
        }
      } catch {
        // Response body was not JSON; keep status text
      }
      return { ok: false, error: errorMessage };
    }

    const data = await response.json();

    // Validate expected response structure
    if (!data || typeof data !== 'object' || data.status !== 'ok') {
      return {
        ok: false,
        error: 'Invalid response format received from backend health endpoint.',
      };
    }

    return {
      ok: true,
      data: {
        status: data.status,
        service: data.service || 'unknown',
      },
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Request was cancelled.', isAborted: true };
    }

    // Network error or connection refused
    return {
      ok: false,
      error: 'Unable to reach backend server. Please verify the Express backend is running on port 3000.',
    };
  }
}
