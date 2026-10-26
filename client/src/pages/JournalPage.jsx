import EmptyState from "../components/EmptyState.jsx";

/**
 * JournalPage - Placeholder view for daily reflections and learning logs.
 * Stage 4 foundation view; journal editor scheduled for upcoming stage.
 */
export default function JournalPage() {
  return (
    <div className="space-y-6">
      <EmptyState
        title="No journal entries"
        description="Reflect and write daily journal entries."
        note="Journal is not implemented yet."
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        }
      />
    </div>
  );
}
