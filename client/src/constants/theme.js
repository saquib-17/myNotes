/**
 * Centralized Design System Tokens for MyNotes.
 *
 * Visual Specification: Modern Light & Royal Blue Reference Design
 *
 * Shell & Navigation:
 * - Sidebar background: #FBFCFF (Clean Light)
 * - Sidebar divider: #E1E6F0
 * - Sidebar text: #667085
 * - Sidebar active navigation background: #E2E8FF
 * - Sidebar active navigation text & icon: #2948D8
 * - Sidebar hover background: #F4F6FB
 * - Navbar background: #FFFFFF (Crisp White)
 * - Navbar divider: #E6EAF2
 * - Navbar text: #111827
 * - Navbar search background: #FFFFFF
 * - Navbar search border: #DCE3EF
 * - Navbar search text: #111827
 * - Navbar search placeholder: #8A94A6
 *
 * Main Workspace:
 * - Main background: #F4F6FB
 * - Primary card background: #FFFFFF
 * - Secondary surface: #F7F9FD
 * - Subtle blue-tinted surface: #EEF3FF
 * - Primary text: #111827
 * - Secondary text: #667085
 * - Muted text: #8A94A6
 * - Card borders: #E6EAF2
 * - Input background: #FFFFFF
 * - Input border: #DCE3EF
 * - Focus ring: #A5B4FC
 *
 * Primary Actions:
 * - Primary accent: #365CF5
 * - Primary hover: #2848D8
 * - Secondary accent: #6554D9
 * - Subtle accent background: #EEF1FF
 *
 * Semantic Colors:
 * - Success: #16805D
 * - Warning: #B7791F
 * - Error: #D14343
 */

export const THEME_TOKENS = {
  // Shell Layers - Clean Light Sidebar (#FBFCFF)
  sidebarBg: "bg-[#FBFCFF]",
  sidebarBorder: "border-[#E1E6F0]",
  sidebarText: "text-[#667085]",
  sidebarSecondaryText: "text-[#8A94A6]",
  sidebarIcon: "text-[#667085]",
  sidebarNavActive: "bg-[#E2E8FF] text-[#2948D8] font-semibold",
  sidebarNavActiveIcon: "text-[#2948D8]",
  sidebarNavHover: "hover:bg-[#F4F6FB] hover:text-[#111827]",

  // Shell Layers - Crisp White Navbar (#FFFFFF)
  navbarBg: "bg-white",
  navbarBorder: "border-[#E6EAF2]",
  navbarText: "text-[#111827]",
  navbarSecondaryText: "text-[#667085]",
  navbarIcon: "text-[#667085]",
  navbarSearchBg: "bg-white",
  navbarSearchText: "text-[#111827]",
  navbarSearchBorder: "border-[#DCE3EF]",
  navbarSearchPlaceholder: "placeholder:text-[#8A94A6]",

  // Main Page & Content - Soft Off-White (#F4F6FB)
  pageBg: "bg-[#F4F6FB] text-[#111827]",
  pageContent: "w-full space-y-4 sm:space-y-5",

  // Cards & Surfaces (Clean white with subtle #E6EAF2 borders)
  card: "rounded-2xl border border-[#E6EAF2] bg-white shadow-2xs",
  cardHeader: "border-b border-[#E6EAF2] pb-3 mb-3",
  cardSubtle: "rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] p-3",
  cardBlueSubtle: "rounded-xl border border-[#DCE3EF] bg-[#EEF3FF] p-3",

  // Typography
  heading1: "text-xl sm:text-2xl font-bold tracking-tight text-[#111827]",
  heading2: "text-base sm:text-lg font-semibold tracking-tight text-[#111827]",
  heading3: "text-sm sm:text-base font-semibold text-[#111827]",
  subtext: "text-xs text-[#667085]",
  label: "block text-xs font-semibold uppercase tracking-wider text-[#667085] mb-1.5",

  // Compact Form Inputs (White background with crisp #DCE3EF border)
  input: "w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs sm:text-sm text-[#111827] placeholder:text-[#8A94A6] hover:border-[#CBD5E1] focus:border-[#365CF5] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]/30 transition-colors",
  inputDisabled: "w-full rounded-xl border border-[#E6EAF2] bg-[#F7F9FD] px-3 py-2 text-xs sm:text-sm text-[#8A94A6] cursor-not-allowed select-all",

  // Buttons (Royal Blue #365CF5, Hover #2848D8)
  btnPrimary: "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#365CF5] hover:bg-[#2848D8] active:bg-[#1E40AF] px-3.5 py-2 text-xs font-semibold text-white shadow-xs focus-visible:outline-2 focus-visible:outline-[#A5B4FC] disabled:opacity-50 transition-colors cursor-pointer",
  btnSecondary: "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3.5 py-2 text-xs font-medium text-[#374151] shadow-2xs hover:bg-[#F7F9FD] hover:border-[#CBD5E1] focus-visible:outline-2 focus-visible:outline-[#A5B4FC] disabled:opacity-50 transition-colors cursor-pointer",
  btnDestructive: "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2 text-xs font-medium text-[#D14343] hover:bg-[#FEE2E2] focus-visible:outline-2 focus-visible:outline-[#EF4444] disabled:opacity-50 transition-colors cursor-pointer",
  btnIcon: "rounded-lg p-1.5 text-[#667085] hover:bg-[#F4F6FB] hover:text-[#111827] transition-colors",

  // Badges & Chips
  badgeBlue: "rounded-lg border border-[#C7D7FE] bg-[#EEF3FF] px-2 py-0.5 text-[11px] font-semibold text-[#2948D8]",
  badgeEmerald: "rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2 py-0.5 text-[11px] font-semibold text-[#16805D]",
  badgeAmber: "rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-semibold text-[#B7791F]",
  badgeRose: "rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-semibold text-[#D14343]",
  badgePurple: "rounded-lg border border-[#DDD6FE] bg-[#F5F3FF] px-2 py-0.5 text-[11px] font-semibold text-[#6554D9]",

  // Tag pastel badges (from reference design)
  tagPill: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
};
