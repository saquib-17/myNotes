import EmptyState from "../components/EmptyState.jsx";

/**
 * InboxPage - Placeholder view for capturing thoughts and incoming items.
 * Stage 4 foundation view; inbox triage scheduled for upcoming stage.
 */
export default function InboxPage() {
  return (
    <div className="space-y-6">
      <EmptyState
        title="Inbox is empty"
        description="Capture and process incoming items."
        note="Inbox is not implemented yet."
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.375v4.5A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25v-4.5m-19.5 0A2.25 2.25 0 014.5 12h15a2.25 2.25 0 012.25 2.25m-19.5 0v-4.5A2.25 2.25 0 014.5 7.5h15a2.25 2.25 0 012.25 2.25v4.5" />
          </svg>
        }
      />
    </div>
  );
}
