import EmptyState from "../components/EmptyState.jsx";

/**
 * NotesPage - Placeholder view for personal notes and documentation.
 * Stage 4 foundation view; CRUD implementation scheduled for Stage 5.
 */
export default function NotesPage() {
  return (
    <div className="space-y-6">
      <EmptyState
        title="No notes yet"
        description="Your notes and documentation will live here."
        note="Note creation will be implemented in the next notes stage."
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        }
      />
    </div>
  );
}
