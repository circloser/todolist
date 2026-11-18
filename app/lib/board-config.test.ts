import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_WIDGETS,
  arrangeCategoryGroups,
  categoryAncestors,
  categoryDepth,
  categoryKey,
  categoryLeaf,
  categoryLevelLabel,
  categoryPath,
  categoryTrail,
  defaultWidgetPrefs,
  escapeHtml,
  isoDate,
  periodRange,
  summarizeBranch,
} from "./board-config";

describe("board config helpers", () => {
  it("escapes user text before building popup HTML", () => {
    expect(escapeHtml(`<span data-x="1">Tom & 'Kim'</span>`)).toBe(
      "&lt;span data-x=&quot;1&quot;&gt;Tom &amp; &#39;Kim&#39;&lt;/span&gt;"
    );
  });

  it("enables every dashboard widget by default", () => {
    expect(Object.keys(defaultWidgetPrefs)).toEqual(
      DASHBOARD_WIDGETS.map((widget) => widget.key)
    );
    expect(Object.values(defaultWidgetPrefs).every(Boolean)).toBe(true);
  });

  it("formats local dates as ISO calendar days", () => {
    expect(isoDate(new Date(2026, 6, 28))).toBe("2026-07-28");
  });

  it("normalizes category hierarchy text", () => {
    expect(categoryPath("복원사업 > 현장조사 / 식생")).toEqual([
      "복원사업",
      "현장조사",
      "식생",
    ]);
    expect(categoryKey("복원사업/현장조사/식생")).toBe(
      "복원사업 > 현장조사 > 식생"
    );
    expect(categoryDepth("복원사업 > 현장조사 > 식생")).toBe(2);
    expect(categoryLeaf("복원사업 > 현장조사 > 식생")).toBe("식생");
    expect(categoryTrail("복원사업 > 현장조사 > 식생")).toBe(
      "복원사업 > 현장조사"
    );
    expect(categoryLevelLabel(0)).toBe("대분류");
    expect(categoryLevelLabel(2)).toBe("소분류");
    expect(categoryLevelLabel(4)).toBe("5단계");
  });
});

describe("periodRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T09:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns this week's Monday-Sunday range", () => {
    expect(periodRange("week")).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
    });
  });

  it("returns this month's first-last day range", () => {
    expect(periodRange("month")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });
});

describe("list hierarchy", () => {
  const group = (name: string, items: number[] = [1]) => ({ name, items });
  const arrange = (names: Array<ReturnType<typeof group>>) =>
    arrangeCategoryGroups(names, (name) => group(name, [])).map((entry) => `${entry.name}${entry.items.length ? "" : " (빈 헤더)"}`);

  it("lists ancestors outermost first", () => {
    expect(categoryAncestors("복원사업 > 현장조사 > 식생")).toEqual(["복원사업", "복원사업 > 현장조사"]);
    expect(categoryAncestors("행정")).toEqual([]);
  });

  it("keeps each 대분류 with its branch and adds missing parent headers", () => {
    expect(
      arrange([
        group("행정"),
        group("복원사업 > 현장조사 > 식생"),
        group("기타"),
        group("복원사업 > 설계"),
        group("행정 > 예산"),
      ])
    ).toEqual([
      "행정",
      "행정 > 예산",
      "복원사업 (빈 헤더)",
      "복원사업 > 현장조사 (빈 헤더)",
      "복원사업 > 현장조사 > 식생",
      "복원사업 > 설계",
      "기타",
    ]);
  });

  it("orders a branch by its 대분류's own saved position", () => {
    // 'A > x' was saved first, but A itself sits after B: the whole A branch follows B.
    expect(arrange([group("A > x"), group("B"), group("A")])).toEqual(["B", "A", "A > x"]);
  });

  it("summarizes assignees and budgets for a branch", () => {
    const items = [
      { assignee: "김민지", allocatedBudget: 1_000_000, requiredBudget: 800_000, progress: 100 },
      { assignee: "박서준", allocatedBudget: null, requiredBudget: 200_000, progress: 50 },
      { assignee: "김민지", allocatedBudget: 500_000, requiredBudget: null, progress: 0 },
      { assignee: " ", allocatedBudget: null, requiredBudget: null, progress: 0 },
    ];
    const summary = summarizeBranch(items, (item) => item.progress, (item) => item.progress === 100);
    expect(summary).toEqual({
      total: 4,
      done: 1,
      progress: 38,
      assignees: [
        { name: "김민지", count: 2 },
        { name: "미지정", count: 1 },
        { name: "박서준", count: 1 },
      ],
      allocated: 1_500_000,
      required: 1_000_000,
    });
    expect(summarizeBranch([], () => 0, () => false)).toMatchObject({ total: 0, progress: 0, assignees: [] });
  });
});
