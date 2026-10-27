import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoginPage from "../pages/LoginPage.jsx";

/**
 * LoginWithSuccessNotice wraps LoginPage and displays a transient success
 * banner when the user arrives via a successful registration redirect.
 */
export default function LoginWithSuccessNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const registrationSuccess = location.state?.registrationSuccess === true;

  useEffect(() => {
    if (registrationSuccess) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {registrationSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-medium text-teal-900 shadow-md"
        >
          <svg
            className="h-4 w-4 text-teal-600 flex-shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Account created successfully. Please sign in.
        </div>
      )}
      <LoginPage />
    </>
  );
}

