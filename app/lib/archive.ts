// 연도별 보관함: the board carries on across years; work finished in an
// earlier year moves to that year's folder and leaves the everyday screens.

import { isItemDone, type WorkflowItem } from "./workflow";

const KST_MS = 9 * 3600_000;

/** The current year in Korea. */
export function kstYear(now = Date.now()) {
  return new Date(now + KST_MS).getUTCFullYear();
}

function kstYearOf(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  // Plain dates ("2025-12-30") are already Korean calendar days.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number(value.slice(0, 4));
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms + KST_MS).getUTCFullYear();
}

/** When the item was finished: its last step's completion (else its last change). */
export function completionYear(item: Pick<WorkflowItem, "steps" | "updatedAt">) {
  const years = item.steps.map((step) => kstYearOf(step.completedAt)).filter((year): year is number => year !== null);
  return years.length ? Math.max(...years) : kstYearOf(item.updatedAt);
}

export function isArchived(item: Pick<WorkflowItem, "archivedYear">) {
  return item.archivedYear !== null && item.archivedYear !== undefined;
}

/**
 * The folder year a finished item should move to now, or null to keep it on
 * the board (not done, finished this year, already archived, or restored).
 */
export function dueArchiveYear(item: WorkflowItem, currentYear = kstYear()) {
  if (isArchived(item) || item.archiveHold || !isItemDone(item)) {
    return null;
  }
  const year = completionYear(item);
  return year !== null && year < currentYear ? year : null;
}

/** Folder for archiving by hand: the year it was finished, else this year. */
export function manualArchiveYear(item: WorkflowItem, currentYear = kstYear()) {
  return isItemDone(item) ? (completionYear(item) ?? currentYear) : currentYear;
}

/** Year folders, newest first, with their items. */
export function archiveFolders(items: WorkflowItem[]) {
  const byYear = new Map<number, WorkflowItem[]>();
  for (const item of items) {
    if (isArchived(item)) {
      const year = item.archivedYear as number;
      byYear.set(year, [...(byYear.get(year) ?? []), item]);
    }
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => ({ year, items: list }));
}
