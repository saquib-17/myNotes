import EmptyState from "../components/EmptyState.jsx";

/**
 * TasksPage - Placeholder view for daily tasks and to-dos.
 * Stage 4 foundation view; task management scheduled for upcoming stage.
 */
export default function TasksPage() {
  return (
    <div className="space-y-6">
      <EmptyState
        title="No tasks created"
        description="Manage daily tasks and to-dos here."
        note="Task management is not available yet."
        icon={
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.09 1.976 1.053 1.976 2.188V8.25M6.75 12h10.5M6.75 16.5h10.5M6.75 7.5h1.5m8.25 0h1.5" />
          </svg>
        }
      />
    </div>
  );
}
