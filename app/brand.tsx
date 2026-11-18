// Product identity shared by the landing page, the board header and reports.

export const BRAND = {
  name: "업무나침반",
  english: "Work Compass",
  tagline: "팀 업무 진행 · 일정 · 회의록 · 업무일지를 한 곳에서",
} as const;

/**
 * Default titles that never named a team: the old placeholder and the product
 * name itself. A board showing one of these displays its team name instead,
 * so each board keeps its own identity (e.g. "습지복원팀").
 */
export const PLACEHOLDER_BOARD_TITLES: string[] = ["Workflow Command Center", BRAND.name];

export function displayBoardTitle(title: string | null | undefined, teamName?: string | null) {
  const value = (title ?? "").trim();
  if (value && !PLACEHOLDER_BOARD_TITLES.includes(value)) {
    return value;
  }
  return (teamName ?? "").trim() || BRAND.name;
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
