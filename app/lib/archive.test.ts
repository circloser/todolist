import { describe, expect, it } from "vitest";

import { archiveFolders, completionYear, dueArchiveYear, kstYear } from "./archive";
import type { WorkflowItem, WorkflowStep } from "./workflow";

const step = (status: "done" | "todo", completedAt: string | null): WorkflowStep => ({
  id: 1,
  itemId: 1,
  stageKey: "s",
  title: "단계",
  description: "",
  phaseGroup: "",
  position: 0,
  progressValue: null,
  status: status as WorkflowStep["status"],
  dueDate: null,
  completedAt,
  updatedBy: "",
  updatedAt: "",
  createdAt: "",
});

const item = (steps: WorkflowStep[], extra: Partial<WorkflowItem> = {}): WorkflowItem =>
  ({
    id: 1,
    title: "업무",
    assignee: "",
    category: "",
    memo: "",
    allocatedBudget: null,
    requiredBudget: null,
    contractVendor: "",
    contractManager: "",
    contractPhone: "",
    contractAmount: null,
    dueDate: null,
    location: "",
    lat: null,
    lng: null,
    links: [],
    templateKey: "",
    position: 0,
    updatedBy: "",
    updatedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "",
    steps,
    subtasks: [],
    archivedYear: null,
    ...extra,
  }) as WorkflowItem;

describe("연도별 보관함", () => {
  it("uses Korean time for the year", () => {
    // 2025-12-31 16:00 UTC is already 2026-01-01 in Korea.
    expect(kstYear(Date.parse("2025-12-31T16:00:00Z"))).toBe(2026);
    expect(completionYear(item([step("done", "2025-12-31T16:30:00Z")]))).toBe(2026);
    expect(completionYear(item([step("done", "2025-12-31T14:00:00Z")]))).toBe(2025);
  });

  it("archives work finished in an earlier year into that year's folder", () => {
    const finished = item([step("done", "2024-05-01T01:00:00Z"), step("done", "2025-03-02T01:00:00Z")]);
    expect(dueArchiveYear(finished, 2026)).toBe(2025);
  });

  it("keeps unfinished, this year's, archived and restored items on the board", () => {
    expect(dueArchiveYear(item([step("done", "2025-01-01T01:00:00Z"), step("todo", null)]), 2026)).toBeNull();
    expect(dueArchiveYear(item([step("done", "2026-01-05T01:00:00Z")]), 2026)).toBeNull();
    expect(dueArchiveYear(item([step("done", "2025-01-05T01:00:00Z")], { archivedYear: 2025 }), 2026)).toBeNull();
    expect(dueArchiveYear(item([step("done", "2025-01-05T01:00:00Z")], { archiveHold: true }), 2026)).toBeNull();
    expect(dueArchiveYear(item([]), 2026)).toBeNull();
  });

  it("lists folders newest first", () => {
    const folders = archiveFolders([
      item([], { id: 1, archivedYear: 2024 }),
      item([], { id: 2, archivedYear: 2025 }),
      item([], { id: 3, archivedYear: null }),
      item([], { id: 4, archivedYear: 2025 }),
    ]);
    expect(folders.map((folder) => [folder.year, folder.items.length])).toEqual([
      [2025, 2],
      [2024, 1],
    ]);
  });
});
