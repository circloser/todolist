import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyManualPositions,
  assigneeName,
  canToggleStep,
  categoryName,
  completionCount,
  daysUntil,
  formatBudget,
  isItemDone,
  itemHasDueInRange,
  itemHasOverdueDate,
  itemHasUrgentDate,
  itemProgress,
  moveItem,
  nextStep,
  nextStepTitle,
  rowAccentColor,
  shortDueLabel,
  subtaskProgress,
  urgency,
  urgencyLabel,
  type StepStatus,
  type WorkflowItem,
  type WorkflowStep,
  type WorkflowSubtask,
} from "./workflow";

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 1,
    itemId: 1,
    stageKey: "stage",
    title: "단계",
    description: "",
    phaseGroup: "",
    position: 1,
    progressValue: null,
    status: "todo",
    dueDate: null,
    completedAt: null,
    updatedBy: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSubtask(overrides: Partial<WorkflowSubtask> = {}): WorkflowSubtask {
  return {
    id: 1,
    itemId: 1,
    title: "세부",
    status: "todo",
    dueDate: null,
    blockers: "",
    position: 1,
    updatedBy: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeItem(overrides: Partial<WorkflowItem> = {}): WorkflowItem {
  return {
    id: 1,
    title: "업무",
    assignee: "",
    category: "",
    memo: "",
    allocatedBudget: null,
    requiredBudget: null,
    dueDate: null,
    location: "",
    lat: null,
    lng: null,
    links: [],
    templateKey: "external-research-outsourcing",
    position: 1,
    updatedBy: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    steps: [],
    subtasks: [],
    ...overrides,
  };
}

function steps(...statuses: StepStatus[]): WorkflowStep[] {
  return statuses.map((status, index) =>
    makeStep({ id: index + 1, position: index + 1, status })
  );
}

describe("assigneeName / categoryName", () => {
  it("falls back to defaults for blank values", () => {
    expect(assigneeName("")).toBe("미지정");
    expect(assigneeName("   ")).toBe("미지정");
    expect(assigneeName("홍길동")).toBe("홍길동");
    expect(categoryName("")).toBe("일반 업무");
    expect(categoryName("  연구  ")).toBe("연구");
  });
});

describe("formatBudget", () => {
  it("formats numbers with locale separators and blanks falsy values", () => {
    expect(formatBudget(1234567)).toBe("1,234,567");
    expect(formatBudget(0)).toBe("");
    expect(formatBudget(null)).toBe("");
    expect(formatBudget(undefined)).toBe("");
  });
});

describe("rowAccentColor", () => {
  it("accepts valid 6-digit hex and rejects everything else", () => {
    expect(rowAccentColor("#a1b2c3")).toBe("#a1b2c3");
    expect(rowAccentColor("#FFF")).toBe("#ffffff");
    expect(rowAccentColor("red")).toBe("#ffffff");
    expect(rowAccentColor(undefined)).toBe("#ffffff");
  });
});

describe("progress helpers", () => {
  it("counts completed steps and computes percentage", () => {
    const item = makeItem({ steps: steps("done", "done", "todo", "todo") });
    expect(completionCount(item)).toBe(2);
    expect(itemProgress(item)).toBe(50);
  });

  it("returns 0 progress when there are no steps", () => {
    expect(itemProgress(makeItem())).toBe(0);
  });

  it("treats an item as done only when every step is done", () => {
    expect(isItemDone(makeItem({ steps: steps("done", "done") }))).toBe(true);
    expect(isItemDone(makeItem({ steps: steps("done", "todo") }))).toBe(false);
    expect(isItemDone(makeItem())).toBe(false);
  });

  it("computes subtask progress or null", () => {
    expect(subtaskProgress(makeItem())).toBeNull();
    const item = makeItem({
      subtasks: [
        makeSubtask({ id: 1, status: "done" }),
        makeSubtask({ id: 2, status: "todo" }),
      ],
    });
    expect(subtaskProgress(item)).toBe(50);
  });
});

describe("nextStep / nextStepTitle", () => {
  it("returns the first non-done step", () => {
    const item = makeItem({ steps: steps("done", "todo", "todo") });
    expect(nextStep(item)?.position).toBe(2);
    expect(nextStepTitle(item)).toBe("단계");
  });

  it("reports 완료 when all steps are done", () => {
    expect(nextStepTitle(makeItem({ steps: steps("done") }))).toBe("완료");
  });
});

describe("canToggleStep", () => {
  it("allows the first step and steps following a completed one", () => {
    const item = makeItem({ steps: steps("todo", "todo") });
    expect(canToggleStep(item, 0)).toBe(true);
    expect(canToggleStep(item, 1)).toBe(false);
  });

  it("allows a step once the previous one is done", () => {
    const item = makeItem({ steps: steps("done", "todo") });
    expect(canToggleStep(item, 1)).toBe(true);
  });

  it("always allows un-checking an already-done step", () => {
    const item = makeItem({ steps: steps("done", "done") });
    expect(canToggleStep(item, 1)).toBe(true);
  });

  it("returns false for out-of-range indices", () => {
    expect(canToggleStep(makeItem({ steps: steps("todo") }), 5)).toBe(false);
  });
});

describe("applyManualPositions", () => {
  it("reassigns positions by order, keeping unknown ids untouched", () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 })];
    const result = applyManualPositions(items, [3, 1, 2]);
    expect(result.find((i) => i.id === 3)?.position).toBe(1);
    expect(result.find((i) => i.id === 1)?.position).toBe(2);
    expect(result.find((i) => i.id === 2)?.position).toBe(3);
  });
});

describe("moveItem", () => {
  it("moves an element without mutating the source", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});

describe("date-based helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T09:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("daysUntil counts whole days from today", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("2026-06-29")).toBe(0);
    expect(daysUntil("2026-07-02")).toBe(3);
    expect(daysUntil("2026-06-26")).toBe(-3);
  });

  it("urgency buckets dates into states", () => {
    expect(urgency(null)).toBe("none");
    expect(urgency("2026-06-26")).toBe("overdue");
    expect(urgency("2026-06-29")).toBe("danger");
    expect(urgency("2026-06-30")).toBe("danger");
    expect(urgency("2026-07-01")).toBe("warning");
    expect(urgency("2026-07-10")).toBe("normal");
  });

  it("urgencyLabel renders D- and D+ markers", () => {
    expect(urgencyLabel(null)).toBe("");
    expect(urgencyLabel("2026-07-02")).toBe("D-3");
    expect(urgencyLabel("2026-06-26")).toBe("D+3");
  });

  it("shortDueLabel falls back to 일정 without a date", () => {
    expect(shortDueLabel(null)).toBe("일정");
    expect(shortDueLabel("2026-07-02")).toBe("D-3");
  });

  it("itemHasDueInRange matches item or open-step dates inside the range", () => {
    const item = makeItem({
      dueDate: "2026-07-05",
      steps: [makeStep({ status: "todo", dueDate: "2026-07-15" })],
    });
    expect(itemHasDueInRange(item, "2026-07-01", "2026-07-07")).toBe(true);
    expect(itemHasDueInRange(item, "2026-07-10", "2026-07-20")).toBe(true);
    expect(itemHasDueInRange(item, "2026-08-01", "2026-08-31")).toBe(false);

    // A done step's date must be ignored.
    const doneOnly = makeItem({
      steps: [makeStep({ status: "done", dueDate: "2026-07-05" })],
    });
    expect(itemHasDueInRange(doneOnly, "2026-07-01", "2026-07-31")).toBe(false);
  });

  it("itemHasUrgentDate / itemHasOverdueDate consider item and open steps", () => {
    const overdue = makeItem({
      steps: [makeStep({ status: "todo", dueDate: "2026-06-20" })],
    });
    expect(itemHasOverdueDate(overdue)).toBe(true);
    expect(itemHasUrgentDate(overdue)).toBe(false);

    const urgent = makeItem({ dueDate: "2026-07-01" });
    expect(itemHasUrgentDate(urgent)).toBe(true);

    // A done step's date must be ignored.
    const doneOnly = makeItem({
      steps: [makeStep({ status: "done", dueDate: "2026-06-20" })],
    });
    expect(itemHasOverdueDate(doneOnly)).toBe(false);
  });
});
