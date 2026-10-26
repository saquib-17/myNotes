import EmptyState from "../components/EmptyState.jsx";

/**
 * DocumentsPage - Placeholder view for document and source material management.
 * Stage 4 foundation view; document uploads scheduled for upcoming stage.
 */
export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <EmptyState
        title="No documents attached"
        description="Store and reference important documents here."
        note="Document uploads are not implemented yet."
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.373L8.552 18.32a1.5 1.5 0 01-2.121-2.121l9.879-9.879" />
          </svg>
        }
      />
    </div>
  );
}
