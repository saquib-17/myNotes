import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";
import {
  fetchProfile,
  updateProfile,
  changePassword,
  fetchSessions,
  logoutCurrentSession,
  logoutOtherSessions,
} from "../services/notes.service.js";

/**
 * Formats ISO date string into human-readable local date and time.
 *
 * @param {string|null} dateStr
 * @returns {string}
 */
function formatDateTime(dateStr) {
  if (!dateStr) return "Not available";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "Not available";
  }
}

export default function SettingsPage() {
  const { user, getCsrfToken, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  // Profile section state
  const [displayName, setDisplayName] = useState(user?.name || user?.displayName || "");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [accountCreated, setAccountCreated] = useState(user?.createdAt || "");

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsSuccess, setSessionsSuccess] = useState("");
  const [isLoggingOutCurrent, setIsLoggingOutCurrent] = useState(false);
  const [isLoggingOutOthers, setIsLoggingOutOthers] = useState(false);
  const [showConfirmLogoutOthers, setShowConfirmLogoutOthers] = useState(false);

  const isMountedRef = useRef(true);

  // Load profile data
  const loadProfile = useCallback(async (signal) => {
    try {
      setProfileError("");
      const profile = await fetchProfile({ signal });
      if (isMountedRef.current && profile) {
        setDisplayName(profile.name || profile.displayName || "");
        setEmail(profile.email || "");
        setAccountCreated(profile.createdAt || "");
      }
    } catch (err) {
      if (signal?.aborted) return;
      if (isMountedRef.current) {
        setProfileError(err.message || "Failed to load profile details.");
      }
    } finally {
      if (isMountedRef.current) {
        setProfileLoading(false);
      }
    }
  }, []);

  // Load sessions data
  const loadSessions = useCallback(async (signal) => {
    try {
      setSessionsLoading(true);
      setSessionsError("");
      const data = await fetchSessions({ signal });
      if (isMountedRef.current) {
        setSessions(data.sessions || []);
      }
    } catch (err) {
      if (signal?.aborted) return;
      if (isMountedRef.current) {
        setSessionsError(err.message || "Failed to load active sessions.");
      }
    } finally {
      if (isMountedRef.current) {
        setSessionsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const controller = new AbortController();
    loadProfile(controller.signal);
    loadSessions(controller.signal);

    return () => {
      isMountedRef.current = false;
      controller.abort();
    };
  }, [loadProfile, loadSessions]);

  // Handle display name update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSuccess("");
    setProfileError("");

    const trimmed = displayName.trim();
    if (trimmed.length > 60) {
      setProfileError("Display name cannot exceed 60 characters.");
      return;
    }

    try {
      setProfileSaving(true);
      const csrfToken = await getCsrfToken();
      const updated = await updateProfile({ name: trimmed, csrfToken });
      const nextName = updated.name || updated.displayName || "";
      setDisplayName(nextName);
      if (updateUser) {
        updateUser({ name: nextName, displayName: nextName });
      }
      setProfileSuccess("Display name updated successfully.");
    } catch (err) {
      setProfileError(err.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle password change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSuccess("");
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (!newPassword) {
      setPasswordError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 15) {
      setPasswordError("New password must be at least 15 characters long.");
      return;
    }
    if (newPassword.length > 128) {
      setPasswordError("New password must not exceed 128 characters.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password cannot be the same as your current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    try {
      setPasswordSaving(true);
      const csrfToken = await getCsrfToken();
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
        csrfToken,
      });

      setPasswordSuccess("Password changed successfully. All other sessions have been signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Refresh sessions
      loadSessions();
    } catch (err) {
      setPasswordError(err.message || "Failed to change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  // Handle sign out of current session
  const handleLogoutCurrent = async () => {
    try {
      setIsLoggingOutCurrent(true);
      setSessionsError("");
      const csrfToken = await getCsrfToken();
      await logoutCurrentSession({ csrfToken });
      // Clear client auth context and navigate to login
      if (logout) {
        await logout();
      }
      navigate("/login", { replace: true });
    } catch (err) {
      setSessionsError(err.message || "Failed to sign out current session.");
      setIsLoggingOutCurrent(false);
    }
  };

  // Handle sign out of all other sessions
  const handleLogoutOthers = async () => {
    setShowConfirmLogoutOthers(false);
    try {
      setIsLoggingOutOthers(true);
      setSessionsError("");
      setSessionsSuccess("");
      const csrfToken = await getCsrfToken();
      const res = await logoutOtherSessions({ csrfToken });
      setSessionsSuccess(res.message || "All other sessions have been signed out.");
      // Refresh sessions list
      await loadSessions();
    } catch (err) {
      setSessionsError(err.message || "Failed to sign out other sessions.");
    } finally {
      setIsLoggingOutOthers(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Profile &amp; Settings
        </h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Manage your account profile, credentials, and active device sessions.
        </p>
      </div>

      {/* 1. Account Information & Display Name Section */}
      <section
        aria-labelledby="profile-heading"
        className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs"
      >
        <div className="border-b border-slate-100 pb-3">
          <h2 id="profile-heading" className="text-base font-semibold text-slate-900">
            Profile Information
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            View your registered email address and customize your personal display name.
          </p>
        </div>

        {profileSuccess && (
          <div
            role="status"
            className="mt-3.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"
          >
            {profileSuccess}
          </div>
        )}

        {profileError && (
          <div
            role="alert"
            className="mt-3.5 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800"
          >
            {profileError}
          </div>
        )}

        {profileLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading profile information…</div>
        ) : (
          <form onSubmit={handleProfileSubmit} className="mt-4 space-y-3.5 max-w-lg">
            {/* Read-only Email */}
            <div>
              <label
                htmlFor="profile-email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs sm:text-sm text-slate-500 cursor-not-allowed select-all"
                />
                <span className="absolute right-3 top-1.5 text-[11px] font-medium text-slate-400">
                  Read-only
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Email address changes are not supported in this version.
              </p>
            </div>

            {/* Editable Display Name */}
            <div>
              <label
                htmlFor="display-name"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
              >
                Display Name
              </label>
              <input
                id="display-name"
                type="text"
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex Doe"
                className="w-full rounded-lg border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs sm:text-sm text-[#182230] placeholder:text-[#8A94A6] hover:border-slate-300 focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5] transition-colors"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Visible throughout your notes, journal, and workspace header (1–60 characters).
              </p>
            </div>

            {accountCreated && (
              <div className="text-xs text-slate-500">
                Member since: <span className="font-medium text-slate-700">{formatDateTime(accountCreated)}</span>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={profileSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-[#365CF5] disabled:opacity-50 transition-colors"
              >
                {profileSaving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. Change Password Section */}
      <section
        aria-labelledby="password-heading"
        className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs"
      >
        <div className="border-b border-slate-100 pb-3">
          <h2 id="password-heading" className="text-base font-semibold text-slate-900">
            Change Password
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Update your account password. Changing your password will automatically sign out all other devices.
          </p>
        </div>

        {passwordSuccess && (
          <div
            role="status"
            className="mt-3.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"
          >
            {passwordSuccess}
          </div>
        )}

        {passwordError && (
          <div
            role="alert"
            className="mt-3.5 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800"
          >
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3.5 max-w-lg">
          {/* Current Password */}
          <div>
            <label
              htmlFor="current-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              Current Password
            </label>
            <div className="relative flex items-center">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-[#DCE3EF] bg-white px-3 py-1.5 pr-12 text-xs sm:text-sm text-[#182230] placeholder:text-[#8A94A6] hover:border-slate-300 focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute right-2 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-800"
                aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
              >
                {showCurrentPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              New Password
            </label>
            <div className="relative flex items-center">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-[#DCE3EF] bg-white px-3 py-1.5 pr-12 text-xs sm:text-sm text-[#182230] placeholder:text-[#8A94A6] hover:border-slate-300 focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-800"
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              >
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Must be at least 15 characters long. Spaces and Unicode characters are supported.
            </p>
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              Confirm New Password
            </label>
            <div className="relative flex items-center">
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-[#DCE3EF] bg-white px-3 py-1.5 pr-12 text-xs sm:text-sm text-[#182230] placeholder:text-[#8A94A6] hover:border-slate-300 focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-2 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-800"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={passwordSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-[#365CF5] disabled:opacity-50 transition-colors"
            >
              {passwordSaving ? "Updating Password…" : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      {/* 3. Active Sessions Section */}
      <section
        aria-labelledby="sessions-heading"
        className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <h2 id="sessions-heading" className="text-base font-semibold text-slate-900">
              Active Sessions
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Review and manage logged-in devices currently holding authenticated access to your account.
            </p>
          </div>

          {sessions.length > 1 && (
            <button
              type="button"
              onClick={() => setShowConfirmLogoutOthers(true)}
              disabled={isLoggingOutOthers}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors shadow-2xs"
            >
              {isLoggingOutOthers ? "Signing out others…" : "Sign out other sessions"}
            </button>
          )}
        </div>

        {sessionsSuccess && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            {sessionsSuccess}
          </div>
        )}

        {sessionsError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            {sessionsError}
          </div>
        )}

        {sessionsLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading active sessions…</div>
        ) : (
          <div className="mt-4 space-y-3">
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 italic">No active sessions found.</p>
            ) : (
              sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 transition-colors ${
                    sess.currentSession
                      ? "border-[#365CF5]/30 bg-[#EEF3FF]"
                      : "border-[#E6EAF2] bg-white"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {sess.id}
                      </span>
                      {sess.currentSession ? (
                        <span className="rounded-full border border-[#365CF5]/20 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#2948D8]">
                          Current Session
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Other Session
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {sess.createdAt && (
                        <span>Created: {formatDateTime(sess.createdAt)}</span>
                      )}
                      {sess.lastSeenAt && (
                        <span>Last Active: {formatDateTime(sess.lastSeenAt)}</span>
                      )}
                      {sess.expiresAt && (
                        <span>Expires: {formatDateTime(sess.expiresAt)}</span>
                      )}
                    </div>
                  </div>

                  {sess.currentSession && (
                    <button
                      type="button"
                      onClick={handleLogoutCurrent}
                      disabled={isLoggingOutCurrent}
                      className="inline-flex items-center self-start sm:self-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                    >
                      {isLoggingOutCurrent ? "Signing out…" : "Sign out current session"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Confirmation Modal for Logging Out Other Sessions */}
      {showConfirmLogoutOthers && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-others-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 id="logout-others-modal-title" className="text-base font-semibold text-slate-900">
              Sign out all other sessions?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will immediately invalidate all other active sessions and devices logged into your account.
              Your current session will remain active.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmLogoutOthers(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogoutOthers}
                disabled={isLoggingOutOthers}
                className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isLoggingOutOthers ? "Signing out…" : "Confirm Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
