/**
 * EmptyState - Consistent, honest foundation state component for placeholder modules.
 *
 * @param {{
 *   title: string,
 *   description: string,
 *   note?: string,
 *   icon?: import("react").ReactNode
 * }} props
 */
export default function EmptyState({ title, description, note, icon }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white p-8 sm:p-12 text-center shadow-xs">
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <p className="mt-2 text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {note && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/70 px-4 py-1.5 text-xs font-medium text-teal-800">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden="true" />
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}
