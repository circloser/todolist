import { describe, expect, it } from "vitest";
import {
  dailyActivityLines,
  dailyStatus,
  formatLogDate,
  hasLogContent,
  isWeekend,
  kstDate,
  monthRange,
  normalizeColor,
  normalizeItemIds,
  normalizeLogDate,
  normalizeLogRange,
  normalizeMemberName,
  parseItemIds,
  shiftDate,
  unregisteredAssignees,
  workLogsToCsv,
  WORK_LOG_ITEM_MAX,
  type TeamMember,
  type WorkLog,
} from "./team";
import type { WorkflowItem } from "./workflow";

function member(id: number, name: string, active = true): TeamMember {
  return {
    id,
    name,
    role: "",
    color: "#e6f4ef",
    active,
    position: id,
    createdAt: "",
    updatedAt: "",
  };
}

function log(overrides: Partial<WorkLog>): WorkLog {
  return {
    id: 1,
    memberId: 1,
    memberName: "김철수",
    logDate: "2026-11-18",
    content: "",
    plan: "",
    issues: "",
    itemIds: [],
    updatedBy: "김철수",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("member input", () => {
  it("collapses whitespace and caps names", () => {
    expect(normalizeMemberName("  김   철수 ")).toBe("김 철수");
    expect(normalizeMemberName(42)).toBe("");
    expect(normalizeMemberName("가".repeat(60))).toHaveLength(40);
  });

  it("accepts only #rrggbb colors", () => {
    expect(normalizeColor("#ABCDEF")).toBe("#abcdef");
    expect(normalizeColor("red")).toBeNull();
    expect(normalizeColor("#abc")).toBeNull();
  });

  it("lists board assignees that are not members yet", () => {
    expect(
      unregisteredAssignees([member(1, "김철수")], [
        "김철수",
        " 이영희 ",
        "미지정",
        "",
        "이영희",
        "박민수",
      ])
    ).toEqual(["이영희", "박민수"]);
  });
});

describe("log dates", () => {
  it("rejects impossible calendar days", () => {
    expect(normalizeLogDate("2026-02-28")).toBe("2026-02-28");
    expect(normalizeLogDate("2026-02-30")).toBeNull();
    expect(normalizeLogDate("2026-2-3")).toBeNull();
    expect(normalizeLogDate(null)).toBeNull();
  });

  it("converts instants to the Korean calendar day", () => {
    expect(kstDate("2026-11-18T14:59:59Z")).toBe("2026-11-18");
    expect(kstDate("2026-11-18T15:00:00Z")).toBe("2026-11-19");
    expect(kstDate("not a date")).toBeNull();
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("builds month ranges with the right last day", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-13")).toBeNull();
  });

  it("validates query ranges", () => {
    expect(normalizeLogRange("2026-11-18", null)).toEqual({
      from: "2026-11-18",
      to: "2026-11-18",
    });
    expect(normalizeLogRange("2026-11-18", "2026-11-01")).toHaveProperty("error");
    expect(normalizeLogRange("2026-01-01", "2026-12-31")).toHaveProperty("error");
    expect(normalizeLogRange("2026-10-01", "2026-12-31")).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });

  it("labels weekdays in Korean", () => {
    expect(formatLogDate("2026-11-18")).toBe("11월 18일 (수)");
    expect(isWeekend("2026-11-21")).toBe(true);
    expect(isWeekend("2026-11-20")).toBe(false);
  });
});

describe("log content", () => {
  it("dedupes and caps linked item ids", () => {
    expect(normalizeItemIds([3, "3", 4, -1, 1.5, "x", 5])).toEqual([3, 4, 5]);
    expect(
      normalizeItemIds(Array.from({ length: 50 }, (_, index) => index + 1))
    ).toHaveLength(WORK_LOG_ITEM_MAX);
    expect(normalizeItemIds("1,2")).toEqual([]);
    expect(parseItemIds("[1,2]")).toEqual([1, 2]);
    expect(parseItemIds("{broken")).toEqual([]);
  });

  it("treats whitespace-only logs as empty", () => {
    expect(hasLogContent({ content: "  ", plan: "", issues: "\n", itemIds: [] })).toBe(false);
    expect(hasLogContent({ content: "", plan: "", issues: "", itemIds: [1] })).toBe(true);
  });
});

describe("daily status", () => {
  it("counts active members and keeps inactive authors visible", () => {
    const members = [member(1, "김철수"), member(2, "이영희"), member(3, "퇴사자", false)];
    const status = dailyStatus(
      members,
      [
        log({ id: 1, memberId: 1 }),
        log({ id: 2, memberId: 3, memberName: "퇴사자" }),
        log({ id: 3, memberId: 2, logDate: "2026-11-17" }),
      ],
      "2026-11-18"
    );

    expect(status.rows.map((row) => row.member.name)).toEqual(["김철수", "이영희", "퇴사자"]);
    expect(status.written).toBe(2);
    expect(status.missing.map((entry) => entry.name)).toEqual(["이영희"]);
  });
});

describe("board activity", () => {
  it("collects steps and checklist items the member finished that KST day", () => {
    const items = [
      {
        id: 1,
        title: "습지 조사",
        steps: [
          {
            title: "견적",
            status: "done",
            completedAt: "2026-11-18T01:00:00Z",
            updatedBy: "김철수",
          },
          {
            title: "착수",
            status: "done",
            completedAt: "2026-11-18T16:00:00Z", // 11-19 in KST
            updatedBy: "김철수",
          },
          {
            title: "검수",
            status: "done",
            completedAt: "2026-11-18T02:00:00Z",
            updatedBy: "이영희",
          },
        ],
        subtasks: [
          { title: "사진 정리", status: "done", updatedAt: "2026-11-18T03:00:00Z", updatedBy: "김철수" },
          { title: "도면", status: "todo", updatedAt: "2026-11-18T03:00:00Z", updatedBy: "김철수" },
        ],
      },
    ] as unknown as WorkflowItem[];

    expect(dailyActivityLines(items, "김철수", "2026-11-18")).toEqual([
      "[습지 조사] 견적 단계 완료",
      "[습지 조사] 사진 정리 완료",
    ]);
    expect(dailyActivityLines(items, "", "2026-11-18")).toEqual([]);
  });
});

describe("csv export", () => {
  it("quotes multi-line cells and resolves item titles", () => {
    const csv = workLogsToCsv(
      [
        log({ id: 2, logDate: "2026-11-19", content: "b" }),
        log({ id: 1, content: '조사 "1차"\n정리', itemIds: [7, 9] }),
      ],
      new Map([[7, "습지 조사"]])
    );
    const lines = csv.replace(/^﻿/, "").split("\n");

    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe(
      "날짜,요일,구성원,업무 내용,관련 업무,다음 계획,특이사항,작성자,수정 시각"
    );
    expect(lines[1]).toBe('2026-11-18,수,김철수,"조사 ""1차""');
    expect(lines[2]).toBe('정리","습지 조사, #9",,,김철수,');
    expect(lines[3]).toBe("2026-11-19,목,김철수,b,,,,김철수,");
  });
});
