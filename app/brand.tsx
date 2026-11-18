// Product identity shared by the landing page, the board header and reports.

export const BRAND = {
  name: "업무나침반",
  english: "Work Compass",
  tagline: "팀 업무 진행 · 업무일지 · 보고서를 한 곳에서",
} as const;

/** Board titles saved before the rename are shown as the new default. */
export const LEGACY_BOARD_TITLES = ["Workflow Command Center"];

export function displayBoardTitle(title: string | null | undefined) {
  const value = (title ?? "").trim();
  return !value || LEGACY_BOARD_TITLES.includes(value) ? BRAND.name : value;
}

export function CompassMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="#18786f" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#ffffff" strokeOpacity="0.32" strokeWidth="1.6" />
      <g transform="rotate(40 16 16)">
        <path d="M16 5.6 L19.2 16 L12.8 16 Z" fill="#ffffff" />
        <path d="M16 26.4 L19.2 16 L12.8 16 Z" fill="#8fd3c4" />
      </g>
      <circle cx="16" cy="16" r="1.7" fill="#18786f" />
    </svg>
  );
}
