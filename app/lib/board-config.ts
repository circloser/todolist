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
  boardTitle: "업무나침반",
};

export const DASHBOARD_WIDGETS: Array<{ key: string; label: string }> = [
  { key: "kpi", label: "KPI 카드" },
  { key: "schedule", label: "다가오는 일정·회의록" },
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

/** Keys of every ancestor of a category, outermost first ("A", "A > B" for "A > B > C"). */
export function categoryAncestors(value: string) {
  const parts = categoryPath(value);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join(" > "));
}

/** The 대분류 a category belongs to. */
export function categoryRoot(value: string) {
  return categoryPath(value)[0];
}

/**
 * Orders list groups as a tree: every 대분류 is followed by its 중분류/소분류,
 * and a missing parent gets an empty header so each branch can be folded.
 * Siblings keep the saved order (a parent's own position wins, otherwise its
 * first child's), so moving a 대분류 moves its whole branch.
 */
export function arrangeCategoryGroups<T extends { name: string }>(
  groups: T[],
  makeEmpty: (name: string) => T
): T[] {
  type Node = { name: string; first: number; own: number | null; group: T | null; children: Map<string, Node> };
  const top = new Map<string, Node>();

  groups.forEach((group, index) => {
    const parts = categoryPath(group.name);
    let level = top;
    parts.forEach((_, depth) => {
      const name = parts.slice(0, depth + 1).join(" > ");
      let node = level.get(name);
      if (!node) {
        node = { name, first: index, own: null, group: null, children: new Map() };
        level.set(name, node);
      }
      if (depth === parts.length - 1) {
        node.own = node.own ?? index;
        node.group = node.group ?? group;
      }
      level = node.children;
    });
  });

  const result: T[] = [];
  const visit = (level: Map<string, Node>) => {
    [...level.values()]
      .sort((first, second) => (first.own ?? first.first) - (second.own ?? second.first))
      .forEach((node) => {
        result.push(node.group ?? makeEmpty(node.name));
        visit(node.children);
      });
  };
  visit(top);
  return result;
}

export type BranchSummary = {
  total: number;
  done: number;
  progress: number;
  /** Assignees by number of items, most first. */
  assignees: Array<{ name: string; count: number }>;
  allocated: number;
  required: number;
};

/** Totals for a branch of the list (a group and everything under it). */
export function summarizeBranch<
  T extends { assignee: string; allocatedBudget: number | null; requiredBudget: number | null },
>(items: T[], progressOf: (item: T) => number, isDone: (item: T) => boolean): BranchSummary {
  const counts = new Map<string, number>();
  let allocated = 0;
  let required = 0;
  let progressSum = 0;
  let done = 0;
  for (const item of items) {
    const name = item.assignee.trim() || "미지정";
    counts.set(name, (counts.get(name) ?? 0) + 1);
    allocated += item.allocatedBudget ?? 0;
    required += item.requiredBudget ?? 0;
    progressSum += progressOf(item);
    done += isDone(item) ? 1 : 0;
  }
  return {
    total: items.length,
    done,
    progress: items.length ? Math.round(progressSum / items.length) : 0,
    assignees: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, "ko-KR")),
    allocated,
    required,
  };
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
