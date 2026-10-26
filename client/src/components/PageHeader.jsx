/**
 * PageHeader - Standardized page header component for authenticated views.
 *
 * Semantic <h1> with optional descriptive subtitle and consistent spacing.
 *
 * @param {{ title: string, description?: string }} props
 */
export default function PageHeader({ title, description }) {
  return (
    <div className="border-b border-stone-200 pb-5">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-sm text-stone-600 sm:text-base">
          {description}
        </p>
      )}
    </div>
  );
}
