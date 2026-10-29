/**
 * PageHeader - Standardized page header component for authenticated views.
 *
 * Semantic <h1> with optional descriptive subtitle and consistent spacing.
 * Styled for the crisp white Navbar (#FFFFFF) with high-contrast text (#111827)
 * and subtle secondary text (#667085).
 *
 * @param {{ title: string, description?: string }} props
 */
export default function PageHeader({ title, description }) {
  return (
    <div className="min-w-0">
      <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#111827] leading-tight truncate">
        {title}
      </h1>
      {description && (
        <p className="text-xs text-[#667085] mt-0.5 truncate max-w-xl">
          {description}
        </p>
      )}
    </div>
  );
}
