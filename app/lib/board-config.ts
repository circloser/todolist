import type {
  AppSettings,
  DueFilter,
  SortMode,
  TaskFilter,
  TemplateOption,
} from "./workflow";

export const filters: Array<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "open", label: "진행" },
  { key: "done", label: "완료" },
];

export const sortOptions: Array<{ key: SortMode; label: string }> = [
  { key: "manual", label: "수동" },
  { key: "assignee", label: "담당자" },
  { key: "progress", label: "진도" },
  { key: "updated", label: "최근" },
];

export const dueFilters: Array<{ key: DueFilter; label: string }> = [
  { key: "all", label: "전체 일정" },
  { key: "urgent", label: "D-3 이내" },
  { key: "week", label: "이번 주" },
  { key: "month", label: "이번 달" },
  { key: "overdue", label: "지연" },
];

export const defaultTemplates: TemplateOption[] = [
  {
    key: "external-research-outsourcing",
    name: "외부 학술/조사 용역",
    description: "공공 조달, 계약, 보고, 검수, 지급이 포함된 외부 용역",
    stages: [],
  },
];

export const defaultSettings: AppSettings = {
  organizationName: "습지복원팀",
  boardTitle: "Workflow Command Center",
};

export const DASHBOARD_WIDGETS: Array<{ key: string; label: string }> = [
  { key: "kpi", label: "KPI 카드" },
  { key: "status", label: "상태 분포" },
  { key: "workload", label: "담당자 워크로드" },
  { key: "types", label: "유형별 업무" },
  { key: "deadlines", label: "다가오는 마감" },
  { key: "budget", label: "예산 요약" },
  { key: "bottlenecks", label: "병목 단계" },
  { key: "regions", label: "지역 현황" },
  { key: "activity", label: "최근 활동" },
];

export const defaultWidgetPrefs: Record<string, boolean> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((widget) => [widget.key, true])
);

const CATEGORY_SEPARATOR = /\s*(?:>|\/|\\|\||›|→|·)\s*/u;
const HIERARCHY_LABELS = ["대분류", "중분류", "소분류"];

export function categoryPath(value: string) {
  const parts = value
    .split(CATEGORY_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts : ["미분류"];
}

export function categoryKey(value: string) {
  return categoryPath(value).join(" > ");
}

export function categoryDepth(value: string) {
  return categoryPath(value).length - 1;
}

export function categoryLeaf(value: string) {
  return categoryPath(value).at(-1) ?? "미분류";
}

export function categoryTrail(value: string) {
  return categoryPath(value).slice(0, -1).join(" > ");
}

export function categoryLevelLabel(depth: number) {
  return HIERARCHY_LABELS[depth] ?? `${depth + 1}단계`;
}

// User text is interpolated into Leaflet popup HTML strings.
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Inclusive [start, end] ISO range for "this week" (Mon-Sun) or "this month".
export function periodRange(kind: "week" | "month") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (kind === "week") {
    const weekday = (today.getDay() + 6) % 7; // Monday = 0
    const start = new Date(today);
    start.setDate(today.getDate() - weekday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: isoDate(start), end: isoDate(end) };
}
