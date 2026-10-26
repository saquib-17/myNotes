import EmptyState from "../components/EmptyState.jsx";

/**
 * RevisionPage - Placeholder view for spaced repetition review schedules.
 * Stage 4 foundation view; revision scheduling scheduled for upcoming stage.
 */
export default function RevisionPage() {
  return (
    <div className="space-y-6">
      <EmptyState
        title="No active revision schedules"
        description="Track spaced repetition and revision schedules."
        note="Revision scheduling is not implemented yet."
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        }
      />
    </div>
  );
}
