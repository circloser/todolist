// 회의록 인쇄용 A4 문서. The minutes view previews exactly this document.

import { minutesAudience, type MeetingMinutes } from "./schedule";
import { weekdayLabel } from "./team";
import { esc, longDate } from "./work-log-report";

export type MinutesPrintContext = {
  organizationName: string;
  boardTitle: string;
  memberNames: Map<number, string>;
  /** Board members, for the 미참석자 확인 table. */
  members?: Array<{ id: number; name: string; active: boolean }>;
  generatedAt: string;
  generatedBy: string;
};

const STYLES = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #17231f; font: 10.5pt/1.6 "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { margin: 0; font-size: 18pt; letter-spacing: -0.02em; }
  h2 { margin: 16px 0 6px; font-size: 11pt; border-left: 3px solid #18786f; padding-left: 6px; }
  .head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid #17231f; padding-bottom: 8px; }
  .sub { color: #5d6b65; font-size: 9pt; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #b9c8bd; padding: 5px 7px; vertical-align: top; text-align: left; }
  th { background: #eef3ef; font-weight: 600; white-space: nowrap; width: 84px; }
  .meta { margin-top: 10px; }
  .box { border: 1px solid #b9c8bd; padding: 8px 10px; white-space: pre-wrap; min-height: 36px; }
  .sign { border-collapse: collapse; width: auto; }
  .sign th { width: auto; text-align: center; font-size: 8.5pt; padding: 2px 12px; }
  .sign td { width: 74px; height: 48px; }
  .muted { color: #8b9790; }
  .done { color: #2f8f55; font-weight: 600; }
  .foot { margin-top: 14px; color: #8b9790; font-size: 8pt; text-align: right; }
  @media screen { body { background: #dfe5df; padding: 18px 0; } .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 14mm; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.12); } }
`;

/** "11/19 14:05" in Korean time. */
function shortStamp(iso: string) {
  const date = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function block(value: string) {
  return value.trim() ? `<div class="box">${esc(value.trim())}</div>` : '<div class="box muted">-</div>';
}

export function renderMinutesHtml(minute: MeetingMinutes, context: MinutesPrintContext) {
  const attendees = minute.attendeeIds.map((id) => context.memberNames.get(id) ?? `#${id}`);
  const time = minute.startTime ? `${minute.startTime}${minute.endTime ? ` ~ ${minute.endTime}` : ""}` : "";
  const org = [...new Set([context.organizationName.trim(), context.boardTitle.trim()].filter(Boolean))].join(" · ");
  const actions = minute.actionItems.length
    ? `<table><thead><tr><th style="width:auto">할 일</th><th>담당</th><th>기한</th><th>상태</th></tr></thead><tbody>${minute.actionItems
        .map(
          (item) =>
            `<tr><td>${esc(item.text)}</td><td>${esc(item.ownerName) || '<span class="muted">-</span>'}</td><td>${
              item.dueDate ? `${Number(item.dueDate.slice(5, 7))}/${Number(item.dueDate.slice(8))}(${weekdayLabel(item.dueDate)})` : '<span class="muted">-</span>'
            }</td><td>${item.done ? '<span class="done">완료</span>' : "진행"}</td></tr>`
        )
        .join("")}</tbody></table>`
    : '<div class="box muted">-</div>';

  const audience = context.members ? minutesAudience(minute, context.members) : null;
  const reads =
    audience && audience.absentees.length
      ? `<h2>미참석자 확인 (${audience.confirmed}/${audience.absentees.length})</h2><table><thead><tr><th style="width:auto">구성원</th><th style="width:160px">확인</th></tr></thead><tbody>${audience.absentees
          .map(
            (member) =>
              `<tr><td>${esc(member.name)}</td><td>${
                member.acknowledgedAt
                  ? `<span class="done">확인</span> ${esc(shortStamp(member.acknowledgedAt))}`
                  : '<span class="muted">미확인</span>'
              }</td></tr>`
          )
          .join("")}</tbody></table>`
      : "";

  const body = `<section class="page">
    <div class="head"><div><h1>회의록</h1><div class="sub">${esc(org)}</div></div>
      <table class="sign" aria-label="결재"><tr><th>작성</th><th>부서장</th></tr><tr><td></td><td></td></tr></table>
    </div>
    <table class="meta">
      <tr><th>회의명</th><td colspan="3">${esc(minute.title)}</td></tr>
      <tr><th>일시</th><td>${esc(longDate(minute.meetingDate))} (${weekdayLabel(minute.meetingDate)}) ${esc(time)}</td><th>장소</th><td>${
        esc(minute.location) || '<span class="muted">-</span>'
      }</td></tr>
      <tr><th>참석자</th><td colspan="3">${[...attendees.map(esc), minute.guests ? esc(minute.guests) : ""].filter(Boolean).join(", ") || '<span class="muted">-</span>'}</td></tr>
      <tr><th>작성자</th><td colspan="3">${esc(minute.authorName)}</td></tr>
    </table>
    <h2>안건</h2>${block(minute.agenda)}
    <h2>회의 내용</h2>${block(minute.content)}
    <h2>결정 사항</h2>${block(minute.decisions)}
    <h2>후속 조치</h2>${actions}
    ${reads}
    <div class="foot">출력 ${esc(context.generatedAt)} · ${esc(context.generatedBy)}</div>
  </section>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(
    `회의록 ${minute.meetingDate} ${minute.title}`
  )}</title><style>${STYLES}</style></head><body>${body}</body></html>`;
}
