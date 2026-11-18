"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatLogDate,
  isWeekend,
  kstToday,
  monthGrid,
  monthRange,
  shiftDate,
  shiftMonth,
  weekDates,
  weekdayLabel,
  workLogPermissions,
  workLogsToCsv,
  type TeamMember,
  type TeamPolicy,
  type Viewer,
  type WorkLog,
} from "./lib/team";
import type { WorkflowItem } from "./lib/workflow";
import {
  LogBody,
  MemberPicker,
  ReviewActions,
  STATUS_TONE,
  StatusBadge,
  formatTime,
  groupByDate,
  mergeLogs,
  type FetchLogs,
  type ReviewFn,
} from "./work-log-parts";

// 모아보기: several members × several days on one screen, in four layouts.

type Layout = "day" | "week" | "month" | "list";
type StatusFilter = "all" | WorkLog["status"];

const LAYOUTS: Array<[Layout, string]> = [
  ["day", "일간 카드"],
  ["week", "주간 표"],
  ["month", "월간 달력"],
  ["list", "목록"],
];

type WorkLogBoardProps = {
  viewer: Viewer;
  members: TeamMember[];
  itemsById: Map<number, WorkflowItem>;
  policy: TeamPolicy;
  canSeeAll: boolean;
  organizationName: string;
  busy: boolean;
  fetchLogs: FetchLogs;
  review: ReviewFn;
  onOpenOwn: (date: string) => void;
  /** Open on this person's log for this day (from 통합 검색). */
  initialFocus?: { memberId: number; logDate: string } | null;
};

function shortDate(iso: string) {
  const [, month, day] = iso.split("-").map(Number);
  return `${month}/${day}`;
}

function excerpt(log: WorkLog) {
  return log.content || log.plan || log.issues || "(관련 업무만 연결)";
}

export default function WorkLogBoard({
  viewer,
  members,
  itemsById,
  policy,
  canSeeAll,
  organizationName,
  busy,
  fetchLogs,
  review,
  onOpenOwn,
  initialFocus = null,
}: WorkLogBoardProps) {
  const today = kstToday();
  const [layout, setLayout] = useState<Layout>(initialFocus ? "day" : "week");
  const [anchor, setAnchor] = useState(initialFocus?.logDate ?? today);
  const pendingFocus = useRef(initialFocus);
  const [weekend, setWeekend] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<WorkLog | null>(null);

  const range = useMemo(() => {
    if (layout === "day") {
      return { from: anchor, to: anchor };
    }
    if (layout === "week") {
      const days = weekDates(anchor);
      return { from: days[0], to: days[6] };
    }
    if (layout === "month") {
      const weeks = monthGrid(anchor);
      return { from: weeks[0][0], to: weeks[weeks.length - 1][6] };
    }
    return monthRange(anchor.slice(0, 7)) ?? { from: anchor, to: anchor };
  }, [anchor, layout]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await fetchLogs(`from=${range.from}&to=${range.to}`);
      setLogs(loaded);
      const focus = pendingFocus.current;
      if (focus) {
        pendingFocus.current = null;
        const found = loaded.find((log) => log.memberId === focus.memberId && log.logDate === focus.logDate);
        if (found) {
          setDetail(found);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "업무일지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [fetchLogs, range.from, range.to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Rows: the chosen members (everyone active by default), plus anyone
  // inactive who still wrote something in the period.
  const rows = useMemo(() => {
    if (!canSeeAll) {
      return members.filter((member) => member.id === viewer.memberId);
    }
    const authors = new Set(logs.map((log) => log.memberId));
    return members.filter((member) =>
      picked.length ? picked.includes(member.id) : member.active || authors.has(member.id)
    );
  }, [canSeeAll, logs, members, picked, viewer.memberId]);

  const rowIds = useMemo(() => new Set(rows.map((member) => member.id)), [rows]);
  const visibleLogs = useMemo(
    () => logs.filter((log) => rowIds.has(log.memberId)),
    [logs, rowIds]
  );
  const logAt = useMemo(() => {
    const map = new Map<string, WorkLog>();
    for (const log of visibleLogs) {
      map.set(`${log.memberId}:${log.logDate}`, log);
    }
    return map;
  }, [visibleLogs]);
  const matches = (log: WorkLog) =>
    statusFilter === "all" ||
    log.status === statusFilter ||
    // Without approval every saved log is simply "제출", 부서장's included.
    (!policy.logApproval && statusFilter === "submitted" && log.status === "recorded");

  const counts = useMemo(() => {
    const inRange = visibleLogs.filter((log) => log.logDate >= range.from && log.logDate <= range.to);
    return {
      total: inRange.length,
      submitted: inRange.filter((log) => log.status === "submitted").length,
      approved: inRange.filter((log) => log.status === "approved").length,
      rejected: inRange.filter((log) => log.status === "rejected").length,
    };
  }, [range.from, range.to, visibleLogs]);

  const reviewable = (log: WorkLog) =>
    workLogPermissions(viewer, log, log.memberId, policy).canReview;

  async function reviewHere(...args: Parameters<ReviewFn>) {
    const updated = await review(...args);
    if (updated) {
      setLogs((current) => mergeLogs(current, updated));
      setDetail((current) => (current ? updated.find((log) => log.id === current.id) ?? current : current));
    }
    return updated;
  }

  function move(step: -1 | 1) {
    setAnchor((current) =>
      layout === "day"
        ? shiftDate(current, step)
        : layout === "week"
          ? shiftDate(current, 7 * step)
          : shiftMonth(current, step)
    );
  }

  function downloadCsv() {
    const titles = new Map([...itemsById].map(([id, item]) => [id, item.title] as const));
    const blob = new Blob([workLogsToCsv(visibleLogs.filter(matches), titles)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchorEl = document.createElement("a");
    anchorEl.href = url;
    anchorEl.download = `${organizationName}_업무일지_${range.from}_${range.to}.csv`
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ");
    document.body.appendChild(anchorEl);
    anchorEl.click();
    anchorEl.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const periodLabel =
    layout === "day"
      ? formatLogDate(anchor)
      : layout === "week"
        ? `${shortDate(range.from)} ~ ${shortDate(range.to)}`
        : `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`;
  const weekDays = weekDates(anchor, weekend);
  const pendingInView = visibleLogs.filter(
    (log) => log.status === "submitted" && reviewable(log) && log.logDate >= range.from && log.logDate <= range.to
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="tb-seg" role="tablist" aria-label="보기 방식">
          {LAYOUTS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={layout === key}
              data-active={layout === key}
              onClick={() => setLayout(key)}
              className="tb-seg-btn"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="tb-iconbtn h-8 w-8" aria-label="이전 기간">
            ‹
          </button>
          <span className="min-w-[110px] text-center text-sm font-semibold">{periodLabel}</span>
          <button type="button" onClick={() => move(1)} className="tb-iconbtn h-8 w-8" aria-label="다음 기간">
            ›
          </button>
          {anchor !== today ? (
            <button type="button" onClick={() => setAnchor(today)} className="tb-btn !px-2.5 !py-1 text-xs">
              오늘
            </button>
          ) : null}
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="tb-field w-auto !py-1.5 text-sm"
          aria-label="상태 필터"
        >
          <option value="all">모든 상태</option>
          <option value="submitted">{policy.logApproval ? "승인 대기" : "제출"}</option>
          {policy.logApproval ? <option value="approved">승인</option> : null}
          {policy.logApproval ? <option value="rejected">반려</option> : null}
          {policy.logApproval ? <option value="recorded">부서장 제출 (승인 불필요)</option> : null}
        </select>
        {layout === "week" ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={weekend}
              onChange={(event) => setWeekend(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            주말 포함
          </label>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {pendingInView.length ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reviewHere(pendingInView.map((log) => log.id), "approve")}
              className="tb-btn tb-btn-primary !py-1.5 text-sm"
            >
              이 기간 대기 {pendingInView.length}건 승인
            </button>
          ) : null}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!visibleLogs.length}
            className="tb-btn !py-1.5 text-sm"
          >
            CSV
          </button>
        </div>
      </div>

      {canSeeAll ? (
        <MemberPicker members={members} selected={picked} onChange={setPicked} />
      ) : (
        <p className="text-xs text-[var(--text-faint)]">
          이 보드는 본인 일지만 볼 수 있도록 설정되어 있습니다.
        </p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]" aria-live="polite">
        <span>
          일지 <strong className="text-[var(--text)]">{counts.total}</strong>건
        </span>
        {policy.logApproval ? (
          <>
            <span>승인 대기 {counts.submitted}</span>
            <span>승인 {counts.approved}</span>
            <span>반려 {counts.rejected}</span>
          </>
        ) : null}
        <span>구성원 {rows.length}명</span>
        {loading ? <span>불러오는 중…</span> : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {layout === "day" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((member) => {
            const log = logAt.get(`${member.id}:${anchor}`) ?? null;
            return (
              <article
                key={member.id}
                className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 ${
                  log && !matches(log) ? "opacity-40" : ""
                }`}
                style={{ borderLeft: `4px solid ${member.color}` }}
              >
                <header className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{member.name}</span>
                  {member.role ? <span className="text-xs text-[var(--text-faint)]">{member.role}</span> : null}
                  <StatusBadge log={log} approval={policy.logApproval} />
                  {log ? (
                    <span className="text-[11px] text-[var(--text-faint)]">{formatTime(log.updatedAt)}</span>
                  ) : null}
                  {member.id === viewer.memberId ? (
                    <button
                      type="button"
                      onClick={() => onOpenOwn(anchor)}
                      className="tb-btn ml-auto !px-2 !py-1 text-xs"
                    >
                      {log ? "열기" : "작성"}
                    </button>
                  ) : null}
                </header>
                {log ? (
                  <>
                    <LogBody log={log} itemsById={itemsById} />
                    {reviewable(log) ? <ReviewActions log={log} busy={busy} onReview={reviewHere} /> : null}
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-faint)]">아직 작성하지 않았습니다.</p>
                )}
              </article>
            );
          })}
        </div>
      ) : layout === "week" ? (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--surface-2)]">
                <th scope="col" className="sticky left-0 z-10 w-[112px] bg-[var(--surface-2)] px-2 py-2 text-left text-xs font-semibold">
                  구성원
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className={`px-2 py-2 text-left text-xs font-semibold ${
                      day === today ? "text-[var(--accent)]" : isWeekend(day) ? "text-[var(--text-faint)]" : ""
                    }`}
                  >
                    {shortDate(day)} ({weekdayLabel(day)})
                  </th>
                ))}
                <th scope="col" className="w-[56px] px-2 py-2 text-right text-xs font-semibold">
                  작성
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const written = weekDays.filter((day) => logAt.has(`${member.id}:${day}`)).length;
                return (
                  <tr key={member.id} className="border-t border-[var(--border)] align-top">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-[var(--surface)] px-2 py-2 text-left font-medium"
                      style={{ boxShadow: `inset 3px 0 0 ${member.color}` }}
                    >
                      <span className="block truncate">{member.name}</span>
                      {member.role ? (
                        <span className="block truncate text-[11px] font-normal text-[var(--text-faint)]">{member.role}</span>
                      ) : null}
                    </th>
                    {weekDays.map((day) => {
                      const log = logAt.get(`${member.id}:${day}`);
                      return (
                        <td
                          key={day}
                          className={`p-1 ${isWeekend(day) ? "bg-[var(--surface-2)]" : ""}`}
                        >
                          {log ? (
                            <button
                              type="button"
                              onClick={() => setDetail(log)}
                              className={`block h-full w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1.5 text-left hover:border-[var(--accent)] ${
                                matches(log) ? "" : "opacity-30"
                              }`}
                              style={{ borderLeft: `3px solid ${STATUS_TONE[log.status].color}` }}
                              aria-label={`${member.name} ${formatLogDate(day)} 업무일지`}
                            >
                              <span className="line-clamp-3 whitespace-pre-line text-xs leading-4">
                                {excerpt(log)}
                              </span>
                              <span className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-faint)]">
                                <StatusBadge log={log} approval={policy.logApproval} />
                                {log.itemIds.length ? <span>🔗{log.itemIds.length}</span> : null}
                                {log.issues ? <span title="특이사항 있음">⚠</span> : null}
                              </span>
                            </button>
                          ) : (
                            <span className="block py-2 text-center text-xs text-[var(--text-faint)]">
                              {day > today ? "" : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-[var(--text-muted)]">
                      {written}/{weekDays.filter((day) => day <= today && !isWeekend(day)).length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
                <th scope="row" className="sticky left-0 bg-[var(--surface-2)] px-2 py-1.5 text-left font-semibold">
                  일별 작성
                </th>
                {weekDays.map((day) => (
                  <td key={day} className="px-2 py-1.5 tabular-nums">
                    {rows.filter((member) => logAt.has(`${member.id}:${day}`)).length}/{rows.length}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : layout === "month" ? (
        <div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--border)]">
            {["월", "화", "수", "목", "금", "토", "일"].map((label) => (
              <div key={label} className="bg-[var(--surface-2)] px-2 py-1 text-center text-xs font-semibold text-[var(--text-muted)]">
                {label}
              </div>
            ))}
            {monthGrid(anchor).flat().map((day) => {
              const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
              const dayLogs = rows
                .map((member) => ({ member, log: logAt.get(`${member.id}:${day}`) }))
                .filter((entry): entry is { member: TeamMember; log: WorkLog } => Boolean(entry.log));
              const single = rows.length === 1;
              const singleLog = single ? dayLogs[0]?.log : undefined;
              return (
                <div
                  key={day}
                  className={`min-h-[84px] p-1.5 sm:min-h-[96px] ${
                    inMonth ? (isWeekend(day) ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]") : "bg-[var(--surface-2)] opacity-50"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setAnchor(day);
                        setLayout("day");
                      }}
                      className={`text-xs font-semibold hover:underline ${day === today ? "rounded-full bg-[var(--accent)] px-1.5 text-white" : ""}`}
                      aria-label={`${formatLogDate(day)} 일간 보기`}
                    >
                      {Number(day.slice(8))}
                    </button>
                    {!single && dayLogs.length ? (
                      <span className="text-[10px] tabular-nums text-[var(--text-faint)]">
                        {dayLogs.length}/{rows.length}
                      </span>
                    ) : null}
                  </div>
                  {single ? (
                    singleLog ? (
                      <button
                        type="button"
                        onClick={() => setDetail(singleLog)}
                        className={`block w-full rounded-[var(--radius-sm)] p-1 text-left hover:bg-[var(--accent-soft)] ${matches(singleLog) ? "" : "opacity-30"}`}
                        style={{ borderLeft: `3px solid ${STATUS_TONE[singleLog.status].color}` }}
                      >
                        <span className="line-clamp-3 whitespace-pre-line text-[11px] leading-4">{excerpt(singleLog)}</span>
                      </button>
                    ) : null
                  ) : (
                    <div className="flex flex-wrap gap-0.5">
                      {dayLogs.slice(0, 8).map(({ member, log }) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => setDetail(log)}
                          title={`${member.name} · ${log.status === "approved" ? "승인" : log.status === "rejected" ? "반려" : "제출"}`}
                          className={`max-w-full truncate rounded-[var(--radius-sm)] px-1 text-[10px] leading-4 ${matches(log) ? "" : "opacity-30"}`}
                          style={{ background: member.color, boxShadow: `inset 0 -2px 0 ${STATUS_TONE[log.status].color}` }}
                        >
                          {member.name}
                        </button>
                      ))}
                      {dayLogs.length > 8 ? (
                        <span className="text-[10px] text-[var(--text-faint)]">+{dayLogs.length - 8}</span>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
            날짜를 누르면 그날의 일간 카드로, 이름을 누르면 일지 상세로 이동합니다. 아래 줄 색: 주황
            {policy.logApproval ? "=승인 대기, 파랑=승인, 빨강=반려, 초록=부서장 제출(승인 불필요)" : "=제출"}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupByDate(visibleLogs.filter(matches)).map(([logDate, dayLogs]) => (
            <section key={logDate}>
              <h3 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">{formatLogDate(logDate)}</h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {dayLogs.map((log) => {
                  const member = members.find((entry) => entry.id === log.memberId);
                  return (
                    <article
                      key={log.id}
                      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                      style={{ borderLeft: `4px solid ${member?.color ?? "var(--border-strong)"}` }}
                    >
                      <header className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{log.memberName}</span>
                        <StatusBadge log={log} approval={policy.logApproval} />
                        <span className="text-[11px] text-[var(--text-faint)]">{formatTime(log.updatedAt)}</span>
                      </header>
                      <LogBody log={log} itemsById={itemsById} />
                      {reviewable(log) ? <ReviewActions log={log} busy={busy} onReview={reviewHere} /> : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {!loading && !visibleLogs.filter(matches).length ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">이 기간에 해당하는 업무일지가 없습니다.</div>
          ) : null}
        </div>
      )}

      {detail ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${detail.memberName} ${formatLogDate(detail.logDate)} 업무일지`}
            className="tb-card my-10 w-full max-w-[560px] !bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-semibold">{detail.memberName}</span>
              <span className="text-sm text-[var(--text-muted)]">{formatLogDate(detail.logDate)}</span>
              <StatusBadge log={detail} approval={policy.logApproval} />
              <button type="button" onClick={() => setDetail(null)} className="tb-iconbtn ml-auto h-8 w-8" aria-label="닫기">
                ×
              </button>
            </header>
            <LogBody log={detail} itemsById={itemsById} />
            <p className="mt-3 text-[11px] text-[var(--text-faint)]">
              {formatTime(detail.updatedAt)} 제출 · 작성 {detail.updatedBy}
            </p>
            {reviewable(detail) ? <ReviewActions log={detail} busy={busy} onReview={reviewHere} /> : null}
            {detail.memberId === viewer.memberId ? (
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  onOpenOwn(detail.logDate);
                }}
                className="tb-btn mt-3 text-sm"
              >
                내 일지에서 열기
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
