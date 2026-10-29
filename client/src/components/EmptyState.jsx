/**
 * EmptyState - Consistent, honest foundation state component for placeholder modules.
 * Professional Developer Navy & Royal Blue aesthetic.
 *
 * @param {{
 *   title: string,
 *   description: string,
 *   note?: string,
 *   icon?: import("react").ReactNode,
 *   action?: { label: string, onClick: () => void }
 * }} props
 */
export default function EmptyState({ title, description, note, icon, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E6EAF2] bg-white p-5 sm:p-7 text-center shadow-2xs">
      {icon && (
        <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#365CF5]" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-sm sm:text-base font-semibold text-[#111827]">{title}</h2>
      <p className="mt-1 text-xs text-[#667085] max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {note && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#C7D7FE] bg-[#EEF3FF] px-3 py-1 text-xs font-medium text-[#2948D8]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#365CF5]" aria-hidden="true" />
          <span>{note}</span>
        </div>
      )}
      {action && (
        <div className="mt-3.5">
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-[#A5B4FC] transition-colors"
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
