// 업무일지 보고서: pure builders that turn logs into a printable A4 HTML
// document. The in-app preview renders exactly this document, so what you
// see is what prints.

import {
  daysBetween,
  isWeekend,
  shiftDate,
  weekdayLabel,
  weekdaysBetween,
  type WorkLog,
} from "./team";

export type ReportFormat = "personal" | "team" | "annual";

export type ReportOptions = {
  /** 작성률·상태 요약 */
  summary: boolean;
  /** 관련 업무별 언급 일수·진행률 */
  items: boolean;
  /** 특이사항 모음 */
  issues: boolean;
  /** 결재란 (작성자 / 부서장) */
  signature: boolean;
  /** 승인된 일지만 포함 */
  approvedOnly: boolean;
  /** 상세표에 미작성 평일도 표시 */
  showMissing: boolean;
  /** 연간: 일자별 상세표 포함 */
  includeDaily: boolean;
  /** 연간: 여러 명이면 팀 개요 페이지를 앞에 */
  teamOverview: boolean;
};

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  summary: true,
  items: true,
  issues: true,
  signature: true,
  approvedOnly: false,
  showMissing: true,
  includeDaily: false,
  teamOverview: true,
};

export type ReportItemInfo = { title: string; category: string; progress: number };
export type ReportMember = { id: number; name: string; role: string };

export type ReportContext = {
  organizationName: string;
  boardTitle: string;
  from: string;
  to: string;
  today: string;
  generatedAt: string;
  generatedBy: string;
  approval: boolean;
};

export type MemberSummary = {
  member: ReportMember;
  logs: WorkLog[];
  workdays: string[];
  missing: string[];
  writtenWeekdays: number;
  rate: number;
  /** recorded = 부서장 본인 일지 (no approval). */
  status: { submitted: number; approved: number; rejected: number; recorded: number };
  items: Array<ReportItemInfo & { id: number; days: number; firstDate: string; lastDate: string }>;
  issues: Array<{ date: string; text: string }>;
};

export function summarizeMember(
  member: ReportMember,
  allLogs: WorkLog[],
  context: Pick<ReportContext, "from" | "to" | "today">,
  items: Map<number, ReportItemInfo>,
  approvedOnly = false
): MemberSummary {
  const logs = allLogs
    .filter(
      (log) =>
        log.memberId === member.id &&
        log.logDate >= context.from &&
        log.logDate <= context.to &&
        // 부서장 본인 일지 needs no approval, so it counts as final.
        (!approvedOnly || log.status === "approved" || log.status === "recorded")
    )
    .sort((first, second) => first.logDate.localeCompare(second.logDate));
  const lastCounted = context.to < context.today ? context.to : context.today;
  const workdays = lastCounted >= context.from ? weekdaysBetween(context.from, lastCounted) : [];
  const written = new Set(logs.map((log) => log.logDate));
  const writtenWeekdays = workdays.filter((day) => written.has(day)).length;
  const mentions = new Map<number, { days: number; firstDate: string; lastDate: string }>();

  for (const log of logs) {
    for (const id of log.itemIds) {
      const current = mentions.get(id);
      mentions.set(id, {
        days: (current?.days ?? 0) + 1,
        firstDate: current?.firstDate ?? log.logDate,
        lastDate: log.logDate,
      });
    }
  }

  return {
    member,
    logs,
    workdays,
    missing: workdays.filter((day) => !written.has(day)),
    writtenWeekdays,
    rate: workdays.length ? Math.round((writtenWeekdays / workdays.length) * 100) : 0,
    status: {
      submitted: logs.filter((log) => log.status === "submitted").length,
      approved: logs.filter((log) => log.status === "approved").length,
      rejected: logs.filter((log) => log.status === "rejected").length,
      recorded: logs.filter((log) => log.status === "recorded").length,
    },
    items: [...mentions.entries()]
      .map(([id, mention]) => ({
        id,
        ...(items.get(id) ?? { title: `삭제된 업무 #${id}`, category: "", progress: 0 }),
        ...mention,
      }))
      .sort((first, second) => second.days - first.days || first.title.localeCompare(second.title, "ko-KR")),
    issues: logs
      .filter((log) => log.issues.trim())
      .map((log) => ({ date: log.logDate, text: log.issues.trim() })),
  };
}

// ------------------------------------------------------------------- html

export function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function multiline(value: string) {
  return esc(value.trim()).replace(/\n/g, "<br>");
}

export function longDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export function shortDay(iso: string) {
  const [, month, day] = iso.split("-").map(Number);
  return `${month}/${day}(${weekdayLabel(iso)})`;
}

function periodText(context: ReportContext) {
  return `${longDate(context.from)} ~ ${longDate(context.to)} (${daysBetween(context.from, context.to) + 1}일)`;
}

function statusText(log: WorkLog, approval: boolean) {
  if (!approval || log.status === "recorded") {
    return "제출";
  }
  if (log.status === "approved") {
    return `승인${log.reviewerName ? `<br><small>${esc(log.reviewerName)}</small>` : ""}`;
  }
  if (log.status === "rejected") {
    return `반려${log.reviewComment ? `<br><small>${esc(log.reviewComment)}</small>` : ""}`;
  }
  return "승인 대기";
}

const STYLES = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #17231f; font: 10pt/1.5 "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { background: #fff; }
  h1 { margin: 0; font-size: 17pt; letter-spacing: -0.02em; }
  h2 { margin: 16px 0 6px; font-size: 11pt; border-left: 3px solid #18786f; padding-left: 6px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #17231f; padding-bottom: 8px; }
  .sub { color: #5d6b65; font-size: 9pt; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #b9c8bd; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #eef3ef; font-weight: 600; white-space: nowrap; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .meta { margin-top: 10px; }
  .meta th { width: 72px; }
  .sign { border-collapse: collapse; width: auto; }
  .sign th { text-align: center; font-size: 8.5pt; padding: 2px 10px; }
  .sign td { width: 74px; height: 50px; text-align: center; vertical-align: bottom; font-size: 8pt; color: #5d6b65; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .stat { border: 1px solid #b9c8bd; padding: 6px 8px; }
  .stat b { display: block; font-size: 14pt; }
  .stat span { color: #5d6b65; font-size: 8.5pt; }
  .muted { color: #8b9790; }
  .missing td { color: #8b9790; background: #fafbf9; }
  .num { text-align: right; white-space: nowrap; }
  .center { text-align: center; }
  .bar { height: 6px; background: #e3e9e0; position: relative; min-width: 60px; }
  .bar i { position: absolute; inset: 0 auto 0 0; background: #18786f; }
  small { color: #5d6b65; }
  .foot { margin-top: 14px; color: #8b9790; font-size: 8pt; text-align: right; }
  .chart { width: 100%; height: auto; display: block; margin-top: 4px; }
  .heat td { text-align: center; font-variant-numeric: tabular-nums; }
  .stats.five { grid-template-columns: repeat(5, 1fr); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
  @media screen {
    body { background: #dfe5df; padding: 18px 0; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 18px; padding: 14mm 12mm; box-shadow: 0 6px 24px rgba(0,0,0,.12); }
    body.landscape .page { width: 297mm; min-height: 210mm; }
  }
  @media print {
    .page { break-after: page; }
    .page:last-child { break-after: auto; }
  }
`;

/** "조직 · 보드" without repeating a name when both are the same. */
export function orgLine(context: Pick<ReportContext, "organizationName" | "boardTitle">) {
  return [...new Set([context.organizationName.trim(), context.boardTitle.trim()].filter(Boolean))].join(" · ");
}

function documentShell(title: string, body: string, landscape = false) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLES}${
    landscape ? "@page { size: A4 landscape; }" : ""
  }</style></head><body${landscape ? ' class="landscape"' : ""}>${body}</body></html>`;
}

function signatureBox(summary: MemberSummary, context: ReportContext) {
  return `<table class="sign" aria-label="결재"><tr><th>작성자</th><th>부서장</th></tr><tr><td>${esc(
    summary.member.name
  )}</td><td>${context.approval && summary.logs.length && summary.status.approved === summary.logs.length ? "전체 승인" : ""}</td></tr></table>`;
}

/** Only 부서장 본인 일지 (nothing to approve). */
function approvalFree(summary: MemberSummary) {
  return summary.logs.length > 0 && summary.status.recorded === summary.logs.length;
}

function approvalStat(summary: MemberSummary) {
  return approvalFree(summary)
    ? `<div class="stat"><b>승인 불필요</b><span>부서장 본인 일지</span></div>`
    : `<div class="stat"><b>${summary.status.approved}</b><span>승인 · 대기 ${summary.status.submitted} · 반려 ${summary.status.rejected}${
        summary.status.recorded ? ` · 승인 불필요 ${summary.status.recorded}` : ""
      }</span></div>`;
}

function headerBlock(title: string, summary: MemberSummary, context: ReportContext, options: ReportOptions) {
  return `<div class="head"><div><h1>${esc(title)}</h1><div class="sub">${esc(orgLine(context))}</div></div>${options.signature ? signatureBox(summary, context) : ""}</div>`;
}

function metaBlock(member: ReportMember, periodLabel: string, period: string) {
  return `<table class="meta"><tr><th>성명</th><td>${esc(member.name)}</td><th>직급·역할</th><td>${
    esc(member.role) || '<span class="muted">-</span>'
  }</td></tr><tr><th>${esc(periodLabel)}</th><td colspan="3">${esc(period)}</td></tr></table>`;
}

function itemsSection(summary: MemberSummary, withFirst = false) {
  if (!summary.items.length) {
    return "";
  }
  return `<h2>관련 업무</h2><table><thead><tr><th>업무</th><th>분류</th><th class="num">언급</th>${
    withFirst ? "<th>첫 언급</th>" : ""
  }<th>최근</th><th>현재 진행률</th></tr></thead><tbody>${summary.items
    .map(
      (item) =>
        `<tr><td>${esc(item.title)}</td><td>${esc(item.category)}</td><td class="num">${item.days}일</td>${
          withFirst ? `<td>${shortDay(item.firstDate)}</td>` : ""
        }<td>${shortDay(item.lastDate)}</td><td><div class="bar"><i style="width:${Math.max(
          0,
          Math.min(100, item.progress)
        )}%"></i></div><small>${item.progress}%</small></td></tr>`
    )
    .join("")}</tbody></table>`;
}

function issuesSection(summary: MemberSummary) {
  if (!summary.issues.length) {
    return "";
  }
  return `<h2>특이사항·이슈</h2><table><thead><tr><th style="width:80px">날짜</th><th>내용</th></tr></thead><tbody>${summary.issues
    .map((issue) => `<tr><td>${shortDay(issue.date)}</td><td>${multiline(issue.text)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function dailySection(summary: MemberSummary, context: ReportContext, showMissing: boolean) {
  const byDate = new Map(summary.logs.map((log) => [log.logDate, log] as const));
  const days: string[] = [];
  for (let day = context.from; day <= context.to; day = shiftDate(day, 1)) {
    if (byDate.has(day) || (showMissing && !isWeekend(day) && day <= context.today)) {
      days.push(day);
    }
  }

  return `<h2>일자별 업무 내용</h2>${
    days.length
      ? `<table><thead><tr><th style="width:62px">날짜</th><th>한 일</th><th style="width:20%">관련 업무</th><th style="width:18%">다음 계획</th><th style="width:16%">특이사항</th><th style="width:58px">상태</th></tr></thead><tbody>${days
          .map((day) => {
            const log = byDate.get(day);
            if (!log) {
              return `<tr class="missing"><td>${shortDay(day)}</td><td colspan="5">미작성</td></tr>`;
            }
            return `<tr><td>${shortDay(day)}</td><td>${multiline(log.content)}</td><td>${log.itemIds
              .map((id) => esc(summary.items.find((item) => item.id === id)?.title ?? `#${id}`))
              .join("<br>")}</td><td>${multiline(log.plan)}</td><td>${multiline(log.issues)}</td><td class="center">${statusText(
              log,
              context.approval
            )}</td></tr>`;
          })
          .join("")}</tbody></table>`
      : '<p class="muted">이 기간에 작성한 일지가 없습니다.</p>'
  }`;
}

function footer(context: ReportContext) {
  return `<div class="foot">출력 ${esc(context.generatedAt)} · ${esc(context.generatedBy)}</div>`;
}

function personalSection(summary: MemberSummary, context: ReportContext, options: ReportOptions) {
  const parts: string[] = [
    headerBlock("개인 업무일지 보고서", summary, context, options),
    metaBlock(summary.member, "기간", periodText(context)),
  ];

  if (options.summary) {
    const approvalStats = context.approval ? approvalStat(summary) : "";
    parts.push(`<h2>요약</h2><div class="stats">
      <div class="stat"><b>${summary.logs.length}건</b><span>작성한 일지</span></div>
      <div class="stat"><b>${summary.rate}%</b><span>평일 작성률 (${summary.writtenWeekdays}/${summary.workdays.length}일)</span></div>
      ${approvalStats}
      <div class="stat"><b>${summary.items.length}건</b><span>관련 업무</span></div>
    </div>${
      summary.missing.length
        ? `<p class="sub">미작성 평일: ${summary.missing.map(shortDay).join(", ")}</p>`
        : ""
    }`);
  }

  if (options.items) {
    parts.push(itemsSection(summary));
  }
  if (options.issues) {
    parts.push(issuesSection(summary));
  }
  parts.push(dailySection(summary, context, options.showMissing), footer(context));
  return `<section class="page">${parts.join("")}</section>`;
}

export function renderPersonalReport(
  context: ReportContext,
  members: ReportMember[],
  logs: WorkLog[],
  items: Map<number, ReportItemInfo>,
  options: ReportOptions = DEFAULT_REPORT_OPTIONS
) {
  const sections = members.map((member) =>
    personalSection(summarizeMember(member, logs, context, items, options.approvedOnly), context, options)
  );
  const title =
    members.length === 1
      ? `${members[0].name} 업무일지 ${context.from}~${context.to}`
      : `업무일지 ${context.from}~${context.to}`;
  return documentShell(title, sections.join("") || '<section class="page"><p>선택한 구성원이 없습니다.</p></section>');
}

export function renderTeamSummary(
  context: ReportContext,
  members: ReportMember[],
  logs: WorkLog[],
  items: Map<number, ReportItemInfo>,
  options: ReportOptions = DEFAULT_REPORT_OPTIONS
) {
  const summaries = members.map((member) =>
    summarizeMember(member, logs, context, items, options.approvedOnly)
  );
  const days: string[] = [];
  for (let day = context.from; day <= context.to; day = shiftDate(day, 1)) {
    days.push(day);
  }
  const matrix = days.length <= 31;
  const parts: string[] = [];

  parts.push(`<div class="head"><div><h1>팀 업무일지 요약</h1><div class="sub">${esc(orgLine(context))} · ${esc(periodText(context))}</div></div></div>`);

  parts.push(`<h2>구성원별 현황</h2><table><thead><tr><th>구성원</th><th class="num">일지</th><th class="num">평일 작성률</th>${
    context.approval ? '<th class="num">승인</th><th class="num">대기</th><th class="num">반려</th>' : ""
  }<th>미작성 평일</th><th>주요 관련 업무</th></tr></thead><tbody>${summaries
    .map(
      (summary) =>
        `<tr><td>${esc(summary.member.name)}${summary.member.role ? `<br><small>${esc(summary.member.role)}</small>` : ""}</td><td class="num">${
          summary.logs.length
        }</td><td class="num">${summary.rate}% <small>(${summary.writtenWeekdays}/${summary.workdays.length})</small></td>${
          context.approval
            ? approvalFree(summary)
              ? '<td class="num" colspan="3"><small>승인 불필요</small></td>'
              : `<td class="num">${summary.status.approved}</td><td class="num">${summary.status.submitted}</td><td class="num">${summary.status.rejected}</td>`
            : ""
        }<td>${summary.missing.length ? summary.missing.map(shortDay).join(", ") : '<span class="muted">없음</span>'}</td><td>${summary.items
          .slice(0, 3)
          .map((item) => `${esc(item.title)} <small>${item.days}일</small>`)
          .join("<br>")}</td></tr>`
    )
    .join("")}</tbody></table>`);

  if (matrix) {
    parts.push(`<h2>일자별 작성 현황</h2><table style="font-size:8pt"><thead><tr><th>구성원</th>${days
      .map((day) => `<th class="center" style="${isWeekend(day) ? "color:#8b9790" : ""}">${Number(day.slice(8))}<br>${weekdayLabel(day)}</th>`)
      .join("")}</tr></thead><tbody>${summaries
      .map((summary) => {
        const byDate = new Map(summary.logs.map((log) => [log.logDate, log] as const));
        return `<tr><td>${esc(summary.member.name)}</td>${days
          .map((day) => {
            const log = byDate.get(day);
            const color = !log
              ? ""
              : log.status === "recorded" && context.approval
                ? "#2f8f55"
                : !context.approval || log.status === "submitted" || log.status === "recorded"
                ? "#b66d12"
                : log.status === "approved"
                  ? "#2563eb"
                  : "#c44232";
            return `<td class="center">${log ? `<span class="dot" style="background:${color}"></span>` : isWeekend(day) || day > context.today ? "" : '<span class="muted">·</span>'}</td>`;
          })
          .join("")}</tr>`;
      })
      .join("")}</tbody></table><p class="sub">● ${
      context.approval ? "파랑=승인, 주황=승인 대기, 빨강=반려, 초록=부서장 제출(승인 불필요)" : "작성"
    } · 점(·)=미작성 평일</p>`);
  }

  if (options.issues) {
    const issues = summaries
      .flatMap((summary) => summary.issues.map((issue) => ({ ...issue, name: summary.member.name })))
      .sort((first, second) => first.date.localeCompare(second.date) || first.name.localeCompare(second.name, "ko-KR"));
    if (issues.length) {
      parts.push(`<h2>특이사항·이슈</h2><table><thead><tr><th style="width:70px">날짜</th><th style="width:80px">구성원</th><th>내용</th></tr></thead><tbody>${issues
        .map((issue) => `<tr><td>${shortDay(issue.date)}</td><td>${esc(issue.name)}</td><td>${multiline(issue.text)}</td></tr>`)
        .join("")}</tbody></table>`);
    }
  }

  parts.push(`<div class="foot">출력 ${esc(context.generatedAt)} · ${esc(context.generatedBy)}</div>`);
  return documentShell(`팀 업무일지 요약 ${context.from}~${context.to}`, `<section class="page">${parts.join("")}</section>`, matrix && days.length > 14);
}

// ----------------------------------------------------------------- annual

export type MonthStat = {
  month: string;
  label: string;
  written: number;
  workdays: number;
  rate: number | null;
  approved: number;
  submitted: number;
  rejected: number;
  issues: number;
  top: string[];
};

export function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Per-month numbers for one member's year (rate is null for months not yet started). */
export function monthlyBreakdown(summary: MemberSummary, year: number, today: string): MonthStat[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const logs = summary.logs.filter((log) => log.logDate.startsWith(month));
    const first = `${month}-01`;
    const last = new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10);
    const until = last < today ? last : today;
    const workdays = until >= first ? weekdaysBetween(first, until) : [];
    const written = new Set(logs.map((log) => log.logDate));
    const writtenWeekdays = workdays.filter((day) => written.has(day)).length;
    const counts = new Map<number, number>();
    for (const log of logs) {
      for (const id of log.itemIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    return {
      month,
      label: `${index + 1}월`,
      written: logs.length,
      workdays: workdays.length,
      rate: workdays.length ? Math.round((writtenWeekdays / workdays.length) * 100) : null,
      approved: logs.filter((log) => log.status === "approved").length,
      submitted: logs.filter((log) => log.status === "submitted").length,
      rejected: logs.filter((log) => log.status === "rejected").length,
      issues: logs.filter((log) => log.issues.trim()).length,
      top: [...counts.entries()]
        .sort((first, second) => second[1] - first[1])
        .slice(0, 2)
        .map(([id]) => summary.items.find((item) => item.id === id)?.title ?? `#${id}`),
    };
  });
}

/** Print-friendly inline SVG bar chart of monthly write rates. */
export function monthlyChart(months: MonthStat[]) {
  const width = 600;
  const height = 150;
  const top = 18;
  const bottom = 22;
  const slot = width / months.length;
  const barWidth = slot * 0.56;
  const plot = height - top - bottom;
  const bars = months
    .map((month, index) => {
      const x = index * slot + (slot - barWidth) / 2;
      const value = month.rate ?? 0;
      const barHeight = Math.max(month.rate === null ? 0 : 1, (plot * value) / 100);
      const y = top + plot - barHeight;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(
        1
      )}" rx="2" fill="${month.rate === null ? "#e3e9e0" : "#18786f"}"/><text x="${(x + barWidth / 2).toFixed(1)}" y="${(
        y - 4
      ).toFixed(1)}" text-anchor="middle" font-size="10" fill="#17231f">${month.rate === null ? "" : `${value}%`}</text><text x="${(
        x + barWidth / 2
      ).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="#5d6b65">${month.label}</text>`;
    })
    .join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="월별 평일 작성률"><line x1="0" y1="${
    top + plot
  }" x2="${width}" y2="${top + plot}" stroke="#b9c8bd"/>${bars}</svg>`;
}

function annualSection(
  summary: MemberSummary,
  year: number,
  context: ReportContext,
  options: ReportOptions
) {
  const months = monthlyBreakdown(summary, year, context.today);
  const parts: string[] = [
    headerBlock("연간 업무일지 보고서", summary, context, options),
    metaBlock(summary.member, "연도", `${year}년 (${periodText(context)})`),
  ];

  parts.push(`<h2>연간 요약</h2><div class="stats five">
    <div class="stat"><b>${summary.logs.length}건</b><span>작성한 일지</span></div>
    <div class="stat"><b>${summary.rate}%</b><span>평일 작성률 (${summary.writtenWeekdays}/${summary.workdays.length}일)</span></div>
    ${context.approval ? approvalStat(summary) : ""}
    <div class="stat"><b>${summary.items.length}건</b><span>관련 업무</span></div>
    <div class="stat"><b>${summary.issues.length}건</b><span>특이사항</span></div>
  </div>`);

  parts.push(`<h2>월별 작성률</h2>${monthlyChart(months)}`);

  parts.push(`<h2>월별 현황</h2><table><thead><tr><th>월</th><th class="num">일지</th><th class="num">평일 작성률</th>${
    context.approval ? '<th class="num">승인</th><th class="num">대기</th><th class="num">반려</th>' : ""
  }<th class="num">특이사항</th><th>주요 관련 업무</th></tr></thead><tbody>${months
    .map(
      (month) =>
        `<tr><td>${month.label}</td><td class="num">${month.written}</td><td class="num">${
          month.rate === null ? '<span class="muted">-</span>' : `${month.rate}%`
        }</td>${
          context.approval
            ? `<td class="num">${month.approved}</td><td class="num">${month.submitted}</td><td class="num">${month.rejected}</td>`
            : ""
        }<td class="num">${month.issues}</td><td>${month.top.map(esc).join("<br>") || '<span class="muted">-</span>'}</td></tr>`
    )
    .join("")}</tbody></table>`);

  if (options.items) {
    parts.push(itemsSection(summary, true));
  }
  if (options.issues) {
    parts.push(issuesSection(summary));
  }
  if (options.includeDaily) {
    parts.push(dailySection(summary, context, false));
  }
  parts.push(footer(context));
  return `<section class="page">${parts.join("")}</section>`;
}

function annualTeamPage(summaries: MemberSummary[], year: number, context: ReportContext) {
  const rows = summaries.map((summary) => ({
    summary,
    months: monthlyBreakdown(summary, year, context.today),
  }));
  const cell = (month: MonthStat) => {
    if (month.rate === null) {
      return '<td class="muted">·</td>';
    }
    const alpha = (month.rate / 100) * 0.85;
    return `<td style="background: rgba(24,120,111,${alpha.toFixed(2)}); color: ${
      month.rate >= 55 ? "#fff" : "#17231f"
    }">${month.written}</td>`;
  };
  const totals = Array.from({ length: 12 }, (_, index) =>
    rows.reduce((sum, row) => sum + row.months[index].written, 0)
  );

  return `<section class="page"><div class="head"><div><h1>${year}년 팀 업무일지 연간 개요</h1><div class="sub">${esc(orgLine(context))} · 구성원 ${summaries.length}명</div></div></div>
  <h2>구성원 × 월 작성 현황</h2>
  <table class="heat" style="font-size:8.5pt"><thead><tr><th style="text-align:left">구성원</th>${Array.from(
    { length: 12 },
    (_, index) => `<th class="center">${index + 1}월</th>`
  ).join("")}<th class="num">합계</th><th class="num">작성률</th></tr></thead><tbody>${rows
    .map(
      ({ summary, months }) =>
        `<tr><td style="text-align:left">${esc(summary.member.name)}</td>${months.map(cell).join("")}<td class="num">${
          summary.logs.length
        }</td><td class="num">${summary.rate}%</td></tr>`
    )
    .join("")}<tr><th style="text-align:left">합계</th>${totals
    .map((total) => `<th class="center">${total}</th>`)
    .join("")}<th class="num">${rows.reduce((sum, row) => sum + row.summary.logs.length, 0)}</th><th></th></tr></tbody></table>
  <p class="sub">칸의 숫자는 그달 작성한 일지 수, 색이 진할수록 평일 작성률이 높습니다. 점(·)은 아직 오지 않은 달입니다.</p>
  <h2>구성원별 연간 요약</h2><table><thead><tr><th>구성원</th><th class="num">일지</th><th class="num">평일 작성률</th>${
    context.approval ? '<th class="num">승인</th><th class="num">반려</th>' : ""
  }<th class="num">특이사항</th><th>가장 많이 다룬 업무</th></tr></thead><tbody>${rows
    .map(
      ({ summary }) =>
        `<tr><td>${esc(summary.member.name)}${summary.member.role ? `<br><small>${esc(summary.member.role)}</small>` : ""}</td><td class="num">${
          summary.logs.length
        }</td><td class="num">${summary.rate}% <small>(${summary.writtenWeekdays}/${summary.workdays.length})</small></td>${
          context.approval
            ? approvalFree(summary)
              ? '<td class="num" colspan="2"><small>승인 불필요</small></td>'
              : `<td class="num">${summary.status.approved}</td><td class="num">${summary.status.rejected}</td>`
            : ""
        }<td class="num">${summary.issues.length}</td><td>${summary.items
          .slice(0, 3)
          .map((item) => `${esc(item.title)} <small>${item.days}일</small>`)
          .join("<br>") || '<span class="muted">-</span>'}</td></tr>`
    )
    .join("")}</tbody></table>${footer(context)}</section>`;
}

export function renderAnnualReport(
  context: ReportContext,
  year: number,
  members: ReportMember[],
  logs: WorkLog[],
  items: Map<number, ReportItemInfo>,
  options: ReportOptions = DEFAULT_REPORT_OPTIONS
) {
  const yearContext = { ...context, ...yearRange(year) };
  const summaries = members.map((member) =>
    summarizeMember(member, logs, yearContext, items, options.approvedOnly)
  );
  const pages = [
    options.teamOverview && summaries.length > 1 ? annualTeamPage(summaries, year, yearContext) : "",
    ...summaries.map((summary) => annualSection(summary, year, yearContext, options)),
  ].join("");
  const title =
    members.length === 1 ? `${members[0].name} ${year}년 업무일지` : `${year}년 업무일지 연간 보고서`;
  return documentShell(title, pages || '<section class="page"><p>선택한 구성원이 없습니다.</p></section>');
}
