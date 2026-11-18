import { describe, expect, it } from "vitest";
import type { WorkLog } from "./team";
import {
  DEFAULT_REPORT_OPTIONS,
  esc,
  monthlyBreakdown,
  monthlyChart,
  renderAnnualReport,
  yearRange,
  renderPersonalReport,
  renderTeamSummary,
  summarizeMember,
} from "./work-log-report";

function log(overrides: Partial<WorkLog>): WorkLog {
  return {
    id: 1,
    memberId: 2,
    memberName: "김민지",
    logDate: "2026-11-16",
    content: "",
    plan: "",
    issues: "",
    itemIds: [],
    status: "submitted",
    reviewerName: "",
    reviewedAt: null,
    reviewComment: "",
    updatedBy: "김민지",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

const minji = { id: 2, name: "김민지", role: "주무관" };
const items = new Map([[7, { title: "습지 조사", category: "복원사업", progress: 40 }]]);
const context = {
  organizationName: "습지복원팀",
  boardTitle: "보드",
  from: "2026-11-16",
  to: "2026-11-22",
  today: "2026-11-19",
  generatedAt: "2026. 11. 19.",
  generatedBy: "최부장",
  approval: true,
};
const logs = [
  log({ id: 1, logDate: "2026-11-16", content: "조사", itemIds: [7], status: "approved", reviewerName: "최부장" }),
  log({ id: 2, logDate: "2026-11-18", content: "정리", itemIds: [7, 99], issues: "드론 고장" }),
  log({ id: 3, logDate: "2026-11-21", content: "주말 근무", status: "rejected", reviewComment: "사유" }),
  log({ id: 4, memberId: 3, memberName: "박서준", logDate: "2026-11-16", content: "다른 사람" }),
];

describe("summarizeMember", () => {
  it("counts weekdays up to today and finds missing days", () => {
    const summary = summarizeMember(minji, logs, context, items);
    expect(summary.logs.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(summary.workdays).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(summary.missing).toEqual(["2026-11-17", "2026-11-19"]);
    expect(summary.writtenWeekdays).toBe(2);
    expect(summary.rate).toBe(50);
    expect(summary.status).toEqual({ submitted: 1, approved: 1, rejected: 1 });
  });

  it("ranks linked items and collects issues", () => {
    const summary = summarizeMember(minji, logs, context, items);
    expect(summary.items.map((item) => [item.title, item.days])).toEqual([
      ["습지 조사", 2],
      ["삭제된 업무 #99", 1],
    ]);
    expect(summary.issues).toEqual([{ date: "2026-11-18", text: "드론 고장" }]);
  });

  it("can restrict to approved logs", () => {
    expect(summarizeMember(minji, logs, context, items, true).logs.map((entry) => entry.id)).toEqual([1]);
  });
});

describe("report html", () => {
  it("escapes user text", () => {
    expect(esc(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    const html = renderPersonalReport(
      context,
      [{ ...minji, name: "<b>민지</b>" }],
      [log({ content: "<script>alert(1)</script>\n둘째 줄" })],
      items
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br>둘째 줄");
    expect(html).toContain("&lt;b&gt;민지&lt;/b&gt;");
  });

  it("renders one printable page per member with the chosen sections", () => {
    const html = renderPersonalReport(context, [minji, { id: 3, name: "박서준", role: "" }], logs, items);
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html).toContain("개인 업무일지 보고서");
    expect(html).toContain("평일 작성률 (2/4일)");
    expect(html).toContain("미작성 평일: 11/17(화), 11/19(목)");
    expect(html).toContain("결재");
    expect(html).toContain("@page { size: A4;");

    const lean = renderPersonalReport(context, [minji], logs, items, {
      ...DEFAULT_REPORT_OPTIONS,
      summary: false,
      items: false,
      issues: false,
      signature: false,
      showMissing: false,
    });
    expect(lean).not.toContain("<h2>요약</h2>");
    expect(lean).not.toContain("<h2>관련 업무</h2>");
    expect(lean).not.toContain('aria-label="결재"');
    expect(lean).not.toContain(">미작성</td>");
  });

  it("drops approval wording when the board has no approval step", () => {
    const html = renderPersonalReport({ ...context, approval: false }, [minji], logs, items);
    expect(html).not.toContain("승인 대기");
    expect(html).toContain(">제출</td>");
  });

  it("summarizes the team with a day matrix", () => {
    const html = renderTeamSummary(context, [minji, { id: 3, name: "박서준", role: "" }], logs, items);
    expect(html).toContain("팀 업무일지 요약");
    expect(html).toContain("일자별 작성 현황");
    expect(html).toContain("드론 고장");
    expect((html.match(/class="dot"/g) ?? []).length).toBe(4);
  });
});

describe("annual report", () => {
  const yearLogs = [
    log({ id: 11, logDate: "2026-01-05", content: "1월", itemIds: [7], status: "approved" }),
    log({ id: 12, logDate: "2026-01-06", content: "1월 둘째", itemIds: [7], issues: "한파" }),
    log({ id: 13, logDate: "2026-03-02", content: "3월", status: "rejected" }),
    log({ id: 14, logDate: "2026-11-18", content: "11월", itemIds: [7] }),
  ];
  const yearContext = { ...context, ...yearRange(2026), today: "2026-11-19" };

  it("breaks a year down by month and leaves future months empty", () => {
    const summary = summarizeMember(minji, yearLogs, yearContext, items);
    const months = monthlyBreakdown(summary, 2026, "2026-11-19");
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ label: "1월", written: 2, workdays: 22, approved: 1, issues: 1, top: ["습지 조사"] });
    expect(months[0].rate).toBe(9);
    expect(months[2]).toMatchObject({ written: 1, rejected: 1 });
    expect(months[10].workdays).toBe(14);
    expect(months[11].rate).toBeNull();
    expect(summary.items[0]).toMatchObject({ title: "습지 조사", days: 3, firstDate: "2026-01-05", lastDate: "2026-11-18" });
  });

  it("draws a bar per month", () => {
    const summary = summarizeMember(minji, yearLogs, yearContext, items);
    const svg = monthlyChart(monthlyBreakdown(summary, 2026, "2026-11-19"));
    expect((svg.match(/<rect /g) ?? []).length).toBe(12);
    expect(svg).toContain(">9%</text>");
    expect(svg).toContain('aria-label="월별 평일 작성률"');
  });

  it("adds a team overview page only for several members", () => {
    const one = renderAnnualReport(context, 2026, [minji], yearLogs, items);
    expect(one).toContain("연간 업무일지 보고서");
    expect(one).not.toContain("팀 업무일지 연간 개요");
    expect(one.match(/<section class="page">/g)).toHaveLength(1);
    expect(one).not.toContain("<h2>일자별 업무 내용</h2>");

    const team = renderAnnualReport(context, 2026, [minji, { id: 3, name: "박서준", role: "" }], yearLogs, items, {
      ...DEFAULT_REPORT_OPTIONS,
      includeDaily: true,
    });
    expect(team).toContain("2026년 팀 업무일지 연간 개요");
    expect(team.match(/<section class="page">/g)).toHaveLength(3);
    expect(team).toContain("<h2>일자별 업무 내용</h2>");
    expect(team).not.toContain(">미작성</td>");
  });
});
