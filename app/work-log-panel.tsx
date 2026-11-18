"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  dailyActivityLines,
  dailyStatus,
  formatLogDate,
  isWeekend,
  kstToday,
  monthRange,
  shiftDate,
  WORK_LOG_STATUS_LABEL,
  workLogPermissions,
  workLogsToCsv,
  type TeamMember,
  type Viewer,
  type WorkLog,
  type WorkLogsResponse,
} from "./lib/team";
import { assigneeName, isItemDone, type WorkflowItem } from "./lib/workflow";

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;
type Tab = "write" | "team" | "queue" | "history";
type Decision = "approve" | "reject" | "reopen";

type Draft = {
  content: string;
  plan: string;
  issues: string;
  itemIds: number[];
};

const EMPTY_DRAFT: Draft = { content: "", plan: "", issues: "", itemIds: [] };

type WorkLogPanelProps = {
  viewer: Viewer | null;
  members: TeamMember[];
  items: WorkflowItem[];
  organizationName: string;
  request: ApiRequest;
  onPendingReviewChange?: (count: number) => void;
  onOpenMembers: () => void;
  onClose: () => void;
};

function draftFrom(log: WorkLog | null): Draft {
  return log
    ? { content: log.content, plan: log.plan, issues: log.issues, itemIds: log.itemIds }
    : EMPTY_DRAFT;
}

function sameDraft(first: Draft, second: Draft) {
  return (
    first.content.trim() === second.content.trim() &&
    first.plan.trim() === second.plan.trim() &&
    first.issues.trim() === second.issues.trim() &&
    first.itemIds.join(",") === second.itemIds.join(",")
  );
}

function formatTime(iso: string | null) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function StatusBadge({ log }: { log: WorkLog | null }) {
  if (!log) {
    return <span className="tb-badge tb-badge-muted">미작성</span>;
  }
  const tone =
    log.status === "approved"
      ? "tb-badge-complete"
      : log.status === "rejected"
        ? "tb-badge-danger"
        : "tb-badge-warning";
  return <span className={`tb-badge ${tone}`}>{WORK_LOG_STATUS_LABEL[log.status]}</span>;
}

function mergeLogs(current: WorkLog[], updates: WorkLog[]) {
  const byId = new Map(updates.map((log) => [log.id, log] as const));
  return current.map((log) => byId.get(log.id) ?? log);
}

export default function WorkLogPanel({
  viewer,
  members,
  items,
  organizationName,
  request,
  onPendingReviewChange,
  onOpenMembers,
  onClose,
}: WorkLogPanelProps) {
  const isManager = viewer?.accessRole === "manager";
  const myId = viewer?.memberId ?? null;
  const [tab, setTab] = useState<Tab>("write");
  const [date, setDate] = useState(kstToday);
  const [dayLogs, setDayLogs] = useState<WorkLog[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [itemQuery, setItemQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyMonth, setHistoryMonth] = useState(() => kstToday().slice(0, 7));
  const [historyMemberId, setHistoryMemberId] = useState<number | "all">(
    () => myId ?? "all"
  );
  const [historyLogs, setHistoryLogs] = useState<WorkLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [queueLogs, setQueueLogs] = useState<WorkLog[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [pendingReview, setPendingReview] = useState(0);

  const myLog =
    dayLogs.find((log) => log.memberId === myId && log.logDate === date) ?? null;
  const permissions = workLogPermissions(viewer, myLog, myId);
  const dirty = !sameDraft(draft, draftFrom(myLog));
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item] as const)),
    [items]
  );
  const today = kstToday();

  const updatePending = useCallback(
    (count: number | undefined) => {
      if (typeof count === "number") {
        setPendingReview(count);
        onPendingReviewChange?.(count);
      }
    },
    [onPendingReviewChange]
  );

  const fetchLogs = useCallback(
    async (query: string) => {
      const response = await request(`/api/work-logs?${query}`, { cache: "no-store" });
      const data = (await response.json()) as WorkLogsResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "업무일지를 불러오지 못했습니다.");
      }
      updatePending(data.pendingReview);
      return data.logs ?? [];
    },
    [request, updatePending]
  );

  const loadDay = useCallback(
    async (targetDate: string) => {
      setDayLoading(true);
      setError("");
      try {
        const logs = await fetchLogs(`date=${encodeURIComponent(targetDate)}`);
        setDayLogs(logs);
        return logs;
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "업무일지를 불러오지 못했습니다.");
        return null;
      } finally {
        setDayLoading(false);
      }
    },
    [fetchLogs]
  );

  const loadHistory = useCallback(async () => {
    const range = monthRange(historyMonth);
    if (!range) {
      return;
    }
    setHistoryLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (historyMemberId !== "all") {
        params.set("memberId", String(historyMemberId));
      }
      setHistoryLogs(await fetchLogs(params.toString()));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "업무일지를 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchLogs, historyMemberId, historyMonth]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setError("");
    try {
      setQueueLogs(await fetchLogs("status=submitted"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "업무일지를 불러오지 못했습니다.");
    } finally {
      setQueueLoading(false);
    }
  }, [fetchLogs]);

  // Fetch the selected day and reset the editor to what is saved for it.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadDay(date).then((logs) => {
        if (cancelled || !logs) {
          return;
        }
        setDraft(
          draftFrom(logs.find((log) => log.memberId === myId && log.logDate === date) ?? null)
        );
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [date, loadDay, myId]);

  // Review tabs always show fresh data (others may have just (re)submitted).
  useEffect(() => {
    if (tab === "write") {
      return;
    }
    const timer = window.setTimeout(() => {
      if (tab === "history") {
        void loadHistory();
      } else if (tab === "queue") {
        void loadQueue();
      } else {
        void loadDay(date);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // `date` changes are already handled by the day effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loadHistory, loadQueue, loadDay]);

  function confirmDiscard() {
    return !dirty || window.confirm("저장하지 않은 내용이 있습니다. 버리고 이동할까요?");
  }

  function selectDate(next: string) {
    if (!next || next === date || !confirmDiscard()) {
      return;
    }
    setNotice("");
    setDate(next);
  }

  function openDate(targetDate: string) {
    if (!confirmDiscard()) {
      return;
    }
    setNotice("");
    setTab("write");
    setDate(targetDate);
  }

  async function saveLog() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await request("/api/work-logs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logDate: date, ...draft }),
      });
      const data = (await response.json()) as WorkLogsResponse;

      if (!response.ok || !data.log) {
        throw new Error(data.error ?? "업무일지를 저장하지 못했습니다.");
      }

      const saved = data.log;
      setDayLogs((current) => [saved, ...current.filter((log) => log.id !== saved.id)]);
      setDraft(draftFrom(saved));
      setNotice(`${formatLogDate(date)} 업무일지를 제출했습니다.${isManager ? "" : " 부서장 승인을 기다립니다."}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "업무일지를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog(log: WorkLog) {
    if (!window.confirm(`${formatLogDate(log.logDate)} 업무일지를 삭제할까요?`)) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await request("/api/work-logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id }),
      });
      const data = (await response.json()) as WorkLogsResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "업무일지를 삭제하지 못했습니다.");
      }
      setDayLogs((current) => current.filter((entry) => entry.id !== log.id));
      setHistoryLogs((current) => current.filter((entry) => entry.id !== log.id));
      setDraft(EMPTY_DRAFT);
      setNotice("업무일지를 삭제했습니다.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "업무일지를 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function review(ids: number[], decision: Decision, comment = "") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await request("/api/work-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, decision, comment }),
      });
      const data = (await response.json()) as WorkLogsResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "검토 결과를 저장하지 못했습니다.");
      }
      const updated = data.logs ?? [];
      setDayLogs((current) => mergeLogs(current, updated));
      setHistoryLogs((current) => mergeLogs(current, updated));
      setQueueLogs((current) =>
        current
          .map((log) => updated.find((entry) => entry.id === log.id) ?? log)
          .filter((log) => log.status === "submitted")
      );
      updatePending(data.pendingReview);
      const label =
        decision === "approve" ? "승인" : decision === "reject" ? "반려" : "승인 취소";
      setNotice(`업무일지 ${data.reviewed ?? updated.length}건을 ${label}했습니다.`);
      return true;
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "검토 결과를 저장하지 못했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function fillFromBoard() {
    if (!viewer) {
      return;
    }
    const lines = dailyActivityLines(items, viewer.name, date).filter(
      (line) => !draft.content.includes(line)
    );
    if (!lines.length) {
      setNotice(`${formatLogDate(date)}에 보드에서 완료 처리한 단계가 없습니다.`);
      return;
    }
    setDraft((current) => ({
      ...current,
      content: [current.content.trim(), ...lines.map((line) => `- ${line}`)]
        .filter(Boolean)
        .join("\n"),
    }));
    setNotice(`보드 활동 ${lines.length}건을 불러왔습니다. 확인 후 제출해 주세요.`);
  }

  function toggleItem(id: number) {
    setDraft((current) => ({
      ...current,
      itemIds: current.itemIds.includes(id)
        ? current.itemIds.filter((entry) => entry !== id)
        : [...current.itemIds, id],
    }));
  }

  function downloadCsv() {
    const titles = new Map(items.map((item) => [item.id, item.title] as const));
    const blob = new Blob([workLogsToCsv(historyLogs, titles)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const who =
      historyMemberId === "all"
        ? "전체"
        : members.find((entry) => entry.id === historyMemberId)?.name ?? "구성원";
    anchor.href = url;
    anchor.download = `${organizationName}_업무일지_${historyMonth}_${who}.csv`
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Suggested links: my own open items first, then search hits.
  const suggestedItems = useMemo(() => {
    if (!viewer) {
      return [];
    }
    const query = itemQuery.trim().toLowerCase();
    const pool = query
      ? items.filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        )
      : items.filter(
          (item) => assigneeName(item.assignee) === viewer.name && !isItemDone(item)
        );
    return pool.filter((item) => !draft.itemIds.includes(item.id)).slice(0, 12);
  }, [draft.itemIds, itemQuery, items, viewer]);

  const status = useMemo(() => dailyStatus(members, dayLogs, date), [members, dayLogs, date]);
  const dayReviewable = dayLogs.filter(
    (log) => log.memberId !== myId && log.status === "submitted"
  );

  const historyGroups = useMemo(() => groupByDate(historyLogs), [historyLogs]);
  const queueGroups = useMemo(() => groupByDate(queueLogs), [queueLogs]);

  const historyStats = useMemo(() => {
    const range = monthRange(historyMonth);
    if (!range || historyMemberId === "all") {
      return null;
    }
    const lastDay = historyMonth === today.slice(0, 7) ? today : range.to;
    let workdays = 0;
    for (let day = range.from; day <= lastDay; day = shiftDate(day, 1)) {
      if (!isWeekend(day)) {
        workdays += 1;
      }
    }
    return {
      written: historyLogs.length,
      approved: historyLogs.filter((log) => log.status === "approved").length,
      workdays,
    };
  }, [historyLogs, historyMemberId, historyMonth, today]);

  const tabs: Array<[Tab, string]> = isManager
    ? [
        ["write", "내 일지"],
        ["team", "팀 현황"],
        ["queue", `승인 대기${pendingReview ? ` ${pendingReview}` : ""}`],
        ["history", "기록"],
      ]
    : [
        ["write", "내 일지"],
        ["history", "기록"],
      ];

  const dateNav = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => selectDate(shiftDate(date, -1))}
        className="tb-iconbtn h-8 w-8"
        aria-label="이전 날"
      >
        ‹
      </button>
      <input
        type="date"
        value={date}
        onChange={(event) => selectDate(event.target.value)}
        className="tb-field w-auto !py-1.5 text-sm"
        aria-label="날짜"
      />
      <button
        type="button"
        onClick={() => selectDate(shiftDate(date, 1))}
        className="tb-iconbtn h-8 w-8"
        aria-label="다음 날"
      >
        ›
      </button>
      {date !== today ? (
        <button type="button" onClick={() => selectDate(today)} className="tb-btn !py-1.5 text-xs">
          오늘
        </button>
      ) : null}
      <span className="text-sm font-medium text-[var(--text-muted)]">{formatLogDate(date)}</span>
    </div>
  );

  function logCard(log: WorkLog, showDate = false) {
    const logMember = members.find((entry) => entry.id === log.memberId);
    const rights = workLogPermissions(viewer, log, log.memberId);
    return (
      <article
        key={log.id}
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
        style={{ borderLeft: `4px solid ${logMember?.color ?? "var(--border-strong)"}` }}
      >
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-semibold">{log.memberName}</span>
          {showDate ? (
            <span className="text-xs text-[var(--text-muted)]">{formatLogDate(log.logDate)}</span>
          ) : null}
          <StatusBadge log={log} />
          <span className="text-[11px] text-[var(--text-faint)]">
            {formatTime(log.updatedAt)} 제출
          </span>
          {log.memberId === myId ? (
            <button
              type="button"
              onClick={() => openDate(log.logDate)}
              className="tb-btn ml-auto !px-2 !py-1 text-xs"
            >
              열기
            </button>
          ) : null}
        </header>
        <LogBody log={log} itemsById={itemsById} />
        {rights.canReview ? (
          <ReviewActions log={log} busy={saving} onReview={review} />
        ) : null}
      </article>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => {
        if (confirmDiscard()) {
          onClose();
        }
      }}
    >
      <div
        className="tb-card my-6 w-full max-w-[920px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worklog-title"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <h2 id="worklog-title" className="mr-2 text-base font-semibold">
            📝 업무일지
          </h2>
          <div className="tb-seg" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-active={tab === key}
                onClick={() => setTab(key)}
                className="tb-seg-btn"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onOpenMembers} className="tb-btn text-sm">
              👥 구성원
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDiscard()) {
                  onClose();
                }
              }}
              className="tb-iconbtn h-8 w-8"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {error ? (
            <div
              role="alert"
              className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              {error}
            </div>
          ) : notice ? (
            <div
              role="status"
              className="rounded-[var(--radius)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]"
            >
              {notice}
            </div>
          ) : null}

          {!viewer ? (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              로그인한 구성원만 업무일지를 쓸 수 있습니다.
            </div>
          ) : tab === "write" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{viewer.name}</span>
                {dateNav}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                {dayLoading ? (
                  <span>불러오는 중…</span>
                ) : (
                  <>
                    <StatusBadge log={myLog} />
                    {myLog ? <span>제출 {formatTime(myLog.updatedAt)}</span> : null}
                    {myLog?.status === "approved" ? (
                      <span>
                        · {myLog.reviewerName} 승인 {formatTime(myLog.reviewedAt)}
                      </span>
                    ) : null}
                  </>
                )}
                {dirty && permissions.canEdit ? (
                  <span className="tb-badge tb-badge-warning">저장 안 됨</span>
                ) : null}
              </div>

              {myLog?.status === "rejected" ? (
                <div className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm">
                  <div className="font-semibold text-[var(--danger)]">
                    {myLog.reviewerName}님이 반려했습니다
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap">{myLog.reviewComment}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    내용을 보완해 다시 제출해 주세요.
                  </div>
                </div>
              ) : myLog?.status === "approved" ? (
                <div className="rounded-[var(--radius)] border border-[var(--complete-border)] bg-[var(--complete-soft)] px-3 py-2 text-sm">
                  승인된 일지는 수정할 수 없습니다. 고칠 내용이 있으면 부서장에게 승인
                  취소를 요청해 주세요.
                </div>
              ) : null}

              <fieldset disabled={!permissions.canEdit || saving} className="m-0 min-w-0 space-y-4 border-0 p-0">
                <label className="block">
                  <span className="tb-label flex items-center justify-between gap-2">
                    <span>오늘 한 일</span>
                    <button
                      type="button"
                      onClick={fillFromBoard}
                      className="text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-40"
                    >
                      ↻ 보드 활동 불러오기
                    </button>
                  </span>
                  <textarea
                    value={draft.content}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, content: event.target.value }))
                    }
                    className="tb-field min-h-[140px] resize-y"
                    placeholder={"- 현장 조사 진행\n- 견적서 검토"}
                    maxLength={4000}
                  />
                </label>

                <div>
                  <span className="tb-label">관련 업무</span>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.itemIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleItem(id)}
                        className="tb-chip tb-chip-accent"
                        title="연결 해제"
                      >
                        {itemsById.get(id)?.title ?? `삭제된 업무 #${id}`}
                        {permissions.canEdit ? " ×" : ""}
                      </button>
                    ))}
                    {!draft.itemIds.length ? (
                      <span className="text-xs text-[var(--text-faint)]">
                        아래에서 오늘 다룬 업무를 선택하세요.
                      </span>
                    ) : null}
                  </div>
                  {permissions.canEdit ? (
                    <div className="mt-2 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-2">
                      <input
                        value={itemQuery}
                        onChange={(event) => setItemQuery(event.target.value)}
                        className="tb-field !py-1.5 text-sm"
                        placeholder="업무명·분류로 검색 (비우면 내 담당 진행 업무)"
                        aria-label="관련 업무 검색"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {suggestedItems.length ? (
                          suggestedItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleItem(item.id)}
                              className="tb-chip"
                            >
                              + {item.title}
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-[var(--text-faint)]">
                            {itemQuery.trim()
                              ? "검색 결과가 없습니다."
                              : "더 제안할 담당 진행 업무가 없습니다. 검색해서 다른 업무를 추가할 수 있습니다."}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="tb-label">다음 계획</span>
                    <textarea
                      value={draft.plan}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, plan: event.target.value }))
                      }
                      className="tb-field min-h-[88px] resize-y"
                      placeholder="내일(다음 근무일) 할 일"
                      maxLength={4000}
                    />
                  </label>
                  <label className="block">
                    <span className="tb-label">특이사항·이슈</span>
                    <textarea
                      value={draft.issues}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, issues: event.target.value }))
                      }
                      className="tb-field min-h-[88px] resize-y"
                      placeholder="막힌 점, 공유할 내용, 요청 사항"
                      maxLength={4000}
                    />
                  </label>
                </div>
              </fieldset>

              {permissions.canEdit ? (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                  {permissions.canDelete && myLog ? (
                    <button
                      type="button"
                      onClick={() => void deleteLog(myLog)}
                      disabled={saving}
                      className="tb-btn mr-auto text-sm text-[var(--danger)]"
                    >
                      삭제
                    </button>
                  ) : null}
                  {dirty ? (
                    <button
                      type="button"
                      onClick={() => setDraft(draftFrom(myLog))}
                      disabled={saving}
                      className="tb-btn text-sm"
                    >
                      되돌리기
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveLog()}
                    disabled={saving || dayLoading || !dirty}
                    className="tb-btn tb-btn-primary text-sm"
                  >
                    {saving
                      ? "저장 중…"
                      : myLog?.status === "rejected"
                        ? "보완해 다시 제출"
                        : myLog
                          ? "수정해 제출"
                          : "일지 제출"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : tab === "team" && isManager ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {dateNav}
                <span className="ml-auto text-sm">
                  작성 <strong className="text-[var(--success)]">{status.written}</strong>/
                  {status.rows.length}명
                </span>
                {dayReviewable.length ? (
                  <button
                    type="button"
                    onClick={() => void review(dayReviewable.map((log) => log.id), "approve")}
                    disabled={saving}
                    className="tb-btn tb-btn-primary !py-1.5 text-sm"
                  >
                    대기 {dayReviewable.length}건 일괄 승인
                  </button>
                ) : null}
              </div>
              {status.missing.length && !dayLoading ? (
                <div className="rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-sm">
                  미작성: {status.missing.map((entry) => entry.name).join(", ")}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {status.rows.map(({ member: rowMember, log }) =>
                  log ? (
                    logCard(log)
                  ) : (
                    <article
                      key={rowMember.id}
                      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                      style={{ borderLeft: `4px solid ${rowMember.color}` }}
                    >
                      <header className="flex items-center gap-2">
                        <span className="font-semibold">{rowMember.name}</span>
                        {rowMember.role ? (
                          <span className="text-xs text-[var(--text-faint)]">{rowMember.role}</span>
                        ) : null}
                        <StatusBadge log={null} />
                      </header>
                    </article>
                  )
                )}
              </div>
            </div>
          ) : tab === "queue" && isManager ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--text-muted)]">
                  다른 구성원이 제출한 일지 중 승인 대기 {queueLogs.length}건
                </span>
                {queueLogs.length ? (
                  <button
                    type="button"
                    onClick={() => void review(queueLogs.map((log) => log.id), "approve")}
                    disabled={saving}
                    className="tb-btn tb-btn-primary ml-auto !py-1.5 text-sm"
                  >
                    전체 승인
                  </button>
                ) : null}
              </div>
              {queueLoading ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">불러오는 중…</div>
              ) : queueGroups.length ? (
                queueGroups.map(([logDate, logs]) => (
                  <section key={logDate}>
                    <h3 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                      {formatLogDate(logDate)}
                    </h3>
                    <div className="space-y-2">{logs.map((log) => logCard(log))}</div>
                  </section>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  승인할 업무일지가 없습니다.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {isManager ? (
                  <select
                    value={historyMemberId}
                    onChange={(event) =>
                      setHistoryMemberId(
                        event.target.value === "all" ? "all" : Number(event.target.value)
                      )
                    }
                    className="tb-field w-auto !py-1.5 text-sm"
                    aria-label="조회 구성원"
                  >
                    <option value="all">전체 구성원</option>
                    {members.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                        {entry.active ? "" : " (비활성)"}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(event) => setHistoryMonth(event.target.value)}
                  className="tb-field w-auto !py-1.5 text-sm"
                  aria-label="조회 월"
                />
                {historyStats ? (
                  <span className="text-sm text-[var(--text-muted)]">
                    평일 {historyStats.workdays}일 중{" "}
                    <strong className="text-[var(--text)]">{historyStats.written}일</strong> 작성 ·
                    승인 {historyStats.approved}
                  </span>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">{historyLogs.length}건</span>
                )}
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={!historyLogs.length}
                  className="tb-btn ml-auto text-sm"
                >
                  CSV 다운로드
                </button>
              </div>
              {historyLoading ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">불러오는 중…</div>
              ) : historyGroups.length ? (
                <div className="space-y-4">
                  {historyGroups.map(([logDate, logs]) => (
                    <section key={logDate}>
                      <h3 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {formatLogDate(logDate)}
                      </h3>
                      <div className="space-y-2">{logs.map((log) => logCard(log))}</div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  이 기간에 작성된 업무일지가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByDate(logs: WorkLog[]) {
  const groups = new Map<string, WorkLog[]>();
  for (const log of logs) {
    groups.set(log.logDate, [...(groups.get(log.logDate) ?? []), log]);
  }
  return [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
}

function ReviewActions({
  log,
  busy,
  onReview,
}: {
  log: WorkLog;
  busy: boolean;
  onReview: (ids: number[], decision: Decision, comment?: string) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-2">
      {log.status !== "submitted" && log.reviewerName ? (
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          {log.reviewerName} {log.status === "approved" ? "승인" : "반려"} · {formatTime(log.reviewedAt)}
          {log.reviewComment ? ` — ${log.reviewComment}` : ""}
        </p>
      ) : null}
      {rejecting ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="tb-field min-w-[180px] flex-1 !py-1.5 text-sm"
            placeholder="반려 사유 (작성자에게 표시됩니다)"
            aria-label={`${log.memberName} 반려 사유`}
            maxLength={500}
            autoFocus
          />
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() =>
              void onReview([log.id], "reject", reason).then((ok) => {
                if (ok) {
                  setRejecting(false);
                  setReason("");
                }
              })
            }
            className="tb-btn !px-3 !py-1.5 text-xs text-[var(--danger)]"
          >
            반려하기
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="tb-btn !px-3 !py-1.5 text-xs">
            취소
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {log.status !== "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview([log.id], "approve")}
              className="tb-btn tb-btn-primary !px-3 !py-1.5 text-xs"
            >
              승인
            </button>
          ) : null}
          {log.status !== "rejected" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="tb-btn !px-3 !py-1.5 text-xs"
            >
              반려
            </button>
          ) : null}
          {log.status !== "submitted" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview([log.id], "reopen")}
              className="tb-btn !px-3 !py-1.5 text-xs"
            >
              승인 취소
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LogBody({
  log,
  itemsById,
}: {
  log: WorkLog;
  itemsById: Map<number, WorkflowItem>;
}) {
  return (
    <div className="space-y-2 text-sm">
      {log.content ? <p className="whitespace-pre-wrap break-words">{log.content}</p> : null}
      {log.itemIds.length ? (
        <div className="flex flex-wrap gap-1">
          {log.itemIds.map((id) => (
            <span key={id} className="tb-chip">
              {itemsById.get(id)?.title ?? `삭제된 업무 #${id}`}
            </span>
          ))}
        </div>
      ) : null}
      {log.plan ? (
        <p className="whitespace-pre-wrap break-words text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">계획 </span>
          {log.plan}
        </p>
      ) : null}
      {log.issues ? (
        <p className="whitespace-pre-wrap break-words text-[var(--warning)]">
          <span className="font-semibold">이슈 </span>
          {log.issues}
        </p>
      ) : null}
    </div>
  );
}
