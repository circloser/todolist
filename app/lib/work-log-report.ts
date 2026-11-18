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

export type ReportFormat = "personal" | "team";

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
};

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  summary: true,
  items: true,
  issues: true,
  signature: true,
  approvedOnly: false,
  showMissing: true,
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
  status: { submitted: number; approved: number; rejected: number };
  items: Array<ReportItemInfo & { id: number; days: number; lastDate: string }>;
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
        (!approvedOnly || log.status === "approved")
    )
    .sort((first, second) => first.logDate.localeCompare(second.logDate));
  const lastCounted = context.to < context.today ? context.to : context.today;
  const workdays = lastCounted >= context.from ? weekdaysBetween(context.from, lastCounted) : [];
  const written = new Set(logs.map((log) => log.logDate));
  const writtenWeekdays = workdays.filter((day) => written.has(day)).length;
  const mentions = new Map<number, { days: number; lastDate: string }>();

  for (const log of logs) {
    for (const id of log.itemIds) {
      const current = mentions.get(id);
      mentions.set(id, { days: (current?.days ?? 0) + 1, lastDate: log.logDate });
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
  if (!approval) {
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

function personalSection(summary: MemberSummary, context: ReportContext, options: ReportOptions) {
  const { member } = summary;
  const parts: string[] = [];

  parts.push(`<div class="head"><div><h1>개인 업무일지 보고서</h1><div class="sub">${esc(
    context.organizationName
  )} · ${esc(context.boardTitle)}</div></div>${options.signature ? signatureBox(summary, context) : ""}</div>`);

  parts.push(`<table class="meta"><tr><th>성명</th><td>${esc(member.name)}</td><th>직급·역할</th><td>${
    esc(member.role) || '<span class="muted">-</span>'
  }</td></tr><tr><th>기간</th><td colspan="3">${esc(periodText(context))}</td></tr></table>`);

  if (options.summary) {
    const approvalStats = context.approval
      ? `<div class="stat"><b>${summary.status.approved}</b><span>승인 · 대기 ${summary.status.submitted} · 반려 ${summary.status.rejected}</span></div>`
      : "";
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

  if (options.items && summary.items.length) {
    parts.push(`<h2>관련 업무</h2><table><thead><tr><th>업무</th><th>분류</th><th class="num">언급</th><th>최근</th><th>현재 진행률</th></tr></thead><tbody>${summary.items
      .map(
        (item) =>
          `<tr><td>${esc(item.title)}</td><td>${esc(item.category)}</td><td class="num">${item.days}일</td><td>${shortDay(
            item.lastDate
          )}</td><td><div class="bar"><i style="width:${Math.max(0, Math.min(100, item.progress))}%"></i></div><small>${item.progress}%</small></td></tr>`
      )
      .join("")}</tbody></table>`);
  }

  if (options.issues && summary.issues.length) {
    parts.push(`<h2>특이사항·이슈</h2><table><thead><tr><th style="width:80px">날짜</th><th>내용</th></tr></thead><tbody>${summary.issues
      .map((issue) => `<tr><td>${shortDay(issue.date)}</td><td>${multiline(issue.text)}</td></tr>`)
      .join("")}</tbody></table>`);
  }

  const byDate = new Map(summary.logs.map((log) => [log.logDate, log] as const));
  const days: string[] = [];
  for (let day = context.from; day <= context.to; day = shiftDate(day, 1)) {
    if (byDate.has(day) || (options.showMissing && !isWeekend(day) && day <= context.today)) {
      days.push(day);
    }
  }

  parts.push(`<h2>일자별 업무 내용</h2>${
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
  }`);

  parts.push(`<div class="foot">출력 ${esc(context.generatedAt)} · ${esc(context.generatedBy)}</div>`);
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

  parts.push(`<div class="head"><div><h1>팀 업무일지 요약</h1><div class="sub">${esc(
    context.organizationName
  )} · ${esc(context.boardTitle)} · ${esc(periodText(context))}</div></div></div>`);

  parts.push(`<h2>구성원별 현황</h2><table><thead><tr><th>구성원</th><th class="num">일지</th><th class="num">평일 작성률</th>${
    context.approval ? '<th class="num">승인</th><th class="num">대기</th><th class="num">반려</th>' : ""
  }<th>미작성 평일</th><th>주요 관련 업무</th></tr></thead><tbody>${summaries
    .map(
      (summary) =>
        `<tr><td>${esc(summary.member.name)}${summary.member.role ? `<br><small>${esc(summary.member.role)}</small>` : ""}</td><td class="num">${
          summary.logs.length
        }</td><td class="num">${summary.rate}% <small>(${summary.writtenWeekdays}/${summary.workdays.length})</small></td>${
          context.approval
            ? `<td class="num">${summary.status.approved}</td><td class="num">${summary.status.submitted}</td><td class="num">${summary.status.rejected}</td>`
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
              : !context.approval || log.status === "submitted"
                ? "#b66d12"
                : log.status === "approved"
                  ? "#2563eb"
                  : "#c44232";
            return `<td class="center">${log ? `<span class="dot" style="background:${color}"></span>` : isWeekend(day) || day > context.today ? "" : '<span class="muted">·</span>'}</td>`;
          })
          .join("")}</tr>`;
      })
      .join("")}</tbody></table><p class="sub">● ${
      context.approval ? "파랑=승인, 주황=승인 대기, 빨강=반려" : "작성"
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
